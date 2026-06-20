import { SymbolView } from 'expo-symbols';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticTap } from '@/lib/haptics';
import { Notifications } from '@/lib/push/notificationsModule';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/lib/queries/useNotificationPreferences';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  type BooleanNotificationKey,
  type NotificationPreferences,
  resolveNotificationPreferences,
} from '@/types/notification-preferences';

type PermissionState = 'loading' | 'unsupported' | 'granted' | 'denied' | 'undetermined';

type ToggleRowConfig = { key: BooleanNotificationKey; label: string; description: string };

const BOOKING_ROWS: ToggleRowConfig[] = [
  { key: 'new_booking', label: 'New bookings', description: 'When a booking is made online or by your team' },
  { key: 'cancellation', label: 'Cancellations', description: 'When a guest or staff member cancels' },
  { key: 'reschedule', label: 'Reschedules & changes', description: 'When a booking moves or is edited' },
  { key: 'payment', label: 'Payments & deposits', description: 'Deposits paid, or a payment that failed' },
];

const OPS_ROWS: ToggleRowConfig[] = [
  { key: 'no_show', label: 'No-show prompts', description: 'When a guest is overdue to arrive' },
  { key: 'waitlist', label: 'Waitlist offers', description: 'When a slot opens for a waiting guest' },
  { key: 'daily_summary', label: 'Daily summary', description: 'A morning rundown of the day’s bookings' },
];

const ACCOUNT_ROWS: ToggleRowConfig[] = [
  { key: 'review', label: 'Reviews & feedback', description: 'When a guest leaves a review' },
  { key: 'low_sms_credit', label: 'Low SMS credit', description: 'Before your guest text reminders run out' },
  { key: 'billing', label: 'Billing & account', description: 'Payment failures and subscription notices' },
];

