/**
 * ScheduleTimelineSheet — "Plan hours ahead" for one calendar: the timeline of
 * schedule changes (the one running now and any still to come, ended ones
 * behind a toggle), the form to add or edit one, the planning calendar that
 * shows the bookable hours on any date, and, for an admin, copying the
 * schedule to other calendars. Saves through PATCH /api/venue/practitioners
 * `{ schedule_periods }`, with the 409 "save anyway" flow the hours editor has.
 *
 * Web parity: `ScheduleTimelineEditor.tsx` (+ `saveSchedule` /
 * `copyScheduleTo` in `AppointmentAvailabilitySettings.tsx`). The web's
 * `window.confirm` questions are a two-step "Tap to confirm" on the row and
 * one ConfirmSheet, since a native alert never fires on the web preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { SchedulePeriodForm } from '@/components/availability/SchedulePeriodForm';
import {
  SchedulePreviewCalendar,
  periodTint,
  type DaySummary,
} from '@/components/availability/SchedulePreviewCalendar';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import {
  describePeriod,
  describeYmdLong,
  describeYmdShort,
  removeSchedulePeriod,
  scheduleForRow,
  schedulePeriodHasEnded,
  type CalendarSchedule,
  type SchedulePeriod,
} from '@/lib/calendar/working-hours-rota';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';
import type { OpeningHours } from '@/types/venue';

type Mode = { kind: 'idle' } | { kind: 'add'; from: string | null } | { kind: 'edit'; id: string };

type Ask = { title: string; message: string; resolve: (ok: boolean) => void };

const CONFIRM_MS = 4000;

type Props = {
  calendar: Practitioner;
  venueOpeningHours?: OpeningHours | null;
  /** True for a calendar the viewer may not change (a staff member's colleague). */
  readOnly: boolean;
  /** Other calendars an admin may copy this schedule to. */
  copyTargets: { id: string; name: string }[];
  /** Today, `YYYY-MM-DD`, in the venue's timezone. */
  todayYmd: string;
  onClose: () => void;
};

