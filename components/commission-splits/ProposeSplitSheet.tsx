import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SheetStep } from '@/components/commission-splits/FlowSheet';
import { SplitExample } from '@/components/commission-splits/SplitExample';
import { TermsFields, checkTerms, draftRates, type TermsDraft } from '@/components/commission-splits/TermsFields';
import { ChoiceChips } from '@/components/pos/parts';
import { FieldBlock, MessageBox } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { commissionErrorMessage, commissionFieldErrors, fieldMessage, type CommissionFieldError } from '@/lib/commission/api';
import { businessSummary } from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import { PERIODS, SPLIT_LABELS, labelWords, periodWords } from '@/lib/commission/splits-format';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { useProposeSplit } from '@/lib/queries/useCommissionSplits';
import { spacing } from '@/theme/index';
import type { SettlementPeriod, SplitLabel, SplitPreviewParams, SplitsListResponse, SplitView } from '@/types/commission-splits';

/**
 * Propose a split (web `ProposeSplitDialog` with `initial`): the business and the calendar were
 * chosen in "Set up a split" (or on the calendar's own card), so they are shown, not asked: the title
 * is the calendar at its business, with who pays whom under it. Then the shares, the VAT basis
 * (starting at your commission setting), what to call it, how often to settle up and the start date,
 * with a note when it starts before today. A sentence says exactly what will count, with the worked
 * example on last month's figures under it. Nothing counts until the other business accepts; the
 * server's refusal shows word for word, with the fields it named beside the inputs. Shown inside
 * `FlowSheet`.
 */
