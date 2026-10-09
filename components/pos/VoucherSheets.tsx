import { useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  ErrorLine,
  money,
  Notice,
  PickRow,
  PosSheet,
  posStyles,
  usePosT,
  writeError,
  type Send,
} from '@/components/pos/parts';
import { CameraScanner, cameraScanAvailable, ScanButton } from '@/components/retail/CameraScanner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { getApiUrl, isBackendConfigured } from '@/lib/env';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posHeaders, posPaths } from '@/lib/pos/api';
import { parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import { codeInputProblem, normaliseVoucherCode, tidyCodeInput } from '@/lib/pos/voucher-code';
import { VOUCHER_BARCODE_TYPES } from '@/lib/retail/scan';
import {
  formatDay,
  issuedVouchers,
  sendDateBounds,
  storedValueAmountProblem,
  storedValueCap,
  storedValueDefault,
  todayInZone,
  voucherBlock,
  voucherDelivery,
  voucherFrozenCopyId,
  voucherLastDay,
  voucherSellLine,
  voucherStatusCopyId,
  type VoucherDeliveryChoice,
  type VoucherWho,
} from '@/lib/pos/voucher-math';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { lookupVoucher, useVoucherSettings } from '@/lib/queries/usePos';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSale, PosSaleLine, PosVoucherSettings, PosVoucherSummary } from '@/types/pos';

/**
 * Gift vouchers and account credit in the app (POS Pass V app step, UX spec §13.13, §20.2 to
 * §20.5), following the web till's `VoucherSell.tsx`, `StoredValuePayPanels.tsx` and
 * `CompletedSale.tsx` (IssuedVouchers):
 *
 * - selling a voucher: the add sheet's Gift vouchers tab and the sell form, and the same form to
 *   change a voucher line before payment. The line has no performer, VAT or discount, and the
 *   voucher is made only when the sale completes, so the body never carries a code;
 * - paying with a gift voucher: the code is typed (or read by a keyboard-mode scanner) into a
 *   field that never autofills, checked here before anything is sent, sent only in the body of the
 *   look-up, and cleared once the voucher is found;
 * - paying with account credit, when the client has some;
 * - after the sale: the vouchers it made, each with its PDF through the share sheet.
 *
 * Voucher and credit payments are applied, not money: no tip, and neither can pay for a voucher
 * line on the same sale (`vpay.notForVouchers`), so their amount is capped at the balance less
 * those lines. Server sentences are shown word for word.
 */

const parseYmd = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

// ─── Selling (§20.2) ────────────────────────────────────────────────────────

