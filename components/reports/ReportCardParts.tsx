/**
 * The Reports overview's shared card furniture: the header with its CSV export
 * action, the label/value row the stat blocks are built from, and the single
 * share path every export takes. Lifted out of `app/(app)/reports.tsx` so the
 * per-model cards (tables, event tiers, resources) are built the same way as
 * the sections that were already there.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type StatRowAccent = 'emerald' | 'amber' | 'red' | 'brand' | 'teal';

/** One label + figure line inside a report card. */
export function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: StatRowAccent;
}) {
  const { colors } = useTheme();
  const valueColor =
    accent === 'emerald'
      ? colors.success
      : accent === 'amber'
        ? colors.warning
        : accent === 'red'
          ? colors.danger
          : accent === 'brand'
            ? colors.brand
            : accent === 'teal'
              ? colors.accent
              : colors.text;

  return (
    <View style={styles.statRow}>
      <Text variant="bodySmall" tone="muted" style={styles.statLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={[styles.statValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A report card's title, with the CSV export action on the right. A blocked
 * export says why, in the web's words for that report
 * (`ReportSection`'s `exportBlockedMessage`).
 */
export function CardHeader({
  title,
  onExport,
  exportDisabled,
  exportBlockedMessage,
}: {
  title: string;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportBlockedMessage?: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  return (
    <View style={styles.cardHeader}>
      <Text variant="label" style={styles.cardTitle}>
        {title}
      </Text>
      {onExport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Export ${title} as CSV`}
          onPress={() => {
            if (exportDisabled) {
              toast.info(exportBlockedMessage ?? 'No data in this range for this report.');
              return;
            }
            hapticTap();
            void onExport();
          }}
          hitSlop={12}
          style={({ pressed }) => [styles.exportBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text variant="caption" style={{ color: exportDisabled ? colors.textMuted : colors.brand }}>
            Export CSV
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Build a report CSV, open the share sheet, and say how it went. */
export function useReportCsvExport(): (filename: string, rows: string[][]) => Promise<void> {
  const toast = useToast();
  return useCallback(
    async (filename: string, rows: string[][]) => {
      const result = await buildAndShareCsv(filename, rows);
      if (!result.ok) {
        toast.error('Could not export the report.');
        return;
      }
      toast.success('Export started.');
    },
    [toast],
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  statLabel: {
    flex: 1,
  },
  statValue: {
    fontVariant: ['tabular-nums'],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flexShrink: 1,
  },
  exportBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
