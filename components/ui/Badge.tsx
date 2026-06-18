import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Dot } from '@/components/ui/Dot';
import { Text } from '@/components/ui/Text';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ThemeColors } from '@/theme/index';

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Solid fill vs subtle tinted background (default: subtle). */
  solid?: boolean;
};

/** Small status/label pill. Use `StatusPill` for booking statuses. */
export function Badge({ label, tone = 'neutral', solid = false }: BadgeProps) {
  const { colors } = useTheme();

  const tones: Record<BadgeTone, { fg: string; subtleBg: string; solidBg: string }> = {
    neutral: { fg: colors.textSecondary, subtleBg: colors.surface, solidBg: colors.textSecondary },
    brand: { fg: colors.brand, subtleBg: colors.brandSubtle, solidBg: colors.brand },
    accent: { fg: colors.accentPressed, subtleBg: colors.accentSubtle, solidBg: colors.accent },
    success: { fg: colors.success, subtleBg: colors.successSurface, solidBg: colors.success },
    warning: { fg: colors.warning, subtleBg: colors.warningSurface, solidBg: colors.warning },
    danger: { fg: colors.danger, subtleBg: colors.dangerSurface, solidBg: colors.danger },
  };
  const t = tones[tone];

  const containerStyle: ViewStyle = {
    backgroundColor: solid ? t.solidBg : t.subtleBg,
  };

  return (
    <View style={[styles.badge, containerStyle]}>
      <Text variant="caption" color={solid ? colors.onColor : t.fg} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

/** "Seated" is restaurant wording — appointment venues display "Started" (web parity). */
const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  Seated: 'Started',
};

/**
 * Booking status pill. Colours come from the shared web palette
 * (`bookingStatusVisualForKey`) — Pending orange, Booked sky, Confirmed navy,
 * Seated/Started emerald — so the list/detail pills match the calendar bars and
 * the web dashboard exactly. (The previous generic `STATUS_TONE` map had
 * Confirmed/Booked/Seated colour-scrambled.)
 *
 * Appointments-first: `Seated` renders as "Started" unless the booking is a
 * genuine table reservation.
 */
export function StatusPill({
  status,
  isTableReservation = false,
}: {
  status: string;
  isTableReservation?: boolean;
}) {
  const label = isTableReservation ? status : APPOINTMENT_STATUS_LABEL[status] ?? status;
  const visual = bookingStatusVisualForKey(status);
  return (
    <View
      style={[
        styles.badge,
        styles.statusPill,
        { backgroundColor: visual.backgroundColor, borderColor: visual.borderColor },
      ]}>
      <Text variant="caption" color={visual.textColor} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Resolved compliance states (spec §11.4), mirroring the web's `PillVariant`
 * compliance-* set in `components/ui/dashboard/Pill.tsx`:
 *   current → emerald · expiring → amber · expired → rose ·
 *   missing → slate · pending → sky · voided → muted slate.
 */
export type ComplianceTone =
  | 'current'
  | 'expiring'
  | 'expired'
  | 'missing'
  | 'pending'
  | 'voided';

/** Default label per state — overridable via the `label` prop. */
const COMPLIANCE_LABELS: Record<ComplianceTone, string> = {
  current: 'Current',
  expiring: 'Expiring soon',
  expired: 'Expired',
  missing: 'Missing',
  pending: 'Pending',
  voided: 'Voided',
};

/** Map a compliance state to themed fg/bg/dot colours (light + dark via theme tokens). */
function complianceToneVisual(
  tone: ComplianceTone,
  colors: ThemeColors,
): { fg: string; bg: string; dot: string } {
  switch (tone) {
    case 'current':
      return { fg: colors.success, bg: colors.successSurface, dot: colors.success };
    case 'expiring':
      return { fg: colors.warning, bg: colors.warningSurface, dot: colors.warning };
    case 'expired':
      return { fg: colors.danger, bg: colors.dangerSurface, dot: colors.danger };
    case 'pending':
      return { fg: colors.info, bg: colors.infoSurface, dot: colors.info };
    case 'voided':
      return { fg: colors.textMuted, bg: colors.surface, dot: colors.textMuted };
    case 'missing':
    default:
      return { fg: colors.textSecondary, bg: colors.surface, dot: colors.textMuted };
  }
}

/**
 * Compliance status pill — a dotted pill for a resolved requirement/record state.
 * Reuses the shared `Dot` primitive for the leading status dot (web parity: the
 * dashboard pills carry a coloured dot). Mirrors the web's 6 compliance states.
 */
export function CompliancePill({
  tone,
  label,
}: {
  tone: ComplianceTone;
  /** Override the default state label (e.g. "Compliant", "2 forms due"). */
  label?: string;
}) {
  const { colors } = useTheme();
  const visual = complianceToneVisual(tone, colors);
  return (
    <View style={[styles.badge, styles.compliancePill, { backgroundColor: visual.bg }]}>
      <Dot color={visual.dot} size={6} />
      <Text variant="caption" color={visual.fg} style={styles.label}>
        {label ?? COMPLIANCE_LABELS[tone]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusPill: {
    borderWidth: 1,
  },
  compliancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  label: {
    fontFamily: fonts.semibold,
  },
});
