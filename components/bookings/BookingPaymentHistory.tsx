import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { formatTimelineEventTime } from '@/lib/booking/booking-timeline';
import { formatPence } from '@/lib/format';
import type { PaymentHistoryRow } from '@/lib/payments/payment-display';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Rows shown before the list has to be asked for in full. */
const COLLAPSED_ROWS = 3;

/**
 * The in-person payments ledger for a booking: what was collected, when, by
 * which method, and how it ended up.
 *
 * Before this existed the only view of the ledger was the refund list, which is
 * admin-only and three taps deep inside Take payment, so end-of-day
 * reconciliation had nothing to work from and a failed or still-processing card
 * attempt was invisible everywhere.
 *
 * Purely presentational — which rows exist and how they read lives in
 * `buildPaymentHistory` so it can be unit-tested.
 */
export function BookingPaymentHistory({ rows }: { rows: PaymentHistoryRow[] }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  const hidden = rows.length - visible.length;

  const statusColor: Record<PaymentHistoryRow['tone'], string> = {
    default: colors.textSecondary,
    muted: colors.textMuted,
    warning: colors.warning,
    danger: colors.danger,
  };

  return (
    <View style={styles.container}>
      {/* Not "Payments taken": the list deliberately carries Failed and
          Processing rows too, which is most of the reason it exists. */}
      <Text variant="overline" tone="muted">
        Payment history
      </Text>
      {visible.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.rowMain}>
            <Text variant="bodySmall">
              {formatPence(row.pence)} · {row.methodLabel}
            </Text>
            <Text variant="caption" color={statusColor[row.tone]}>
              {row.statusLabel}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {formatTimelineEventTime(row.createdAt)}
          </Text>
          {row.note ? (
            <Text variant="caption" tone="muted">
              {row.note}
            </Text>
          ) : null}
        </View>
      ))}
      {hidden > 0 ? (
        <Button
          label={`Show ${hidden} more`}
          variant="ghost"
          size="sm"
          onPress={() => setShowAll(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    gap: 2,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
