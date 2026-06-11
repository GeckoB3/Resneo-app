/**
 * ComplianceFlagBadge — coloured compliance status indicator for booking list
 * rows and calendar event bars.
 *
 * Powered by useComplianceBookingFlags (POST /api/venue/compliance/booking-flags).
 * Renders nothing when the booking has no compliance requirement or when the
 * plan does not include compliance (graceful 403 degradation).
 *
 * Usage (BookingRow / AppointmentBlock / booking detail header):
 *   const flagsQuery = useComplianceBookingFlags(bookingIds);
 *   const flag = flagsQuery.data?.flags[booking.id];
 *   <ComplianceFlagDot flag={flag} />
 *   <ComplianceFlagBadge flag={flag} />
 */

import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { fonts, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map flag state → a theme colour. */
function flagColor(
  state: ComplianceBookingFlag['state'],
  colors: {
    danger: string;
    warning: string;
    success: string;
    textMuted: string;
  },
): string {
  switch (state) {
    case 'missing':
    case 'expired':
      return colors.danger;
    case 'expiring_soon':
      return colors.warning;
    case 'satisfied':
      return colors.success;
    default:
      return colors.textMuted;
  }
}

const FLAG_LABELS: Record<ComplianceBookingFlag['state'], string> = {
  missing: 'Missing',
  expired: 'Expired',
  expiring_soon: 'Expiring',
  satisfied: 'Compliant',
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Small coloured dot for tight spaces (calendar bars, compact list rows).
 * satisfied → green, expiring_soon → amber, missing/expired → red.
 * Returns null when no flag (booking has no compliance requirement).
 */
export function ComplianceFlagDot({
  flag,
  scale = 1,
}: {
  flag: ComplianceBookingFlag | null | undefined;
  scale?: number;
}) {
  const { colors } = useTheme();
  if (!flag) return null;

  const color = flagColor(flag.state, colors);
  const size = Math.round(8 * scale);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
      accessibilityLabel={`Compliance: ${flag.state.replace(/_/g, ' ')}`}
    />
  );
}

/**
 * Coloured pill (dot + label) — for larger list rows or booking detail headers
 * where there is more space to communicate state clearly.
 * Returns null when no flag.
 */
export function ComplianceFlagBadge({
  flag,
}: {
  flag: ComplianceBookingFlag | null | undefined;
}) {
  const { colors } = useTheme();
  if (!flag) return null;

  const color = flagColor(flag.state, colors);
  const label = FLAG_LABELS[flag.state];

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: color + '22', borderColor: color + '55' },
      ]}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      <Text variant="caption" color={color} style={styles.pillText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: fonts.semibold,
  },
});
