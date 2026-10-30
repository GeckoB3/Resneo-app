import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { refusalText, useSaveCollectiveCalendarValues } from '@/lib/queries/useCollectiveServiceTools';
import { useUpdateServiceOverride } from '@/lib/queries/useUpdateServiceOverride';
import {
  calendarValuesPatch,
  calendarValuesText,
  fieldsTurnedOnBySaving,
  flagsTurnedOn,
  orList,
  shownCalendarValueFields,
  standardValueText,
  type CalendarValueDefaults,
  type CalendarValueFlag,
  type CalendarValueFlags,
  type CalendarValueKey,
  type CalendarValuesMode,
  type CalendarValuesTarget,
} from '@/lib/services/calendar-values';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * One calendar's own price, length, buffer and deposit for a service (web
 * `CollectiveCalendarValuesDialog`, 2026-10-28), as a STEP of whatever sheet opened it, never a
 * second sheet over it ([[ios-no-stacked-modals]]).
 *
 *   host  the collective's host, on any venue's calendar: saved through the collective, which tells
 *         that venue. A value for a field calendars may not set yet turns the setting on for the
 *         service, and the step says so before the save.
 *   own   a venue's admin, on its own calendars: only the fields the service lets calendars set.
 *
 * `CalendarValuesStep` is the plain frame (title, fields, Back and Save) for a sheet that draws its
 * own; a sheet built on `StepShell` uses `useCalendarValuesEditor` and `CalendarValuesFields` inside it.
 */
export interface CalendarValuesEditorInput {
  mode: CalendarValuesMode;
  /** The collective the host saves through; unused in own mode. */
  collectiveId: string | null;
  serviceName: string;
  target: CalendarValuesTarget;
  flags: CalendarValueFlags;
  defaults: CalendarValueDefaults | null;
  currencySymbol: string;
  /**
   * The service has active options (CQ-12, Rule B): each option sets its own price, length and
   * buffer, so only the deposit is offered here, and a server refusal says why.
   */
  hasOptions: boolean;
  /** Saved, with the settings the host's save turned on for the service (none in own mode). */
  onSaved: (turnedOn: CalendarValueFlag[]) => void;
  /** Nothing changed, so nothing was sent. */
  onUnchanged: () => void;
}

export function useCalendarValuesEditor(input: CalendarValuesEditorInput) {
  const { mode, collectiveId, target, flags, defaults, hasOptions, onSaved, onUnchanged } = input;
  const hostSave = useSaveCollectiveCalendarValues();
  const ownSave = useUpdateServiceOverride();
  const [text, setText] = useState<Record<CalendarValueKey, string>>(() => calendarValuesText(target.current));
  const [error, setError] = useState<string | null>(null);
  const shown = shownCalendarValueFields(mode, flags, defaults, hasOptions);
  const turnsOn = mode === 'host' ? fieldsTurnedOnBySaving(shown, flags) : [];
  const saving = hostSave.isPending || ownSave.isPending;

  const submit = () => {
    const patch = calendarValuesPatch(shown, text, target.current);
    if (!patch.ok) {
      setError(areaCopy('values.invalid', { field: patch.field.label.toLowerCase() }));
      return;
    }
    if (Object.keys(patch.values).length === 0) {
      onUnchanged();
      return;
    }
    setError(null);
    const onError = (err: unknown) =>
      setError(refusalText(err, areaCopy('values.saveFailed'), areaCopy('values.saveFailed')));
    if (mode === 'host') {
      if (!collectiveId) return;
      hostSave.mutate(
        { collectiveId, body: { calendar_id: target.calendarId, service_id: target.serviceId, values: patch.values } },
        { onSuccess: (result) => onSaved(flagsTurnedOn(result?.flags_turned_on)), onError },
      );
      return;
    }
    ownSave.mutate(
      { service_id: target.serviceId, calendar_id: target.calendarId, ...patch.values },
      { onSuccess: () => onSaved([]), onError },
    );
  };

  return {
    ...input,
    text,
    setField: (key: CalendarValueKey, value: string) => setText((prev) => ({ ...prev, [key]: value })),
    error,
    saving,
    submit,
    shown,
    turnsOn,
  };
}

