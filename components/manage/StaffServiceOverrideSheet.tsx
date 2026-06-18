import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { penceToPoundsInput } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateServiceOverride } from '@/lib/queries/useUpdateServiceOverride';
import {
  buildServiceOverridePatch,
  mergeServiceWithOverride,
  staffMayCustomizeFlags,
  type ServiceOverrideDraft,
} from '@/lib/services/service-override';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService, PractitionerServiceLink } from '@/types/services-manage';

/** Web service-colour presets (same palette as the admin form). */
const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export interface OverrideCalendarChoice {
  id: string;
  name: string;
}

interface StaffServiceOverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The venue base service whose `staff_may_customize_*` flags gate the fields. */
  service: ManagedService | null;
  /** Calendars this staff member manages (drives the picker when length > 1). */
  calendarChoices: OverrideCalendarChoice[];
  /** Currently selected calendar id (controlled by the parent). */
  selectedCalendarId: string | null;
  onSelectCalendar: (id: string) => void;
  /** Existing override link for the selected calendar (to seed current values). */
  link: PractitionerServiceLink | null;
}

/**
 * Non-admin staff per-calendar field overrides (web parity:
 * StaffServiceOverrideModal). Renders ONLY the fields the admin permitted via
 * `staff_may_customize_*`; each is seeded from the effective (merged) value and
 * diffed to `null` when it matches the venue base on save. A calendar picker
 * appears when the staff member manages more than one calendar.
 */
export function StaffServiceOverrideSheet({
  visible,
  onClose,
  service,
  calendarChoices,
  selectedCalendarId,
  onSelectCalendar,
  link,
}: StaffServiceOverrideSheetProps) {
  const { colors } = useTheme();
  const updateOverride = useUpdateServiceOverride();

  const flags = useMemo(
    () => (service ? staffMayCustomizeFlags(service) : null),
    [service],
  );
  const merged = useMemo(
    () => (service ? mergeServiceWithOverride(service, link) : null),
    [service, link],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [buffer, setBuffer] = useState('0');
  const [price, setPrice] = useState('');
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [colour, setColour] = useState(COLOUR_OPTIONS[0]!);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the fields whenever the sheet opens or the selected calendar's link
  // changes. Mirrors the web modal's effect on `[open, merged]`.
  useEffect(() => {
    if (!visible || !merged) return;
    // Re-seed editor fields on open / calendar change (same pattern as the other
    // editor sheets, e.g. ClassTypeEditorSheet).
    /* eslint-disable react-hooks/set-state-in-effect */
    setError(null);
    setName(merged.name);
    setDescription(merged.description);
    setDuration(String(merged.duration_minutes));
    setBuffer(String(merged.buffer_minutes));
    setPrice(penceToPoundsInput(merged.price_pence));
    const dep = merged.deposit_pence;
    setRequireDeposit(dep != null && dep > 0);
    setDeposit(penceToPoundsInput(dep));
    setColour(merged.colour);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible, merged]);

  if (!service || !flags || !merged) return null;

  const multipleCalendars = calendarChoices.length > 1;

  async function handleSave() {
    if (!service) return;
    setError(null);

    const draft: ServiceOverrideDraft = {
      name,
      description,
      durationMinutes: Number(duration),
      bufferMinutes: Number(buffer || '0'),
      price,
      requireDeposit,
      deposit,
      colour,
    };

    // Validate the numeric fields that are editable, mirroring the route's zod
    // bounds (duration 5–480, buffer 0–120) so we fail fast with a clear message.
    if (flags!.duration) {
      const d = draft.durationMinutes;
      if (!Number.isInteger(d) || d < 5 || d > 480) {
        setError('Duration must be 5–480 minutes.');
        return;
      }
    }
    if (flags!.buffer) {
      const b = draft.bufferMinutes;
      if (!Number.isInteger(b) || b < 0 || b > 120) {
        setError('Buffer must be 0–120 minutes.');
        return;
      }
    }

    const patch = buildServiceOverridePatch({
      service: service!,
      draft,
      calendarId: selectedCalendarId,
      multipleCalendars,
    });

    try {
      await updateOverride.mutateAsync(patch);
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save your settings.');
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%" fill>
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          Your settings
        </Text>
        <Text variant="subheading" numberOfLines={2}>
          {service.name}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled">
          {multipleCalendars ? (
            <View style={styles.sectionStack}>
              <Text variant="overline" tone="muted">
                Calendar
              </Text>
              <View style={styles.calendarWrap}>
                {calendarChoices.map((choice) => {
                  const selected = choice.id === selectedCalendarId;
                  return (
                    <Pressable
                      key={choice.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        if (selected) return;
                        hapticSelect();
                        onSelectCalendar(choice.id);
                      }}
                      style={({ pressed }) => [
                        styles.calendarChip,
                        {
                          backgroundColor: selected ? colors.brand : colors.surface,
                          borderColor: selected ? colors.brand : colors.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}>
                      <Text
                        variant="label"
                        color={selected ? colors.onBrand : colors.textSecondary}
                        numberOfLines={1}>
                        {choice.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text variant="caption" tone="muted">
            {multipleCalendars
              ? 'Changes apply only to the calendar selected above. Match the venue default to clear your override for a field.'
              : 'Changes apply only to your calendar. Match the venue default to clear your override for a field.'}
          </Text>

          {flags.name ? (
            <Input
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={200}
              helper={`Venue default: ${service.name}`}
            />
          ) : null}

          {flags.description ? (
            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              style={styles.multiline}
              maxLength={2000}
            />
          ) : null}

          {flags.duration || flags.buffer ? (
            <View style={styles.moneyRow}>
              {flags.duration ? (
                <View style={styles.moneyField}>
                  <Input
                    label="Duration (mins)"
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    helper={`Default: ${service.duration_minutes} min`}
                  />
                </View>
              ) : null}
              {flags.buffer ? (
                <View style={styles.moneyField}>
                  <Input
                    label="Buffer (mins)"
                    value={buffer}
                    onChangeText={setBuffer}
                    keyboardType="number-pad"
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {flags.price ? (
            <Input
              label="Price (£)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          ) : null}

          {flags.deposit ? (
            <View style={[styles.depositBox, { borderColor: colors.border }]}>
              <View style={styles.switchRow}>
                <Text variant="bodyMedium">Require deposit</Text>
                <Switch value={requireDeposit} onValueChange={setRequireDeposit} />
              </View>
              {requireDeposit ? (
                <Input
                  label="Deposit (£)"
                  value={deposit}
                  onChangeText={setDeposit}
                  keyboardType="decimal-pad"
                />
              ) : null}
            </View>
          ) : null}

          {flags.colour ? (
            <View style={styles.sectionStack}>
              <Text variant="overline" tone="muted">
                Colour
              </Text>
              <View style={styles.swatchRow}>
                {COLOUR_OPTIONS.map((option) => {
                  const selected = colour === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityLabel={`Colour ${option}`}
                      accessibilityState={{ selected }}
                      onPress={() => setColour(option)}
                      style={({ pressed }) => [
                        styles.swatch,
                        { backgroundColor: option, opacity: pressed ? 0.7 : 1 },
                        selected
                          ? { borderColor: colors.text, borderWidth: 2.5 }
                          : { borderColor: 'transparent', borderWidth: 2.5 },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Save changes"
            style={styles.flex1}
            loading={updateOverride.isPending}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bodyWrap: {
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionStack: {
    gap: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyField: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  depositBox: {
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
  },
  calendarWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  calendarChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
