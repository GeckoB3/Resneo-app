import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { useStaffAccountForm } from '@/lib/queries/useStaffAccountForm';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { getSupabase } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Personal account settings for the signed-in staff member.
 * Mirrors the web StaffPersonalSettingsSection. Available to all roles (not admin-only).
 *
 * Shares its form logic (validation, phone E.164 normalisation, the email-change
 * session refresh) with `MyAccountSheet` via `useStaffAccountForm`.
 *
 * PATCH /api/venue/staff/me — name, phone, email
 * POST /api/venue/staff/change-password — new_password
 */
export default function AccountScreen() {
  const toast = useToast();
  const { data, isLoading } = useStaffMe();
  const staff = data?.staff ?? null;

  const form = useStaffAccountForm({
    staff,
    onEmailChanged: async () => {
      // Refresh the Supabase session so the new email claim is loaded.
      await getSupabase().auth.refreshSession();
    },
    messages: {
      profileSaved: () => t('account.profile.saved'),
      passwordChanged: t('account.password.changed'),
      profileError: t('account.profile.saveError'),
      passwordError: t('account.password.changeError'),
      emailRequired: t('account.profile.emailRequired'),
      emailInvalid: t('account.profile.emailInvalid'),
      passwordTooShort: t('account.password.tooShort', { min: 8 }),
      passwordMismatch: t('account.password.mismatch'),
    },
  });

  // Seed the form once when async staff data first arrives — the "adjust state
  // during render" pattern (avoids setState-in-effect cascading renders).
  const [seeded, setSeeded] = useState(false);
  if (staff && !seeded) {
    setSeeded(true);
    form.seed(staff);
  }

  async function handleSaveProfile() {
    const result = await form.saveProfile();
    if (result.status === 'saved') {
      hapticSuccess();
      toast.success(result.message);
    } else if (result.status === 'error') {
      hapticError();
      toast.error(result.message);
    }
  }

  async function handleChangePassword() {
    const result = await form.changeOwnPassword();
    if (result.status === 'changed') {
      hapticSuccess();
      toast.success(result.message);
    } else if (result.status === 'invalid') {
      hapticWarning();
    } else if (result.status === 'error') {
      hapticError();
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('account.title') }} />;

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
            {t('account.profile.title')}
          </Text>
          <Text variant="caption" tone="muted" style={styles.sectionDesc}>
            {t('account.profile.description')}
          </Text>
          <View style={styles.fields}>
            <Input
              label={t('account.profile.nameLabel')}
              value={form.name}
              onChangeText={form.setName}
              placeholder={t('account.profile.namePlaceholder')}
              maxLength={200}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <Input
              label={t('account.profile.emailLabel')}
              value={form.email}
              onChangeText={(v) => {
                form.setEmail(v);
                form.setEmailError(null);
              }}
              placeholder={t('account.profile.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              helper={t('account.profile.emailHelper')}
              error={form.emailError ?? undefined}
              returnKeyType="next"
            />
            <PhoneInput
              label={t('account.profile.phoneLabel')}
              value={form.phone}
              onChangeText={form.setPhone}
              placeholder={t('account.profile.phonePlaceholder')}
              helper={t('account.profile.phoneHelper')}
              optional
            />
            <Button
              label={t('account.profile.save')}
              fullWidth
              loading={form.patchMe.isPending}
              disabled={!form.hasProfileChanges}
              onPress={() => void handleSaveProfile()}
            />
          </View>
        </Card>

        {/* Password section */}
        <Card>
          <Text variant="label" style={styles.sectionTitle}>
            {t('account.password.title')}
          </Text>
          <Text variant="caption" tone="muted" style={styles.sectionDesc}>
            {t('account.password.description')}
          </Text>
          <View style={styles.fields}>
            <Input
              label={t('account.password.newLabel')}
              value={form.newPassword}
              onChangeText={(v) => {
                form.setNewPassword(v);
                form.setPasswordError(null);
              }}
              placeholder={t('account.password.newPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Input
              label={t('account.password.confirmLabel')}
              value={form.confirmPassword}
              onChangeText={(v) => {
                form.setConfirmPassword(v);
                form.setPasswordError(null);
              }}
              placeholder={t('account.password.confirmPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              error={form.passwordError ?? undefined}
              returnKeyType="done"
              onSubmitEditing={() => void handleChangePassword()}
            />
            <Button
              label={t('account.password.submit')}
              fullWidth
              loading={form.changePassword.isPending}
              disabled={!form.newPassword || !form.confirmPassword}
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
