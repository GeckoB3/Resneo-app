import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCommunicationPolicies,
  useNotificationSettings,
  useUpdateCommunicationPolicies,
  useUpdateNotificationSettings,
} from '@/lib/queries/useCommunications';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CommunicationMessageKey,
  LaneCommunicationPolicies,
  LaneMessagePolicy,
  MessageChannel,
  VenueNotificationSettings,
} from '@/types/communications';

/**
 * Per-message definitions — ported from the web `CommunicationTemplatesSection`
 * (appointments_other lane). Order matches the web page.
 */
type MessageDef = {
  key: CommunicationMessageKey;
  label: string;
  description: string;
  allowedChannels: MessageChannel[];
  /** Timing-controlled messages: hours before start / after end. */
  timing?: { field: 'hoursBefore' | 'hoursAfter'; label: string; default: number };
  defaultEnabled: boolean;
  defaultChannels: MessageChannel[];
};

const MESSAGE_DEFS: MessageDef[] = [
  {
    key: 'booking_confirmation',
    label: 'Booking confirmation',
    description: 'Sent as soon as the booking is confirmed',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'confirm_or_cancel_prompt',
    label: 'Confirm or cancel prompt',
    description: 'Ask the guest to confirm or cancel before the visit',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before the visit', default: 24 },
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'pre_visit_reminder',
    label: 'Pre-visit reminder',
    description: 'Reminder shortly before the booking starts',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before the visit', default: 2 },
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'deposit_payment_request',
    label: 'Deposit payment request',
    description: 'Used when a booking needs a separate deposit payment link',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'deposit_confirmation',
    label: 'Deposit confirmation',
    description: 'Confirms that a deposit has been paid successfully',
    allowedChannels: ['email'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'deposit_payment_reminder',
    label: 'Deposit payment reminder',
    description: 'Reminder for unpaid deposit bookings before they are released',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before release', default: 2 },
    defaultEnabled: true,
    defaultChannels: ['sms'],
  },
  {
    key: 'booking_modification',
    label: 'Booking modification',
    description: 'Sent when the booking details are changed',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'cancellation_confirmation',
    label: 'Cancellation confirmation',
    description: 'Sent when a booking is cancelled',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'auto_cancel_notification',
    label: 'Auto-cancel notification',
    description: 'Sent when an unpaid booking is automatically cancelled',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'no_show_notification',
    label: 'No-show notification',
    description: 'Optional notice when staff mark a booking as a no-show',
    allowedChannels: ['email'],
    defaultEnabled: false,
    defaultChannels: ['email'],
  },
  {
    key: 'post_visit_thankyou',
    label: 'Post-visit thank you',
    description: 'Follow-up after the booking has taken place',
    allowedChannels: ['email'],
    timing: { field: 'hoursAfter', label: 'after the visit', default: 4 },
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'custom_message',
    label: 'Custom message',
    description: 'Staff-composed message sent directly to the guest',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
];

const WAITLIST_DEF: MessageDef = {
  key: 'appointment_waitlist_offer',
  label: 'Waitlist invite',
  description: 'Sent when staff offer an appointment slot to someone on the waitlist',
  allowedChannels: ['email', 'sms'],
  defaultEnabled: false,
  defaultChannels: ['email'],
};

function defaultPolicy(def: MessageDef): LaneMessagePolicy {
  return {
    enabled: def.defaultEnabled,
    channels: def.defaultChannels,
    emailCustomMessage: null,
    smsCustomMessage: null,
    ...(def.timing ? { [def.timing.field]: def.timing.default } : {}),
  };
}

function HoursStepper({
  value,
  suffix,
  onChange,
  disabled = false,
}: {
  value: number;
  suffix: string;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const step = (delta: number) => {
    if (disabled) return;
    hapticSelect();
    onChange(Math.min(168, Math.max(1, value + delta)));
  };
  return (
    <View style={styles.hoursRow}>
      <Text variant="bodySmall" tone="muted">
        Send
      </Text>
      <View style={styles.hoursControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fewer hours"
          onPress={() => step(-1)}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.stepSymbol, { color: colors.brand }]}>−</Text>
        </Pressable>
        <Text variant="bodyMedium" style={styles.hoursValue}>
          {value}h
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More hours"
          onPress={() => step(1)}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.stepSymbol, { color: colors.brand }]}>+</Text>
        </Pressable>
      </View>
      <Text variant="bodySmall" tone="muted">
        {suffix}
      </Text>
    </View>
  );
}

