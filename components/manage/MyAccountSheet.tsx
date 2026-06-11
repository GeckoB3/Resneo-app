import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { useChangeOwnPassword, usePatchStaffMe } from '@/lib/queries/useTeamMutations';
import { spacing } from '@/theme/index';
import type { StaffMe } from '@/types/staff';

type MyAccountSheetProps = {
  visible: boolean;
  staff: StaffMe | null;
  onClose: () => void;
};

/**
 * Bottom sheet allowing any staff member to edit their own profile
 * (name, email, phone) and change their own password.
 */
export function MyAccountSheet({ visible, staff, onClose }: MyAccountSheetProps) {
  // Profile fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const patchMe = usePatchStaffMe();

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const changePassword = useChangeOwnPassword();

  // Seed form when sheet opens
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible && staff) {
      setName(staff.name ?? '');
      setEmail(staff.email ?? '');
      setPhone(staff.phone ?? '');
      setEmailError(undefined);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(undefined);
    }
  }

  function handleClose() {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(undefined);
    onClose();
  }

  async function handleSaveProfile() {
    if (!staff) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(undefined);

    const body: { name?: string; email?: string; phone?: string } = {};
    const trimmedName = name.trim();
    if (trimmedName !== (staff.name ?? '')) body.name = trimmedName;
    if (trimmedEmail !== staff.email.toLowerCase()) body.email = trimmedEmail;
    const trimmedPhone = phone.trim();
    if (trimmedPhone !== (staff.phone ?? '')) body.phone = trimmedPhone || '';

    if (Object.keys(body).length === 0) {
      handleClose();
      return;
    }

    try {
      await patchMe.mutateAsync(body);
      hapticSuccess();
      const emailChanged = !!body.email;
      Alert.alert(
        'Profile updated',
        emailChanged
          ? 'Your profile was saved. Your sign-in email has been updated — please use the new address next time you log in.'
          : 'Your profile has been saved.',
        [{ text: 'OK', onPress: handleClose }],
      );
    } catch (err) {
      hapticError();
      Alert.alert(
        'Could not save',
        err instanceof ApiError ? err.message : 'Failed to update profile.',
      );
    }
  }

  async function handleChangePassword() {
    setPasswordError(undefined);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      await changePassword.mutateAsync({ new_password: newPassword });
      hapticSuccess();
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Your new password is active.');
    } catch (err) {
      hapticError();
      setPasswordError(
        err instanceof ApiError ? err.message : 'Password change failed.',
      );
    }
  }

  if (!staff) return null;

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="subheading">My account</Text>
        <Text variant="caption" tone="muted">
          Update your display name, email, and password.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Profile section */}
        <View style={styles.section}>
          <Text variant="label">Profile</Text>

          <Input
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            editable={!patchMe.isPending}
          />

          <Input
            label="Sign-in email *"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your@email.com"
            error={emailError}
            editable={!patchMe.isPending}
          />

          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+44 7700 000000"
            helper="International format, e.g. +44 7700 000000"
            editable={!patchMe.isPending}
          />

          <Button
            label={patchMe.isPending ? 'Saving…' : 'Save profile'}
            loading={patchMe.isPending}
            onPress={() => void handleSaveProfile()}
            fullWidth
          />
        </View>

        {/* Password section */}
        <View style={styles.section}>
          <Text variant="label">Change password</Text>

          <Input
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Min 8 characters"
            editable={!changePassword.isPending}
          />

          <Input
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Re-enter password"
            error={passwordError}
            editable={!changePassword.isPending}
          />

          <Button
            label={changePassword.isPending ? 'Updating…' : 'Update password'}
            loading={changePassword.isPending}
            onPress={() => void handleChangePassword()}
            fullWidth
            disabled={newPassword.length < 8 || confirmPassword.length < 8}
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
    gap: 2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing['2xl'],
  },
  section: {
    gap: spacing.md,
  },
});
