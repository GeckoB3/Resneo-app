import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProposeSplitSheet } from '@/components/commission-splits/ProposeSplitSheet';
import { MessageBox, SettingsCard } from '@/components/pos/settings-more/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { calendarAt, directionLine, labelWords, periodWords, splitBadges, termsSummaryFrom } from '@/lib/commission/splits-format';
import { useSplitsList } from '@/lib/queries/useCommissionSplits';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SplitView } from '@/types/commission-splits';

/**
 * Commission splits, "Businesses you work with" (web settings page): every split this venue is party
 * to, each with its calendar and business, who pays whom, what it is called, the terms in force (or
 * proposed), how often it settles up and its status, opening its own screen. "Propose a split"
 * shows where there is a business to propose one to; otherwise the screen says what a split needs.
 */
export function BusinessSplitsPanel({ currency }: { currency?: string | null }) {
  const router = useRouter();
  const list = useSplitsList();
  const [proposing, setProposing] = useState(false);

  if (list.isError) {
    return <ErrorState message={commissionErrorMessage(list.error, splitsT('ui.loadError'))} onRetry={() => void list.refetch()} />;
  }
  if (!list.data) return <DetailSkeleton />;
  const data = list.data;
  const canPropose = data.partners.some((p) => p.their_calendars.length > 0 || p.your_calendars.length > 0);
  const open = (split: SplitView) => router.push(`/commission-splits/${encodeURIComponent(split.id)}` as Href);

  return (
    <View style={styles.stack}>
      <SettingsCard title={splitsT('biz.title')} description={splitsT('biz.intro')}>
        {canPropose ? (
          <Button label={splitsT('biz.propose')} onPress={() => setProposing(true)} fullWidth />
        ) : (
          <MessageBox tone="info" role="note">
            {splitsT('biz.none')}
          </MessageBox>
        )}
        {data.splits.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {splitsT('biz.empty')}
          </Text>
        ) : (
          data.splits.map((split) => <SplitRow key={split.id} split={split} today={data.today} onPress={() => open(split)} />)
        )}
      </SettingsCard>

      {proposing ? (
        <ProposeSplitSheet
          list={data}
          currency={data.currency || currency}
          onClose={() => setProposing(false)}
          onSent={(split) => {
            setProposing(false);
            open(split);
          }}
        />
      ) : null}
    </View>
  );
}

/** One split in the list: calendar at business, who pays, the label, the terms and the status. */
export function SplitRow({ split, today, onPress }: { split: SplitView; today: string; onPress: () => void }) {
  const { colors } = useTheme();
  const shown = split.terms ?? split.pending;
  const title = calendarAt(split);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowBody}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="caption" tone="secondary">
          {`${directionLine(split)} · ${labelWords(split.label)}`}
        </Text>
        {shown ? (
          <Text variant="caption" tone="muted">
            {`${termsSummaryFrom(shown)} · ${periodWords(split.settlement_period, true)}`}
          </Text>
        ) : null}
        <View style={styles.badges}>
          {splitBadges(split, today).map((b) => (
            <Badge key={b.text} label={b.text} tone={b.tone} />
          ))}
        </View>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={colors.textMuted} size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xxs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
});
