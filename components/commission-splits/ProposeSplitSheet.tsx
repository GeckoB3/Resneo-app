import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SplitExample } from '@/components/commission-splits/SplitExample';
import { TermsFields, checkTerms, draftRates, type TermsDraft } from '@/components/commission-splits/TermsFields';
import { ChoiceChips, PosSheet } from '@/components/pos/parts';
import { FieldBlock, MessageBox, OptionList } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, commissionFieldErrors, fieldMessage, type CommissionFieldError } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { PERIODS, SPLIT_LABELS, labelWords, periodWords } from '@/lib/commission/splits-format';
import { useProposeSplit } from '@/lib/queries/useCommissionSplits';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { SettlementPeriod, SplitLabel, SplitPreviewParams, SplitsListResponse, SplitView } from '@/types/commission-splits';

/**
 * "Propose a split" (web propose form): the business (any you have a "Work as one team" link with,
 * or share a live collective with), one calendar, theirs (they pay you) or yours (you pay them),
 * what to call it, the shares, the VAT basis (starting at your commission setting), how often to
 * settle up and the start date, with a note when it starts before today. The worked example on last
 * month's figures follows the terms as they are typed. Nothing counts until the other business
 * accepts; the server's refusal shows word for word, with the fields it named beside the inputs.
 */
export function ProposeSplitSheet({
  list,
  currency,
  onClose,
  onSent,
}: {
  list: SplitsListResponse;
  currency?: string | null;
  onClose: () => void;
  onSent: (split: SplitView) => void;
}) {
  const toast = useToast();
  const propose = useProposeSplit();
  const partners = list.partners.filter((p) => p.their_calendars.length > 0 || p.your_calendars.length > 0);
  const [partnerId, setPartnerId] = useState<string | null>(partners.length === 1 ? partners[0]!.venue_id : null);
  // `t:<id>` for their calendar (they pay you), `y:<id>` for yours (you pay them).
  const [calendarKey, setCalendarKey] = useState<string | null>(null);
  const [label, setLabel] = useState<SplitLabel>('rent');
  // Weekly (Monday to Sunday) to start with, as on the web.
  const [period, setPeriod] = useState<SettlementPeriod>('weekly');
  const [start, setStart] = useState(list.today);
  const [draft, setDraft] = useState<TermsDraft>({ services: '', includeProducts: false, products: '', vat: list.basis_default });
  const [checks, setChecks] = useState<{ services: string | null; products: string | null }>({ services: null, products: null });
  const [fields, setFields] = useState<CommissionFieldError[]>([]);
  const [error, setError] = useState<string | null>(null);

  const partner = partners.find((p) => p.venue_id === partnerId) ?? null;
  const calendarId = calendarKey ? calendarKey.slice(2) : null;
  const theirs = calendarKey?.startsWith('t:') ?? false;
  // The business whose calendar it is pays.
  const payerName = theirs ? (partner?.name ?? '') : list.venue.name;
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

  const serverField = (path: string) => fieldMessage(fields, path);
  const clearField = (path: string) => setFields((prev) => prev.filter((f) => f.path !== path));

  const send = async () => {
    if (!partner || !calendarId || propose.isPending) return;
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
      toast.success(splitsT('form.sent', { partner: partner.name }));
      onSent(split);
    } catch (e) {
      setError(commissionErrorMessage(e));
      setFields(commissionFieldErrors(e));
    }
  };

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={splitsT('form.title')}
      footer={
        <View style={styles.footer}>
          <Button
            label={partner ? splitsT('form.send', { partner: partner.name }) : splitsT('biz.propose')}
            onPress={() => void send()}
            loading={propose.isPending}
            disabled={!partner || !calendarId}
            fullWidth
          />
          <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={propose.isPending} fullWidth />
        </View>
      }>
      <FieldBlock
        label={splitsT('form.business')}
        help={partner ? null : splitsT('form.business.choose')}
        error={serverField('other_venue_id')}>
        <OptionList
          value={partnerId}
          options={partners.map((p) => ({ value: p.venue_id, label: p.name }))}
          onChange={(id) => {
            if (id === partnerId) return;
            setPartnerId(id);
            setCalendarKey(null);
            clearField('other_venue_id');
          }}
        />
      </FieldBlock>

      <FieldBlock
        label={splitsT('form.calendar')}
        help={partner && !calendarKey ? splitsT('form.calendar.choose') : null}
        error={serverField('calendar_id')}>
        {!partner ? (
          <Text variant="bodySmall" tone="muted">
            {splitsT('form.calendar.none')}
          </Text>
        ) : (
          <View style={styles.groups}>
            {partner.their_calendars.length > 0 ? (
              <OptionList
                label={splitsT('form.calendar.theirs', { partner: partner.name })}
                value={calendarKey?.startsWith('t:') ? calendarKey : null}
                options={partner.their_calendars.map((c) => ({ value: `t:${c.id}`, label: c.name }))}
                onChange={(key) => {
                  setCalendarKey(key);
                  clearField('calendar_id');
                }}
              />
            ) : null}
            {partner.your_calendars.length > 0 ? (
              <OptionList
                label={splitsT('form.calendar.yours', { partner: partner.name })}
                value={calendarKey?.startsWith('y:') ? calendarKey : null}
                options={partner.your_calendars.map((c) => ({ value: `y:${c.id}`, label: c.name }))}
                onChange={(key) => {
                  setCalendarKey(key);
                  clearField('calendar_id');
                }}
              />
            ) : null}
          </View>
        )}
      </FieldBlock>

      <FieldBlock label={splitsT('form.label')} error={serverField('label')}>
        <ChoiceChips<SplitLabel>
          options={SPLIT_LABELS.map((l) => ({ value: l, label: labelWords(l) }))}
          value={label}
          onChange={setLabel}
        />
      </FieldBlock>

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

      <FieldBlock label={splitsT('form.period')} error={serverField('settlement_period')}>
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
      {start < list.today && partner ? (
        <MessageBox tone="warning" role="note">
          {splitsT('form.backdated', { partner: partner.name })}
        </MessageBox>
      ) : null}

      <SplitExample params={previewParams} business={payerName} currency={currency} />

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
  groups: { gap: spacing.md },
});
