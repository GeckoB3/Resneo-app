import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SummaryBox } from '@/components/commission-splits/SplitExample';

import { PosSheet } from '@/components/pos/parts';
import { FieldBlock, MessageBox, OptionList, longDay } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { checkPercent } from '@/lib/commission/splits-format';
import { bpsToPercentText, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import { usePostCommissionRate } from '@/lib/queries/useCommissionSplits';
import { spacing } from '@/theme/index';
import type { CommissionItemType, CommissionRate, CommissionSettingsResponse } from '@/types/commission-splits';

export interface RateScope {
  item_type: CommissionItemType;
  category_id: string | null;
  calendar_id: string | null;
  staff_id: string | null;
}

/** What opened the sheet: a row's own scope (`fixed`), or a new category rate for everyone. */
export interface RateSheetTarget {
  scope: Partial<RateScope>;
  fixed: boolean;
}

/** The rate in force today among one scope's rows (the newest that has started), or null with none. */
function rateToday(rows: CommissionRate[], today: string): number | null {
  let newest: CommissionRate | null = null;
  for (const r of rows) {
    if (r.effective_from > today) continue;
    if (!newest || r.effective_from > newest.effective_from || (r.effective_from === newest.effective_from && r.created_at > newest.created_at)) {
      newest = r;
    }
  }
  return newest ? newest.rate_bps : null;
}

/**
 * The rate sheet (web `RateDialog`): a new dated rate, never an edit. From a row ("Standard rate for
 * services") it only asks for the rate and the start date, starting on the rate in force today with
 * "At the moment: 5%." under it; "Add a category rate" also asks for the type and the category. A
 * sentence says what the team will earn from the chosen day before anything saves, and saving the
 * same rate from today only closes the sheet. A start date before today warns that it changes
 * figures already worked out. The server's refusal (a removed category, a date it cannot take)
 * shows word for word.
 *
 * Commission splits (2026-10-14): saves through `POST /api/venue/commission/rates`, which works with
 * or without Checkout, and the answer's settings replace the cached ones. A person's own rates are
 * set on their calendar (the share sheet), so this sheet is for your standard rates only.
 */
export function RateSheet({
  loaded,
  target,
  onClose,
  onSaved,
}: {
  loaded: Pick<CommissionSettingsResponse, 'categories' | 'today' | 'rates'>;
  target: RateSheetTarget;
  onClose: () => void;
  onSaved: (next: CommissionSettingsResponse) => void;
}) {
  const post = usePostCommissionRate();
  const { scope, fixed } = target;
  const [itemType, setItemType] = useState<CommissionItemType>(scope.item_type ?? 'service');
  const [categoryId, setCategoryId] = useState<string>(scope.category_id ?? '');
  // The rate in force today for a row's own scope (0 with none yet), so a change starts from it.
  const [currentBps] = useState<number | null>(() => {
    if (!fixed) return null;
    const rows = loaded.rates.filter(
      (r) =>
        r.calendar_id === (scope.calendar_id ?? null) &&
        r.staff_id === (scope.staff_id ?? null) &&
        r.item_type === itemType &&
        (r.category_id ?? '') === (scope.category_id ?? ''),
    );
    return rateToday(rows, loaded.today) ?? 0;
  });
  const [rate, setRate] = useState(currentBps !== null ? bpsToPercentText(currentBps) : '');
  const [from, setFrom] = useState(loaded.today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = loaded.categories.filter((c) => c.item_type === itemType);
  const needsCategory = !fixed;

  const categoryName = categoryId
    ? (loaded.categories.find((c) => c.id === categoryId)?.name ??
      loaded.rates.find((r) => r.category_id === categoryId && r.category_name)?.category_name ??
      commT('set.comm.fallback.category'))
    : null;
  const typeWord = typeWords(itemType).toLowerCase();
  const what = categoryName ? `${categoryName} (${typeWord})` : typeWord;
  const check = checkPercent(rate);
  const summary =
    check.ok && (fixed || categoryId)
      ? splitsT(categoryName ? 'rate.summary.category' : 'rate.summary', {
          date: longDay(from),
          rate: bpsToPercentText(Math.round(check.value * 100)),
          what,
        })
      : null;

  const save = async () => {
    if (busy) return;
    if (!check.ok) {
      setError(check.message);
      return;
    }
    const pct = check.value;
    // Saving the same rate from today would only add a row that changes nothing.
    if (fixed && currentBps !== null && Math.round(pct * 100) === currentBps && from === loaded.today) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await post.mutateAsync({
        item_type: itemType,
        category_id: categoryId || null,
        calendar_id: scope.calendar_id ?? null,
        staff_id: scope.staff_id ?? null,
        rate_percent: pct,
        effective_from: from,
      });
      setBusy(false);
      onSaved(next);
    } catch (e) {
      setBusy(false);
      setError(commissionErrorMessage(e));
    }
  };

  const title = fixed ? splitsT('rate.title', { what }) : splitsT('rate.title.category');
  const typeOptions = (['service', 'product'] as CommissionItemType[]).map((t) => ({ value: t, label: typeWords(t) }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={title}
      subtitle={fixed ? null : splitsT('share.categories.help')}
      footer={
        <View style={styles.footer}>
          <Button
            label={commT('set.comm.sheet.save')}
            onPress={() => void save()}
            loading={busy}
            disabled={needsCategory && !categoryId}
            fullWidth
          />
          <Button label={commT('set.comm.sheet.cancel')} variant="secondary" onPress={onClose} disabled={busy} fullWidth />
        </View>
      }>
      {!fixed ? (
        <OptionList
          label={splitsT('rate.type')}
          value={itemType}
          options={typeOptions}
          onChange={(t) => {
            setItemType(t);
            // A category belongs to one type, so a new type starts from no category.
            setCategoryId('');
          }}
        />
      ) : null}
      {!fixed ? (
        <FieldBlock label={splitsT('rate.category')} help={needsCategory && !categoryId ? splitsT('rate.category.choose') : null}>
          <OptionList value={categoryId} options={categoryOptions} onChange={setCategoryId} />
        </FieldBlock>
      ) : null}
      <FieldBlock label={splitsT('rate.label')}>
        <Input
          value={rate}
          onChangeText={(next) => {
            setRate(next);
            setError(null);
          }}
          keyboardType="decimal-pad"
          accessibilityLabel={splitsT('rate.label')}
        />
        {currentBps !== null ? (
          <Text variant="caption" tone="muted">
            {splitsT('rate.current', { rate: bpsToPercentText(currentBps) })}
          </Text>
        ) : null}
      </FieldBlock>
      <FieldBlock label={splitsT('share.start')}>
        <DatePickerField
          value={from}
          onChange={(d) => {
            if (d) setFrom(d);
          }}
          accessibilityLabel={splitsT('share.start')}
        />
      </FieldBlock>
      {from < loaded.today ? (
        <MessageBox tone="warning" role="note">
          {commT('set.comm.backdated', { date: longDay(from) })}
        </MessageBox>
      ) : null}
      {summary ? <SummaryBox summary={summary} /> : null}
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
