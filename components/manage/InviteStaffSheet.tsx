import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { useInviteStaff } from '@/lib/queries/useTeamMutations';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, StaffRole } from '@/types/staff';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

type InviteStaffSheetProps = {
  visible: boolean;
  onClose: () => void;
  practitioners: AssignablePractitioner[];
};

/**
 * Bottom sheet for inviting a new staff member (admin only).
 * Fields: email (required), name (optional), role (Staff/Admin),
 * and calendar assignments for staff-role users.
 */
export function InviteStaffSheet({
  visible,
  onClose,
  practitioners,
}: InviteStaffSheetProps) {
  const { colors } = useTheme();
  const invite = useInviteStaff();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string | undefined>();

  const activePractitioners = practitioners.filter(
    (p) => p.is_active && (p.calendar_type ?? 'practitioner') !== 'resource',
  );

  function resetForm() {
    setEmail('');
    setName('');
    setRole('staff');
    setSelectedCalendarIds([]);
    setEmailError(undefined);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function toggleCalendar(id: string) {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError(undefined);

    try {
      const result = await invite.mutateAsync({
        email: trimmedEmail,
        name: name.trim() || undefined,
        role,
        ...(role === 'staff' && selectedCalendarIds.length > 0
          ? { calendar_ids: selectedCalendarIds }
          : {}),
      });
      hapticSuccess();
      const sent = result.invite_email_sent;
      Alert.alert(
        'Invitation sent',
        sent
          ? `An invite was sent to ${trimmedEmail}. They will receive a secure link to set their password.`
          : `${trimmedEmail} was added to the team. If they already have an account they can sign in directly.`,
        [{ text: 'OK' }],
      );
      resetForm();
      onClose();
    } catch (err) {
      hapticError();
      const msg =
        err instanceof ApiError ? err.message : 'Failed to send invitation. Please try again.';
      // Check for plan limit error
      if (err instanceof ApiError && (err.body as { code?: string } | null | undefined)?.code === 'PLAN_STAFF_LIMIT') {
        Alert.alert('Staff limit reached', msg, [{ text: 'OK' }]);
      } else {
        Alert.alert('Invite failed', msg, [{ text: 'OK' }]);
      }
    }
  }

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="subheading">Invite team member</Text>
        <Text variant="bodySmall" tone="muted" style={styles.headerSub}>
          We&apos;ll email them a secure link to set their password.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Input
          label="Email *"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="user@example.com"
          error={emailError}
          editable={!invite.isPending}
        />

        <Input
          label="Full name (optional)"
          value={name}
          onChangeText={setName}
          placeholder="Jane Smith"
          editable={!invite.isPending}
        />

        <View style={styles.field}>
          <Text variant="label" tone="secondary" style={styles.fieldLabel}>
            Role
          </Text>
          <Segmented
            options={ROLE_OPTIONS}
            value={role}
            onChange={(v) => {
              setRole(v);
              if (v === 'admin') setSelectedCalendarIds([]);
            }}
          />
          <Text variant="caption" tone="muted">
            {role === 'admin'
              ? 'Full access to all settings, staff, and bookings.'
              : 'Day-to-day access for assigned calendars.'}
          </Text>
        </View>

        {role === 'staff' && (
          <View style={styles.field}>
            <View style={styles.calendarHeader}>
              <Text variant="label" tone="secondary">
                Calendars they manage
              </Text>
              {activePractitioners.length > 0 && (
                <View style={styles.calendarActions}>
                  <Pressable
                    onPress={() =>
                      setSelectedCalendarIds(activePractitioners.map((p) => p.id))
                    }
                    hitSlop={8}>
                    <Text variant="caption" color={colors.brand}>
                      All
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setSelectedCalendarIds([])} hitSlop={8}>
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
                          style={[styles.calendarDivider, { backgroundColor: colors.border }]}
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
                            <Text variant="caption" color={colors.onBrand} style={styles.checkmark}>
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
            <Text variant="caption" tone="muted">
              Optional — you can update calendar assignments anytime.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label={invite.isPending ? 'Sending…' : 'Send invitation'}
            loading={invite.isPending}
            onPress={() => void handleSubmit()}
            fullWidth
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={handleClose}
            fullWidth
            disabled={invite.isPending}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerSub: {
    marginTop: 2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    marginBottom: 2,
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
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
});