/** One message policy card — toggle, channels, timing, custom template lines. */
function MessageCard({
  def,
  policy,
  isAdmin,
  onChange,
}: {
  def: MessageDef;
  policy: LaneMessagePolicy;
  isAdmin: boolean;
  onChange: (next: LaneMessagePolicy) => void;
}) {
  const toggleChannel = (channel: MessageChannel) => {
    if (!isAdmin) return;
    const has = policy.channels.includes(channel);
    if (has && policy.channels.length === 1) {
      // At least one channel must stay selected (web parity).
      hapticWarning();
      return;
    }
    hapticSelect();
    onChange({
      ...policy,
      channels: has
        ? policy.channels.filter((c) => c !== channel)
        : [...policy.channels, channel],
    });
  };

  const timingValue = def.timing
    ? policy[def.timing.field] ?? def.timing.default
    : null;

  return (
    <Card>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text variant="bodyMedium">{def.label}</Text>
          <Text variant="caption" tone="muted">
            {def.description}
          </Text>
        </View>
        <Switch
          value={policy.enabled}
          disabled={!isAdmin}
          accessibilityLabel={def.label}
          onValueChange={(enabled) => onChange({ ...policy, enabled })}
        />
      </View>

      {policy.enabled ? (
        <View style={styles.cardBody}>
          <View style={styles.channelRow}>
            {def.allowedChannels.map((channel) => (
              <Chip
                key={channel}
                label={channel === 'email' ? 'Email' : 'SMS'}
                selected={policy.channels.includes(channel)}
                onPress={() => toggleChannel(channel)}
              />
            ))}
          </View>

          {def.timing && timingValue != null ? (
            <HoursStepper
              value={timingValue}
              suffix={def.timing.label}
              disabled={!isAdmin}
              onChange={(v) => onChange({ ...policy, [def.timing!.field]: v })}
            />
          ) : null}

          {isAdmin && def.allowedChannels.includes('email') && policy.channels.includes('email') ? (
            <Input
              label="Email optional message"
              helper="Optional extra line shown with the standard template."
              value={policy.emailCustomMessage ?? ''}
              onChangeText={(v) => onChange({ ...policy, emailCustomMessage: v || null })}
              multiline
              style={styles.multiline}
              maxLength={500}
            />
          ) : null}
          {isAdmin && def.allowedChannels.includes('sms') && policy.channels.includes('sms') ? (
            <Input
              label="SMS optional message"
              helper={`Kept short — counts toward the SMS length. ${(policy.smsCustomMessage ?? '').length}/320`}
              value={policy.smsCustomMessage ?? ''}
              onChangeText={(v) => onChange({ ...policy, smsCustomMessage: v || null })}
              multiline
              style={styles.multiline}
              maxLength={320}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Communications — per-message guest policies (web "Guest communications"
 * parity: enable, channels, timing, optional template lines) + staff alerts.
 */
export default function CommunicationsScreen() {
  const { venue, featureFlags } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const waitlistEnabled = featureFlags?.resolved?.waitlist_v2 === true;

  const policiesQuery = useCommunicationPolicies();
  const updatePolicies = useUpdateCommunicationPolicies();
  const settingsQuery = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();

  const [lane, setLane] = useState<LaneCommunicationPolicies | null>(null);
  const [staffDraft, setStaffDraft] = useState<VenueNotificationSettings | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (policiesQuery.data && settingsQuery.data && !seeded) {
    setSeeded(true);
    setLane(policiesQuery.data.appointments_other ?? {});
    setStaffDraft(settingsQuery.data);
  }

  const defs = waitlistEnabled ? [...MESSAGE_DEFS, WAITLIST_DEF] : MESSAGE_DEFS;

  const policyFor = (def: MessageDef): LaneMessagePolicy =>
    lane?.[def.key] ?? defaultPolicy(def);

  const setPolicy = (key: CommunicationMessageKey, next: LaneMessagePolicy) => {
    setLane((current) => ({ ...(current ?? {}), [key]: next }));
    setSaved(false);
  };

  const patchStaff = <K extends keyof VenueNotificationSettings>(
    key: K,
    value: VenueNotificationSettings[K],
  ) => {
    setStaffDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  const laneChanged =
    !!lane &&
    !!policiesQuery.data &&
    JSON.stringify(lane) !== JSON.stringify(policiesQuery.data.appointments_other ?? {});
  const staffChanged =
    !!staffDraft &&
    !!settingsQuery.data &&
    JSON.stringify(staffDraft) !== JSON.stringify(settingsQuery.data);
  const hasChanges = laneChanged || staffChanged;

  async function handleSave() {
    if (!lane || !staffDraft || !settingsQuery.data) return;
    setError(null);
    try {
      if (laneChanged) {
        await updatePolicies.mutateAsync({ appointments_other: lane });
      }
      if (staffChanged) {
        const changes: Partial<VenueNotificationSettings> = {};
        for (const key of Object.keys(staffDraft) as (keyof VenueNotificationSettings)[]) {
          if (JSON.stringify(staffDraft[key]) !== JSON.stringify(settingsQuery.data[key])) {
            (changes as Record<string, unknown>)[key] = staffDraft[key];
          }
        }
        await updateSettings.mutateAsync(changes);
      }
      hapticSuccess();
      setSaved(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save communication settings.');
    }
  }

  const header = <Stack.Screen options={{ title: 'Communications' }} />;
  const loading =
    policiesQuery.isLoading || settingsQuery.isLoading || ((policiesQuery.data && settingsQuery.data) && (!lane || !staffDraft));

  if (loading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (policiesQuery.isError || settingsQuery.isError || !lane || !staffDraft) {
    const err = policiesQuery.error ?? settingsQuery.error;
    return (
      <Screen>
        {header}
        <ErrorState
          message={err instanceof ApiError ? err.message : 'Could not load settings.'}
          onRetry={() => {
            void policiesQuery.refetch();
            void settingsQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" tone="secondary">
          Messages for appointments and other bookings. Each one can be switched off, sent by
          email and/or SMS, and carry an optional extra line on top of the standard template.
        </Text>

        {defs.map((def) => (
          <MessageCard
            key={def.key}
            def={def}
            policy={policyFor(def)}
            isAdmin={!!isAdmin}
            onChange={(next) => setPolicy(def.key, next)}
          />
        ))}

        <Card>
          <Text variant="label">Staff alerts</Text>
          <View style={styles.staffSection}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text variant="bodyMedium">Daily schedule email</Text>
                <Text variant="caption" tone="muted">
                  Each morning&apos;s appointments
                </Text>
              </View>
              <Switch
                value={staffDraft.daily_schedule_enabled}
                disabled={!isAdmin}
                onValueChange={(v) => patchStaff('daily_schedule_enabled', v)}
              />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text variant="bodyMedium">New booking alerts</Text>
              </View>
              <Switch
                value={staffDraft.staff_new_booking_alert}
                disabled={!isAdmin}
                onValueChange={(v) => patchStaff('staff_new_booking_alert', v)}
              />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text variant="bodyMedium">Cancellation alerts</Text>
              </View>
              <Switch
                value={staffDraft.staff_cancellation_alert}
                disabled={!isAdmin}
                onValueChange={(v) => patchStaff('staff_cancellation_alert', v)}
              />
            </View>
          </View>
        </Card>

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success">
            Saved.
          </Text>
        ) : null}

        {isAdmin ? (
          <Button
            label="Save changes"
            fullWidth
            loading={updatePolicies.isPending || updateSettings.isPending}
            disabled={!hasChanges}
            onPress={() => void handleSave()}
          />
        ) : (
          <Text variant="caption" tone="muted" style={styles.footnote}>
            Only admins can change these settings.
          </Text>
        )}
        <Text variant="caption" tone="muted" style={styles.footnote}>
          Message previews are available on the web dashboard.
        </Text>
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  cardBody: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  channelRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hoursControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hoursValue: {
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 20,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  staffSection: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
