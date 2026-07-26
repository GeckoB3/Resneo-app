import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import type { PriceSummaryRow } from '@/lib/payments/payment-display';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The price breakdown at the top of "Payments & confirmation": each priced item,
 * the booking total, the visit total for a multi-service visit, the deposit, and
 * the outstanding balance.
 *
 * Purely presentational — every decision about which rows exist lives in
 * `buildPriceSummary` so it can be unit-tested.
 */
export function BookingPriceSummary({ rows }: { rows: PriceSummaryRow[] }) {
  const { colors } = useTheme();

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      {rows.map((row) => (
        <View
          key={row.key}
          style={[
            styles.row,
            row.indent && styles.rowIndent,
            row.emphasis && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.xs },
          ]}>
          <Text
            variant={row.emphasis ? 'bodySmall' : 'caption'}
            tone={row.emphasis ? 'default' : 'muted'}
            numberOfLines={2}
            style={styles.label}>
            {row.label}
          </Text>
          <Text
            variant={row.emphasis ? 'bodyMedium' : 'bodySmall'}
            tone={row.pence == null ? 'muted' : 'default'}>
            {row.pence == null ? (row.note ?? '—') : formatPence(row.pence)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowIndent: {
    paddingLeft: spacing.md,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
});