export function ProposeSplitSheet({
  list,
  currency,
  initial,
  onClose,
  onSent,
  onBack,
}: {
  list: SplitsListResponse;
  currency?: string | null;
  /** The business, and `theirs:<calendar>` (they pay you) or `yours:<calendar>` (you pay them). */
  initial: { partnerId: string; calendar: string };
  onClose: () => void;
  onSent: (split: SplitView, partnerName: string) => void;
  onBack?: () => void;
}) {
  const propose = useProposeSplit();
  const [label, setLabel] = useState<SplitLabel>('rent');
  // Weekly (Monday to Sunday) to start with, as on the web.
  const [period, setPeriod] = useState<SettlementPeriod>('weekly');
  const [start, setStart] = useState(list.today);
  const [draft, setDraft] = useState<TermsDraft>({ services: '', includeProducts: false, products: '', vat: list.basis_default });
  const [checks, setChecks] = useState<{ services: string | null; products: string | null }>({ services: null, products: null });
  const [fields, setFields] = useState<CommissionFieldError[]>([]);
  const [error, setError] = useState<string | null>(null);

  const partner = list.partners.find((p) => p.venue_id === initial.partnerId) ?? null;
  const [side, calendarId] = initial.calendar.split(':', 2) as ['theirs' | 'yours', string];
  // The business whose calendar it is pays.
  const payerName = side === 'yours' ? list.venue.name : (partner?.name ?? '');
  const calendarName = (side === 'yours' ? partner?.your_calendars : partner?.their_calendars)?.find((c) => c.id === calendarId)?.name ?? '';
  const rates = draftRates(draft);
  const previewParams: SplitPreviewParams | null =
    partner && calendarId && rates
      ? {
          calendar_id: calendarId,
          other_venue_id: partner.venue_id,
          services_rate_percent: rates.services,
          products_rate_percent: rates.products,
          vat_basis: draft.vat,
        }
      : null;
  const summary =
    partner && rates
      ? businessSummary({
          role: side === 'yours' ? 'payer' : 'payee',
          partner: partner.name,
          calendar: calendarName,
          date: formatLongDay(start),
          servicesBps: Math.round(rates.services * 100),
          productsBps: rates.products === null ? null : Math.round(rates.products * 100),
          basis: draft.vat,
          label,
          period,
        })
      : null;

  const serverField = (path: string) => fieldMessage(fields, path);
  const clearField = (path: string) => setFields((prev) => prev.filter((f) => f.path !== path));
  // The business and calendar are chosen before this step, so only these fields show here. A 400's
  // sentence is its first field's message, which already sits beside that field when it shows.
  const shownField = (f: { path: string }) =>
    ['label', 'services_rate_percent', 'products_rate_percent', 'vat_basis', 'settlement_period', 'effective_from'].some(
      (k) => f.path === k || f.path.startsWith(`${k}.`),
    );
  const general = error && !fields.some((f) => f.message === error && shownField(f)) ? error : null;
  const others = fields.filter((f) => !shownField(f) && f.message !== general);

  // The business (or its calendar) is no longer one you can agree a split with, such as a link that
  // ended while the sheet was open: say so, rather than a half-empty title and a dead button.
  if (!partner || !calendarName) {
    return (
      <SheetStep
        title={splitsT('setup.title')}
        footer={
          <View style={styles.row}>
            {onBack ? <Button label={splitsT('setup.back')} variant="ghost" onPress={onBack} style={styles.flex} /> : null}
            <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} style={styles.flex} />
          </View>
        }>
        <MessageBox tone="warning" role="note">
          {splitsT('err.notAllowed')}
        </MessageBox>
      </SheetStep>
    );
  }

  const send = async () => {
    if (!calendarId || propose.isPending) return;
    const check = checkTerms(draft);
    if (!check.ok) {
      setChecks({ services: check.services, products: check.products });
      return;
    }
    setChecks({ services: null, products: null });
    setError(null);
    setFields([]);
    try {
      const { split } = await propose.mutateAsync({
        calendar_id: calendarId,
        other_venue_id: partner.venue_id,
        label,
        settlement_period: period,
        effective_from: start,
        services_rate_percent: check.services,
        products_rate_percent: check.products,
        vat_basis: draft.vat,
      });
      onSent(split, partner.name);
    } catch (e) {
      setError(commissionErrorMessage(e));
      setFields(commissionFieldErrors(e));
    }
  };

  return (
    <SheetStep
      title={splitsT('biz.calendarAt', { calendar: calendarName, business: payerName })}
      subtitle={splitsT(side === 'yours' ? 'propose.youPay.help' : 'propose.theyPay.help', { partner: partner.name })}
      footer={
        <>
          {/* The refusal sits by the buttons, so it is seen however far the sheet is scrolled. */}
          {general || others.length ? (
            <MessageBox tone="danger" role="alert">
              {[general, ...others.map((f) => f.message)].filter(Boolean).join('\n')}
            </MessageBox>
          ) : null}
          <Button
            label={splitsT('form.send', { partner: partner.name })}
            onPress={() => void send()}
            loading={propose.isPending}
            disabled={!calendarId || !draft.services.trim()}
            fullWidth
          />
          <View style={styles.row}>
            {onBack ? (
              <Button label={splitsT('setup.back')} variant="ghost" onPress={onBack} disabled={propose.isPending} style={styles.flex} />
            ) : null}
            <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={propose.isPending} style={styles.flex} />
          </View>
        </>
      }>
      <TermsFields
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setChecks({ services: null, products: null });
        }}
        errors={{
          services: checks.services ?? serverField('services_rate_percent'),
          products: checks.products ?? serverField('products_rate_percent'),
          vat: serverField('vat_basis'),
        }}
      />

      <FieldBlock label={splitsT('form.label')} help={splitsT('form.label.help')} error={serverField('label')}>
        <ChoiceChips<SplitLabel>
          options={SPLIT_LABELS.map((l) => ({ value: l, label: labelWords(l) }))}
          value={label}
          onChange={setLabel}
        />
      </FieldBlock>

      <FieldBlock label={splitsT('form.period')} help={splitsT('form.period.help')} error={serverField('settlement_period')}>
        <ChoiceChips<SettlementPeriod>
          options={PERIODS.map((p) => ({ value: p, label: periodWords(p) }))}
          value={period}
          onChange={setPeriod}
        />
      </FieldBlock>

      <FieldBlock label={splitsT('form.start')} error={serverField('effective_from')}>
        <DatePickerField
          value={start}
          onChange={(d) => {
            if (d) setStart(d);
            clearField('effective_from');
          }}
          accessibilityLabel={splitsT('form.start')}
        />
      </FieldBlock>
      {start < list.today ? (
        <MessageBox tone="warning" role="note">
          {splitsT('form.backdated', { partner: partner.name })}
        </MessageBox>
      ) : null}

      <SplitExample params={previewParams} business={payerName} currency={currency} summary={summary} />
    </SheetStep>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
