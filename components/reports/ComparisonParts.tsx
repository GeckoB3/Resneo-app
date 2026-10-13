/**
 * Reports' comparisons and date-basis captions (reports plan, release 1, 2026-10-13; web
 * `report-comparison.ts` and its StatTile trend pill): the change pill beside a figure, the caption
 * that says what the changes compare with, the "Compare with" control, and the line under a card
 * title that says which date its figures are counted by.
 */
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { formatReportRangeLabel } from '@/lib/dates/venue-dates';
import {
  COMPARISON_BASES,
  COMPARISON_BASIS_LABELS,
  type ComparisonBasis,
  type FigureChange,
} from '@/lib/reports/report-comparison';
import { reportScopeCopy } from '@/lib/reports/report-scope';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The change as a small pill: green when better, red when worse, grey for no change. */
export function ChangePill({ change, style }: { change: FigureChange | null | undefined; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  if (!change) return null;
  const tone =
    change.tone === 'good'
      ? { fg: colors.success, bg: colors.successSurface }
      : change.tone === 'bad'
        ? { fg: colors.danger, bg: colors.dangerSurface }
        : { fg: colors.textSecondary, bg: colors.surface };
  return (
    <View
      testID="change-pill"
      accessibilityLabel={change.label}
      style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.fg }, style]}>
      <Text variant="caption" color={tone.fg} style={styles.pillText}>
        {change.label}
      </Text>
    </View>
  );
}

/** "8 Oct 2026", or "1 Sep to 30 Sep 2026" (the range labels used elsewhere in Reports). */
export function comparisonRangeLabel(from: string, to: string): string {
  if (from === to) return formatReportRangeLabel(from, to).split(' to ')[1] ?? from;
  return formatReportRangeLabel(from, to);
}

/** "Changes compare with 1 Sep to 30 Sep 2026." One per tab, near the tiles; nothing without a comparison. */
export function ComparisonCaption({
  comparison,
  style,
}: {
  comparison: { from: string; to: string } | null | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  if (!comparison || typeof comparison.from !== 'string' || typeof comparison.to !== 'string') return null;
  return (
    <View style={style}>
      <Text variant="caption" tone="muted">
        {reportScopeCopy('scope.changesCompare', { range: comparisonRangeLabel(comparison.from, comparison.to) })}
      </Text>
    </View>
  );
}

/** "Compare with": Previous period (the default) or Same dates last year. */
export function CompareWithControl({
  value,
  onChange,
}: {
  value: ComparisonBasis;
  onChange: (basis: ComparisonBasis) => void;
}) {
  return (
    <View style={styles.compareRow} accessibilityLabel={reportScopeCopy('scope.compareWith')}>
      <Text variant="caption" tone="muted">
        {reportScopeCopy('scope.compareWith')}
      </Text>
      {COMPARISON_BASES.map((basis) => (
        <Chip
          key={basis}
          label={COMPARISON_BASIS_LABELS[basis]}
          selected={value === basis}
          onPress={() => onChange(basis)}
        />
      ))}
    </View>
  );
}

/** Under a card title: which date its figures are counted by. */
export function BasisCaption({ basis, style }: { basis: 'made' | 'date'; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant="caption" tone="muted" style={style}>
      {reportScopeCopy(basis === 'made' ? 'basis.made' : 'basis.date')}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  pillText: {
    fontVariant: ['tabular-nums'],
  },
  compareRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
