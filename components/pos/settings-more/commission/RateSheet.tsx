import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PosSheet } from '@/components/pos/parts';
import { FieldBlock, MessageBox, OptionList, longDay } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { COMMISSION_TYPES, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import { useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { CommissionItemType, CommissionRatesResponse } from '@/lib/pos/settings-more/types';
import { spacing } from '@/theme/index';

export interface RateScope {
  item_type: CommissionItemType;
  category_id: string | null;
  calendar_id: string | null;
  staff_id: string | null;
}

/** What opened the sheet: a row's own scope (`fixed`), a new category rate, or a new person's rate. */
export interface RateSheetTarget {
  scope: Partial<RateScope>;
  fixed: boolean;
  withPerson: boolean;
}

export const personKeyOf = (p: { calendar_id: string | null; staff_id: string | null }) =>
  p.calendar_id ? `c:${p.calendar_id}` : `s:${p.staff_id ?? ''}`;

/**
 * The rate sheet (web `RateDialog`): a new dated rate, never an edit. From a row it only asks for the
 * rate and the start date; "Add a category rate" also asks for the type and the category; "Add a
 * person's rates" asks for the type, the team member and a category or Any category. A start date
 * before today warns that it changes figures already worked out. The server's refusal (a rate for
 * the same scope and date, a removed person or category) shows word for word.
 */
export function RateSheet({
  loaded,
  target,
  onClose,
  onSaved,
}: {
  loaded: CommissionRatesResponse;
  target: RateSheetTarget;
  onClose: () => void;
  onSaved: (next: CommissionRatesResponse) => void;
}) {
  const send = useSettingsSend();
  const { scope, fixed, withPerson } = target;
  const [itemType, setItemType] = useState<CommissionItemType>(scope.item_type ?? 'service');
  const [categoryId, setCategoryId] = useState<string>(scope.category_id ?? '');
  const [personKey, setPersonKey] = useState<string>(
    scope.calendar_id ? `c:${scope.calendar_id}` : scope.staff_id ? `s:${scope.staff_id}` : '',
  );
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(loaded.today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = loaded.categories.filter((c) => c.item_type === itemType);
  const needsCategory = !fixed && !withPerson;

  const save = async () => {
    const pct = Number(rate.trim().replace(',', '.'));
    if (rate.trim() === '' || !Number.isFinite(pct)) {
      setError(commT('set.comm.sheet.rateInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const person = personKey.startsWith('c:')
      ? { calendar_id: personKey.slice(2), staff_id: null }
      : personKey.startsWith('s:')
        ? { calendar_id: null, staff_id: personKey.slice(2) }
        : { calendar_id: null, staff_id: null };
    try {
      const next = await send<CommissionRatesResponse>(settingsMorePaths.commissionRates, 'POST', {
        item_type: itemType,
        category_id: categoryId || null,
        ...person,
        rate_percent: pct,
        effective_from: from,
      });
      setBusy(false);
      onSaved(next);
    } catch (e) {
      setBusy(false);
      setError(settingsErrorMessage(e));
    }
  };

  const title = fixed ? commT('set.comm.change') : withPerson ? commT('set.comm.person.add') : commT('set.comm.category.add');
  const typeOptions = (withPerson ? COMMISSION_TYPES : (['service', 'product'] as CommissionItemType[])).map((t) => ({
    value: t,
    label: typeWords(t),
  }));
  const categoryOptions = [
    ...(needsCategory ? [] : [{ value: '', label: commT('set.comm.sheet.category.any') }]),
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={title}
      footer={
        <View style={styles.footer}>
          <Button
            label={commT('set.comm.sheet.save')}
            onPress={() => void save()}
            loading={busy}
            disabled={(needsCategory && !categoryId) || (withPerson && !personKey)}
            fullWidth
          />
          <Button label={commT('set.comm.sheet.cancel')} variant="secondary" onPress={onClose} disabled={busy} fullWidth />
        </View>
      }>
      {!fixed ? (
        <OptionList
          label={commT('set.comm.sheet.type')}
          value={itemType}
          options={typeOptions}
          onChange={(t) => {
            setItemType(t);
            // A category belongs to one type, so a new type starts from no category.
            setCategoryId('');
          }}
        />
      ) : null}
      {withPerson ? (
        <FieldBlock label={commT('set.comm.sheet.person')} help={personKey ? null : commT('set.comm.sheet.person.choose')}>
          <OptionList
            value={personKey || null}
            options={loaded.people.map((p) => ({ value: personKeyOf(p), label: p.name }))}
            onChange={setPersonKey}
          />
        </FieldBlock>
      ) : null}
      {!fixed && itemType !== 'voucher' ? (
        <FieldBlock
          label={commT('set.comm.byCategory')}
          help={needsCategory && !categoryId ? commT('set.comm.sheet.category.choose') : null}>
          <OptionList value={categoryId} options={categoryOptions} onChange={setCategoryId} />
        </FieldBlock>
      ) : null}
      <FieldBlock label={commT('set.comm.sheet.rate')}>
        <Input
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          accessibilityLabel={commT('set.comm.sheet.rate')}
        />
      </FieldBlock>
      <FieldBlock label={commT('set.comm.sheet.from')}>
        <DatePickerField
          value={from}
          onChange={(d) => {
            if (d) setFrom(d);
          }}
          accessibilityLabel={commT('set.comm.sheet.from')}
        />
      </FieldBlock>
      {from < loaded.today ? (
        <MessageBox tone="warning" role="note">
          {commT('set.comm.backdated', { date: longDay(from) })}
        </MessageBox>
      ) : null}
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
