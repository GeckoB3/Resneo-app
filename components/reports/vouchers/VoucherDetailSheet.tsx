import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, Notice, PosSheet, usePosT } from '@/components/pos/parts';
import { useReportDownload } from '@/components/reports/pos/PosReportUi';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { ApiError } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { parseMoneyInput } from '@/lib/pos/sale-math';
import { formatDay, todayInZone, voucherLastDay } from '@/lib/pos/voucher-math';
import { posReportPaths, useVoucherAction, useVoucherDetail, type VoucherAction } from '@/lib/queries/usePosReports';
import { formatLongDay, formatMoneyExact, isDisputeHold, movementWords, voucherLastDayYmd } from '@/lib/reports/pos-report-format';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VoucherDetail } from '@/types/pos-reports';

/**
 * One gift voucher (web `VoucherSheet.tsx`, UX spec §20.8), opened from the Vouchers tab's list:
 * its status, balance, dates, buyer and recipient, the message, the delivery state and its history,
 * newest first. With `manage_vouchers` (admins always) it offers the voucher PDF through the share
 * sheet, sending the email again, extending it, putting it on hold or taking it off, changing what
 * is left and cancelling it, each with a reason where it changes value or status. The web's small
 * dialogs open here as steps inside the same sheet. Never the code: only its last four characters.
 * Server sentences are shown word for word.
 */

type Step = 'view' | 'resend' | 'extend' | 'freeze' | 'unfreeze' | 'adjust' | 'cancel' | 'cancelReason';

const STATUS: Record<string, { id: 'vch.status.active' | 'vch.status.usedUp' | 'vch.status.expired' | 'vch.status.frozen' | 'vch.status.cancelled'; tone: BadgeTone }> = {
  active: { id: 'vch.status.active', tone: 'success' },
  used_up: { id: 'vch.status.usedUp', tone: 'neutral' },
  expired: { id: 'vch.status.expired', tone: 'warning' },
  frozen: { id: 'vch.status.frozen', tone: 'danger' },
  cancelled: { id: 'vch.status.cancelled', tone: 'neutral' },
};

/** The voucher's status as the web's pill shows it. */
export function ReportVoucherStatus({ status }: { status: string }) {
  const t = usePosT();
  const s = STATUS[status] ?? STATUS.active!;
  return <Badge label={t(s.id)} tone={s.tone} />;
}

/** `vch.sent`, `vch.scheduled` or `vch.notSent`. */
function deliveryWords(a: VoucherDetail['account'], timeZone: string): string {
  const email = a.recipient_email ?? a.buyer_email;
  if (a.sent_at && email) return reportsCopy('vch.sent', { email, date: formatDay(a.sent_at, timeZone) });
  if (a.send_at && email && !a.sent_at) return reportsCopy('vch.scheduled', { email, date: formatDay(a.send_at, timeZone) });
  return reportsCopy('vch.notSent');
}

