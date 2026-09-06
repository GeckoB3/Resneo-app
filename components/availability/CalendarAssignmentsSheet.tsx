/**
 * CalendarAssignmentsSheet — which appointment services, class types,
 * resources and ticketed events sit on one calendar column, edited from the
 * calendar itself (web "Edit calendar" modal on the Calendars tab). Each
 * offering keeps its own editor too; this is the column's view of them.
 *
 * Saving applies only what changed: the service set through
 * PUT /api/venue/practitioner-services (which replaces the whole set), and one
 * PATCH per class type, resource or event whose column moved. A class type, a
 * resource and an event each sit on ONE column, so ticking one here moves it
 * off wherever it was, and the row says so; a resource is never left without a
 * column (`planCalendarAssignments`).
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { isResourceCalendar } from '@/lib/calendar/schedule-calendars';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateClassType } from '@/lib/queries/useClassesManage';
import { useUpdateEvent } from '@/lib/queries/useEventsManage';
import { useUpdateResource } from '@/lib/queries/useResourcesManage';
import { useToggleCalendarService } from '@/lib/queries/useToggleCalendarService';
import {
  assignmentsMovingHere,
  planCalendarAssignments,
  type AssignableItem,
} from '@/lib/venue/calendar-assignments';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

type Props = {
  calendar: Practitioner;
  /** Every calendar column: names where an item moves from, and a resource's fallback. */
  calendars: Practitioner[];
  services: { id: string; name: string }[];
  practitionerServices: { practitioner_id: string; service_id: string }[];
  classes: AssignableItem[];
  resources: AssignableItem[];
  /** Active events only (a paused one is not bookable anywhere). */
  events: AssignableItem[];
  onClose: () => void;
};