export function ScheduleTimelineSheet({
  calendar,
  venueOpeningHours,
  readOnly,
  copyTargets,
  todayYmd,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patch = usePatchPractitioner();

  const schedule = useMemo(() => scheduleForRow(calendar), [calendar]);
  const periods = schedule?.periods ?? [];
  const currentPeriods = periods.filter((p) => !schedulePeriodHasEnded(p, todayYmd));
  const pastPeriods = periods.filter((p) => schedulePeriodHasEnded(p, todayYmd));

  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [showPast, setShowPast] = useState(false);
  const [selected, setSelected] = useState<{ date: string; summary: DaySummary } | null>(null);
  const [copySelection, setCopySelection] = useState<Set<string>>(() => new Set());
  const [copying, setCopying] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  // Two-step remove: the first tap arms the row, the second removes; the arm
  // lapses after a few seconds (a native confirm never fires on the web preview).
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const editing = mode.kind === 'edit' ? (periods.find((p) => p.id === mode.id) ?? null) : null;
  const saving = patch.isPending || copying;

  /** Ask through the ConfirmSheet and wait for the answer. */
  function askAsync(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => setAsk({ title, message, resolve }));
  }

  /**
   * Save a timeline for a calendar. A 409 `requires_confirmation` (the change
   * strands upcoming bookings) asks, then re-sends acknowledged. Returns
   * whether it saved.
   */
  async function patchSchedule(
    calendarId: string,
    next: CalendarSchedule | null,
    question: string,
  ): Promise<boolean> {
    try {
      await patch.mutateAsync({ id: calendarId, schedule_periods: next });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        const ok = await askAsync(
          question,
          e.body.message ?? 'Some upcoming bookings fall outside the new hours.',
        );
        if (!ok) return false;
        await patch.mutateAsync({ id: calendarId, schedule_periods: next, acknowledge: true });
        return true;
      }
      throw e;
    }
  }

  async function saveSchedule(next: CalendarSchedule | null) {
    try {
      const saved = await patchSchedule(calendar.id, next, 'Save this schedule anyway?');
      if (!saved) return;
      hapticSuccess();
      toast.success('Schedule saved.');
      setMode({ kind: 'idle' });
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Failed to save the schedule.');
    }
  }

  function armRemove(period: SchedulePeriod) {
    if (armedRemoveId === period.id) {
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmedRemoveId(null);
      void saveSchedule(removeSchedulePeriod(schedule, period.id));
      return;
    }
    hapticWarning();
    setArmedRemoveId(period.id);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmedRemoveId(null), CONFIRM_MS);
  }

  async function copyTo(targetIds: string[]) {
    if (!schedule || targetIds.length === 0) return;
    setCopying(true);
    let copied = 0;
    try {
      for (const targetId of targetIds) {
        const name = copyTargets.find((t) => t.id === targetId)?.name ?? 'this calendar';
        const saved = await patchSchedule(targetId, schedule, `Copy to ${name} anyway?`);
        if (!saved) break;
        copied += 1;
      }
      if (copied === targetIds.length) {
        hapticSuccess();
        toast.success(`Schedule copied to ${copied} calendar${copied === 1 ? '' : 's'}.`);
        setCopySelection(new Set());
      } else {
        hapticWarning();
        toast.error(`Copied to ${copied} of ${targetIds.length} calendars.`);
      }
    } catch (e) {
      hapticWarning();
      toast.error(
        copied > 0
          ? `Copied to ${copied} of ${targetIds.length} calendars, then failed.`
          : e instanceof ApiError
            ? e.message
            : 'Failed to copy the schedule.',
      );
    } finally {
      setCopying(false);
    }
  }

  function renderPeriodRow(p: SchedulePeriod, ended: boolean) {
    const armed = armedRemoveId === p.id;
    return (
      <View
        key={p.id}
        style={[styles.periodRow, { borderColor: colors.border }, ended ? { opacity: 0.7 } : null]}>
        <View style={styles.periodMain}>
          <View
            style={[styles.swatch, { backgroundColor: periodTint(periods.indexOf(p)) }]}
            accessibilityElementsHidden
          />
          <Text variant="caption" tone={ended ? 'muted' : 'secondary'} style={styles.periodText}>
            {describePeriod(p)}
            {ended ? ' (ended)' : ''}
          </Text>
        </View>
        {!readOnly ? (
          <View style={styles.periodActions}>
            <Button
              label="Edit"
              variant="ghost"
              size="sm"
              disabled={saving}
              onPress={() => setMode({ kind: 'edit', id: p.id })}
            />
            <Button
              label={armed ? 'Tap to confirm' : 'Remove'}
              variant="ghost"
              size="sm"
              disabled={saving}
              customColors={{ background: 'transparent', text: colors.danger }}
              onPress={() => armRemove(p)}
            />
          </View>
        ) : null}
        {armed ? (
          <Text variant="caption" tone="muted">
            {ended
              ? `Remove the change from ${describeYmdShort(p.from)}? It has already ended; removing it only changes what the calendar below shows for those past dates.`
              : `Remove the change from ${describeYmdShort(p.from)}? Those dates go back to the standard weekly hours.`}
          </Text>
        ) : null}
      </View>
    );
  }

  const selectedSummary = selected?.summary ?? null;

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Plan hours ahead — {calendar.name}
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {mode.kind === 'idle' ? (
          <>
            <Text variant="caption" tone="muted">
              Change this calendar&apos;s hours from a date in the future, or set a pattern that
              rotates week by week, without touching the dates before it. The standard weekly
              hours apply to any date no change covers. Breaks, days off and closures still apply.
            </Text>

            {!readOnly ? (
              <Button
                label="Add a change from a date"
                disabled={saving}
                onPress={() => setMode({ kind: 'add', from: selected?.date ?? null })}
              />
            ) : null}

            <View style={styles.timeline} accessibilityLabel="Schedule timeline">
              <View style={[styles.periodRow, { borderColor: colors.border }]}>
                <View style={styles.periodMain}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                    ]}
                  />
                  <Text variant="caption" tone="secondary" style={styles.periodText}>
                    Standard weekly hours (Edit hours), on every date the changes below do not
                    cover
                  </Text>
                </View>
              </View>
              {currentPeriods.map((p) => renderPeriodRow(p, false))}
              {currentPeriods.length === 0 ? (
                <Text variant="caption" tone="muted">
                  No changes planned. The standard weekly hours apply from today onwards.
                </Text>
              ) : null}
            </View>

            {pastPeriods.length > 0 ? (
              <View style={styles.pastBlock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showPast }}
                  hitSlop={8}
                  onPress={() => setShowPast((v) => !v)}>
                  <Text variant="caption" color={colors.brand}>
                    {showPast
                      ? 'Hide past changes'
                      : `Show ${pastPeriods.length} past change${pastPeriods.length === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
                {showPast ? (
                  <View style={styles.timeline} accessibilityLabel="Past schedule changes">
                    {pastPeriods.map((p) => renderPeriodRow(p, true))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.previewBlock}>
              <Text variant="caption" tone="muted">
                Bookable hours by date: this calendar&apos;s hours inside your business hours and
                closures, minus days off and leave. Page back to see what the hours were, or ahead
                to what they will be. Pick a day to see which rule applies.
              </Text>
              <SchedulePreviewCalendar
                calendarId={calendar.id}
                baseHours={calendar.working_hours}
                schedule={schedule}
                daysOff={calendar.days_off ?? []}
                venueOpeningHours={venueOpeningHours}
                selectedDate={selected?.date ?? null}
                onPickDate={(date, summary) => setSelected({ date, summary })}
                todayYmd={todayYmd}
              />
              <View
                style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityLiveRegion="polite">
                {selected && selectedSummary ? (
                  <>
                    <Text variant="label">{describeYmdLong(selected.date)}</Text>
                    <Text variant="bodySmall">
                      {selectedSummary.text}
                      {selectedSummary.partialLeave ? ` (leave ${selectedSummary.partialLeave})` : ''}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {selectedSummary.source.kind === 'period'
                        ? `Rule: change from ${describeYmdShort(selectedSummary.source.period.from)}${
                            selectedSummary.source.period.weeks.length > 1
                              ? `, week ${selectedSummary.source.weekIndex + 1} of ${selectedSummary.source.period.weeks.length}`
                              : ''
                          }.`
                        : 'Rule: standard weekly hours.'}
                      {selectedSummary.reason === 'day-off' ? ' This is a day off.' : ''}
                      {selectedSummary.reason === 'leave' ? ' This calendar is on leave.' : ''}
                      {selectedSummary.reason === 'venue-closed'
                        ? ' Your venue is closed on this weekday.'
                        : ''}
                      {selectedSummary.reason === 'venue-closure'
                        ? ' Your venue has a closure on this date.'
                        : ''}
                    </Text>
                    {!readOnly ? (
                      <View style={styles.detailActions}>
                        <Button
                          label="Change hours from this week"
                          variant="secondary"
                          size="sm"
                          disabled={saving}
                          onPress={() => setMode({ kind: 'add', from: selected.date })}
                        />
                        {selectedSummary.source.kind === 'period' ? (
                          <Button
                            label="Edit this change"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onPress={() =>
                              setMode({
                                kind: 'edit',
                                id: (selectedSummary.source as { period: SchedulePeriod }).period.id,
                              })
                            }
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text variant="caption" tone="muted">
                    Pick a day on the calendar to see its hours and which rule sets them.
                  </Text>
                )}
              </View>
            </View>

            {schedule && !readOnly && copyTargets.length > 0 ? (
              <View style={[styles.copyBlock, { borderColor: colors.border }]}>
                <Text variant="label">Copy this schedule to other calendars</Text>
                <Text variant="caption" tone="muted">
                  Copies every change above as saved, past changes included. Each calendar keeps
                  its own standard weekly hours, breaks and days off.
                </Text>
                {copyTargets.map((t) => (
                  <View key={t.id} style={styles.copyRow}>
                    <Text variant="bodySmall" style={styles.periodText}>
                      {t.name}
                    </Text>
                    <Switch
                      value={copySelection.has(t.id)}
                      disabled={saving}
                      accessibilityLabel={`Copy to ${t.name}`}
                      onValueChange={(on) =>
                        setCopySelection((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(t.id);
                          else next.delete(t.id);
                          return next;
                        })
                      }
                      trackColor={{ true: colors.brand, false: colors.border }}
                      thumbColor={colors.surfaceRaised}
                    />
                  </View>
                ))}
                <Button
                  label={`Copy to ${copySelection.size} calendar${copySelection.size === 1 ? '' : 's'}`}
                  variant="secondary"
                  disabled={saving || copySelection.size === 0}
                  loading={copying}
                  onPress={() => void copyTo([...copySelection])}
                />
              </View>
            ) : null}
          </>
        ) : (
          <SchedulePeriodForm
            key={mode.kind === 'edit' ? mode.id : `add-${mode.from ?? ''}`}
            schedule={schedule}
            editing={editing}
            initialFrom={mode.kind === 'add' ? mode.from : null}
            weeklyHours={calendar.working_hours}
            venueOpeningHours={venueOpeningHours}
            onSave={saveSchedule}
            onCancel={() => setMode({ kind: 'idle' })}
            saving={saving}
            todayYmd={todayYmd}
          />
        )}
      </ScrollView>

      {mode.kind === 'idle' ? (
        <View style={styles.footer}>
          <Button label="Done" variant="secondary" onPress={onClose} />
        </View>
      ) : null}

      {/* One confirm for every question: "save anyway" after a 409, per calendar. */}
      <ConfirmSheet
        visible={ask != null}
        title={ask?.title ?? 'Save anyway?'}
        message={ask?.message}
        confirmLabel="Save anyway"
        destructive={false}
        loading={patch.isPending}
        onConfirm={() => {
          const current = ask;
          setAsk(null);
          current?.resolve(true);
        }}
        onClose={() => {
          const current = ask;
          setAsk(null);
          current?.resolve(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding (they delegate it to the
    // child), so pad the sheet itself to match the standard sheet inset.
    paddingHorizontal: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  timeline: {
    gap: spacing.sm,
  },
  periodRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  periodMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  periodText: {
    flex: 1,
  },
  periodActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  pastBlock: {
    gap: spacing.sm,
  },
  previewBlock: {
    gap: spacing.sm,
  },
  detail: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  copyBlock: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footer: {
    paddingTop: spacing.sm,
  },
});