export function VoucherDetailSheet({
  voucherId,
  canManage,
  timeZone,
  currency,
  onClose,
}: {
  voucherId: string | null;
  canManage: boolean;
  timeZone: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const q = useVoucherDetail(voucherId);
  const action = useVoucherAction(voucherId ?? '');
  const download = useReportDownload();
  const [step, setStep] = useState<Step>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Step fields.
  const [text, setText] = useState('');
  const [day, setDay] = useState('');
  const [never, setNever] = useState(false);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amountText, setAmountText] = useState('');
  // One request id per attempt, kept across a retry after a lost answer so it is recorded once.
  const [requestId, setRequestId] = useState(() => newPaymentAttemptId());

  const detail = q.data;
  const a = detail?.account;
  const money = (p: number) => formatMoneyExact(p, a?.currency?.toUpperCase() ?? currency ?? 'GBP');
  const isVoucher = a?.kind !== 'credit';
  const lastDay = a ? voucherLastDay(a.expires_at, timeZone) : null;
  const newestExtendId = detail?.movements.find((m) => m.kind === 'extend')?.id ?? null;
  const closed = a?.status === 'cancelled';
  const today = todayInZone(timeZone);

  const close = () => {
    setStep('view');
    setNotice(null);
    setError(null);
    onClose();
  };

  const open = (next: Step) => {
    setError(null);
    setNotice(null);
    setText('');
    setAmountText('');
    setDirection('add');
    if (next === 'resend' && a) setText((a.recipient_email || a.recipient_name ? a.recipient_email : a.buyer_email) ?? '');
    if (next === 'extend' && a) {
      const current = voucherLastDayYmd(a.expires_at, timeZone);
      setDay(current && current >= today ? current : today);
      setNever(false);
    }
    setRequestId(newPaymentAttemptId());
    setStep(next);
  };

  const run = async (body: VoucherAction, sentence?: string) => {
    setError(null);
    try {
      await action.mutateAsync(body);
      setNotice(sentence ?? null);
      setStep('view');
    } catch (e) {
      // A request that reached ResNeo gets a fresh id next time; a lost one keeps it, so a retry is recorded once.
      if (e instanceof ApiError) setRequestId(newPaymentAttemptId());
      setError(posErrorMessage(e, t('common.networkError')));
    }
  };

  const sharePdf = async () => {
    if (!voucherId) return;
    setPdfBusy(true);
    try {
      await download(posReportPaths.voucherPdf(voucherId), reportsCopy('vch.pdf'), {
        fallbackFilename: `gift-voucher-${a?.code_last4 ?? 'voucher'}.pdf`,
        mimeType: 'application/pdf',
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const title = a ? (isVoucher ? reportsCopy('vch.title', { last4: a.code_last4 ?? '' }) : t('totals.credit')) : t('pay.method.voucher');
  const amount = parseMoneyInput(amountText);
  const tooMuch = direction === 'remove' && amount != null && a != null && amount > a.balance_pence;

  const stepBody = () => {
    if (!a) return null;
    switch (step) {
      case 'resend': {
        const toRecipient = Boolean(a.recipient_email || a.recipient_name);
        return (
          <View style={styles.stack}>
            <Text variant="label">{reportsCopy('vch.resend')}</Text>
            <Input
              label={toRecipient ? reportsCopy('vch.resend.to') : reportsCopy('vch.resend.holder')}
              accessibilityLabel={toRecipient ? reportsCopy('vch.resend.to') : reportsCopy('vch.resend.holder')}
              value={text}
              onChangeText={setText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
            />
            <ErrorLine message={error} />
            <Button
              label={reportsCopy('vch.resend')}
              loading={action.isPending}
              disabled={!text.trim()}
              onPress={() => void run({ action: 'resend', to: text.trim() })}
              fullWidth
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      }
      case 'extend': {
        const ready = Boolean(text.trim()) && (never || day >= today);
        return (
          <View style={styles.stack}>
            <Text variant="label">{reportsCopy('vch.extend.title')}</Text>
            <Text variant="caption" tone="muted">
              {reportsCopy('vch.useBy')}
            </Text>
            <DatePickerField
              value={day}
              onChange={setDay}
              accessibilityLabel={reportsCopy('vch.useBy')}
              minimumDate={new Date(`${today}T12:00:00`)}
              disabled={never}
            />
            <Chip label={reportsCopy('vch.noExpiry')} selected={never} onPress={() => setNever((n) => !n)} />
            <Input label={reportsCopy('vch.reason')} accessibilityLabel={reportsCopy('vch.reason')} value={text} onChangeText={setText} maxLength={200} />
            <ErrorLine message={error} />
            <Button
              label={reportsCopy('vch.extend')}
              loading={action.isPending}
              disabled={!ready}
              onPress={() =>
                void run(
                  { action: 'extend', client_request_id: requestId, expires_on: never ? null : day, reason: text.trim() },
                  never ? reportsCopy('vch.noExpiry') : reportsCopy('vch.extend.done', { date: formatLongDay(day) }),
                )
              }
              fullWidth
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      }
      case 'freeze':
      case 'unfreeze': {
        const label = reportsCopy(step === 'freeze' ? 'vch.freeze' : 'vch.unfreeze');
        return (
          <View style={styles.stack}>
            <Text variant="label">{label}</Text>
            <Input label={reportsCopy('vch.reason')} accessibilityLabel={reportsCopy('vch.reason')} value={text} onChangeText={setText} multiline maxLength={200} />
            <ErrorLine message={error} />
            <Button
              label={label}
              loading={action.isPending}
              disabled={!text.trim()}
              onPress={() => void run({ action: step, reason: text.trim() })}
              fullWidth
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      }
      case 'adjust': {
        const ready = amount != null && amount > 0 && !tooMuch && Boolean(text.trim());
        return (
          <View style={styles.stack}>
            <Text variant="label">{reportsCopy('vch.adjust')}</Text>
            <Text variant="bodySmall" tone="secondary">
              {t('vch.balance', { balance: money(a.balance_pence) })}
            </Text>
            <View style={styles.row}>
              <Chip label={reportsCopy('vch.adjust.add')} selected={direction === 'add'} onPress={() => setDirection('add')} />
              <Chip label={reportsCopy('vch.adjust.remove')} selected={direction === 'remove'} onPress={() => setDirection('remove')} />
            </View>
            <Input
              label={reportsCopy('vch.amount')}
              accessibilityLabel={reportsCopy('vch.amount')}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              error={tooMuch ? t('vch.balance', { balance: money(a.balance_pence) }) : undefined}
            />
            <Input label={reportsCopy('vch.reason')} accessibilityLabel={reportsCopy('vch.reason')} value={text} onChangeText={setText} maxLength={200} />
            <ErrorLine message={error} />
            <Button
              label={reportsCopy('vch.adjust.save')}
              loading={action.isPending}
              disabled={!ready}
              onPress={() =>
                amount != null
                  ? void run({
                      action: 'adjust',
                      client_request_id: requestId,
                      delta_pence: direction === 'add' ? amount : -amount,
                      reason: text.trim(),
                    })
                  : undefined
              }
              fullWidth
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      }
      case 'cancel':
        return (
          <View style={styles.stack}>
            <Text variant="label">{reportsCopy('vch.cancel.title')}</Text>
            <Text variant="bodySmall">{reportsCopy('vch.cancel.body')}</Text>
            <Button label={reportsCopy('vch.cancel')} variant="danger" onPress={() => setStep('cancelReason')} fullWidth />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      case 'cancelReason':
        return (
          <View style={styles.stack}>
            <Text variant="label">{reportsCopy('vch.cancel.title')}</Text>
            <Input label={reportsCopy('vch.reason')} accessibilityLabel={reportsCopy('vch.reason')} value={text} onChangeText={setText} multiline maxLength={200} />
            <ErrorLine message={error} />
            <Button
              label={reportsCopy('vch.cancel')}
              variant="danger"
              loading={action.isPending}
              disabled={!text.trim()}
              onPress={() => void run({ action: 'cancel', reason: text.trim(), client_request_id: requestId })}
              fullWidth
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setStep('view')} fullWidth />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <PosSheet visible={voucherId !== null} onClose={close} title={title}>
      {q.isLoading ? <DetailSkeleton /> : null}
      {q.isError ? (
        <View style={styles.stack}>
          <ErrorLine message={posErrorMessage(q.error, reportsCopy('vch.loadError'))} />
          <Button label={t('common.tryAgain')} variant="secondary" size="sm" onPress={() => void q.refetch()} />
        </View>
      ) : null}
      {a && detail ? (
        step !== 'view' ? (
          stepBody()
        ) : (
          <View style={styles.stack}>
            <View style={styles.row}>
              <ReportVoucherStatus status={a.status} />
              <Text variant="title">{t('vch.balance', { balance: money(a.balance_pence) })}</Text>
            </View>
            {a.status === 'frozen' ? (
              <Notice tone="warning">
                {isDisputeHold(a.status, a.frozen_reason)
                  ? reportsCopy('vch.disputed')
                  : a.frozen_reason?.trim()
                    ? reportsCopy('vch.onHoldWhy', { reason: a.frozen_reason.trim() })
                    : reportsCopy('vch.onHold')}
              </Notice>
            ) : null}
            {notice ? <Notice tone="success">{notice}</Notice> : null}
            <ErrorLine message={error} />

            <View style={styles.facts}>
              {isVoucher ? <Text variant="bodySmall">{reportsCopy('vch.initial', { amount: money(a.initial_pence) })}</Text> : null}
              <Text variant="bodySmall">{reportsCopy('vch.issued', { date: formatDay(a.issued_at, timeZone) })}</Text>
              {isVoucher ? (
                <Text variant="bodySmall">{lastDay ? t('vch.expires', { date: lastDay }) : reportsCopy('vch.noExpiry')}</Text>
              ) : null}
              {a.buyer_name ? <Text variant="bodyMedium">{a.buyer_name}</Text> : null}
              {a.recipient_name ? <Text variant="bodyMedium">{t('vpay.for', { recipientName: a.recipient_name })}</Text> : null}
              {a.message ? (
                <View style={[styles.message, { backgroundColor: colors.surface }]}>
                  <Text variant="bodySmall" style={styles.italic}>
                    {a.message}
                  </Text>
                </View>
              ) : null}
              {isVoucher ? <Text variant="bodySmall">{deliveryWords(a, timeZone)}</Text> : null}
            </View>

            {canManage && !closed ? (
              <View style={[styles.actions, { borderTopColor: colors.border }]}>
                {isVoucher ? (
                  <>
                    <Button label={reportsCopy('vch.pdf')} variant="secondary" loading={pdfBusy} onPress={() => void sharePdf()} fullWidth />
                    <Button label={reportsCopy('vch.resend')} variant="secondary" onPress={() => open('resend')} fullWidth />
                    <Button label={reportsCopy('vch.extend')} variant="secondary" onPress={() => open('extend')} fullWidth />
                    {a.status === 'frozen' ? (
                      <Button label={reportsCopy('vch.unfreeze')} variant="secondary" onPress={() => open('unfreeze')} fullWidth />
                    ) : (
                      <Button label={reportsCopy('vch.freeze')} variant="secondary" onPress={() => open('freeze')} fullWidth />
                    )}
                  </>
                ) : null}
                <Button label={reportsCopy('vch.adjust')} variant="secondary" onPress={() => open('adjust')} fullWidth />
                {isVoucher ? <Button label={reportsCopy('vch.cancel')} variant="danger" onPress={() => open('cancel')} fullWidth /> : null}
              </View>
            ) : null}

            <View style={[styles.actions, { borderTopColor: colors.border }]}>
              <Text variant="label">{reportsCopy('vch.history')}</Text>
              {detail.movements.map((m) => (
                <View key={m.id} style={[styles.movement, { borderBottomColor: colors.border }]}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall">{movementWords(m, { lastDay, newestExtendId })}</Text>
                    <Text variant="caption" tone="muted">
                      {[formatDay(m.created_at, timeZone), m.staff_name].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <Text variant="bodySmall" tone={m.delta_pence < 0 ? 'default' : 'success'} style={styles.figure}>
                    {m.delta_pence === 0 ? '' : money(m.delta_pence)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  facts: { gap: spacing.xs },
  message: { borderRadius: radius.md, padding: spacing.sm },
  italic: { fontStyle: 'italic' },
  actions: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  movement: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  figure: { fontVariant: ['tabular-nums'] },
});