export function VoucherSellForm({
  settings,
  presetPence,
  editLine,
  sale,
  send,
  timeZone,
  onDone,
  onBack,
}: {
  settings: PosVoucherSettings;
  /** A preset tile's value; null for "Another amount". */
  presetPence?: number | null;
  /** A voucher line already on the sale, to change before payment. */
  editLine?: PosSaleLine | null;
  sale: PosSale;
  send: Send;
  timeZone: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const t = usePosT();
  const existing = editLine?.voucher ?? null;
  const initialPence = editLine?.unit_price_pence ?? presetPence ?? null;
  const isPreset = !editLine && initialPence != null && settings.preset_pence.includes(initialPence);
  const today = todayInZone(timeZone);
  const bounds = sendDateBounds(today);
  const clientEmail = sale.guest?.email?.trim() || null;
  const existingDelivery = voucherDelivery(existing);

  const [amountText, setAmountText] = useState(initialPence != null ? penceToInput(initialPence) : '');
  const [who, setWho] = useState<VoucherWho>(existing?.recipient_name ? 'gift' : 'buyer');
  const [recipientName, setRecipientName] = useState(existing?.recipient_name ?? '');
  const [recipientEmail, setRecipientEmail] = useState(existing?.recipient_email ?? '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [delivery, setDelivery] = useState<VoucherDeliveryChoice>(
    existingDelivery === 'later' ? 'emailLater' : existingDelivery === 'now' ? 'emailNow' : 'print',
  );
  const [sendDate, setSendDate] = useState(() => {
    const at = existing?.send_at ? Date.parse(existing.send_at) : NaN;
    const ymd = Number.isNaN(at) ? bounds.min : todayInZone(timeZone, new Date(at));
    return ymd < bounds.min || ymd > bounds.max ? bounds.min : ymd;
  });
  const [buyerEmail, setBuyerEmail] = useState(existing && !existing.recipient_name ? (existing.buyer_email ?? '') : '');
  const [busy, setBusy] = useState<'add' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valuePence = parseMoneyInput(amountText);
  const { ready, needsBuyerEmail, amountProblem, line } = voucherSellLine(
    { valuePence, who, recipientName, recipientEmail, message, delivery, sendDate, buyerEmail },
    { limits: settings, todayYmd: today, timeZone, clientName: sale.guest?.name ?? null, clientEmail },
  );
  const amountError =
    amountProblem === 'tooLow'
      ? t('vsell.amount.tooLow', { min: money(settings.min_pence) })
      : amountProblem === 'tooHigh'
        ? t('vsell.amount.tooHigh', { max: money(settings.max_pence) })
        : undefined;
  const range = t('vsell.amount.range', { min: money(settings.min_pence), max: money(settings.max_pence) });
  const emailing = delivery !== 'print';

  async function write(ops: Record<string, unknown>[], kind: 'add' | 'remove') {
    setBusy(kind);
    setError(null);
    try {
      await send({ action: 'lines', body: { version: sale.version, ops } });
      onDone();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  // The server changes a voucher line by taking it off and adding it again, in one call.
  const add = () =>
    void write(
      editLine ? [{ op: 'remove', line_id: editLine.id }, { op: 'add', line }] : [{ op: 'add', line }],
      'add',
    );

  return (
    <View style={posStyles.stack}>
      {editLine ? (
        <Text variant="bodySmall" tone="muted">
          {t('line.voucher.noDiscount')}
        </Text>
      ) : null}
      <Input
        label={t('vsell.amount')}
        accessibilityLabel={t('vsell.amount')}
        value={amountText}
        onChangeText={setAmountText}
        editable={!isPreset}
        keyboardType="decimal-pad"
        inputMode="decimal"
        helper={isPreset ? undefined : range}
        error={amountError}
      />

      <Text variant="label">{t('vsell.who')}</Text>
      <ChoiceChips
        options={[
          { value: 'buyer', label: t('vsell.who.buyer') },
          { value: 'gift', label: t('vsell.who.gift') },
        ]}
        value={who}
        onChange={setWho}
      />

      {who === 'gift' ? (
        <>
          <Input
            label={t('vsell.recipientName')}
            accessibilityLabel={t('vsell.recipientName')}
            value={recipientName}
            onChangeText={setRecipientName}
            maxLength={120}
            required
          />
          <Input
            label={t('vsell.message')}
            accessibilityLabel={t('vsell.message')}
            value={message}
            onChangeText={setMessage}
            maxLength={300}
            multiline
            helper={t('vsell.message.help')}
          />
        </>
      ) : null}

      <Text variant="label">{t('vsell.delivery')}</Text>
      {(['print', 'emailNow', 'emailLater'] as const).map((d) => (
        <PickRow
          key={d}
          title={t(
            d === 'print' ? 'vsell.delivery.print' : d === 'emailNow' ? 'vsell.delivery.emailNow' : 'vsell.delivery.emailLater',
          )}
          selected={delivery === d}
          onPress={() => setDelivery(d)}
        />
      ))}

      {emailing && who === 'gift' ? (
        <Input
          label={t('vsell.recipientEmail')}
          accessibilityLabel={t('vsell.recipientEmail')}
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={254}
        />
      ) : null}
      {needsBuyerEmail ? (
        <Input
          label={t('vsell.buyerEmail')}
          accessibilityLabel={t('vsell.buyerEmail')}
          value={buyerEmail}
          onChangeText={setBuyerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={254}
        />
      ) : null}
      {delivery === 'emailLater' ? (
        <View style={styles.dateBlock}>
          <Text variant="label">{t('vsell.sendDate')}</Text>
          <DatePickerField
            value={sendDate}
            onChange={setSendDate}
            accessibilityLabel={t('vsell.sendDate')}
            minimumDate={parseYmd(bounds.min)}
            maximumDate={parseYmd(bounds.max)}
          />
          <Text variant="caption" tone="muted">
            {t('vsell.sendDate.help')}
          </Text>
        </View>
      ) : null}

      <ErrorLine message={error} />
      <View style={posStyles.buttons}>
        <Button
          label={editLine ? t('line.save') : t('vsell.add')}
          loading={busy === 'add'}
          disabled={!ready || busy !== null}
          onPress={add}
          fullWidth
        />
        {editLine ? (
          <Button
            label={t('line.remove')}
            variant="danger"
            loading={busy === 'remove'}
            disabled={busy !== null}
            onPress={() => void write([{ op: 'remove', line_id: editLine.id }], 'remove')}
            fullWidth
          />
        ) : null}
        {onBack ? <Button label={t('app.card.back')} variant="ghost" onPress={onBack} fullWidth /> : null}
      </View>
    </View>
  );
}

/** The Gift vouchers tab of the add sheet: one tile per preset value, and "Another amount". */
export function VoucherTiles({
  settings,
  onPick,
}: {
  settings: PosVoucherSettings;
  onPick: (presetPence: number | null) => void;
}) {
  const t = usePosT();
  return (
    <View style={posStyles.buttons}>
      {settings.preset_pence.map((p) => (
        <PickRow key={p} title={t('vsell.preset', { amount: money(p) })} detail={money(p)} onPress={() => onPick(p)} />
      ))}
      {settings.custom_allowed ? (
        <PickRow
          title={t('vsell.custom')}
          detail={t('vsell.amount.range', { min: money(settings.min_pence), max: money(settings.max_pence) })}
          onPress={() => onPick(null)}
        />
      ) : null}
    </View>
  );
}

/** What a voucher line says under its name: who it is for and how it goes out (§20.2). */
export function voucherLineDetails(line: PosSaleLine, t: ReturnType<typeof usePosT>, timeZone: string): string[] {
  const v = line.voucher ?? null;
  const out: string[] = [];
  if (v?.recipient_name) out.push(t('line.voucher.for', { recipientName: v.recipient_name }));
  const delivery = voucherDelivery(v);
  out.push(
    delivery === 'later' && v?.send_at
      ? t('line.voucher.delivery.later', { date: formatDay(v.send_at, timeZone) })
      : delivery === 'now'
        ? t('line.voucher.delivery.now')
        : t('line.voucher.delivery.print'),
  );
  return out;
}

/**
 * A gift voucher line, tapped: the sell form to change it before payment, or, with vouchers
 * switched off since it was added, its sentence and a way to take it off. Once the sale has moved
 * on (a payment in progress, or paid) it is read-only. Mounted per line.
 */
export function VoucherLineSheet({
  line,
  sale,
  send,
  editable,
  timeZone,
  onClose,
}: {
  line: PosSaleLine;
  sale: PosSale;
  send: Send;
  editable: boolean;
  timeZone: string;
  onClose: () => void;
}) {
  const t = usePosT();
  const settings = useVoucherSettings({ enabled: editable });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = settings.data?.settings ?? null;
  const title = editable && loaded ? t('vsell.title') : t('line.voucher', { amount: money(line.unit_price_pence) });

  return (
    <PosSheet visible onClose={onClose} title={title}>
      {editable && settings.isLoading ? (
        <Text tone="muted">{t('app.loading')}</Text>
      ) : editable && loaded ? (
        <VoucherSellForm settings={loaded} editLine={line} sale={sale} send={send} timeZone={timeZone} onDone={onClose} />
      ) : (
        <View style={posStyles.stack}>
          {voucherLineDetails(line, t, timeZone).map((d) => (
            <Text key={d} variant="bodySmall">
              {d}
            </Text>
          ))}
          {line.voucher?.message ? (
            <Text variant="bodySmall" tone="muted">
              {line.voucher.message}
            </Text>
          ) : null}
          <Text variant="bodySmall" tone="muted">
            {t('line.voucher.noDiscount')}
          </Text>
          <ErrorLine message={error} />
          {editable ? (
            <Button
              label={t('line.remove')}
              variant="danger"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  await send({ action: 'lines', body: { version: sale.version, ops: [{ op: 'remove', line_id: line.id }] } });
                  onClose();
                } catch (e) {
                  setError(writeError(e, t));
                } finally {
                  setBusy(false);
                }
              }}
              fullWidth
            />
          ) : null}
        </View>
      )}
    </PosSheet>
  );
}

// ─── Paying with a gift voucher or account credit (§20.3, §20.4) ────────────

type StoredValueError = { text: string; retry: boolean; code: string | null; balancePence: number | null };

/** One stored-value payment at a time, with one request id kept across a retry after a lost answer. */
function useStoredValueSubmit(sale: PosSale, send: Send) {
  const t = usePosT();
  const requestId = useRef(newPaymentAttemptId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StoredValueError | null>(null);

  async function submit(body: Record<string, unknown>): Promise<{ balance_left_pence?: number | null } | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await send({
        action: 'payments',
        money: true,
        body: { ...body, version: sale.version, client_request_id: requestId.current },
      });
      requestId.current = newPaymentAttemptId();
      return { balance_left_pence: typeof res.balance_left_pence === 'number' ? res.balance_left_pence : null };
    } catch (e) {
      // A lost answer (no connection, a timeout) keeps the key, so trying again records it once.
      const lost = e instanceof ApiError && (e.status === 0 || e.status === 408);
      if (!lost) requestId.current = newPaymentAttemptId();
      const raw = e instanceof ApiError ? (e.body as { balance_pence?: unknown } | undefined) : undefined;
      setError({
        text: writeError(e, t),
        retry: lost,
        code: apiErrorCode(e),
        balancePence: typeof raw?.balance_pence === 'number' ? raw.balance_pence : null,
      });
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error, clearError: () => setError(null) };
}

/** The voucher's status as a pill. */
export function VoucherStatusBadge({ status }: { status: string | null | undefined }) {
  const t = usePosT();
  const id = voucherStatusCopyId(status);
  const tone = id === 'vch.status.active' ? 'success' : id === 'vch.status.frozen' ? 'warning' : 'neutral';
  return <Badge label={t(id)} tone={tone} />;
}

/** §20.3 Pay with a gift voucher. */
export function VoucherPayPanel({
  sale,
  send,
  timeZone,
  onDone,
  onBack,
}: {
  sale: PosSale;
  send: Send;
  timeZone: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [camera, setCamera] = useState(false);
  const [found, setFound] = useState<PosVoucherSummary | null>(null);
  const [amountText, setAmountText] = useState<string | null>(null);
  const { capPence, heldPence } = storedValueCap(sale);
  const { submit, busy, error, clearError } = useStoredValueSubmit(sale, send);

  const block = found ? voucherBlock(found.status) : null;
  const available = found?.balance_pence ?? 0;
  const amountPence = amountText == null ? storedValueDefault(available, capPence) : parseMoneyInput(amountText);
  const amountProblem = found ? storedValueAmountProblem(amountPence, available, capPence) : null;
  const lastDay = found ? voucherLastDay(found.expires_at, timeZone) : null;

  async function find() {
    clearError();
    setCodeError(null);
    const problem = codeInputProblem(code);
    if (problem) {
      setCodeError(problem === 'invalid' ? t('vpay.code.invalid') : null);
      return;
    }
    if (!accessToken || !isBackendConfigured()) {
      setCodeError(t('common.networkError'));
      return;
    }
    setFinding(true);
    try {
      const voucher = await lookupVoucher(accessToken, normaliseVoucherCode(code));
      // Found: the code leaves the screen; only the voucher's id is kept for the payment.
      setCode('');
      setFound(voucher);
      setAmountText(null);
    } catch (e) {
      setFound(null);
      setCodeError(posErrorMessage(e, t('common.saveError')));
    } finally {
      setFinding(false);
    }
  }

  async function take() {
    if (!found || amountPence == null) return;
    const res = await submit({ method: 'gift_card', voucher_id: found.id, amount_pence: amountPence });
    if (!res) return;
    const left = res.balance_left_pence ?? Math.max(0, found.balance_pence - amountPence);
    toast.success(t('vpay.left', { balance: money(left) }));
    setFound(null);
    onDone();
  }

  return (
    <View style={posStyles.stack}>
      {heldPence > 0 ? <Notice tone="warning">{t('vpay.notForVouchers', { amount: money(heldPence) })}</Notice> : null}

      <Input
        label={t('vpay.code')}
        accessibilityLabel={t('vpay.code')}
        value={code}
        onChangeText={(v) => {
          setCode(tidyCodeInput(v));
          setCodeError(null);
        }}
        // Never autofilled or remembered: no suggestions, no password manager, no saved text.
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="characters"
        keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
        returnKeyType="search"
        onSubmitEditing={() => void find()}
        maxLength={40}
        helper={t('vpay.code.help')}
        error={codeError ?? undefined}
        rightSlot={cameraScanAvailable && !code.trim() ? <ScanButton onPress={() => setCamera(true)} /> : undefined}
      />
      {/* The voucher PDF carries the code as a QR code (§13.13): it fills the field, never a cache. */}
      <CameraScanner
        visible={camera}
        onClose={() => setCamera(false)}
        barcodeTypes={VOUCHER_BARCODE_TYPES}
        onScan={(scanned) => {
          setCode(tidyCodeInput(scanned));
          setCodeError(null);
        }}
      />
      <Button label={t('vpay.find')} loading={finding} disabled={!code.trim() || finding} onPress={() => void find()} fullWidth />

      {found ? (
        <Boxed>
          <View style={posStyles.row}>
            <Text variant="label" style={styles.flex}>
              {t('vpay.found', { last4: found.code_last4 ?? '' })}
            </Text>
            <VoucherStatusBadge status={found.status} />
          </View>
          <Text variant="heading">{t('vpay.balance', { balance: money(found.balance_pence) })}</Text>
          <Text variant="bodySmall" tone="muted">
            {lastDay ? t('vpay.expires', { date: lastDay }) : t('vpay.noExpiry')}
          </Text>
          {found.recipient_name ? (
            <Text variant="bodySmall" tone="muted">
              {t('vpay.for', { recipientName: found.recipient_name })}
            </Text>
          ) : null}

          {block === 'usedUp' ? <Notice>{t('vpay.usedUp')}</Notice> : null}
          {block === 'cancelled' ? <Notice>{t('vpay.cancelled')}</Notice> : null}
          {block === 'frozen' ? <Notice tone="warning">{t(voucherFrozenCopyId(found.on_hold))}</Notice> : null}
          {block === 'expired' ? <Notice tone="warning">{t('err.VOUCHER_EXPIRED', { date: lastDay ?? '' })}</Notice> : null}

          {!block ? (
            <Input
              label={t('vpay.amount')}
              accessibilityLabel={t('vpay.amount')}
              value={amountText ?? penceToInput(amountPence ?? 0)}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              inputMode="decimal"
              helper={amountProblem === 'overAvailable' || amountProblem === 'overCap' ? undefined : t('vpay.amount.max', { amount: money(Math.min(available, capPence)) })}
              error={
                amountProblem === 'overAvailable' || amountProblem === 'overCap'
                  ? t('vpay.amount.max', { amount: money(Math.min(available, capPence)) })
                  : undefined
              }
            />
          ) : null}
        </Boxed>
      ) : null}

      {error ? (
        <Notice
          tone="warning"
          action={
            error.code === 'VOUCHER_INSUFFICIENT_BALANCE' && error.balancePence != null && error.balancePence > 0
              ? {
                  label: t('vpay.useBalance', { balance: money(error.balancePence) }),
                  onPress: () => {
                    const balance = error.balancePence!;
                    setAmountText(penceToInput(Math.min(balance, capPence)));
                    if (found) setFound({ ...found, balance_pence: balance });
                    clearError();
                  },
                }
              : error.retry
                ? { label: t('common.tryAgain'), onPress: () => void take(), loading: busy }
                : undefined
          }>
          {error.text}
        </Notice>
      ) : null}

      {found && !block ? (
        <Button
          label={t('vpay.confirm', { amount: money(amountPence ?? 0) })}
          loading={busy}
          disabled={amountProblem !== null || busy}
          onPress={() => void take()}
          fullWidth
        />
      ) : null}
      <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
    </View>
  );
}

/** §20.4 Pay with account credit: the attached client's own credit, no code. */
export function CreditPayPanel({
  sale,
  send,
  creditPence,
  onDone,
  onBack,
}: {
  sale: PosSale;
  send: Send;
  creditPence: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = usePosT();
  const { capPence, heldPence } = storedValueCap(sale);
  const [amountText, setAmountText] = useState<string | null>(null);
  const amountPence = amountText == null ? storedValueDefault(creditPence, capPence) : parseMoneyInput(amountText);
  const problem = storedValueAmountProblem(amountPence, creditPence, capPence);
  const { submit, busy, error } = useStoredValueSubmit(sale, send);
  const clientName = sale.guest?.name ?? '';

  async function spend() {
    if (amountPence == null) return;
    const res = await submit({ method: 'account_credit', amount_pence: amountPence });
    if (res) onDone();
  }

  return (
    <View style={posStyles.stack}>
      <Text variant="bodySmall">{t('cpay.available', { clientName, amount: money(creditPence) })}</Text>
      {heldPence > 0 ? <Notice tone="warning">{t('vpay.notForVouchers', { amount: money(heldPence) })}</Notice> : null}
      <Input
        label={t('cpay.amount')}
        accessibilityLabel={t('cpay.amount')}
        value={amountText ?? penceToInput(amountPence ?? 0)}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={
          problem === 'overAvailable'
            ? t('err.CREDIT_INSUFFICIENT', { clientName, amount: money(creditPence) })
            : problem === 'overCap'
              ? t('vpay.amount.max', { amount: money(capPence) })
              : undefined
        }
      />
      {error ? (
        <Notice
          tone="warning"
          action={error.retry ? { label: t('common.tryAgain'), onPress: () => void spend(), loading: busy } : undefined}>
          {error.text}
        </Notice>
      ) : null}
      <Button
        label={t('cpay.confirm', { amount: money(amountPence ?? 0) })}
        loading={busy}
        disabled={problem !== null || busy}
        onPress={() => void spend()}
        fullWidth
      />
      <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
    </View>
  );
}

// ─── After the sale (§3.20, §20.2) ──────────────────────────────────────────

/**
 * The vouchers this sale made: each one ready, or when it will be emailed, and its PDF (which
 * carries the full code) through the share sheet to print or send. The PDF needs `create_sale` or
 * `manage_vouchers`, as the route does.
 */
export function IssuedVouchers({ sale, timeZone, canPdf }: { sale: PosSale; timeZone: string; canPdf: boolean }) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const [sharing, setSharing] = useState<string | null>(null);
  const issued = issuedVouchers(sale);
  if (issued.length === 0) return null;

  async function share(accountId: string, last4: string | null) {
    if (!accessToken || !isBackendConfigured()) {
      toast.error(t('app.voucher.pdfFailed'));
      return;
    }
    setSharing(accountId);
    try {
      const result = await downloadAndShareFile({
        url: `${getApiUrl()}${posPaths.voucherPdf(accountId)}`,
        filename: `gift-voucher-${last4 ?? accountId.slice(0, 8)}.pdf`,
        mimeType: 'application/pdf',
        headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
        dialogTitle: t('app.voucher.pdf'),
      });
      if (!result.ok) toast.error(t('app.voucher.pdfFailed'));
    } finally {
      setSharing(null);
    }
  }

  return (
    <View style={posStyles.stack}>
      {issued.map((l) => {
        const v = l.voucher!;
        // A send date is always tomorrow or later when the voucher is sold, so here it is still ahead.
        const scheduled = Boolean(v.send_at && v.recipient_email);
        return (
          <Boxed key={l.id}>
            <Text variant="bodyMedium">{t('done.voucher.issued', { last4: v.code_last4 ?? '' })}</Text>
            {scheduled ? (
              <Text variant="caption" tone="muted">
                {t('done.voucher.scheduled', {
                  recipientName: v.recipient_name ?? v.recipient_email ?? '',
                  date: formatDay(v.send_at, timeZone),
                })}
              </Text>
            ) : null}
            {canPdf ? (
              <Button
                label={t('app.voucher.pdf')}
                variant="secondary"
                size="sm"
                loading={sharing === v.account_id}
                disabled={sharing !== null}
                onPress={() => void share(v.account_id!, v.code_last4)}
              />
            ) : null}
          </Boxed>
        );
      })}
    </View>
  );
}

/** One line of a voucher's summary, for lists: "Gift voucher ending 9HPA", the balance and the use-by. */
export function VoucherSummaryRow({ voucher, timeZone }: { voucher: PosVoucherSummary; timeZone: string }) {
  const t = usePosT();
  const lastDay = voucherLastDay(voucher.expires_at, timeZone);
  return (
    <Boxed>
      <View style={posStyles.row}>
        <Text variant="bodyMedium" style={styles.flex}>
          {t('vch.ending', { last4: voucher.code_last4 ?? '' })}
        </Text>
        <VoucherStatusBadge status={voucher.status} />
      </View>
      <Text variant="bodySmall">{t('vch.balance', { balance: money(voucher.balance_pence) })}</Text>
      <Text variant="caption" tone="muted">
        {lastDay ? t('vch.expires', { date: lastDay }) : t('vch.noExpiry')}
      </Text>
    </Boxed>
  );
}

/** A bordered block inside a sheet or card. */
function Boxed({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[posStyles.stack, styles.box, { borderColor: colors.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  dateBlock: { gap: spacing.xs },
  flex: { flex: 1 },
});
