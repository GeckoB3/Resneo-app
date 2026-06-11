import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiFetch } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { getSupabase } from '@/lib/supabase';
import { spacing } from '@/theme/index';
import type { StaffMe, StaffMeResponse } from '@/types/staff';

interface PatchStaffMeInput {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Personal account settings for the signed-in staff member.
 * Mirrors the web StaffPersonalSettingsSection. Available to all roles (not admin-only).
 *
 * POST /api/venue/staff/me — GET (via useStaffMe)
 * PATCH /api/venue/staff/me — name, phone, email
 * POST /api/venue/staff/change-password — new_password
 */
export default function AccountScreen() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const { data, isLoading } = useStaffMe();
  const staff = data?.staff ?? null;

  // Profile fields
  const [seeded, setSeeded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Seed form from loaded staff data (run once)
  useEffect(() => {
    if (staff && !seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(staff.name ?? '');
       
      setEmail(staff.email);
       
      setPhone(staff.phone ?? '');
       
      setSeeded(true);
    }
  }, [staff, seeded]);

  const profileMutation = useMutation({
    mutationFn: async (input: PatchStaffMeInput) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<StaffMeResponse>('/api/venue/staff/me', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: (result) => {
      hapticSuccess();
      // Seed fields from fresh server values
      const row: StaffMe = result.staff;
      setName(row.name ?? '');
      setEmail(row.email);
      setPhone(row.phone ?? '');
      // Refresh cache so the More hub header and anywhere useStaffMe is used update
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all() });
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (error) => {
      hapticError();
      const msg = error instanceof ApiError ? error.message : 'Could not save profile.';
      Alert.alert('Save failed', msg);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (newPw: string) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/staff/change-password', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ new_password: newPw }),
      });
    },
    onSuccess: () => {
      hapticSuccess();
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your password has been changed. Sign in with the new password next time.');
    },
    onError: (error) => {
      hapticError();
      const msg = error instanceof ApiError ? error.message : 'Password change failed.';
      Alert.alert('Password change failed', msg);
    },
  });

  // Compute which profile fields differ from the server values
  function buildProfilePatch(): PatchStaffMeInput | null {
    if (!staff) return null;
    const patch: PatchStaffMeInput = {};
    if (name.trim() !== (staff.name ?? '')) patch.name = name.trim();
    if (email.trim().toLowerCase() !== staff.email.toLowerCase()) patch.email = email.trim().toLowerCase();
    if (phone.trim() !== (staff.phone ?? '')) patch.phone = phone.trim();
    return Object.keys(patch).length > 0 ? patch : null;
  }

  async function handleSaveProfile() {
    const patch = buildProfilePatch();
    if (!patch) return;
    await profileMutation.mutateAsync(patch);
    // If email changed, refresh the Supabase session so the new email claim is loaded
    if (patch.email) {
      try {
        await getSupabase().auth.refreshSession();
      } catch {
        // best-effort
      }
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      hapticWarning();
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      hapticWarning();
      return;
    }
    await passwordMutation.mutateAsync(newPassword);
  }

  const hasProfileChanges = buildProfilePatch() !== null;

  const header = <Stack.Screen options={{ title: 'Account settings' }} />;

  if (isLoading || !seeded) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Profile section */}
        <Card>
          <Text variant="label" style={styles.sectionTitle}>
            Your profile
          </Text>
          <Text variant="caption" tone="muted" style={styles.sectionDesc}>
            Update how you appear in the dashboard, your sign-in email, and your contact number.
          </Text>
          <View style={styles.fields}>
            <Input
              label="Display name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              maxLength={200}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <Input
              label="Sign-in email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              helper="This is the address you use to log in."
              returnKeyType="next"
            />
            <Input
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. +44 7700 900000"
              keyboardType="phone-pad"
              helper="Optional. Include country code."
            />
            <Button
              label="Save profile"
              fullWidth
              loading={profileMutation.isPending}
              disabled={!hasProfileChanges}
              onPress={() => void handleSaveProfile()}
            />
          </View>
        </Card>

        {/* Password section */}
        <Card>
          <Text variant="label" style={styles.sectionTitle}>
            Password
          </Text>
          <Text variant="caption" tone="muted" style={styles.sectionDesc}>
            Change the password you use to sign in.
          </Text>
          <View style={styles.fields}>
            <Input
              label="New password"
              value={newPassword}
              onChangeText={(v) => {
                setNewPassword(v);
                setPasswordError(null);
              }}
              placeholder="Min 8 characters"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setPasswordError(null);
              }}
              placeholder="Re-enter password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              error={passwordError ?? undefined}
              returnKeyType="done"
              onSubmitEditing={() => void handleChangePassword()}
            />
            <Button
              label="Update password"
              fullWidth
              loading={passwordMutation.isPending}
              disabled={!newPassword || !confirmPassword}
              onPress={() => void handleChangePassword()}
            />
          </View>
        </Card>

        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sectionDesc: {
    marginBottom: spacing.md,
  },
  fields: {
    gap: spacing.md,
  },
  spacer: {
    height: spacing.xl,
  },
});
