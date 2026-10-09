import { Image } from 'expo-image';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AmountRow, ChoiceChips, ErrorLine, money, Notice, PickRow, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { hapticSuccess } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posHeaders, posPaths } from '@/lib/pos/api';
import { pickReceiptPhoto } from '@/lib/pos/receipt-photo';
import { parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import {
  BAGGED_KEY,
  bankingAddsUp,
  defaultBanking,
  denominationLabel,
  denominationsFromDraft,
  GBP_DENOMINATIONS,
  PAID_IN_CATEGORIES,
  PAID_OUT_CATEGORIES,
  reportWhen,
  suggestedFloat,
  tillForCash,
  tillReportFilename,
  tillReportSections,
  tipPayouts,
  varianceWords,
  type DenominationDraft,
} from '@/lib/pos/till-math';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  uploadTillReceiptPhoto,
  useCashTipsDue,
  useCloseTill,
  useCountTill,
  useEmailZReport,
  useOpenTill,
  useTillMovement,
  useTillSessions,
  type TillMovementInput,
} from '@/lib/queries/useTill';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosDenominations, PosTillCountResult, PosTillReport, PosTillSession, PosTillSessionDetail, PosTillState } from '@/types/pos';

/**
 * The till's sheets in the app (POS app step 3, plan P7-10; UX spec §7.2 to §7.5, §7.9, §13.5), as
 * the web's `OpenTillDialog`, `MovementDialog`, `TipsPaidOutDialog`, `CloseTillSheet` and
 * `TillReportView`, presented as phone sheets with the PDF through the share sheet.
 */

// ─── An amount, or the notes and coins grid (§7.9) ──────────────────────────

/** One amount, or with `session.countByDenom` the notes and coins grid with its total. */
function CashAmount({
  label,
  amount,
  onAmount,
  byDenom,
  onByDenom,
  draft,
  onDraft,
  error,
}: {
  label: string;
  amount: string;
  onAmount: (v: string) => void;
  byDenom: boolean;
  onByDenom: (v: boolean) => void;
  draft: DenominationDraft;
  onDraft: (d: DenominationDraft) => void;
  error?: string | null;
}) {
  const t = usePosT();
  const grid = denominationsFromDraft(draft);
  return (
    <View style={posStyles.stack}>
      <View style={posStyles.row}>
        <Text variant="bodyMedium" style={styles.flex}>
          {t('session.countByDenom')}
        </Text>
        <Switch value={byDenom} onValueChange={onByDenom} accessibilityLabel={t('session.countByDenom')} />
      </View>
      {byDenom ? (
        <View style={posStyles.stack}>
          {GBP_DENOMINATIONS.map((d) => (
            <View key={d.key} style={styles.denomRow}>
              <Text variant="bodySmall" style={styles.flex}>
                {denominationLabel(d, t)}
              </Text>
              <Input
                accessibilityLabel={denominationLabel(d, t)}
                value={draft[d.key] ?? ''}
                onChangeText={(v) => onDraft({ ...draft, [d.key]: v.replace(/[^\d]/g, '') })}
                keyboardType="number-pad"
                placeholder="0"
                containerStyle={styles.denomInput}
              />
            </View>
          ))}
          <View style={styles.denomRow}>
            <Text variant="bodySmall" style={styles.flex}>
              {t('denom.bagged')}
            </Text>
            <Input
              accessibilityLabel={t('denom.bagged')}
              value={draft[BAGGED_KEY] ?? ''}
              onChangeText={(v) => onDraft({ ...draft, [BAGGED_KEY]: v })}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0.00"
              containerStyle={styles.denomInput}
            />
          </View>
          <AmountRow label={t('denom.total')} amount={grid ? money(grid.totalPence) : '-'} strong />
          <ErrorLine message={error} />
        </View>
      ) : (
        <Input
          label={label}
          accessibilityLabel={label}
          value={amount}
          onChangeText={onAmount}
          keyboardType="decimal-pad"
          inputMode="decimal"
          error={error ?? undefined}
        />
      )}
    </View>
  );
}

