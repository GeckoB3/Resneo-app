import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeleteStaffMember,
  usePatchStaffCalendar,
  usePatchStaffMember,
  useResendInvite,
  useResetStaffPassword,
} from '@/lib/queries/useTeamMutations';
import { useToast } from '@/providers/ToastProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, StaffRole, TeamMember } from '@/types/staff';

type Tab = 'actions' | 'role' | 'password' | 'calendars';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

type StaffMemberSheetProps = {
  visible: boolean;
  member: TeamMember | null;
  isSelf: boolean;
  practitioners: AssignablePractitioner[];
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * Full management sheet for a single staff member (admin only).
 * Tabs: Actions (resend invite), Change Role, Reset Password, Calendars.
 */
export function StaffMemberSheet({
  visible,
  member,
  isSelf,
  practitioners,
  onClose,
  onDeleted,
}: StaffMemberSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('actions');
  // Inline two-step confirm for removing a member (Alert.alert confirm is a no-op on web).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Role change
  const [pendingRole, setPendingRole] = useState<StaffRole>('staff');
  const patchMember = usePatchStaffMember();

  // Password reset
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const resetPassword = useResetStaffPassword();

  // Calendar assignments
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [calendarsDirty, setCalendarsDirty] = useState(false);
  const patchCalendar = usePatchStaffCalendar();

  // Mutations
  const resendInvite = useResendInvite();
  const deleteStaff = useDeleteStaffMember();

  const activePractitioners = practitioners.filter(
    (p) => p.is_active && (p.calendar_type ?? 'practitioner') !== 'resource',
  );

  function handleOpen() {
    if (!member) return;
    setTab('actions');
    setPendingRole((member.role as StaffRole) ?? 'staff');
    setSelectedCalendarIds(member.linked_calendar_ids ?? []);
    setCalendarsDirty(false);
    setNewPassword('');
    setPasswordError(undefined);
    setConfirmingDelete(false);
  }

  // Call handleOpen when sheet becomes visible with a member
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) handleOpen();
  }

  function handleClose() {
    setNewPassword('');
    setPasswordError(undefined);
    onClose();
  }

  async function handleResendInvite() {
    if (!member) return;
    try {
      const res = await resendInvite.mutateAsync(member.id);
      hapticSuccess();
      toast.success(res.message ?? 'A new sign-in link was emailed to them.');
    } catch (err) {
      hapticError();
      toast.error(err instanceof ApiError ? err.message : 'Could not resend the invitation.');
    }
  }

  async function handleRoleChange() {
    if (!member) return;
    if (isSelf) {
      toast.info('You cannot change your own role.');
      return;
    }
    try {
      await patchMember.mutateAsync({ id: member.id, body: { role: pendingRole } });
      hapticSuccess();
      toast.success(
        `${member.name ?? member.email} is now ${pendingRole === 'admin' ? 'an Admin' : 'a Staff member'}.`,
      );
      handleClose();
    } catch (err) {
      hapticError();
      toast.error(err instanceof ApiError ? err.message : 'Could not update the role.');
    }
  }

  async function handlePasswordReset() {
    if (!member) return;
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setPasswordError(undefined);
    try {
      await resetPassword.mutateAsync({ id: member.id, body: { new_password: newPassword } });
      hapticSuccess();
      setNewPassword('');
      toast.success(`Password for ${member.email ?? 'this user'} has been updated.`);
      handleClose();
    } catch (err) {
      hapticError();
      setPasswordError(err instanceof ApiError ? err.message : 'Password reset failed.');
    }
  }

  async function handleCalendarSave() {
    if (!member) return;
    try {
      await patchCalendar.mutateAsync({
        id: member.id,
        body: { calendar_ids: selectedCalendarIds },
      });
      hapticSuccess();
      setCalendarsDirty(false);
      toast.success('Calendar assignments saved.');
      handleClose();
    } catch (err) {
      hapticError();
      toast.error(
        err instanceof ApiError ? err.message : 'Could not update calendar assignments.',
      );
    }
  }

  async function handleDelete() {
    if (!member) return;
    try {
      await deleteStaff.mutateAsync(member.id);
      hapticSuccess();
      setConfirmingDelete(false);
      onDeleted();
      onClose();
    } catch (err) {
      hapticError();
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the member.');
    }
  }

  function toggleCalendar(id: string) {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setCalendarsDirty(true);
  }

  if (!member) return null;

  const displayName = member.name ?? member.email ?? 'Team member';
  const inactiveAssigned = (member.linked_calendar_ids ?? []).filter(
    (id) => !activePractitioners.some((p) => p.id === id),
  );

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="subheading" numberOfLines={1}>
          {displayName}
        </Text>
        {member.name && member.email ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {member.email}
          </Text>
        ) : null}
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['actions', 'role', 'password', 'calendars'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = {
            actions: 'Actions',
            role: 'Role',
            password: 'Password',
            calendars: 'Calendars',
          };
          const isActive = t === tab;
          return (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tabItem}>
              <Text
                variant="label"
                color={isActive ? colors.brand : colors.textMuted}
                style={isActive ? styles.tabActive : undefined}>
                {labels[t]}
              </Text>
              {isActive && (
                <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Actions tab */}
        {tab === 'actions' && (
          <View style={styles.section}>
            <Button
              label={resendInvite.isPending ? 'Sending…' : 'Resend invitation email'}
              variant="secondary"
              loading={resendInvite.isPending}
              onPress={() => void handleResendInvite()}
              fullWidth
            />
            <Text variant="caption" tone="muted">
              Sends a new sign-in link to {member.email}. Useful if they didn&apos;t receive
              the original email.
            </Text>

            {!isSelf && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                {confirmingDelete ? (
                  <>
                    <Text variant="bodySmall" tone="danger">
                      Remove {member.name ?? member.email ?? 'this person'} from the team? They
                      will lose dashboard access immediately.
                    </Text>
                    <View style={styles.confirmRow}>
                      <Button
                        label="Cancel"
                        variant="secondary"
                        style={styles.flex1}
                        onPress={() => setConfirmingDelete(false)}
                      />
                      <Button
                        label={deleteStaff.isPending ? 'Removing…' : 'Remove'}
                        variant="danger"
                        style={styles.flex1}
                        loading={deleteStaff.isPending}
                        onPress={() => void handleDelete()}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Button
                      label="Remove from team"
                      variant="danger"
                      onPress={() => {
                        hapticWarning();
                        setConfirmingDelete(true);
                      }}
                      fullWidth
                    />
                    <Text variant="caption" tone="muted">
                      This will immediately revoke their dashboard access.
                    </Text>
                  </>
                )}
              </>
            )}

            {isSelf && (
              <Text variant="caption" tone="muted" style={styles.selfNote}>
                You cannot remove yourself from the team.
              </Text>
            )}
          </View>
        )}

        {/* Role tab */}
        {tab === 'role' && (
          <View style={styles.section}>
            {isSelf ? (
              <Text variant="body" tone="muted">
                You cannot change your own role.
              </Text>
            ) : (
              <>
                <Segmented options={ROLE_OPTIONS} value={pendingRole} onChange={setPendingRole} />
                <Text variant="caption" tone="muted">
                  {pendingRole === 'admin'
                    ? 'Full access to all settings, staff management, reports and bookings.'
                    : 'Day-to-day access. Can only see calendars assigned to them.'}
                </Text>
                <Button
                  label={patchMember.isPending ? 'Saving…' : 'Save role'}
                  loading={patchMember.isPending}
                  onPress={() => void handleRoleChange()}
                  fullWidth
                  disabled={pendingRole === member.role}
                />
              </>
            )}
          </View>
        )}

        {/* Password reset tab */}
        {tab === 'password' && (
          <View style={styles.section}>
            <Text variant="bodySmall" tone="secondary">
              Set a new password for {member.email ?? displayName}.
            </Text>
            <Input
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Min 8 characters"
              error={passwordError}
              editable={!resetPassword.isPending}
            />
            <Button
              label={resetPassword.isPending ? 'Resetting…' : 'Reset password'}
              loading={resetPassword.isPending}
              onPress={() => void handlePasswordReset()}
              fullWidth
              disabled={newPassword.length < 8}
            />
          </View>
        )}

        {/* Calendars tab */}
        {tab === 'calendars' && (
          <View style={styles.section}>
            {member.role === 'admin' ? (
              <Text variant="body" tone="muted">
                Admin users have access to all calendars. Calendar restrictions only apply to
                Staff role.
              </Text>
            ) : (
              <>
                <View style={styles.calendarHeader}>
                  <Text variant="bodySmall" tone="secondary">
                    Calendars this person can manage
                  </Text>
                  {activePractitioners.length > 0 && (
                    <View style={styles.calendarActions}>
                      <Pressable
                        onPress={() => {
                          setSelectedCalendarIds(activePractitioners.map((p) => p.id));
                          setCalendarsDirty(true);
                        }}
                        hitSlop={8}>
                        <Text variant="caption" color={colors.brand}>
                          All
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedCalendarIds([]);
                          setCalendarsDirty(true);
                        }}
                        hitSlop={8}>
                        <Text variant="caption" tone="muted">
                          None
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {activePractitioners.length === 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    No active bookable calendars yet.
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.calendarList,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}>
                    {activePractitioners.map((p, index) => {
                      const isChecked = selectedCalendarIds.includes(p.id);
                      return (
                        <View key={p.id}>
                          {index > 0 && (
                            <View
                              style={[
                                styles.calendarDivider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          )}
                          <Pressable
                            onPress={() => toggleCalendar(p.id)}
                            style={({ pressed }) => [
                              styles.calendarRow,
                              pressed && { backgroundColor: colors.surfaceRaised },
                            ]}>
                            <View
                              style={[
                                styles.checkbox,
                                {
                                  borderColor: isChecked ? colors.brand : colors.borderStrong,
                                  backgroundColor: isChecked ? colors.brand : 'transparent',
                                },
                              ]}>
                              {isChecked && (
                                <Text
                                  variant="caption"
                                  color={colors.onBrand}
                                  style={styles.checkmark}>
                                  ✓
                                </Text>
                              )}
                            </View>
                            <Text variant="body">{p.name}</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}

                {inactiveAssigned.length > 0 && (
                  <View
                    style={[
                      styles.warningBox,
                      { backgroundColor: colors.warningSurface, borderColor: colors.warning },
                    ]}>
                    <Text variant="caption" color={colors.warning}>
                      {inactiveAssigned.length === 1 ? '1 assigned calendar is' : `${inactiveAssigned.length} assigned calendars are`} inactive. Activate them or update assignments in Calendar availability.
                    </Text>
                  </View>
                )}

                <Button
                  label={patchCalendar.isPending ? 'Saving…' : 'Save calendars'}
                  loading={patchCalendar.isPending}
                  onPress={() => void handleCalendarSave()}
                  fullWidth
                  disabled={!calendarsDirty || patchCalendar.isPending}
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  tabActive: {
    fontFamily: fonts.semibold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  section: {
    gap: spacing.md,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  selfNote: {
    fontStyle: 'italic',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  calendarList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  calendarDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + 20 + spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 12,
    lineHeight: 14,
  },
  warningBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
});