/** "9:00pm" from an HH:mm string. */
function format12h(time: string): string {
  const [h, m] = time.split(':');
  const hour = Number(h);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m}${suffix}`;
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  isLast,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  isLast?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}>
      <View style={styles.rowText}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.surfaceRaised}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** OS-permission banner — only shown when push isn't already granted. */
function PermissionBanner({
  state,
  busy,
  onEnable,
  onOpenSettings,
}: {
  state: PermissionState;
  busy: boolean;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  const { colors } = useTheme();

  if (state === 'loading' || state === 'granted') return null;

  if (state === 'unsupported') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SymbolView
          name={{ ios: 'bell.slash.fill', android: 'notifications_off', web: 'notifications_off' }}
          tintColor={colors.textMuted}
          size={20}
        />
        <Text variant="bodySmall" tone="muted" style={styles.bannerText}>
          Push notifications aren’t available in this build (web preview or Expo Go). Use the
          installed app on your phone.
        </Text>
      </View>
    );
  }

  const denied = state === 'denied';
  return (
    <View style={[styles.banner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <SymbolView
        name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
        tintColor={colors.warning}
        size={20}
      />
      <View style={styles.bannerBody}>
        <Text variant="label" color={colors.warning}>
          {denied ? 'Notifications are turned off' : 'Turn on notifications'}
        </Text>
        <Text variant="caption" color={colors.warning} style={styles.bannerText}>
          {denied
            ? 'Enable notifications for Resneo in your device Settings to get alerts.'
            : 'Allow notifications so this device can alert you about bookings.'}
        </Text>
        <Button
          label={denied ? 'Open Settings' : 'Enable'}
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={denied ? onOpenSettings : onEnable}
          style={styles.bannerButton}
        />
      </View>
    </View>
  );
}

export default function NotificationPreferencesScreen() {
  const toast = useToast();
  const accessToken = useAccessToken();
  const prefsQuery = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  // Init synchronously so the effect never sets state on the unsupported path
  // (web / Expo Go) — that would be a cascading-render setState-in-effect.
  const [permission, setPermission] = useState<PermissionState>(() =>
    Notifications ? 'loading' : 'unsupported',
  );
  const [enabling, setEnabling] = useState(false);

  const checkPermission = useCallback(async () => {
    if (!Notifications) return;
    try {
      const result = await Notifications.getPermissionsAsync();
      setPermission(
        result.status === 'granted'
          ? 'granted'
          : result.status === 'denied'
            ? 'denied'
            : 'undetermined',
      );
    } catch {
      setPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    // checkPermission only setStates AFTER an await (async), never synchronously —
    // the rule can't see past the async boundary, so the warning is a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkPermission();
  }, [checkPermission]);

  // Re-check when returning from the OS Settings app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const header = <Stack.Screen options={{ headerShown: true, title: 'Push notifications' }} />;

  const handleEnable = useCallback(async () => {
    if (!accessToken) {
      toast.info('Sign in before enabling push notifications.');
      return;
    }
    setEnabling(true);
    try {
      const result = await registerCurrentDeviceForPush({ accessToken });
      if (result.registered) {
        toast.success('Push notifications enabled on this device.');
      } else if (result.reason === 'denied') {
        toast.info('Permission denied — enable notifications for Resneo in Settings.');
      } else if (result.reason !== 'web' && result.reason !== 'expo-go' && result.reason !== 'simulator') {
        toast.error('Could not enable push on this device.');
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not enable push.');
    } finally {
      setEnabling(false);
      void checkPermission();
    }
  }, [accessToken, toast, checkPermission]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings().catch(() => toast.error('Could not open Settings.'));
  }, [toast]);

  const setPref = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      hapticTap();
      updatePrefs.mutate(patch, {
        onError: () => toast.error('Could not save that change. Please try again.'),
      });
    },
    [updatePrefs, toast],
  );

  const toggle = useCallback(
    (key: BooleanNotificationKey, value: boolean) =>
      setPref({ [key]: value } as Partial<NotificationPreferences>),
    [setPref],
  );

  if (prefsQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (prefsQuery.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            prefsQuery.error instanceof ApiError
              ? prefsQuery.error.message
              : 'Could not load your notification settings.'
          }
          onRetry={() => void prefsQuery.refetch()}
        />
      </Screen>
    );
  }

  const prefs = resolveNotificationPreferences(prefsQuery.data);
  const categoriesEnabled = prefs.push_enabled;

  const renderToggleCard = (rows: ToggleRowConfig[]) => (
    <Card padded={false}>
      {rows.map((row, index) => (
        <ToggleRow
          key={row.key}
          label={row.label}
          description={row.description}
          value={prefs[row.key]}
          disabled={!categoriesEnabled}
          isLast={index === rows.length - 1}
          onValueChange={(next) => toggle(row.key, next)}
        />
      ))}
    </Card>
  );

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {header}

      <PermissionBanner
        state={permission}
        busy={enabling}
        onEnable={() => void handleEnable()}
        onOpenSettings={handleOpenSettings}
      />

      <Card padded={false}>
        <ToggleRow
          label="Push notifications"
          description="Receive alerts on this device"
          value={prefs.push_enabled}
          isLast
          onValueChange={(next) => toggle('push_enabled', next)}
        />
      </Card>

      {categoriesEnabled ? (
        <>
          <View style={styles.section}>
            <SectionHeader title="Bookings" />
            {renderToggleCard(BOOKING_ROWS)}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Reminders & operations" />
            {renderToggleCard(OPS_ROWS)}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Account" />
            {renderToggleCard(ACCOUNT_ROWS)}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Which bookings?" />
            <Segmented
              options={[
                { value: 'all', label: 'All bookings' },
                { value: 'mine', label: 'Just mine' },
              ]}
              value={prefs.booking_scope}
              onChange={(value) => setPref({ booking_scope: value })}
            />
            <Text variant="caption" tone="muted" style={styles.scopeHint}>
              {prefs.booking_scope === 'mine'
                ? 'Only alert me about bookings assigned to me.'
                : 'Alert me about every booking at this venue.'}
            </Text>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Quiet hours" />
            <Card padded={false}>
              <ToggleRow
                label="Pause overnight"
                description={`Mute non-urgent alerts ${format12h(prefs.quiet_hours_start)}–${format12h(prefs.quiet_hours_end)}`}
                value={prefs.quiet_hours_enabled}
                isLast
                onValueChange={(next) => toggle('quiet_hours_enabled', next)}
              />
            </Card>
          </View>
        </>
      ) : (
        <Text variant="bodySmall" tone="muted" style={styles.disabledNote}>
          Turn on push notifications to choose what this device alerts you about.
        </Text>
      )}

      <Text variant="caption" tone="muted" style={styles.footnote}>
        These preferences apply to this account on every device you sign in to. Guest reminders and
        confirmations are sent separately by email and SMS.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  bannerBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
  },
  bannerButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  scopeHint: {
    marginLeft: spacing.xs,
  },
  disabledNote: {
    marginTop: -spacing.sm,
  },
  footnote: {
    marginTop: spacing.sm,
  },
});
