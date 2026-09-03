import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ComplianceBookingWarning } from '@/lib/queries/useCreateBooking';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The two tiers a confirmation shows. Staff are never blocked by compliance
 * (web 2026-09-01), so a venue's block_all rule now arrives as a `required`
 * warning rather than a 409; it must read as the venue's requirement, not as a
 * reminder. Anything the server sends without a severity is an older server's
 * warn_* rule, so it is advisory.
 */
export function splitComplianceWarnings(warnings: ComplianceBookingWarning[] | undefined): {
  required: string[];
  advisory: string[];
} {
  const required: string[] = [];
  const advisory: string[] = [];
  for (const w of warnings ?? []) {
    const list = w.severity === 'required' ? required : advisory;
    if (!list.includes(w.compliance_type_name)) list.push(w.compliance_type_name);
  }
  return { required, advisory };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * "Outstanding compliance forms" notice on a booking confirmation. Ports the
 * web staff confirmation card: `required` items first in the danger tone with
 * the venue's-requirement copy, advisory items in the warning tone, and a
 * "Capture in venue" action that opens the booking so the record can be taken
 * there. Renders nothing when there are no warnings.
 */
export function ComplianceWarningNotice({
  warnings,
  onCapture,
}: {
  warnings: ComplianceBookingWarning[] | undefined;
  /** Opens the created booking, where the compliance card captures the record. */
  onCapture?: () => void;
}) {
  const { colors } = useTheme();
  const { required, advisory } = splitComplianceWarnings(warnings);
  if (required.length === 0 && advisory.length === 0) return null;

  const strong = required.length > 0;
  const accent = strong ? colors.danger : colors.warning;

  return (
    <View
      style={[styles.notice, { backgroundColor: accent + '18', borderColor: accent + '55' }]}
      accessibilityRole="alert">
      <Text variant="bodySmall" color={accent} style={styles.title}>
        Outstanding compliance forms
      </Text>
      {required.length > 0 ? (
        <Text variant="caption" tone="default">
          The booking is made, but this venue requires {joinNames(required)} for this booking and{' '}
          {required.length === 1 ? 'it is' : 'they are'} not on file. Capture the record in venue or
          send the form before the appointment.
        </Text>
      ) : null}
      {advisory.length > 0 ? (
        <Text variant="caption" tone="muted">
          {joinNames(advisory)} {advisory.length === 1 ? 'is' : 'are'} not on file yet. Collect the
          record or send the form before the appointment.
        </Text>
      ) : null}
      {onCapture ? (
        <Button label="Capture in venue" variant="secondary" onPress={onCapture} />
      ) : null}
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
