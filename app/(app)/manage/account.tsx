import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DeleteAccountSheet, formatScheduledDate } from '@/components/manage/DeleteAccountSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import {
  useAccountDeletionStatus,
  useCancelAccountDeletion,
} from '@/lib/queries/useAccountDeletion';
import { useStaffAccountForm } from '@/lib/queries/useStaffAccountForm';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

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
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const { data, isLoading } = useStaffMe();
  const staff = data?.staff ?? null;
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Pending-deletion state: a user who signed back in during the 30-day grace
  // window sees a banner and can cancel in-app (web parity, R11-2). Nothing is
  // anonymised until the grace period ends, so cancelling restores normality.
  const deletionStatus = useAccountDeletionStatus();
  const cancelDeletion = useCancelAccountDeletion();
  const deletionScheduledAt = deletionStatus.data?.deletion_scheduled_at ?? null;
  const deletionDate = formatScheduledDate(deletionScheduledAt);

  async function handleCancelDeletion() {
    if (cancelDeletion.isPending) return;
    try {
      await cancelDeletion.mutateAsync();
      hapticSuccess();
      toast.success(t('account.delete.cancelled'));
    } catch (e) {
      hapticError();
      toast.error(e instanceof ApiError ? e.message : t('account.delete.cancelError'));
    }
  }

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
        {/* Pending account deletion — grace-window banner + in-app cancel. */}
        {deletionScheduledAt !== null ? (
          <Card
            style={[
              styles.pendingCard,
              { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
            ]}>
            <Text variant="label" tone="danger" style={styles.sectionTitle}>
              {t('account.delete.pendingTitle')}
            </Text>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              {deletionDate
                ? t('account.delete.pendingBody', { date: deletionDate })
                : t('account.delete.pendingBodyNoDate')}
            </Text>
            <Button
              label={
                cancelDeletion.isPending
                  ? t('account.delete.cancelWorking')
                  : t('account.delete.cancelCta')
              }
              variant="secondary"
              fullWidth
              loading={cancelDeletion.isPending}
              onPress={() => void handleCancelDeletion()}
            />
          </Card>
        ) : null}

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

        {/* Danger zone — account deletion (Apple Guideline 5.1.1(v)). Available to
            all roles; deletes the signed-in user's own account, not the venue.
            Hidden while a deletion is already scheduled — the pending banner above
            owns that state, and re-requesting would be a no-op. */}
        {deletionScheduledAt === null ? (
          <Card>
            <Text variant="label" tone="danger" style={styles.sectionTitle}>
              {t('account.delete.title')}
            </Text>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              {t('account.delete.description')}
            </Text>
            <Button
              label={t('account.delete.cta')}
              variant="danger"
              fullWidth
              onPress={() => setDeleteOpen(true)}
            />
          </Card>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>

      <DeleteAccountSheet
        visible={deleteOpen}
        email={staff?.email}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          void signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
  pendingCard: {
    borderWidth: 1,
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
