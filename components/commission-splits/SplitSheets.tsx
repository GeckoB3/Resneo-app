import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SplitExample } from '@/components/commission-splits/SplitExample';
import { TermsFields, checkTerms, draftRates, type TermsDraft } from '@/components/commission-splits/TermsFields';
import { PosSheet } from '@/components/pos/parts';
import { FieldBlock, MessageBox } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, commissionFieldErrors, fieldMessage, type CommissionFieldError } from '@/lib/commission/api';
import { businessSummary } from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import { calendarAt, nextDay, periodText, splitMoney, termsWithBasis } from '@/lib/commission/splits-format';
import { bpsToPercentText } from '@/lib/pos/settings-more/commission-copy';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { useEndSplit, useMarkPaid, useProposeTerms } from '@/lib/queries/useCommissionSplits';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { SplitPeriodView, SplitPreviewParams, SplitView } from '@/types/commission-splits';

/**
 * The sheets on a split's screen (web split card): "Propose new terms", "End this split" and
 * "Mark as paid". Each is one `PosSheet` (never a second modal over another), shows the server's
 * refusal word for word, and closes on success with the web's sentence as a toast.
 */

const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

/**
 * "Propose new terms": what is agreed now, a start date after the current terms began (and before
 * the split ends, when it is ending), the shares, the VAT basis, the worked example, and a sentence
 * saying exactly what the new terms would count. The current terms stay in force until the other
 * business accepts.
 */
export function TermsSheet({
  split,
  today,
  currency,
  onClose,
}: {
  split: SplitView;
  today: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const propose = useProposeTerms();
  const current = split.terms;
  const earliest = current ? nextDay(current.effective_from) : today;
  const [start, setStart] = useState(earliest > today ? earliest : today);
  const [draft, setDraft] = useState<TermsDraft>({
    services: current ? bpsToPercentText(current.services_rate_bps) : '',
    includeProducts: current ? current.products_rate_bps !== null : false,
    products: current?.products_rate_bps != null ? bpsToPercentText(current.products_rate_bps) : '',
    vat: current?.vat_basis ?? 'net_ex_vat',
  });
  const [checks, setChecks] = useState<{ services: string | null; products: string | null; start: string | null }>({
    services: null,
    products: null,
    start: null,
  });
  const [fields, setFields] = useState<CommissionFieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const partner = split.partner.name;
  const rates = draftRates(draft);
  const previewParams: SplitPreviewParams | null = rates
    ? {
        calendar_id: split.calendar.id,
        other_venue_id: split.partner.venue_id,
        services_rate_percent: rates.services,
        products_rate_percent: rates.products,
        vat_basis: draft.vat,
      }
    : null;
  const summary = rates
    ? businessSummary({
        role: split.role,
        partner,
        calendar: split.calendar.name,
        date: formatLongDay(start),
        servicesBps: Math.round(rates.services * 100),
        productsBps: rates.products === null ? null : Math.round(rates.products * 100),
        basis: draft.vat,
        label: split.label,
        period: split.settlement_period,
        change: true,
      })
    : null;

  const startProblem = (d: string): string | null => {
    if (current && d <= current.effective_from) return splitsT('change.mustFollow', { date: formatLongDay(current.effective_from) });
    if (split.ended_on && d > split.ended_on) return splitsT('err.startAfterEnd');
    return null;
  };

  const send = async () => {
    if (propose.isPending) return;
    const check = checkTerms(draft);
    const startCheck = startProblem(start);
    if (!check.ok || startCheck) {
      setChecks({
        services: check.ok ? null : check.services,
        products: check.ok ? null : check.products,
        start: startCheck,
      });
      return;
    }
    setChecks({ services: null, products: null, start: null });
    setFields([]);
    // The same terms again would only ask the other business to agree to nothing new (web the same).
    if (
      current &&
      Math.round(check.services * 100) === current.services_rate_bps &&
      (check.products === null ? null : Math.round(check.products * 100)) === current.products_rate_bps &&
      draft.vat === current.vat_basis
    ) {
      setError(splitsT('change.same'));
      return;
    }
    setError(null);
    try {
      await propose.mutateAsync({
        splitId: split.id,
        body: {
          effective_from: start,
          services_rate_percent: check.services,
          products_rate_percent: check.products,
          vat_basis: draft.vat,
        },
      });
      toast.success(splitsT('change.sent', { partner }));
      onClose();
    } catch (e) {
      setError(commissionErrorMessage(e));
      setFields(commissionFieldErrors(e));
    }
  };

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={splitsT('change.title')}
      subtitle={calendarAt(split)}
      footer={
        <View style={styles.footer}>
          <Button label={splitsT('form.send', { partner })} onPress={() => void send()} loading={propose.isPending} fullWidth />
          <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={propose.isPending} fullWidth />
        </View>
      }>
      {current ? <Text variant="bodySmall">{splitsT('change.now', { summary: termsWithBasis(current) })}</Text> : null}
      <FieldBlock label={splitsT('change.start')} error={checks.start ?? fieldMessage(fields, 'effective_from')}>
        <DatePickerField
          value={start}
          onChange={(d) => {
            if (d) setStart(d);
            setChecks((c) => ({ ...c, start: null }));
          }}
          accessibilityLabel={splitsT('change.start')}
        />
      </FieldBlock>
      {start < today ? (
        <MessageBox tone="warning" role="note">
          {splitsT('form.backdated', { partner })}
        </MessageBox>
      ) : null}
      <TermsFields
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setChecks((c) => ({ ...c, services: null, products: null }));
        }}
        errors={{
          services: checks.services ?? fieldMessage(fields, 'services_rate_percent'),
          products: checks.products ?? fieldMessage(fields, 'products_rate_percent'),
          vat: fieldMessage(fields, 'vat_basis'),
        }}
      />
      <SplitExample params={previewParams} business={split.payer.name} currency={currency} summary={summary} />
      {error ? (
        <MessageBox tone="danger" role="alert">
          {error}
        </MessageBox>
      ) : null}
    </PosSheet>
  );
}