export function CalendarAssignmentsSheet({
  calendar,
  calendars,
  services,
  practitionerServices,
  classes,
  resources,
  events,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const setServices = useToggleCalendarService();
  const updateClassType = useUpdateClassType();
  const updateResource = useUpdateResource();
  const updateEvent = useUpdateEvent();

  const [chosenServices, setChosenServices] = useState<Set<string>>(
    () =>
      new Set(
        practitionerServices
          .filter((link) => link.practitioner_id === calendar.id)
          .map((link) => link.service_id),
      ),
  );
  const onThisCalendar = (items: AssignableItem[]) =>
    new Set(items.filter((i) => i.calendarId === calendar.id).map((i) => i.id));
  const [chosenClasses, setChosenClasses] = useState<Set<string>>(() => onThisCalendar(classes));
  const [chosenResources, setChosenResources] = useState<Set<string>>(() =>
    onThisCalendar(resources),
  );
  const [chosenEvents, setChosenEvents] = useState<Set<string>>(() => onThisCalendar(events));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarName = useMemo(
    () => new Map(calendars.map((c) => [c.id, c.name] as const)),
    [calendars],
  );
  // Another team calendar a resource can move to when it is unticked here.
  const fallbackCalendarId =
    calendars.find((c) => c.id !== calendar.id && !isResourceCalendar(c))?.id ?? null;

  function toggle(setter: (update: (prev: Set<string>) => Set<string>) => void, id: string, on: boolean) {
    setError(null);
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const plan = planCalendarAssignments({
      calendarId: calendar.id,
      fallbackCalendarId,
      draft: {
        services: chosenServices,
        classes: chosenClasses,
        resources: chosenResources,
        events: chosenEvents,
      },
      classes,
      resources,
      events,
    });
    if (plan.error) {
      setError(plan.error);
      return;
    }
    setSaving(true);
    try {
      for (const move of plan.classes) {
        await step(
          () => updateClassType.mutateAsync({ id: move.id, instructor_id: move.calendarId }),
          move.calendarId
            ? 'Could not update a class type for this calendar.'
            : 'Could not remove this class from the calendar.',
        );
      }
      for (const move of plan.resources) {
        await step(
          () =>
            updateResource.mutateAsync({ id: move.id, display_on_calendar_id: move.calendarId }),
          move.calendarId === calendar.id
            ? 'Could not assign a resource to this calendar.'
            : 'Could not move a resource to another calendar.',
        );
      }
      for (const move of plan.events) {
        await step(
          () => updateEvent.mutateAsync({ id: move.id, calendar_id: move.calendarId }),
          move.calendarId
            ? 'Could not assign an event to this calendar.'
            : 'Could not remove this event from the calendar.',
        );
      }
      await step(
        () =>
          setServices.mutateAsync({ practitioner_id: calendar.id, service_ids: plan.serviceIds }),
        'Failed to sync service links for this calendar.',
      );
      hapticSuccess();
      toast.success('Calendar updated.');
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const movingClasses = assignmentsMovingHere(classes, chosenClasses, calendar.id);
  const movingResources = assignmentsMovingHere(resources, chosenResources, calendar.id);
  const movingEvents = assignmentsMovingHere(events, chosenEvents, calendar.id);

  function renderRows(
    items: AssignableItem[],
    chosen: Set<string>,
    moving: AssignableItem[],
    onToggle: (id: string, on: boolean) => void,
  ) {
    return items.map((item) => {
      const movesHere = moving.some((m) => m.id === item.id);
      const elsewhere = item.calendarId != null && item.calendarId !== calendar.id;
      return (
        <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowText}>
            <Text variant="bodySmall" numberOfLines={1}>
              {item.name}
            </Text>
            {movesHere ? (
              <Text variant="caption" color={colors.warning}>
                Moves here from {calendarName.get(item.calendarId ?? '') ?? 'another calendar'}
              </Text>
            ) : elsewhere ? (
              <Text variant="caption" tone="muted">
                On {calendarName.get(item.calendarId ?? '') ?? 'another calendar'}
              </Text>
            ) : null}
          </View>
          <Switch
            value={chosen.has(item.id)}
            disabled={saving}
            accessibilityLabel={item.name}
            onValueChange={(on) => onToggle(item.id, on)}
            trackColor={{ true: colors.brand, false: colors.border }}
            thumbColor={colors.surfaceRaised}
          />
        </View>
      );
    });
  }

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Assignments — {calendar.name}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {services.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label">Appointment services</Text>
            <Text variant="caption" tone="muted">
              Which services can guests book on this column? The same service can appear on
              several columns. Leave empty if this column is only for classes or resources.
            </Text>
            {services.map((s) => (
              <View key={s.id} style={[styles.row, { borderColor: colors.border }]}>
                <Text variant="bodySmall" numberOfLines={1} style={styles.rowText}>
                  {s.name}
                </Text>
                <Switch
                  value={chosenServices.has(s.id)}
                  disabled={saving}
                  accessibilityLabel={s.name}
                  onValueChange={(on) => toggle(setChosenServices, s.id, on)}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={colors.surfaceRaised}
                />
              </View>
            ))}
          </View>
        ) : null}

        {classes.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label">Class types</Text>
            <Text variant="caption" tone="muted">
              Tick which classes run on this calendar. Each class can only sit on one column;
              ticking moves it here from another. If class times overlap, assign them to
              different calendars. To remove a class, clear its upcoming sessions and any
              recurring rule on the Classes page first.
            </Text>
            {renderRows(classes, chosenClasses, movingClasses, (id, on) =>
              toggle(setChosenClasses, id, on),
            )}
          </View>
        ) : null}

        {resources.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label">Resources on this column</Text>
            <Text variant="caption" tone="muted">
              Resources must be on a calendar to be bookable. You can assign more than one to
              this column as long as their weekly hours don&apos;t overlap.
            </Text>
            {renderRows(resources, chosenResources, movingResources, (id, on) =>
              toggle(setChosenResources, id, on),
            )}
          </View>
        ) : null}

        {events.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label">Ticketed events</Text>
            <Text variant="caption" tone="muted">
              Times on this column must not overlap other items. Events must be on a calendar to
              be bookable. You cannot remove an event while it has bookings. Cancel or resolve
              those first. Create events in Events.
            </Text>
            {renderRows(events, chosenEvents, movingEvents, (id, on) =>
              toggle(setChosenEvents, id, on),
            )}
          </View>
        ) : null}

        {services.length + classes.length + resources.length + events.length === 0 ? (
          <Text variant="caption" tone="muted">
            Nothing to assign yet. Add services, classes, resources or events first.
          </Text>
        ) : null}

        {error ? (
          <View
            style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}
            accessibilityRole="alert">
            <Text variant="caption" color={colors.danger}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" style={styles.flex1} disabled={saving} onPress={onClose} />
        <Button label="Save" style={styles.flex1} loading={saving} onPress={() => void handleSave()} />
      </View>
    </View>
  );
}

/** Run one save step; a failure surfaces the server's message, else the step's own. */
async function step(run: () => Promise<unknown>, fallback: string): Promise<void> {
  try {
    await run();
  } catch (e) {
    throw new Error(e instanceof ApiError ? e.message : fallback);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding (they delegate it to the
    // child), so pad the editor itself to match the standard sheet inset.
    paddingHorizontal: spacing.lg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});
