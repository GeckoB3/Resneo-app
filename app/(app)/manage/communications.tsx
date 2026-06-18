import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { CommunicationPreviewSheet } from '@/components/manage/CommunicationPreviewSheet';
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
  usePreviewCommunication,
  useUpdateCommunicationPolicies,
  useUpdateNotificationSettings,
} from '@/lib/queries/useCommunications';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CommunicationLane,
  CommunicationMessageKey,
  CommunicationPreviewResponse,
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

/**
 * Loose email check matching the web "New booking alert" validation exactly
 * (`CommunicationTemplatesSection` `commitOwnerAlertEmail`). An empty value is
 * allowed — the server falls back to the venue profile email.
 */
const OWNER_ALERT_EMAIL_RE = /^\S+@\S+\.\S+$/;
function isValidOwnerAlertEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || OWNER_ALERT_EMAIL_RE.test(trimmed);
}

// ---------------------------------------------------------------------------
// HoursStepper — fixed to 44-pt minimum touch targets (Apple HIG).
// ---------------------------------------------------------------------------
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
          disabled={disabled}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.stepBtnPressed,
            disabled && styles.stepBtnDisabled,
          ]}>
          <Text style={[styles.stepSymbol, { color: disabled ? colors.textMuted : colors.brand }]}>
            −
          </Text>
        </Pressable>
        <Text variant="bodyMedium" style={styles.hoursValue}>
          {value}h
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More hours"
          onPress={() => step(1)}
          disabled={disabled}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.stepBtnPressed,
            disabled && styles.stepBtnDisabled,
          ]}>
          <Text style={[styles.stepSymbol, { color: disabled ? colors.textMuted : colors.brand }]}>
            +
          </Text>
        </Pressable>
      </View>
      <Text variant="bodySmall" tone="muted">
        {suffix}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PreviewButton — small tappable label in MessageCard channel rows.
// ---------------------------------------------------------------------------
function PreviewButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Preview message"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.previewBtn,
        {
          backgroundColor: pressed ? colors.surface : colors.surfaceRaised,
          borderColor: colors.border,
        },
        disabled && { opacity: 0.4 },
      ]}>
      <Text variant="caption" style={{ color: colors.brand }}>
        Preview
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// MessageCard — toggle, channels, timing, custom template lines + preview.
// ---------------------------------------------------------------------------
type PreviewRequest = {
  def: MessageDef;
  channel: MessageChannel;
  customMessage: string | null;
};

