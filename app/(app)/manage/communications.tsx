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
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/lib/queries/useCommunications';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  MessageChannel,
  NotificationSettingsPatch,
  VenueNotificationSettings,
} from '@/types/communications';

function SettingRow({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text variant="bodyMedium">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

function ChannelPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: MessageChannel[];
  onChange: (next: MessageChannel[]) => void;
  disabled?: boolean;
}) {
  const toggle = (channel: MessageChannel) => {
    if (disabled) return;
    hapticSelect();
    onChange(
      value.includes(channel) ? value.filter((c) => c !== channel) : [...value, channel],
    );
  };
  return (
    <View style={styles.channelRow}>
      <Chip label="Email" selected={value.includes('email')} onPress={() => toggle('email')} />
      <Chip label="SMS" selected={value.includes('sms')} onPress={() => toggle('sms')} />
    </View>
  );
}

function HoursStepper({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
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
      <Text variant="bodySmall" tone="muted" style={styles.hoursLabel}>
        Send
      </Text>
      <View style={styles.hoursControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fewer hours before"
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
          accessibilityLabel="More hours before"
          onPress={() => step(1)}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.stepSymbol, { color: colors.brand }]}>+</Text>
        </Pressable>
      </View>
      <Text variant="bodySmall" tone="muted">
        before the visit
      </Text>
    </View>
  );
}

/** Communications — guest confirmations/reminders + staff alerts (admin edits). */
export default function CommunicationsScreen() {
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const query = useNotificationSettings();
  const update = useUpdateNotificationSettings();

  const [draft, setDraft] = useState<VenueNotificationSettings | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (query.data && !seeded) {
    setSeeded(true);
    setDraft(query.data);
  }

  const patch = <K extends keyof VenueNotificationSettings>(
    key: K,
    value: VenueNotificationSettings[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  const hasChanges =
    !!draft && !!query.data && JSON.stringify(draft) !== JSON.stringify(query.data);

  async function handleSave() {
    if (!draft || !query.data) return;
    setError(null);
    const changes: NotificationSettingsPatch = {};
    for (const key of Object.keys(draft) as (keyof VenueNotificationSettings)[]) {
      if (JSON.stringify(draft[key]) !== JSON.stringify(query.data[key])) {
        (changes as Record<string, unknown>)[key] = draft[key];
      }
    }
    try {
      await update.mutateAsync(changes);
      hapticSuccess();
      setSaved(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save communication settings.');
    }
  }

  const header = <Stack.Screen options={{ title: 'Communications' }} />;

  if (query.isLoading || (query.data && !draft)) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (query.isError || !draft) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load settings.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text variant="label">Booking confirmations</Text>
          <View style={styles.section}>
            <SettingRow
              label="Send confirmations"
              hint="When a booking is made"
              value={draft.confirmation_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('confirmation_enabled', v)}
            />
            {draft.confirmation_enabled ? (
              <>
                <ChannelPicker
                  value={draft.confirmation_channels}
                  disabled={!isAdmin}
                  onChange={(v) => patch('confirmation_channels', v)}
                />
                {isAdmin ? (
                  <Input
                    label="Custom SMS message (optional)"
                    value={draft.confirmation_sms_custom_message ?? ''}
                    onChangeText={(v) => patch('confirmation_sms_custom_message', v || null)}
                    multiline
                    style={styles.multiline}
                    maxLength={320}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </Card>

        <Card>
          <Text variant="label">Reminders</Text>
          <View style={styles.section}>
            <SettingRow
              label="First reminder"
              value={draft.reminder_1_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('reminder_1_enabled', v)}
            />
            {draft.reminder_1_enabled ? (
              <>
                <HoursStepper
                  value={draft.reminder_1_hours_before}
                  disabled={!isAdmin}
                  onChange={(v) => patch('reminder_1_hours_before', v)}
                />
                <ChannelPicker
                  value={draft.reminder_1_channels}
                  disabled={!isAdmin}
                  onChange={(v) => patch('reminder_1_channels', v)}
                />
              </>
            ) : null}

            <SettingRow
              label="Second reminder"
              value={draft.reminder_2_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('reminder_2_enabled', v)}
            />
            {draft.reminder_2_enabled ? (
              <>
                <HoursStepper
                  value={draft.reminder_2_hours_before}
                  disabled={!isAdmin}
                  onChange={(v) => patch('reminder_2_hours_before', v)}
                />
                <ChannelPicker
                  value={draft.reminder_2_channels}
                  disabled={!isAdmin}
                  onChange={(v) => patch('reminder_2_channels', v)}
                />
              </>
            ) : null}
          </View>
        </Card>

        <Card>
          <Text variant="label">Booking updates</Text>
          <View style={styles.section}>
            <SettingRow
              label="Reschedule notifications"
              value={draft.reschedule_notification_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('reschedule_notification_enabled', v)}
            />
            <SettingRow
              label="Cancellation notifications"
              value={draft.cancellation_notification_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('cancellation_notification_enabled', v)}
            />
            <SettingRow
              label="No-show notifications"
              value={draft.no_show_notification_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('no_show_notification_enabled', v)}
            />
            <SettingRow
              label="Post-visit thank you"
              value={draft.post_visit_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('post_visit_enabled', v)}
            />
          </View>
        </Card>

        <Card>
          <Text variant="label">Staff alerts</Text>
          <View style={styles.section}>
            <SettingRow
              label="Daily schedule email"
              hint="Each morning's appointments"
              value={draft.daily_schedule_enabled}
              disabled={!isAdmin}
              onChange={(v) => patch('daily_schedule_enabled', v)}
            />
            <SettingRow
              label="New booking alerts"
              value={draft.staff_new_booking_alert}
              disabled={!isAdmin}
              onChange={(v) => patch('staff_new_booking_alert', v)}
            />
            <SettingRow
              label="Cancellation alerts"
              value={draft.staff_cancellation_alert}
              disabled={!isAdmin}
              onChange={(v) => patch('staff_cancellation_alert', v)}
            />
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
            loading={update.isPending}
            disabled={!hasChanges}
            onPress={() => void handleSave()}
          />
        ) : (
          <Text variant="caption" tone="muted" style={styles.footnote}>
            Only admins can change these settings.
          </Text>
        )}
        <Text variant="caption" tone="muted" style={styles.footnote}>
          Per-message templates & advanced policies are managed on the web dashboard.
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
  section: {
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
  channelRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hoursLabel: {
    width: 34,
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
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
