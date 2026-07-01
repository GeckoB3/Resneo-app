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

/** satisfied → green; blocking unmet → red; non-blocking unmet → amber. */
function flagColor(
  flag: ComplianceBookingFlag,
  colors: {
    danger: string;
    warning: string;
    success: string;
  },
): string {
  if (flag.state === 'satisfied') return colors.success;
  if (flag.blocking) return colors.danger;
  return colors.warning;
}

/** Short pill label: "Compliant", "<type> due", or "N forms due". */
function flagLabel(flag: ComplianceBookingFlag): string {
  if (flag.state === 'satisfied') return 'Compliant';
  if (flag.labels.length === 1) return `${flag.labels[0]} due`;
  return `${flag.labels.length} forms due`;
}

/** Fuller sentence for screen readers / tooltip (ports web complianceFlagTooltip). */
function flagTooltip(flag: ComplianceBookingFlag): string {
  const list = flag.labels.join(', ');
  if (flag.state === 'satisfied') return `Compliance complete${list ? `: ${list}` : ''}`;
  if (flag.blocking) return `${list || 'A compliance record'} required before this appointment`;
  return `${list || 'A compliance form'} still outstanding`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Small coloured dot for tight spaces (calendar bars, compact list rows).
 * satisfied → green, blocking → red, otherwise outstanding → amber.
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

  const color = flagColor(flag, colors);
  const size = Math.round(8 * scale);

  return (
    <View
      accessible={true}
      accessibilityRole="image"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
      accessibilityLabel={flagTooltip(flag)}
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

  const color = flagColor(flag, colors);
  const label = flagLabel(flag);

  return (
    <View
      accessible={true}
      accessibilityLabel={flagTooltip(flag)}
      style={[
        styles.pill,
        { backgroundColor: color + '22', borderColor: color + '55' },
      ]}>
      <View
        accessibilityElementsHidden={true}
        importantForAccessibility="no"
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