/** The amount the field or the grid holds, with the grid to send, or null when it is not money. */
function readCash(byDenom: boolean, amount: string, draft: DenominationDraft): { pence: number; denominations: PosDenominations | null } | null {
  if (byDenom) {
    const grid = denominationsFromDraft(draft);
    return grid ? { pence: grid.totalPence, denominations: grid.body } : null;
  }
  const pence = parseMoneyInput(amount);
  return pence == null ? null : { pence, denominations: null };
}

// ─── Opening the till (§7.2) ────────────────────────────────────────────────

/**
 * "Open {till}": the float, filled with what was left last time (`session.float.fromLast`) or the
 * venue's usual float, by one amount or by notes and coins. One request id per sheet.
 * `POS_SESSION_ALREADY_OPEN`: the server's sentence, and the caller reads the tills again.
 */
export function OpenTillSheet({
  visible,
  till,
  usualFloatPence,
  refundOnly,
  onClose,
  onOpened,
}: {
  visible: boolean;
  till: PosTillState | null;
  usualFloatPence: number;
  refundOnly?: boolean;
  onClose: () => void;
  onOpened: (detail: PosTillSessionDetail | null, message: string) => void;
}) {
  return visible && till ? (
    <OpenTillBody
      till={till}
      usualFloatPence={usualFloatPence}
      refundOnly={refundOnly}
      onClose={onClose}
      onOpened={onOpened}
    />
  ) : null;
}

