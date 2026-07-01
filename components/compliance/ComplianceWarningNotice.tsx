import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ComplianceBookingWarning } from '@/lib/queries/useCreateBooking';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Amber "outstanding compliance forms" notice shown on a booking confirmation
 * when the booking was created with unmet non-blocking (warn) requirements.
 * Ports the web staff confirmation card. Renders nothing when there are no
 * warnings.
 */
export function ComplianceWarningNotice({
  warnings,
}: {
  warnings: ComplianceBookingWarning[] | undefined;
}) {
  const { colors } = useTheme();
  if (!warnings || warnings.length === 0) return null;

  const names = [...new Set(warnings.map((w) => w.compliance_type_name))];
  const verb = names.length === 1 ? 'is' : 'are';

  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
      ]}>
      <Text variant="bodySmall" color={colors.warning} style={styles.title}>
        Outstanding compliance forms
      </Text>
      <Text variant="caption" tone="muted">
        The booking is made, but {names.join(', ')} {verb} not on file yet. Collect the record or
        send the form before the appointment.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.semibold,
  },
});
