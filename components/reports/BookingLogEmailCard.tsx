/**
 * BookingLogEmailCard — enable/disable + configure the daily booking digest email.
 * Mirrors the web's BookingLogEmailSettingsPanel from ReportsView.tsx.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { useBookingLogEmailMutation } from '@/lib/queries/useBookingLogEmail';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingLogEmailConfig } from '@/types/reports';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_SCHEDULE: { day: number; time: string }[] = [
  { day: 1, time: '17:00' },
  { day: 2, time: '17:00' },
  { day: 3, time: '17:00' },
  { day: 4, time: '17:00' },
  { day: 5, time: '17:00' },
];

function normalizeConfig(
  config: BookingLogEmailConfig | null | undefined,
  fallbackEmail?: string | null,
): BookingLogEmailConfig {
  return {
    enabled: config?.enabled === true,
    recipient_email: config?.recipient_email ?? fallbackEmail ?? '',
    schedule: config?.schedule?.length ? config.schedule : DEFAULT_SCHEDULE,
  };
}

interface BookingLogEmailCardProps {
  config: BookingLogEmailConfig | null | undefined;
  defaultEmail: string | null | undefined;
  onSaved?: () => void;
}

export function BookingLogEmailCard({
  config,
  defaultEmail,
  onSaved,
}: BookingLogEmailCardProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const mutation = useBookingLogEmailMutation();
  const [draft, setDraft] = useState<BookingLogEmailConfig>(() =>
    normalizeConfig(config, defaultEmail),
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local draft when server config prop changes
    setDraft(normalizeConfig(config, defaultEmail));
  }, [config, defaultEmail]);

  function setDayEnabled(day: number, enabled: boolean) {
    setDraft((current) => {
      const exists = current.schedule.some((entry) => entry.day === day);
      if (enabled && !exists) {
        return {
          ...current,
          schedule: [...current.schedule, { day, time: '17:00' }].sort(
            (a, b) => a.day - b.day,
          ),
        };
      }
      if (!enabled) {
        return {
          ...current,
          schedule: current.schedule.filter((entry) => entry.day !== day),
        };
      }
      return current;
    });
  }

  async function handleSave() {
    hapticTap();
    const payload = {
      enabled: draft.enabled,
      recipient_email: draft.recipient_email?.trim() || null,
      schedule: draft.schedule,
    };
    try {
      await mutation.mutateAsync(payload);
      toast.success('Daily booking log settings saved.');
      onSaved?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to save booking log email settings.';
      toast.error(msg);
    }
  }

  const statusColor = draft.enabled ? colors.success : colors.textMuted;

  return (
    <Card>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text variant="label">Daily booking log email</Text>
          <Text variant="bodySmall" tone="secondary" style={styles.description}>
            Send a summary of new appointments and cancellations each day.
          </Text>
        </View>
        <View style={styles.switchRow}>
          <Text variant="caption" style={{ color: statusColor }}>
            {draft.enabled ? 'On' : 'Off'}
          </Text>
          <Switch
            value={draft.enabled}
            onValueChange={(val) => setDraft((c) => ({ ...c, enabled: val }))}
            trackColor={{ true: colors.success, false: colors.border }}
            thumbColor={colors.surfaceRaised}
          />
        </View>
      </View>

      <View style={styles.fields}>
        {/* Recipient email */}
        <Input
          label="Send to"
          value={draft.recipient_email ?? ''}
          onChangeText={(val) => setDraft((c) => ({ ...c, recipient_email: val }))}
          placeholder={defaultEmail ?? 'admin@example.com'}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Day schedule */}
        <View>
          <Text variant="label" tone="secondary">
            Schedule
          </Text>
          <Text variant="caption" tone="muted" style={styles.scheduleHint}>
            Select the days you want to receive the daily digest.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, day) => {
                const entry = draft.schedule.find((item) => item.day === day);
                const isChecked = Boolean(entry);
                return (
                  <View
                    key={label}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: isChecked ? colors.brandSubtle : colors.surface,
                        borderColor: isChecked ? colors.brandBorder : colors.border,
                      },
                    ]}>
                    <Text
                      variant="label"
                      style={{ color: isChecked ? colors.brand : colors.textSecondary }}>
                      {label}
                    </Text>
                    <Switch
                      value={isChecked}
                      onValueChange={(val) => setDayEnabled(day, val)}
                      trackColor={{ true: colors.brand, false: colors.border }}
                      thumbColor={colors.surfaceRaised}
                      style={styles.daySwitch}
                    />
                    {isChecked ? (
                      <Text variant="caption" tone="muted">
                        {entry?.time}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>

      <Button
        label={mutation.isPending ? 'Saving...' : 'Save email settings'}
        loading={mutation.isPending}
        onPress={() => void handleSave()}
        variant="primary"
        size="sm"
        style={styles.saveButton}
      />

      <Text variant="caption" tone="muted" style={styles.hint}>
        Emails are off by default and only send on selected days.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  headerText: {
    flex: 1,
  },
  description: {
    marginTop: spacing.xs,
  },
  switchRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  fields: {
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  scheduleHint: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  dayScroll: {
    marginTop: spacing.xs,
  },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dayChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 56,
  },
  daySwitch: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
  },
  saveButton: {
    alignSelf: 'flex-end',
  },
  hint: {
    marginTop: spacing.sm,
  },
});
