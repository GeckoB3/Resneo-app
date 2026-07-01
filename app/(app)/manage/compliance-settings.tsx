import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ComplianceServiceRequirementsPanel } from '@/components/compliance/ComplianceServiceRequirementsPanel';
import { ComplianceTemplatesPanel } from '@/components/compliance/ComplianceTemplatesPanel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { queryKeys } from '@/lib/queries/keys';
import { useFeatureFlags, useUpdateFeatureFlags } from '@/lib/queries/useVenueSettings';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { DEFAULT_COMPLIANCE_CONFIG, type ComplianceConfig } from '@/types/venue';

type CaptureMethod = ComplianceConfig['default_capture_method'];
type LinkChannel = ComplianceConfig['default_form_link_channel'];

/** The three panels of the web Settings → Compliance section, in web order. */
type SettingsTab = 'templates' | 'requirements' | 'general';

const TAB_OPTIONS: { value: SettingsTab; label: string }[] = [
  { value: 'templates', label: 'Templates' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'general', label: 'General' },
];

const CAPTURE_METHOD_OPTIONS: { value: CaptureMethod; label: string }[] = [
  { value: 'staff_in_venue', label: 'Staff' },
  { value: 'client_online', label: 'Client' },
  { value: 'both', label: 'Both' },
];

const LINK_CHANNEL_OPTIONS: { value: LinkChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
];

function isSettingsTab(value: string | undefined): value is SettingsTab {
  return value === 'templates' || value === 'requirements' || value === 'general';
}

