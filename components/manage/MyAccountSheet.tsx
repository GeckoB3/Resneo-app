import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { useStaffAccountForm } from '@/lib/queries/useStaffAccountForm';
import { getSupabase } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
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
 *
 * Shares its form logic (validation, phone E.164 normalisation, the email-change
 * session refresh) with the dedicated account screen via `useStaffAccountForm`.
 */
export function MyAccountSheet({ visible, staff, onClose }: MyAccountSheetProps) {
  const toast = useToast();

  const form = useStaffAccountForm({
    staff,
    onEmailChanged: async () => {
      // Mint a fresh token so the session matches the new sign-in email.
      await getSupabase().auth.refreshSession();
    },
    messages: {
      profileSaved: (emailChanged) =>
        emailChanged
          ? 'Profile saved. Use your new sign-in email next time you log in.'
          : 'Your profile has been saved.',
      passwordChanged: 'Your new password is active.',
      profileError: 'Failed to update profile.',
      passwordError: 'Password change failed.',
      emailRequired: 'Email is required',
      emailInvalid: 'Enter a valid email address',
      passwordTooShort: 'Password must be at least 8 characters',
      passwordMismatch: 'Passwords do not match',
    },
  });

  // Seed form when sheet opens.
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible && staff) {
      form.seed(staff);
      form.resetPasswordFields();
    }
  }

  function handleClose() {
    form.resetPasswordFields();
    onClose();
  }

  async function handleSaveProfile() {
    const result = await form.saveProfile();
    if (result.status === 'saved') {
      hapticSuccess();
      // Toast + close fire directly off the resolved mutation — Alert.alert's
      // callback never runs on web, so the sheet would have stayed open there.
      toast.success(result.message);
      handleClose();
    } else if (result.status === 'noop') {
      handleClose();
    } else if (result.status === 'error') {
      hapticError();
      toast.error(result.message);
    }
    // 'invalid' → inline emailError already set by the hook; keep the sheet open.
  }

  async function handleChangePassword() {
    const result = await form.changeOwnPassword();
    if (result.status === 'changed') {
      hapticSuccess();
      toast.success(result.message);
    } else if (result.status === 'error') {
      hapticError();
      // passwordError already set inline by the hook.
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
            value={form.name}
            onChangeText={form.setName}
            placeholder="Your name"
            editable={!form.patchMe.isPending}
          />

          <Input
            label="Sign-in email *"
            value={form.email}
            onChangeText={(v) => {
              form.setEmail(v);
              form.setEmailError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your@email.com"
            error={form.emailError ?? undefined}
            editable={!form.patchMe.isPending}
          />

          <PhoneInput
            label="Phone"
            value={form.phone}
            onChangeText={form.setPhone}
            placeholder="+44 7700 000000"
            helper="International format, e.g. +44 7700 000000"
            optional
          />

          <Button
            label={form.patchMe.isPending ? 'Saving…' : 'Save profile'}
            loading={form.patchMe.isPending}
            onPress={() => void handleSaveProfile()}
            fullWidth
          />
        </View>

        {/* Password section */}
        <View style={styles.section}>
          <Text variant="label">Change password</Text>

          <Input
            label="New password"
            value={form.newPassword}
            onChangeText={form.setNewPassword}
            secureTextEntry
            placeholder="Min 8 characters"
            editable={!form.changePassword.isPending}
          />

          <Input
            label="Confirm password"
            value={form.confirmPassword}
            onChangeText={form.setConfirmPassword}
            secureTextEntry
            placeholder="Re-enter password"
            error={form.passwordError ?? undefined}
            editable={!form.changePassword.isPending}
          />

          <Button
            label={form.changePassword.isPending ? 'Updating…' : 'Update password'}
            loading={form.changePassword.isPending}
            onPress={() => void handleChangePassword()}
            fullWidth
            disabled={form.newPassword.length < 8 || form.confirmPassword.length < 8}
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
