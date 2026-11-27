import { type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { CARD_HOLD_FEE_NOT_USED } from '@/lib/booking/card-hold-fee';
import { areaCopy } from '@/lib/collective-area/copy';
import { STAFF_MAY_FIELDS, type StaffMayState } from '@/lib/services/service-form-options';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService } from '@/types/services-manage';

export interface ServiceStaffMaySectionProps {
  staffMaySummary: string;
  showMemberValues: boolean;
  optionsLocked: boolean;
  holdFeeIsPercent: boolean;
  staffMayLocked: (key: keyof StaffMayState) => boolean;
  staffMaySends: (key: keyof StaffMayState) => boolean;
  setStaffMay: Dispatch<SetStateAction<StaffMayState>>;
  nameLocked: boolean;
  editingService: ManagedService | null | undefined;
  serviceCollective: { name?: string | null } | null | undefined;
  memberVenueWords: string;
  memberValuesAllowed: boolean;
  setMemberValuesAllowed: Dispatch<SetStateAction<boolean>>;
}

/**
 * The service form's Staff override permissions card (admin only), with the
 * other venues' part for a page service at the host. Moved out of the Services
 * screen unchanged (codebase standards P5.2).
 */
export function ServiceStaffMaySection({
  staffMaySummary,
  showMemberValues,
  optionsLocked,
  holdFeeIsPercent,
  staffMayLocked,
  staffMaySends,
  setStaffMay,
  nameLocked,
  editingService,
  serviceCollective,
  memberVenueWords,
  memberValuesAllowed,
  setMemberValuesAllowed,
}: ServiceStaffMaySectionProps) {
  const { colors } = useTheme();
  return (
    <CollapsibleCard title="Staff override permissions" summary={staffMaySummary}>
      <View style={styles.sectionStack}>
        {showMemberValues ? (
          <Text variant="label" tone="muted">
            {areaCopy('svc.form.staffMay.ownHeading')}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {showMemberValues
            ? areaCopy(optionsLocked ? 'svc.form.staffMay.ownHelpOptions' : 'svc.form.staffMay.ownHelp')
            : 'Allow staff members with their own calendar to override these fields for their calendar only.'}
        </Text>
        {STAFF_MAY_FIELDS.map(({ key, label }) => (
          <View key={key} style={styles.switchRow}>
            {key === 'deposit' && holdFeeIsPercent ? (
              // A person's own fixed fee is not used with a percentage fee (web plan PF5).
              <View style={styles.staffMayLabel}>
                <Text variant="bodyMedium" tone={staffMayLocked(key) ? 'muted' : undefined}>
                  {label}
                </Text>
                <Text variant="caption" tone="muted">
                  {CARD_HOLD_FEE_NOT_USED}
                </Text>
              </View>
            ) : (
              <Text variant="bodyMedium" tone={staffMayLocked(key) ? 'muted' : undefined}>
                {label}
              </Text>
            )}
            <Switch
              // A locked box shows off, as the server stores it, and the save sends it off.
              value={staffMaySends(key)}
              disabled={staffMayLocked(key)}
              accessibilityLabel={`Staff may change: ${label}`}
              onValueChange={(v) =>
                setStaffMay((prev) => ({ ...prev, [key]: v }))
              }
            />
          </View>
        ))}
        {optionsLocked ? (
          <Text variant="caption" tone="muted">
            {areaCopy('svc.form.staffMay.optionsLocked')}
          </Text>
        ) : null}
        {nameLocked ? (
          <Text variant="caption" tone="muted">
            {areaCopy('svc.form.staffMay.nameLocked', {
              collective: editingService?.collective?.collective_name ?? serviceCollective?.name,
            })}
          </Text>
        ) : null}
        {showMemberValues ? (
          <View style={[styles.sectionStack, styles.memberValuesPart, { borderTopColor: colors.border }]}>
            <Text variant="label" tone="muted">
              {areaCopy('svc.form.memberValues.heading', { venueList: memberVenueWords })}
            </Text>
            <View style={styles.switchRow}>
              <Text variant="bodyMedium" style={styles.flexText}>
                {areaCopy(optionsLocked ? 'svc.form.memberValues.labelOptions' : 'svc.form.memberValues.label')}
              </Text>
              <Switch
                value={memberValuesAllowed}
                accessibilityLabel={areaCopy(
                  optionsLocked ? 'svc.form.memberValues.labelOptions' : 'svc.form.memberValues.label',
                )}
                onValueChange={setMemberValuesAllowed}
              />
            </View>
            <Text variant="caption" tone="muted">
              {areaCopy(memberValuesAllowed ? 'svc.form.memberValues.open' : 'svc.form.memberValues.locked')}
            </Text>
          </View>
        ) : null}
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  // Vertical rhythm for inputs/rows inside a CollapsibleCard body (the card body
  // is a single View, so the sheet-level `gap` doesn't reach these children).
  sectionStack: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  staffMayLabel: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.sm,
  },
  // The other venues' part of the overrides on a page service (web 2026-11-05).
  memberValuesPart: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  flexText: {
    flex: 1,
    paddingRight: spacing.md,
  },
});