/** Clamp a parsed numeric input to a range; empty/invalid falls back to `fallback`. */
function clampInt(text: string, min: number, max: number, fallback: number): number {
  const n = Number(text.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Compliance settings — the app port of the web `ComplianceSettingsSection`
 * (Settings → Compliance): three panels behind a segmented control, in web
 * order. **Templates & types** lists/creates/duplicates the venue's form types
 * (incl. the starter library), **Service requirements** maps compliance types
 * onto services per-service (enforcement, lead time, online collection), and
 * **General** edits the venue-level defaults stored on `feature_flags.compliance`
 * plus the enable toggle, saved together via
 * `useUpdateFeatureFlags({ compliance_records_enabled, compliance })`. Admin-only.
 */
export default function ComplianceSettingsScreen() {
  const toast = useToast();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const params = useLocalSearchParams<{ tab?: string }>();

  const flags = useFeatureFlags();
  const update = useUpdateFeatureFlags();

  const [tab, setTab] = useState<SettingsTab>(isSettingsTab(params.tab) ? params.tab : 'templates');
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [recordsEnabled, setRecordsEnabled] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>(
    DEFAULT_COMPLIANCE_CONFIG.default_capture_method,
  );
  const [linkChannel, setLinkChannel] = useState<LinkChannel>(
    DEFAULT_COMPLIANCE_CONFIG.default_form_link_channel,
  );
  const [reminderDays, setReminderDays] = useState(String(DEFAULT_COMPLIANCE_CONFIG.reminder_cadence_days));
  const [expiryDays, setExpiryDays] = useState(String(DEFAULT_COMPLIANCE_CONFIG.form_link_expiry_days));
  const [lockHours, setLockHours] = useState(String(DEFAULT_COMPLIANCE_CONFIG.lock_period_hours));

  // Hydrate once from the stored config (render-time guard, no effect/loop).
  const savedEnabled = flags.data?.resolved?.compliance_records_enabled ?? false;
  if (flags.data && hydratedKey !== 'loaded') {
    const cfg = { ...DEFAULT_COMPLIANCE_CONFIG, ...(flags.data.raw.compliance ?? {}) };
    setRecordsEnabled(savedEnabled);
    setCaptureMethod(cfg.default_capture_method);
    setLinkChannel(cfg.default_form_link_channel);
    setReminderDays(String(cfg.reminder_cadence_days));
    setExpiryDays(String(cfg.form_link_expiry_days));
    setLockHours(String(cfg.lock_period_hours));
    setHydratedKey('loaded');
  }

  const header = <Stack.Screen options={{ headerShown: true, title: 'Compliance settings' }} />;

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Admins only"
          message="Only venue admins can change compliance settings."
        />
      </Screen>
    );
  }

  if (flags.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (flags.isError || !flags.data) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            flags.error instanceof ApiError ? flags.error.message : 'Could not load settings.'
          }
          onRetry={() => void flags.refetch()}
        />
      </Screen>
    );
  }

  function handleSave() {
    const config: ComplianceConfig = {
      default_capture_method: captureMethod,
      default_form_link_channel: linkChannel,
      reminder_cadence_days: clampInt(reminderDays, 0, 90, DEFAULT_COMPLIANCE_CONFIG.reminder_cadence_days),
      form_link_expiry_days: clampInt(expiryDays, 1, 90, DEFAULT_COMPLIANCE_CONFIG.form_link_expiry_days),
      lock_period_hours: clampInt(lockHours, 0, 720, DEFAULT_COMPLIANCE_CONFIG.lock_period_hours),
      incomplete_behaviour: 'warn_only',
    };
    update.mutate(
      { compliance_records_enabled: recordsEnabled, compliance: config },
      {
        onSuccess: () => {
          hapticSuccess();
          toast.success('Compliance settings saved.');
        },
        onError: (error) => {
          hapticWarning();
          toast.error(error instanceof ApiError ? error.message : 'Could not save settings.');
        },
      },
    );
  }

  function handleRefresh() {
    void flags.refetch();
    // The Templates and Service requirements panels own their queries.
    void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={flags.isRefetching} onRefresh={handleRefresh} />
        }>
        <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />

        {tab === 'templates' ? <ComplianceTemplatesPanel /> : null}

        {tab === 'requirements' ? (
          <ComplianceServiceRequirementsPanel complianceEnabled={savedEnabled} />
        ) : null}

        {tab === 'general' ? (
          <>
            <SectionCard>
              <SectionCard.Header
                eyebrow="Compliance"
                title="Compliance records"
                description="Track consent forms, patch tests and other records against bookings."
              />
              <SectionCard.Body>
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text variant="bodyMedium">Enable compliance records</Text>
                    <Text variant="caption" tone="muted">
                      Turns the compliance dashboard, forms and booking checks on for this venue.
                    </Text>
                  </View>
                  <Switch
                    value={recordsEnabled}
                    onValueChange={setRecordsEnabled}
                    trackColor={{ true: colors.brand }}
                    accessibilityLabel="Enable compliance records"
                  />
                </View>
              </SectionCard.Body>
            </SectionCard>

            <SectionCard>
              <SectionCard.Header
                eyebrow="Defaults"
                title="New forms"
                description="Pre-selected when you create a compliance type."
              />
              <SectionCard.Body style={styles.cardBody}>
                <View style={styles.field}>
                  <Text variant="label" tone="secondary">
                    Default capture method
                  </Text>
                  <Segmented options={CAPTURE_METHOD_OPTIONS} value={captureMethod} onChange={setCaptureMethod} />
                </View>
                <View style={styles.field}>
                  <Text variant="label" tone="secondary">
                    Form link channel
                  </Text>
                  <Segmented options={LINK_CHANNEL_OPTIONS} value={linkChannel} onChange={setLinkChannel} />
                </View>
              </SectionCard.Body>
            </SectionCard>

            <SectionCard>
              <SectionCard.Header
                eyebrow="Form links"
                title="Reminders & expiry"
                description="How long links last and when clients are nudged."
              />
              <SectionCard.Body style={styles.cardBody}>
                <Input
                  label="Reminder cadence (days before expiry)"
                  value={reminderDays}
                  onChangeText={setReminderDays}
                  keyboardType="number-pad"
                  helper="0 disables expiry reminders. Max 90."
                />
                <Input
                  label="Form link expiry (days)"
                  value={expiryDays}
                  onChangeText={setExpiryDays}
                  keyboardType="number-pad"
                  helper="Venue default; a per-type override still wins. 1–90."
                />
              </SectionCard.Body>
            </SectionCard>

            <SectionCard>
              <SectionCard.Header
                eyebrow="Enforcement"
                title="Bookings"
                description="Defaults applied to new service requirements."
              />
              <SectionCard.Body style={styles.cardBody}>
                <Input
                  label="Lock period (hours before booking)"
                  value={lockHours}
                  onChangeText={setLockHours}
                  keyboardType="number-pad"
                  helper="Clients must complete required forms this many hours ahead. 0 = no lock. Max 720."
                />
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text variant="bodyMedium">When a client arrives incomplete</Text>
                    <Text variant="caption" tone="muted">
                      Warn staff (v1 — blocking check-in is coming).
                    </Text>
                  </View>
                  <Text variant="bodySmall" tone="secondary">
                    Warn only
                  </Text>
                </View>
              </SectionCard.Body>
            </SectionCard>

            <Button
              label="Save settings"
              fullWidth
              loading={update.isPending}
              onPress={handleSave}
            />
          </>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  cardBody: {
    gap: spacing.base,
  },
  field: {
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  spacer: {
    height: spacing.xl,
  },
});