export type CalendarValuesEditor = ReturnType<typeof useCalendarValuesEditor>;

/** The help line, the boxes, and the notes that go with them. */
export function CalendarValuesFields({ editor }: { editor: CalendarValuesEditor }) {
  const { colors } = useTheme();
  const { mode, target, serviceName, defaults, currencySymbol, hasOptions, shown, turnsOn, text, saving } = editor;
  return (
    <View style={styles.fields}>
      <Text variant="bodySmall" tone="secondary">
        {mode === 'host'
          ? areaCopy('values.help.host', { calendar: target.calendarName, venue: target.venueName })
          : areaCopy('values.help.own', { calendar: target.calendarName })}
      </Text>
      {shown.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {hasOptions ? areaCopy('values.noneAllowedOptions', { service: serviceName }) : areaCopy('values.noneAllowed')}
        </Text>
      ) : (
        <>
          {shown.map((field) => {
            const standard = standardValueText(field.key, defaults, currencySymbol);
            return (
              <View key={field.key} style={styles.field}>
                <Input
                  label={field.money ? `${field.label} (${currencySymbol})` : field.label}
                  accessibilityLabel={field.label}
                  value={text[field.key]}
                  placeholder={standard ?? ''}
                  onChangeText={(next) => editor.setField(field.key, next)}
                  keyboardType={field.money ? 'decimal-pad' : 'number-pad'}
                  editable={!saving}
                  helper={standard ? areaCopy('values.standard', { value: standard }) : undefined}
                />
                {text[field.key].trim() !== '' ? (
                  <Button
                    label={areaCopy('values.useStandard')}
                    variant="ghost"
                    size="sm"
                    style={styles.useStandard}
                    disabled={saving}
                    accessibilityLabel={`${areaCopy('values.useStandard')}: ${field.label}`}
                    onPress={() => editor.setField(field.key, '')}
                  />
                ) : null}
              </View>
            );
          })}
          <Text variant="caption" tone="muted">
            {areaCopy('values.blankHint')}
          </Text>
          {turnsOn.length > 0 ? (
            <View style={[styles.note, { borderColor: colors.brand, backgroundColor: colors.infoSurface }]}>
              <Text variant="caption">
                {areaCopy('values.turnsOn', { service: serviceName, fields: orList(turnsOn.map((f) => f.short)) })}
              </Text>
            </View>
          ) : null}
          {hasOptions ? (
            <View style={[styles.note, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
              <Text variant="caption" color={colors.warning}>
                {areaCopy('values.optionsNote', { service: serviceName })}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/** The step in a sheet that draws its own frame: title, the fields, then Back and Save. */
export function CalendarValuesStep(props: Omit<CalendarValuesEditorInput, 'onUnchanged'> & { onBack: () => void }) {
  const { colors } = useTheme();
  const { onBack, ...input } = props;
  const editor = useCalendarValuesEditor({ ...input, onUnchanged: onBack });
  return (
    <View style={styles.frame}>
      <Text variant="subheading">
        {areaCopy('values.title', { service: props.serviceName, calendar: props.target.calendarName })}
      </Text>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {editor.error ? (
          <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: colors.dangerSurface }]}>
            <Text variant="caption" tone="danger">
              {editor.error}
            </Text>
          </View>
        ) : null}
        <CalendarValuesFields editor={editor} />
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Back" variant="ghost" disabled={editor.saving} onPress={onBack} />
        <Button
          label={areaCopy('values.save')}
          loading={editor.saving}
          disabled={editor.saving || editor.shown.length === 0}
          onPress={editor.submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    gap: spacing.md,
    // A `fill` sheet carries no side padding of its own.
    paddingHorizontal: spacing.lg,
  },
  flex1: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  fields: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xxs,
  },
  useStandard: {
    alignSelf: 'flex-start',
  },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alert: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
