/**
 * Choose calendars for the services picked in the grid (web `CollectiveBulkCalendarsDialog`,
 * 2026-10-28).
 *
 * The bar's "Choose calendars" used to stage "every calendar offers it" at every venue picked, with
 * nothing to choose: a host whose calendars all offered the service already saw "4 staged" and a
 * save of changes that changed nothing. This is the choice the button promises. One row per active
 * calendar at the venues picked (every venue when none is), ticked when it offers every service
 * picked, clear when it offers none, and a dash when it offers some. Touching a row decides it for
 * every service; an untouched dash leaves each service as it is. Save sends only what differs from
 * what is saved, straight away.
 *
 * After a Save (CQ-04): what went through, and what will only be refused again, is no longer sent;
 * what can still go through stays chosen here, so Save counts it and sends it again. Each failure
 * reads "{service}, {calendar} at {venue}: {reason}". A calendar with upcoming bookings for a
 * service shows them here, and the host decides.
 *
 * A Save that takes calendars off asks first, here, naming each change and any venue left with
 * nobody to offer a service (CQ-11). A Save that only adds calendars goes straight through, and
 * either can be undone from the bar for a minute. One sheet with steps, never two stacked.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AffectedBookingsStep } from '@/components/collective-area/AffectedBookingsStep';
import type { ServicesGridState } from '@/components/collective-area/ServicesGrid';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import {
  describeStaged,
  gridVenueName,
  groupAffected,
  pickerDescription,
  pickerKey,
  pickerResult,
  pickerServices,
  pickerState,
  removalWarnings,
  type CollectiveCalendarGroup,
  type PickerState,
} from '@/lib/collective-area/model';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export function BulkCalendarsSheet({ grid }: { grid: ServicesGridState }) {
  const { colors } = useTheme();
  /** Only the calendars the host has touched: true offers every service, false offers none. */
  const [choice, setChoice] = useState<Map<string, boolean>>(new Map());
  /** Changes a Save settled (by key), which are not sent again unless their calendar is touched. */
  const [skip, setSkip] = useState<Set<string>>(new Set());
  /** The ask before a Save that takes calendars off (CQ-11). */
  const [askingRemoval, setAskingRemoval] = useState(false);
  const [openedFor, setOpenedFor] = useState(grid.choosing);
  // A fresh choice each time it opens, set while rendering so nothing from last time flashes.
  if (grid.choosing !== openedFor) {
    setOpenedFor(grid.choosing);
    if (grid.choosing) {
      setChoice(new Map());
      setSkip(new Set());
      setAskingRemoval(false);
    }
  }
  const settle = (keys: string[]) => {
    if (keys.length > 0) setSkip((prev) => new Set([...prev, ...keys]));
  };

  const close = () => {
    if (!grid.saving) grid.closeChooser();
  };
  if (!grid.choosing) return <Sheet visible={false} onClose={close}>{null}</Sheet>;

  const services = pickerServices(grid.crossing.serviceIds, grid.services);
  const groups = grid.groups.filter((g) => grid.crossing.venueIds.includes(g.venue_id));
  const onPage = services.filter((s) => s.itemId);
  const offPage = services.length - onPage.length;
  const result = pickerResult(groups, services, grid.staged, choice, skip);
  const removals = result.ops.filter((op) => op.op === 'unassign').length;
  const description = pickerDescription(services);
  const failures = grid.failures;
  const send = () => void grid.saveChosen(result).then(settle);

  // The bookings step, in this sheet rather than over it (CQ-04).
  const bookings = grid.bookingsStep?.where === 'picker' ? grid.bookingsStep : null;
  if (bookings) {
    const items = groupAffected(bookings.refusals, grid.services, grid.groups);
    const keep = () => {
      settle(items.map((item) => item.key));
      grid.keepBookings();
    };
    return (
      <Sheet visible onClose={() => (grid.saving ? undefined : keep())} maxHeight="92%" fill>
        <AffectedBookingsStep
          items={items}
          othersSaved={bookings.othersSaved}
          busy={grid.saving}
          onKeep={keep}
          onConfirm={() => void grid.acknowledgeBookings().then(settle)}
        />
      </Sheet>
    );
  }

  if (askingRemoval && removals > 0) {
    // What the Save does, change by change, and who is left with nobody to offer a service,
    // counted over every venue, not only the ones shown.
    const described = describeStaged(result.ops, services, grid.groups);
    const warnings = removalWarnings(result.ops, services, grid.groups);
    return (
      <Sheet visible onClose={() => (grid.saving ? undefined : setAskingRemoval(false))} maxHeight="92%" fill>
        <View style={styles.header}>
          <Text variant="subheading">{areaCopy('ov.bulk.choose.confirmTitle')}</Text>
        </View>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
          {described.lines.map((line, index) => (
            <Text key={index} variant="bodySmall" tone="secondary">
              {line}
            </Text>
          ))}
          {warnings.length > 0 ? (
            <View style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
              {warnings.map((line, index) => (
                <Text key={index} variant="bodySmall">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            label={areaCopy('ov.bulk.choose.confirmBack')}
            variant="secondary"
            style={styles.flex1}
            disabled={grid.saving}
            onPress={() => setAskingRemoval(false)}
          />
          <Button
            label={areaCopy(removals === 1 ? 'ov.bulk.choose.confirmGoOne' : 'ov.bulk.choose.confirmGo')}
            variant="danger"
            style={styles.flex1}
            loading={grid.saving}
            disabled={grid.saving}
            onPress={() => {
              setAskingRemoval(false);
              send();
            }}
          />
        </View>
      </Sheet>
    );
  }

  const set = (group: CollectiveCalendarGroup, calendarIds: string[], on: boolean) => {
    setChoice((prev) => {
      const next = new Map(prev);
      for (const id of calendarIds) next.set(pickerKey(group.venue_id, id), on);
      return next;
    });
    // Touching a calendar again decides it again, including what an earlier Save settled.
    setSkip((prev) => {
      const touched = calendarIds.map((id) => `:${group.venue_id}:${id}`);
      const next = new Set([...prev].filter((key) => !touched.some((suffix) => key.endsWith(suffix))));
      return next.size === prev.size ? prev : next;
    });
  };

  const stateOf = (group: CollectiveCalendarGroup, calendarId: string): PickerState => {
    const calendar = group.calendars.find((c) => c.id === calendarId);
    return calendar ? pickerState(group, calendar, onPage, grid.staged, choice) : 'off';
  };
  const anyMixed = groups.some((g) =>
    g.calendars.some((c) => c.is_active && !choice.has(pickerKey(g.venue_id, c.id)) && stateOf(g, c.id) === 'mixed'),
  );

  return (
    <Sheet visible onClose={close} maxHeight="92%" fill>
      <View style={styles.header}>
        <Text variant="subheading">{areaCopy('ov.bulk.choose.title')}</Text>
        {description ? (
          <Text variant="bodySmall" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
        {/* A toast would sit behind this sheet, so a save that did not go through says so here. */}
        {failures.length > 0 ? (
          <View
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}
          >
            <Text variant="bodySmall" tone="danger">
              {failures.length === 1
                ? areaCopy('ov.bulk.choose.failedOne')
                : areaCopy('ov.bulk.choose.failed', { count: failures.length })}
            </Text>
            {grid.failureTexts(failures).map((text, index) => (
              <Text key={failures[index]?.key ?? index} variant="caption" tone="danger">
                {`• ${text}`}
              </Text>
            ))}
            {failures.some((f) => f.retryable) ? (
              <Text variant="caption" tone="danger">
                {areaCopy('ov.bulk.choose.failedKept')}
              </Text>
            ) : null}
          </View>
        ) : null}
        {onPage.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('ov.bulk.choose.nothingOnPage')}
          </Text>
        ) : (
          <>
            <Text variant="bodySmall" tone="secondary">
              {areaCopy(onPage.length === 1 ? 'ov.bulk.choose.helpOne' : 'ov.bulk.choose.helpMany')}
            </Text>
            {offPage > 0 ? (
              <View style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
                <Text variant="caption">
                  {offPage === 1
                    ? areaCopy('ov.bulk.choose.offPageOne')
                    : areaCopy('ov.bulk.choose.offPage', { count: offPage })}
                </Text>
              </View>
            ) : null}
            {groups.map((group) => {
              const active = group.calendars.filter((c) => c.is_active);
              return (
                <View key={group.venue_id} style={[styles.venue, { borderColor: colors.border }]}>
                  <View style={styles.venueHead}>
                    <Text variant="label" style={styles.flex1}>
                      {gridVenueName(group)}
                    </Text>
                    {active.length > 1 ? (
                      <>
                        <Button
                          label={areaCopy('ov.bulk.choose.all')}
                          variant="ghost"
                          size="sm"
                          accessibilityLabel={areaCopy('ov.bulk.choose.allAt', { venue: group.venue_name })}
                          disabled={grid.saving}
                          onPress={() => set(group, active.map((c) => c.id), true)}
                        />
                        <Button
                          label={areaCopy('ov.bulk.choose.none')}
                          variant="ghost"
                          size="sm"
                          accessibilityLabel={areaCopy('ov.bulk.choose.noneAt', { venue: group.venue_name })}
                          disabled={grid.saving}
                          onPress={() => set(group, active.map((c) => c.id), false)}
                        />
                      </>
                    ) : null}
                  </View>
                  {active.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {areaCopy('ov.bulk.choose.noCalendars', { venue: group.venue_name })}
                    </Text>
                  ) : (
                    active.map((calendar) => {
                      const state = stateOf(group, calendar.id);
                      return (
                        <TriStateRow
                          key={calendar.id}
                          state={state}
                          name={calendar.name}
                          accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                          disabled={grid.saving}
                          // A dash becomes a tick: "some" turns into "all" first, as select-all does.
                          onPress={() => set(group, [calendar.id], state !== 'on')}
                        />
                      );
                    })
                  )}
                </View>
              );
            })}
            {anyMixed ? (
              <Text variant="caption" tone="muted">
                {areaCopy('ov.bulk.choose.mixed')}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      {/* Cancel left, Save right, equal widths: Save growing to "Save 5 changes" moves nothing. */}
      <View style={styles.footer}>
        <Button
          label={areaCopy('ov.bulk.choose.cancel')}
          variant="ghost"
          style={styles.flex1}
          disabled={grid.saving}
          onPress={close}
        />
        {onPage.length > 0 ? (
          <Button
            label={
              result.changeCount === 0
                ? areaCopy('ov.bulk.choose.save')
                : result.changeCount === 1
                  ? areaCopy('ov.bulk.choose.saveOne')
                  : areaCopy('ov.bulk.choose.saveCount', { count: result.changeCount })
            }
            style={styles.flex1}
            disabled={result.changeCount === 0 || grid.saving}
            loading={grid.saving}
            // Taking calendars off asks first; adding them goes straight through (CQ-11).
            onPress={() => (removals > 0 ? setAskingRemoval(true) : send())}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** A row with a box that can show "some": a dash, read out as mixed. A press always decides it. */
function TriStateRow({
  state,
  name,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  state: PickerState;
  name: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const filled = state !== 'off';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state === 'mixed' ? 'mixed' : state === 'on', disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.box,
          { borderColor: filled ? colors.brand : colors.border },
          filled ? { backgroundColor: colors.brand } : null,
        ]}
      >
        {state === 'on' ? (
          <Text variant="caption" color={colors.onColor}>
            ✓
          </Text>
        ) : state === 'mixed' ? (
          <View style={[styles.dash, { backgroundColor: colors.onColor }]} />
        ) : null}
      </View>
      <Text variant="bodySmall" style={styles.flex1}>
        {name}
      </Text>
      {state === 'mixed' ? (
        <Text variant="caption" tone="muted">
          {areaCopy('ov.bulk.choose.some')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xxs },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
  venue: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xxs },
  venueHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dash: { width: 10, height: 2, borderRadius: 1 },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