function MessageCard({
  def,
  policy,
  isAdmin,
  onChange,
  onPreview,
}: {
  def: MessageDef;
  policy: LaneMessagePolicy;
  isAdmin: boolean;
  onChange: (next: LaneMessagePolicy) => void;
  onPreview: (req: PreviewRequest) => void;
}) {
  const { colors } = useTheme();

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
    ? (policy[def.timing.field] ?? def.timing.default)
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
          onValueChange={(enabled) => {
            hapticSelect();
            onChange({ ...policy, enabled });
          }}
        />
      </View>

      {policy.enabled ? (
        <View style={styles.cardBody}>
          {/* Channel chips */}
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

          {/* Timing stepper */}
          {def.timing && timingValue != null ? (
            <HoursStepper
              value={timingValue}
              suffix={def.timing.label}
              disabled={!isAdmin}
              onChange={(v) => onChange({ ...policy, [def.timing!.field]: v })}
            />
          ) : null}

          {/* Custom-message inputs + preview buttons — shown for ALL allowed
              channels when the message is on (web parity: pre-fill even if
              channel not yet active). */}
          {def.allowedChannels.includes('email') ? (
            <View
              style={[
                styles.channelEditor,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <View style={styles.channelEditorHeader}>
                <Text variant="label">Email optional message</Text>
                <PreviewButton
                  onPress={() =>
                    onPreview({
                      def,
                      channel: 'email',
                      customMessage: policy.emailCustomMessage ?? null,
                    })
                  }
                />
              </View>
              {isAdmin ? (
                <Input
                  value={policy.emailCustomMessage ?? ''}
                  placeholder="Optional extra line shown with the standard template…"
                  onChangeText={(v) => onChange({ ...policy, emailCustomMessage: v || null })}
                  multiline
                  style={styles.multiline}
                  maxLength={500}
                  helper={`${(policy.emailCustomMessage ?? '').length}/500 characters`}
                />
              ) : (
                <Text variant="bodySmall" tone="muted">
                  {policy.emailCustomMessage ?? '—'}
                </Text>
              )}
            </View>
          ) : null}

          {def.allowedChannels.includes('sms') ? (
            <View
              style={[
                styles.channelEditor,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <View style={styles.channelEditorHeader}>
                <Text variant="label">SMS optional message</Text>
                <PreviewButton
                  onPress={() =>
                    onPreview({
                      def,
                      channel: 'sms',
                      customMessage: policy.smsCustomMessage ?? null,
                    })
                  }
                />
              </View>
              {isAdmin ? (
                <Input
                  value={policy.smsCustomMessage ?? ''}
                  placeholder="Optional extra line added to the SMS…"
                  onChangeText={(v) => onChange({ ...policy, smsCustomMessage: v || null })}
                  multiline
                  style={styles.multiline}
                  maxLength={320}
                  helper={`${(policy.smsCustomMessage ?? '').length}/320 — counts toward SMS length`}
                />
              ) : (
                <Text variant="bodySmall" tone="muted">
                  {policy.smsCustomMessage ?? '—'}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// OwnerAlertCard — venue-level "New booking alert" (email-only). Mirrors the
// web `CommunicationTemplatesSection` "Business notifications → New booking
// alert" card: a Switch (owner_booking_notification_enabled) plus a recipient
// Input (owner_booking_notification_email) shown only when enabled, defaulting
// its placeholder to the venue profile email.
// ---------------------------------------------------------------------------
function OwnerAlertCard({
  enabled,
  email,
  venueEmail,
  isAdmin,
  error,
  onToggle,
  onChangeEmail,
}: {
  enabled: boolean;
  email: string;
  venueEmail: string | null | undefined;
  isAdmin: boolean;
  error: string | null;
  onToggle: (next: boolean) => void;
  onChangeEmail: (next: string) => void;
}) {
  const trimmedVenueEmail = venueEmail?.trim() || '';
  const helper = trimmedVenueEmail
    ? `Leave blank to use your venue email (${trimmedVenueEmail}).`
    : 'No venue email is set in Profile — enter an address here to receive alerts.';

  return (
    <Card>
      <Text variant="label">Business notifications</Text>
      <Text variant="caption" tone="muted" style={styles.sectionSub}>
        Alerts sent to you and your team rather than to guests.
      </Text>

      <View style={styles.staffSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text variant="bodyMedium">New booking alert</Text>
            <Text variant="caption" tone="muted">
              Email the business whenever a booking is made, so you and your staff know
              straight away. Sent by email only.
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={!isAdmin}
            accessibilityLabel="New booking alert"
            onValueChange={(next) => {
              hapticSelect();
              onToggle(next);
            }}
          />
        </View>

        {enabled ? (
          isAdmin ? (
            <Input
              label="Notification email"
              value={email}
              placeholder={trimmedVenueEmail || 'name@business.com'}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              textContentType="emailAddress"
              onChangeText={onChangeEmail}
              error={error ?? undefined}
              helper={helper}
            />
          ) : (
            <View style={styles.settingText}>
              <Text variant="label" tone="secondary">
                Notification email
              </Text>
              <Text variant="bodySmall" tone="muted">
                {email.trim() || trimmedVenueEmail || '—'}
              </Text>
            </View>
          )
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SMS Light-plan banner
// ---------------------------------------------------------------------------
function SmsLightBanner() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.infoBanner,
        { backgroundColor: colors.infoSurface, borderColor: colors.brandBorder },
      ]}>
      <Text variant="label" style={{ color: colors.brand }}>
        SMS on Appointments Light
      </Text>
      <Text variant="bodySmall" style={{ color: colors.brand, marginTop: spacing.xs }}>
        100 SMS segments are included each month, then a small per-segment fee beyond that. Add a
        payment card under Settings → Plan to enable SMS sending.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type PreviewSheetState = {
  visible: boolean;
  title: string;
  channel: MessageChannel;
  preview: CommunicationPreviewResponse | null;
  loading: boolean;
  error: string | null;
};

const PREVIEW_CLOSED: PreviewSheetState = {
  visible: false,
  title: '',
  channel: 'email',
  preview: null,
  loading: false,
  error: null,
};

/**
 * Communications — per-message guest policies (web "Guest communications"
 * parity: enable, channels, timing, optional template lines) + staff alerts.
 */
export default function CommunicationsScreen() {
  const { venue, featureFlags, refetch: refetchVenue } = useVenueContext();
  const { colors } = useTheme();
  const isAdmin = venue?.current_user_role === 'admin';
  const waitlistEnabled = featureFlags?.resolved?.waitlist_v2 === true;

  // SMS upsell banner: show when pricing_tier === 'light' and no Stripe subscription.
  // VenueBootstrap doesn't yet surface stripe_subscription_id, so we derive a safe
  // fallback: if stripe_connected_account_id is absent, assume no subscription.
  const showSmsLightBanner =
    venue?.pricing_tier === 'light' && !venue?.stripe_connected_account_id;

  const toast = useToast();
  const policiesQuery = useCommunicationPolicies();
  const updatePolicies = useUpdateCommunicationPolicies();
  const settingsQuery = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const updateVenue = useUpdateVenue();
  const previewMutation = usePreviewCommunication();

  const [lane, setLane] = useState<LaneCommunicationPolicies | null>(null);
  const [staffDraft, setStaffDraft] = useState<VenueNotificationSettings | null>(null);
  // Owner "New booking alert" draft (venue-level, PATCH /api/venue). Seeded from
  // the bootstrap on first load alongside lane/staffDraft.
  const [ownerAlertEnabled, setOwnerAlertEnabled] = useState(
    venue?.owner_booking_notification_enabled ?? false,
  );
  const [ownerAlertEmail, setOwnerAlertEmail] = useState(
    venue?.owner_booking_notification_email ?? '',
  );
  const [seeded, setSeeded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewSheet, setPreviewSheet] = useState<PreviewSheetState>(PREVIEW_CLOSED);

  // ---------------------------------------------------------------------------
  // Seed local state once (fixes the render-path side-effect bug).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (policiesQuery.data && settingsQuery.data && !seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeeded(true);

      // NOTE: the app is appointments-first and intentionally edits ONLY the
      // `appointments_other` lane. The web's restaurant `table` comm-lane (and
      // its lane switcher) is an intentional exclusion (R7 domain-15 Low) — do
      // not re-add a lane tablist unless a restaurant/table tier ships here.
      setLane(policiesQuery.data.appointments_other ?? {});

      setStaffDraft(settingsQuery.data);
      // Re-sync the owner-alert draft from the (now-loaded) bootstrap.
      setOwnerAlertEnabled(venue?.owner_booking_notification_enabled ?? false);
      setOwnerAlertEmail(venue?.owner_booking_notification_email ?? '');
    }
  }, [policiesQuery.data, settingsQuery.data, seeded, venue]);

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

  // Owner-alert change detection (compare trimmed email so whitespace-only edits
  // don't arm Save, matching the web's trim-before-compare).
  const ownerAlertEnabledChanged =
    ownerAlertEnabled !== (venue?.owner_booking_notification_enabled ?? false);
  const ownerAlertEmailChanged =
    ownerAlertEmail.trim() !== (venue?.owner_booking_notification_email ?? '').trim();
  const ownerAlertChanged = ownerAlertEnabledChanged || ownerAlertEmailChanged;
  // Block Save while the (enabled) recipient is an invalid address. Empty is OK.
  const ownerAlertEmailInvalid = ownerAlertEnabled && !isValidOwnerAlertEmail(ownerAlertEmail);
  const ownerAlertError = ownerAlertEmailInvalid ? 'Enter a valid email address.' : null;

  const laneChanged =
    !!lane &&
    !!policiesQuery.data &&
    JSON.stringify(lane) !== JSON.stringify(policiesQuery.data.appointments_other ?? {});
  const staffChanged =
    !!staffDraft &&
    !!settingsQuery.data &&
    JSON.stringify(staffDraft) !== JSON.stringify(settingsQuery.data);
  const hasChanges = laneChanged || staffChanged || ownerAlertChanged;

  async function handleSave() {
    if (!lane || !staffDraft || !settingsQuery.data) return;
    // Don't save an invalid owner-alert recipient (Save is also disabled below,
    // but guard here too in case it's invoked programmatically).
    if (ownerAlertEmailInvalid) {
      hapticWarning();
      setSaveError('Enter a valid notification email address.');
      return;
    }
    setSaveError(null);
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
      if (ownerAlertChanged) {
        // Send only what changed; empty email → null so the server falls back to
        // the venue profile email (web parity).
        await updateVenue.mutateAsync({
          ...(ownerAlertEnabledChanged
            ? { owner_booking_notification_enabled: ownerAlertEnabled }
            : {}),
          ...(ownerAlertEmailChanged
            ? { owner_booking_notification_email: ownerAlertEmail.trim() || null }
            : {}),
        });
        // Refresh the bootstrap so the seeded values reflect what we just saved
        // (placeholder/helper + change detection read from VenueProvider).
        refetchVenue();
      }
      hapticSuccess();
      setSaved(true);
      toast.success('Communication settings saved.');
    } catch (e) {
      hapticWarning();
      const msg =
        e instanceof ApiError ? e.message : 'Could not save communication settings.';
      setSaveError(msg);
      toast.error(msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Preview handling
  // ---------------------------------------------------------------------------
  async function handlePreview(req: PreviewRequest) {
    if (!isAdmin) return;
    hapticSelect();
    const title = `${req.def.label} (${req.channel === 'sms' ? 'SMS' : 'Email'})`;
    setPreviewSheet({ visible: true, title, channel: req.channel, preview: null, loading: true, error: null });
    try {
      const result = await previewMutation.mutateAsync({
        lane: 'appointments_other' as CommunicationLane,
        messageKey: req.def.key,
        channel: req.channel,
        customMessage: req.customMessage,
      });
      setPreviewSheet((prev) => ({ ...prev, preview: result, loading: false }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Preview failed to load.';
      setPreviewSheet((prev) => ({ ...prev, loading: false, error: msg }));
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  const header = <Stack.Screen options={{ title: 'Communications' }} />;
  const isLoading = policiesQuery.isLoading || settingsQuery.isLoading;

  // Show skeleton while queries are in flight OR while seeding state into lane/staffDraft
  // (the useEffect runs asynchronously on the next tick after query success).
  if (isLoading || (!policiesQuery.isError && !settingsQuery.isError && (!lane || !staffDraft))) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (policiesQuery.isError || settingsQuery.isError) {
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

  // At this point lane and staffDraft are guaranteed non-null (seeded by useEffect).
  if (!lane || !staffDraft) {
    // Unreachable in practice, but satisfies TypeScript narrowing.
    return null;
  }

  const isSaving =
    updatePolicies.isPending || updateSettings.isPending || updateVenue.isPending;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={policiesQuery.isRefetching || settingsQuery.isRefetching}
            onRefresh={() => {
              void policiesQuery.refetch();
              void settingsQuery.refetch();
            }}
            tintColor={colors.brand}
          />
        }>
        <Text variant="bodySmall" tone="secondary">
          Messages for appointments and other bookings. Switch each one on or off, choose
          email and/or SMS, and optionally add an extra line to the standard template.
        </Text>

        {/* SMS Light-plan upsell */}
        {showSmsLightBanner ? <SmsLightBanner /> : null}

        {/* Message policy cards */}
        {defs.map((def) => (
          <MessageCard
            key={def.key}
            def={def}
            policy={policyFor(def)}
            isAdmin={!!isAdmin}
            onChange={(next) => setPolicy(def.key, next)}
            onPreview={handlePreview}
          />
        ))}

        {/* Staff alerts */}
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

        {/* Business notifications — "New booking alert" owner email (web parity) */}
        <OwnerAlertCard
          enabled={ownerAlertEnabled}
          email={ownerAlertEmail}
          venueEmail={venue?.email}
          isAdmin={!!isAdmin}
          error={ownerAlertError}
          onToggle={(next) => {
            setOwnerAlertEnabled(next);
            setSaved(false);
          }}
          onChangeEmail={(next) => {
            setOwnerAlertEmail(next);
            setSaved(false);
          }}
        />

        {saveError ? (
          <Text variant="bodySmall" tone="danger">
            {saveError}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success" style={styles.savedText}>
            Settings saved.
          </Text>
        ) : null}

        {!isAdmin ? (
          <Text variant="caption" tone="muted" style={styles.footnote}>
            Only admins can change these settings.
          </Text>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Sticky save bar — armed by unsaved changes; Save blocked while the
          owner-alert email is invalid (the inline field error explains why). */}
      {isAdmin ? (
        <StickyBar
          hasChanges={hasChanges}
          isSaving={isSaving}
          saveDisabled={ownerAlertEmailInvalid}
          onSave={handleSave}
        />
      ) : null}

      {/* Preview sheet */}
      <CommunicationPreviewSheet
        visible={previewSheet.visible}
        title={previewSheet.title}
        channel={previewSheet.channel}
        preview={previewSheet.preview}
        loading={previewSheet.loading}
        error={previewSheet.error}
        onClose={() => setPreviewSheet(PREVIEW_CLOSED)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// StickyBar — appears at the bottom when hasChanges; replaces the scroll-to-
// bottom Save button pattern.
// ---------------------------------------------------------------------------
function StickyBar({
  hasChanges,
  isSaving,
  onSave,
  saveDisabled = false,
}: {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  /** Keeps the bar visible (it's armed by hasChanges) but blocks Save — e.g. a
   *  validation error elsewhere on the screen. */
  saveDisabled?: boolean;
}) {
  const { colors } = useTheme();
  // Use useState to hold the Animated.Value so it is stable across renders
  // without accessing a ref during render (satisfies react-hooks/refs).
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: hasChanges ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [hasChanges, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <Animated.View
      style={[
        styles.stickyBar,
        {
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.border,
          transform: [{ translateY }],
          opacity: anim,
        },
      ]}
      pointerEvents={hasChanges ? 'auto' : 'none'}>
      <Button
        label={isSaving ? 'Saving…' : 'Save changes'}
        fullWidth
        loading={isSaving}
        disabled={!hasChanges || isSaving || saveDisabled}
        onPress={onSave}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
    paddingBottom: spacing['2xl'],
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
    width: minTouchTarget,
    height: minTouchTarget,
    minWidth: minTouchTarget,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: {
    opacity: 0.7,
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  stepSymbol: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 20,
  },
  channelEditor: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  channelEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  previewBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  sectionSub: {
    marginTop: 2,
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
    minHeight: minTouchTarget,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  infoBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  footnote: {
    textAlign: 'center',
  },
  savedText: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  stickyBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
    paddingBottom: spacing.md,
  },
});