/** "End this split": the last day it counts, today or later. The other business is told. */
export function EndSplitSheet({ split, today, onClose }: { split: SplitView; today: string; onClose: () => void }) {
  const toast = useToast();
  const end = useEndSplit();
  const [lastDay, setLastDay] = useState(today);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const partner = split.partner.name;

  const confirm = async () => {
    if (end.isPending) return;
    if (lastDay < today) {
      setProblem(splitsT('err.lastDay'));
      return;
    }
    setProblem(null);
    setError(null);
    try {
      await end.mutateAsync({ splitId: split.id, body: { last_day: lastDay } });
      toast.success(splitsT('end.done', { date: formatLongDay(lastDay) }));
      onClose();
    } catch (e) {
      setError(commissionErrorMessage(e));
    }
  };

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={splitsT('end')}
      subtitle={splitsT('end.help', { partner })}
      footer={
        <View style={styles.footer}>
          <Button label={splitsT('end.confirm')} variant="danger" onPress={() => void confirm()} loading={end.isPending} fullWidth />
          <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={end.isPending} fullWidth />
        </View>
      }>
      <FieldBlock label={splitsT('end.lastDay')} error={problem}>
        <DatePickerField
          value={lastDay}
          onChange={(d) => {
            if (d) setLastDay(d);
            setProblem(null);
          }}
          minimumDate={ymdToDate(today)}
          accessibilityLabel={splitsT('end.lastDay')}
        />
      </FieldBlock>
      <Text variant="bodySmall" tone="secondary">
        {splitsT('end.after')}
      </Text>
      {error ? (
        <MessageBox tone="danger" role="alert">
          {error}
        </MessageBox>
      ) : null}
    </PosSheet>
  );
}

/** "Mark as paid": one closed period, with an optional note such as "bank transfer". Moves no money. */
export function MarkPaidSheet({
  split,
  period,
  currency,
  onClose,
}: {
  split: SplitView;
  period: SplitPeriodView;
  currency?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const mark = useMarkPaid();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (mark.isPending) return;
    setError(null);
    try {
      const trimmed = note.trim();
      await mark.mutateAsync({ splitId: split.id, body: { period_start: period.start, note: trimmed ? trimmed : null } });
      toast.success(splitsT('stmt.done'));
      onClose();
    } catch (e) {
      setError(commissionErrorMessage(e));
    }
  };

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={splitsT('stmt.markPaid')}
      subtitle={`${periodText(period)}: ${splitMoney(period.owed_pence, currency)}`}
      footer={
        <View style={styles.footer}>
          <Button label={splitsT('stmt.markPaid')} onPress={() => void confirm()} loading={mark.isPending} fullWidth />
          <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={mark.isPending} fullWidth />
        </View>
      }>
      <FieldBlock label={splitsT('stmt.note')}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={splitsT('stmt.notePlaceholder')}
          maxLength={300}
          accessibilityLabel={splitsT('stmt.note')}
        />
      </FieldBlock>
      {error ? (
        <MessageBox tone="danger" role="alert">
          {error}
        </MessageBox>
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
});