function OpenTillBody({
  till,
  usualFloatPence,
  refundOnly,
  onClose,
  onOpened,
}: {
  till: PosTillState;
  usualFloatPence: number;
  refundOnly?: boolean;
  onClose: () => void;
  onOpened: (detail: PosTillSessionDetail | null, message: string) => void;
}) {
  const t = usePosT();
  const open = useOpenTill();
  const requestId = useRef(newPaymentAttemptId());
  const [amount, setAmount] = useState(penceToInput(suggestedFloat(till, usualFloatPence)));
  const [byDenom, setByDenom] = useState(false);
  const [draft, setDraft] = useState<DenominationDraft>({});
  const [error, setError] = useState<string | null>(null);
  const cash = readCash(byDenom, amount, draft);

  async function submit() {
    if (!cash) return;
    setError(null);
    try {
      const detail = await open.mutateAsync({
        tillId: till.id,
        clientRequestId: requestId.current,
        floatPence: cash.pence,
        denominations: cash.denominations,
      });
      hapticSuccess();
      onOpened(detail, t('session.opened', { till: till.name }));
    } catch (e) {
      if (apiErrorCode(e) === 'POS_SESSION_ALREADY_OPEN') {
        // Someone opened it on another device: carry on with theirs.
        onOpened(null, posErrorMessage(e, t('err.POS_SESSION_ALREADY_OPEN', { till: till.name })));
        return;
      }
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('session.open.title', { till: till.name })}
      footer={
        <Button
          label={t('session.open.confirm')}
          loading={open.isPending}
          disabled={!cash || open.isPending}
          onPress={() => void submit()}
          fullWidth
        />
      }>
      {refundOnly ? <Notice tone="warning">{t('session.open.refundOnly')}</Notice> : null}
      {till.last_float_left_pence != null ? (
        <Text variant="bodySmall" tone="muted">
          {t('session.float.fromLast', { amount: money(till.last_float_left_pence) })}
        </Text>
      ) : null}
      <CashAmount
        label={t('session.float')}
        amount={amount}
        onAmount={setAmount}
        byDenom={byDenom}
        onByDenom={setByDenom}
        draft={draft}
        onDraft={setDraft}
      />
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Paid in, paid out and safe drops (§7.3) ────────────────────────────────

export type MoveKind = 'paid_in' | 'paid_out' | 'safe_drop';

/**
 * Paid in (`move.in.*`), paid out (`move.out.*`) with a receipt photo from the library or the
 * camera, or a safe drop (`move.drop.*`). One request id per sheet, so a retry records once.
 */
export function MovementSheet({
  kind,
  session,
  onClose,
}: {
  kind: MoveKind | null;
  session: PosTillSession;
  onClose: () => void;
}) {
  return kind ? <MovementBody key={kind} kind={kind} session={session} onClose={onClose} /> : null;
}

function MovementBody({ kind, session, onClose }: { kind: MoveKind; session: PosTillSession; onClose: () => void }) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const move = useTillMovement(session.id);
  const requestId = useRef(newPaymentAttemptId());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; path: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pence = parseMoneyInput(amount);
  const categories = kind === 'paid_in' ? PAID_IN_CATEGORIES : kind === 'paid_out' ? PAID_OUT_CATEGORIES : null;
  const ready = pence != null && pence > 0 && (categories ? category !== null : true);
  const title = kind === 'paid_in' ? t('move.in.title') : kind === 'paid_out' ? t('move.out.title') : t('move.drop.title');
  const confirm = kind === 'paid_in' ? t('move.in.confirm') : kind === 'paid_out' ? t('move.out.confirm') : t('move.drop.confirm');

  async function addPhoto(source: 'library' | 'camera') {
    if (!accessToken) return;
    setError(null);
    let picked: Awaited<ReturnType<typeof pickReceiptPhoto>>;
    try {
      picked = await pickReceiptPhoto(source);
    } catch {
      setError(t('app.till.photo.failed'));
      return;
    }
    if (picked === 'denied') {
      setError(t('app.photo.denied'));
      return;
    }
    if (!picked) return;
    setPhotoBusy(true);
    try {
      const path = await uploadTillReceiptPhoto(accessToken, session.id, picked);
      setPhoto({ uri: picked.uri, path });
    } catch (e) {
      setError(posErrorMessage(e, t('app.till.photo.failed')));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    if (!ready || pence == null) return;
    setError(null);
    const trimmed = note.trim() || null;
    const movement: TillMovementInput =
      kind === 'paid_in'
        ? { kind, amount_pence: pence, category: category as 'bank' | 'float' | 'other', note: trimmed, attachment_path: photo?.path ?? null }
        : kind === 'paid_out'
          ? {
              kind,
              amount_pence: pence,
              category: category as 'petty' | 'supplier' | 'expenses' | 'other',
              note: trimmed,
              attachment_path: photo?.path ?? null,
            }
          : { kind, amount_pence: pence, note: trimmed };
    try {
      await move.mutateAsync({ clientRequestId: requestId.current, movement });
      hapticSuccess();
      toast.success(t('app.till.recorded'));
      onClose();
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={title}
      subtitle={kind === 'safe_drop' ? t('move.drop.help') : null}
      footer={<Button label={confirm} loading={move.isPending} disabled={!ready || move.isPending || photoBusy} onPress={() => void submit()} fullWidth />}>
      <Input
        label={t('app.till.amount')}
        accessibilityLabel={t('app.till.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        inputMode="decimal"
        autoFocus
      />
      {categories ? (
        <>
          <Text variant="label">{t('move.category')}</Text>
          <ChoiceChips options={categories.map((c) => ({ value: c.value, label: t(c.copy) }))} value={category} onChange={setCategory} />
        </>
      ) : null}
      <Input label={t('move.note')} accessibilityLabel={t('move.note')} value={note} onChangeText={setNote} maxLength={500} optional multiline />
      {kind !== 'safe_drop' ? (
        <View style={posStyles.stack}>
          <Text variant="label">{t('move.photo')}</Text>
          {photo ? (
            <View style={posStyles.row}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={t('app.till.photo.added')} />
              <Text variant="bodySmall" style={styles.flex}>
                {t('app.till.photo.added')}
              </Text>
              <Button label={t('app.till.photo.remove')} size="sm" variant="ghost" onPress={() => setPhoto(null)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button label={t('app.photo.library')} size="sm" variant="secondary" loading={photoBusy} onPress={() => void addPhoto('library')} />
              <Button label={t('app.photo.camera')} size="sm" variant="secondary" disabled={photoBusy} onPress={() => void addPhoto('camera')} />
            </View>
          )}
        </View>
      ) : null}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Tips paid out (§7.3) ───────────────────────────────────────────────────

/**
 * "Tips paid out": one row per person with cash tips allocated and not yet paid, a tick and an
 * amount (never more than is still to pay). One movement, linked to their tip records.
 */
export function TipsPaidOutSheet({ visible, session, onClose }: { visible: boolean; session: PosTillSession; onClose: () => void }) {
  return visible ? <TipsBody session={session} onClose={onClose} /> : null;
}

function TipsBody({ session, onClose }: { session: PosTillSession; onClose: () => void }) {
  const t = usePosT();
  const toast = useToast();
  const due = useCashTipsDue();
  const move = useTillMovement(session.id);
  const requestId = useRef(newPaymentAttemptId());
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const people = due.data ?? [];
  const keyOf = (p: { calendar_id: string | null; staff_id: string | null }) => p.calendar_id ?? `s:${p.staff_id}`;
  const rows = people.map((p) => {
    const key = keyOf(p);
    const text = amounts[key] ?? penceToInput(p.unpaid_pence);
    return { ...p, key, picked: picked[key] === true, amountPence: parseMoneyInput(text), text };
  });
  const result = tipPayouts(rows);

  async function submit() {
    if (!result.valid) return;
    setError(null);
    try {
      await move.mutateAsync({ clientRequestId: requestId.current, movement: { kind: 'tips_paid_out', payouts: result.payouts } });
      hapticSuccess();
      toast.success(t('app.till.recorded'));
      onClose();
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('move.tips.title')}
      subtitle={t('move.tips.help')}
      footer={
        <Button
          label={t('move.tips.confirm', { amount: money(result.totalPence) })}
          loading={move.isPending}
          disabled={!result.valid || move.isPending}
          onPress={() => void submit()}
          fullWidth
        />
      }>
      {due.isLoading ? (
        <Text tone="muted">{t('app.loading')}</Text>
      ) : due.isError ? (
        <ErrorLine message={posErrorMessage(due.error, t('common.networkError'))} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{t('app.till.tips.none')}</Text>
      ) : (
        rows.map((r) => (
          <View key={r.key} style={styles.tipRow}>
            <View style={posStyles.row}>
              <Switch
                value={r.picked}
                onValueChange={(v) => setPicked((cur) => ({ ...cur, [r.key]: v }))}
                accessibilityLabel={r.name}
              />
              <View style={styles.flex}>
                <Text variant="bodyMedium">{r.name}</Text>
                <Text variant="caption" tone="muted">
                  {t('app.till.tips.unpaid', { amount: money(r.unpaid_pence) })}
                </Text>
              </View>
            </View>
            {r.picked ? (
              <Input
                accessibilityLabel={`${t('app.till.amount')} ${r.name}`}
                value={r.text}
                onChangeText={(v) => setAmounts((cur) => ({ ...cur, [r.key]: v }))}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            ) : null}
          </View>
        ))
      )}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Closing the till: a blind count (§7.4) ─────────────────────────────────

type CloseStep = 'count' | 'result' | 'bank' | 'done';

/**
 * "Close {till}" in steps (§7.4): count (blind unless the venue turned blind close off and this
 * person may see expected cash), the result (balanced, over or short; the expected figure only with
 * `see_expected_cash`; a reason over the venue's threshold; one recount), banking (cash to the bank
 * and the float left, which must add up to the count), then the Z report with its PDF and
 * "Email to admins".
 */
export function CloseTillSheet({
  visible,
  till,
  session,
  blindClose,
  canSeeExpected,
  expectedBeforePence,
  usualFloatPence,
  timeZone,
  onClose,
}: {
  visible: boolean;
  till: PosTillState;
  session: PosTillSession;
  blindClose: boolean;
  canSeeExpected: boolean;
  /** The X report's expected figure, shown before counting only when blind close is off. */
  expectedBeforePence: number | null;
  usualFloatPence: number;
  timeZone: string;
  onClose: () => void;
}) {
  return visible ? (
    <CloseBody
      till={till}
      session={session}
      blindClose={blindClose}
      canSeeExpected={canSeeExpected}
      expectedBeforePence={expectedBeforePence}
      usualFloatPence={usualFloatPence}
      timeZone={timeZone}
      onClose={onClose}
    />
  ) : null;
}

function CloseBody({
  till,
  session,
  blindClose,
  canSeeExpected,
  expectedBeforePence,
  usualFloatPence,
  timeZone,
  onClose,
}: {
  till: PosTillState;
  session: PosTillSession;
  blindClose: boolean;
  canSeeExpected: boolean;
  expectedBeforePence: number | null;
  usualFloatPence: number;
  timeZone: string;
  onClose: () => void;
}) {
  const t = usePosT();
  const count = useCountTill(session.id);
  const close = useCloseTill(session.id);
  const [step, setStep] = useState<CloseStep>('count');
  const [amount, setAmount] = useState('');
  const [byDenom, setByDenom] = useState(false);
  const [draft, setDraft] = useState<DenominationDraft>({});
  const [counted, setCounted] = useState<{ pence: number; denominations: PosDenominations | null } | null>(null);
  const [result, setResult] = useState<PosTillCountResult | null>(null);
  const [reason, setReason] = useState('');
  const [reasonRequired, setReasonRequired] = useState(false);
  const [bank, setBank] = useState('');
  const [floatLeft, setFloatLeft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PosTillReport | null>(null);
  const cash = readCash(byDenom, amount, draft);

  async function submitCount() {
    if (!cash) return;
    setError(null);
    try {
      const res = await count.mutateAsync({ countedPence: cash.pence, denominations: cash.denominations });
      setCounted(cash);
      setResult(res);
      setReasonRequired(res.needs_reason);
      const banking = defaultBanking(res.counted_cash_pence, usualFloatPence);
      setBank(penceToInput(banking.bankPence));
      setFloatLeft(penceToInput(banking.floatPence));
      setStep('result');
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  const bankPence = parseMoneyInput(bank);
  const floatPence = parseMoneyInput(floatLeft);
  const countedPence = result?.counted_cash_pence ?? counted?.pence ?? 0;
  const addsUp = bankingAddsUp(countedPence, bankPence, floatPence);

  async function submitClose() {
    if (!counted || bankPence == null || floatPence == null || !addsUp) return;
    setError(null);
    try {
      const detail = await close.mutateAsync({
        countedPence,
        denominations: counted.denominations,
        reason: reason.trim() || null,
        bankPence,
        floatPence,
      });
      hapticSuccess();
      setReport(detail.report);
      setStep('done');
    } catch (e) {
      if (apiErrorCode(e) === 'POS_VARIANCE_REASON_REQUIRED') {
        setReasonRequired(true);
        setStep('result');
      }
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  const title = t('close.title', { till: till.name });
  let footer: ReactNode = null;
  let body: ReactNode = null;

  if (step === 'count') {
    footer = (
      <Button label={t('close.next')} loading={count.isPending} disabled={!cash || count.isPending} onPress={() => void submitCount()} fullWidth />
    );
    body = (
      <>
        <Text variant="bodyMedium">{t('close.count.body')}</Text>
        {blindClose || !canSeeExpected || expectedBeforePence == null ? (
          blindClose ? (
            <Text variant="bodySmall" tone="muted">
              {t('close.blind')}
            </Text>
          ) : null
        ) : (
          <Notice>{t('close.expected.before', { expected: money(expectedBeforePence) })}</Notice>
        )}
        <CashAmount
          label={t('close.total')}
          amount={amount}
          onAmount={setAmount}
          byDenom={byDenom}
          onByDenom={setByDenom}
          draft={draft}
          onDraft={setDraft}
        />
      </>
    );
  } else if (step === 'result' && result) {
    const needsReason = reasonRequired && !reason.trim();
    footer = (
      <View style={posStyles.buttons}>
        <Button label={t('close.next')} disabled={needsReason} onPress={() => setStep('bank')} fullWidth />
        {result.can_recount ? (
          <Button
            label={t('close.recount')}
            variant="ghost"
            onPress={() => {
              setError(null);
              setStep('count');
            }}
            fullWidth
          />
        ) : null}
      </View>
    );
    body = (
      <>
        <Text variant="heading">{varianceWords(result.variance_pence, t, money)}</Text>
        {canSeeExpected && result.expected_cash_pence != null ? (
          <Text variant="bodyMedium">
            {t('close.expected', { expected: money(result.expected_cash_pence), counted: money(result.counted_cash_pence) })}
          </Text>
        ) : (
          <AmountRow label={t('close.total')} amount={money(result.counted_cash_pence)} strong />
        )}
        {reasonRequired ? <Notice tone="warning">{t('close.needsReason')}</Notice> : null}
        {result.variance_pence !== 0 ? (
          <Input
            label={t('close.reason')}
            accessibilityLabel={t('close.reason')}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            optional={!reasonRequired}
          />
        ) : null}
      </>
    );
  } else if (step === 'bank') {
    footer = (
      <View style={posStyles.buttons}>
        <Button label={t('close.confirm')} loading={close.isPending} disabled={!addsUp || close.isPending} onPress={() => void submitClose()} fullWidth />
        <Button label={t('app.card.back')} variant="ghost" disabled={close.isPending} onPress={() => setStep('result')} fullWidth />
      </View>
    );
    body = (
      <>
        <AmountRow label={t('close.total')} amount={money(countedPence)} strong />
        <Input label={t('close.bank')} accessibilityLabel={t('close.bank')} value={bank} onChangeText={setBank} keyboardType="decimal-pad" inputMode="decimal" />
        <Input label={t('close.floatLeft')} accessibilityLabel={t('close.floatLeft')} value={floatLeft} onChangeText={setFloatLeft} keyboardType="decimal-pad" inputMode="decimal" />
        {!addsUp ? <Notice tone="warning">{t('close.mismatch', { counted: money(countedPence) })}</Notice> : null}
      </>
    );
  } else if (step === 'done') {
    footer = <Button label={t('app.card.back')} variant="secondary" onPress={onClose} fullWidth />;
    body = (
      <>
        <Notice tone="success">{t('app.till.closed.done', { till: till.name })}</Notice>
        {report ? <TillReportView report={report} timeZone={timeZone} /> : null}
      </>
    );
  }

  return (
    <PosSheet visible onClose={onClose} title={title} footer={footer}>
      {body}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── X and Z reports (§7.5) ─────────────────────────────────────────────────

/**
 * The X report (the till still open, `z.xWatermark`) or the frozen Z report, on screen in the
 * spec's order; shared as the PDF through the share sheet (`app.receipt.share`); a Z report can be
 * emailed to the admins (`z.email`, `open_close_till`).
 */
export function TillReportView({
  report,
  timeZone,
  canEmail = true,
}: {
  report: PosTillReport;
  timeZone: string;
  canEmail?: boolean;
}) {
  const t = usePosT();
  const toast = useToast();
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const email = useEmailZReport(report.session_id);
  const [sharing, setSharing] = useState(false);
  const sections = tillReportSections(report, { t, money, when: (iso) => reportWhen(iso, timeZone) });
  const heading = t('app.till.report.title', { report: report.kind === 'z' ? t('z.title') : t('z.xTitle'), till: report.till_name });

  async function share() {
    if (!accessToken) return;
    setSharing(true);
    try {
      const res = await downloadAndShareFile({
        url: `${getApiUrl()}${posPaths.tillReportPdf(report.session_id)}`,
        filename: tillReportFilename(report),
        mimeType: 'application/pdf',
        headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
        dialogTitle: heading,
      });
      if (!res.ok) toast.error(t('app.till.report.failed'));
    } finally {
      setSharing(false);
    }
  }

  async function sendEmail() {
    try {
      const res = await email.mutateAsync();
      toast.success(t('app.till.report.emailed', { count: res.sent }));
    } catch (e) {
      toast.error(posErrorMessage(e, t('common.networkError')));
    }
  }

  return (
    <View style={[styles.report, { borderColor: colors.border }]}>
      <Text variant="subheading">{heading}</Text>
      {report.kind === 'x' ? (
        <Text variant="caption" tone="muted">
          {t('z.xWatermark')}
        </Text>
      ) : null}
      {sections.map((s, i) => (
        <View key={`${s.heading ?? 'section'}-${i}`} style={styles.reportSection}>
          {s.heading ? <Text variant="label">{s.heading}</Text> : null}
          {s.lines.map((l, j) =>
            l.value != null ? (
              <AmountRow key={`${l.label}-${j}`} label={l.label} amount={l.value} strong={l.strong} />
            ) : (
              <Text key={`${l.label}-${j}`} variant="bodySmall">
                {l.label}
              </Text>
            ),
          )}
        </View>
      ))}
      {report.expected_hidden && report.kind === 'x' ? (
        <Text variant="caption" tone="muted">
          {t('app.till.report.hidden')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label={t('app.receipt.share')} size="sm" variant="secondary" loading={sharing} onPress={() => void share()} />
        {report.kind === 'z' && canEmail ? (
          <Button label={t('z.email')} size="sm" variant="ghost" loading={email.isPending} onPress={() => void sendEmail()} />
        ) : null}
      </View>
    </View>
  );
}

/** A choice of till, when "Open the till" from a payment cannot tell which (several tills). */
export function TillChooser({ tills, onPick }: { tills: PosTillState[]; onPick: (till: PosTillState) => void }) {
  const t = usePosT();
  return (
    <View style={posStyles.stack}>
      <Text variant="label">{t('app.till.chooseTill')}</Text>
      {tills.map((till) => (
        <PickRow key={till.id} title={till.name} onPress={() => onPick(till)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  denomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  denomInput: { width: 110 },
  tipRow: { gap: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  report: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  reportSection: { gap: spacing.xs },
});

// ─── "Open the till" from a cash payment (§3.19.1) ──────────────────────────

/**
 * Under the cash panel's error when the payment was refused with `POS_TILL_SESSION_REQUIRED`:
 * `session.openNow` opens the till (§7.2) and comes back, so the cash can be taken with one more
 * tap. The till is the sale's own, the venue's till for app cash, or the only till; with several,
 * the person chooses. A sale with no till is then put on the till just opened (`PATCH` with its
 * version), so its cash is counted there whatever else is open.
 */
export function CashTillPrompt({
  sale,
  send,
  onResolved,
}: {
  sale: { till_id: string | null; version: number };
  send: (input: { action: string; method?: 'PATCH'; body?: Record<string, unknown> }) => Promise<unknown>;
  onResolved: (message: string) => void;
}) {
  const t = usePosT();
  const tills = useTillSessions();
  const [target, setTarget] = useState<PosTillState | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = tills.data;
  if (!data || !data.cash.enabled || !data.can.open_close_till) return null;
  const candidate = tillForCash(data, sale.till_id);
  const active = data.tills.filter((x) => x.is_active);

  async function assignTill(till: PosTillState, message: string) {
    setError(null);
    if (!sale.till_id) {
      try {
        await send({ action: '', method: 'PATCH', body: { version: sale.version, till_id: till.id } });
      } catch (e) {
        setError(posErrorMessage(e, t('common.saveError')));
        return;
      }
    }
    onResolved(message);
  }

  function pick(till: PosTillState) {
    setChoosing(false);
    if (till.session) void assignTill(till, t('err.POS_SESSION_ALREADY_OPEN', { till: till.name }));
    else setTarget(till);
  }

  return (
    <View style={posStyles.stack}>
      {choosing ? (
        <TillChooser tills={active} onPick={pick} />
      ) : (
        <Button
          label={t('session.openNow')}
          variant="secondary"
          onPress={() => (candidate && !candidate.session ? setTarget(candidate) : setChoosing(true))}
          fullWidth
        />
      )}
      <ErrorLine message={error} />
      <OpenTillSheet
        visible={target !== null}
        till={target}
        usualFloatPence={data.cash.default_float_pence}
        onClose={() => setTarget(null)}
        onOpened={(_detail, message) => {
          const opened = target;
          setTarget(null);
          if (opened) void assignTill(opened, message);
        }}
      />
    </View>
  );
}
