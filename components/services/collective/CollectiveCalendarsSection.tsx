import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { SyncBadge } from '@/components/collective-area/AreaPieces';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { groupStatus, retryOutcome, valueChips, venueWarnings, type CollectiveCalendarGroup } from '@/lib/collective-area/model';
import { useCollectiveRetry } from '@/lib/queries/useCollectiveArea';
import {
  collectiveCalendarState,
  lastChangedLine,
  toggleCollectiveCalendar,
  type CollectiveCalendarRef,
  type CollectiveCalendarsDiff,
} from '@/lib/services/collective-calendars';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ServiceCollectiveBlock } from '@/types/services-manage';

/**
 * Which calendars offer a page service, at every venue in the collective (web
 * `CollectiveCalendarsSection.tsx`, 2026-10-28). It takes the place of the host's own "Offered by"
 * in the service form: the host's venue first, then the members, each calendar a switch with what
 * it charges or times differently and an "Edit values" for one that offers it now.
 *
 * Nothing here writes except Update now. The ticks are held as a diff and go with the form's Save;
 * "Edit values" opens a step of the same sheet.
 */
export function CollectiveCalendarsSection({
  mode = 'edit',
  groups,
  itemId,
  collectiveId = null,
  collectiveName,
  currencySymbol,
  value,
  onChange,
  onEditValues,
  hiddenReasons = [],
  hasOptions = false,
  disabled = false,
}: {
  /**
   * 'new' is a service being added straight onto the page (CQ-05): there is no offering yet, so
   * nothing is saved to compare with. Every active calendar at every venue is listed, `value.add` is
   * the whole ticked set, and "All calendars at every venue" ticks them all.
   */
  mode?: 'edit' | 'new';
  groups: CollectiveCalendarGroup[];
  /** The offering this service is on the page; null while it is being added. */
  itemId: string | null;
  /** Update now and Retry now for a venue whose copy is behind (CQ-02). Without it, no button. */
  collectiveId?: string | null;
  collectiveName: string;
  currencySymbol: string;
  value: CollectiveCalendarsDiff;
  onChange: (next: CollectiveCalendarsDiff) => void;
  onEditValues?: (venueId: string, calendarId: string) => void;
  /** From the service's `collective.hidden_reasons`: where guests cannot book it, and why. */
  hiddenReasons?: ServiceCollectiveBlock['hidden_reasons'];
  /** Each option sets its own price, length and buffer, so no calendar shows its own (CQ-12). */
  hasOptions?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const retry = useCollectiveRetry(collectiveId);
  /** What Update now did for one venue, said under its name until the next one (CQ-02). */
  const [retryNote, setRetryNote] = useState<{ venueId: string; text: string } | null>(null);
  // The host's venue first, then the members as the server orders them.
  const ordered = [...groups.filter((g) => g.is_host), ...groups.filter((g) => !g.is_host)];

  if (mode === 'new') {
    return <NewServiceCalendars groups={ordered} collectiveName={collectiveName} value={value} onChange={onChange} disabled={disabled} />;
  }
  if (!itemId) return null;

  const updateVenue = (group: CollectiveCalendarGroup) => {
    setRetryNote(null);
    retry.mutate(group.venue_id, {
      onSuccess: (data) =>
        setRetryNote({ venueId: group.venue_id, text: retryOutcome(data?.collective_sync, group.venue_name).text }),
      onError: () => setRetryNote({ venueId: group.venue_id, text: areaCopy('ov.venue.retryError') }),
    });
  };

  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted">
        {areaCopy('svc.cal.heading')}
      </Text>
      <Text variant="caption" tone="muted">
        {areaCopy('svc.cal.help.collective', { collective: collectiveName })}
      </Text>
      {ordered.map((group) => {
        const warnings = venueWarnings(group, hiddenReasons, collectiveName, itemId);
        const venueLabel = group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name;
        const status = groupStatus(group);
        return (
          <View key={group.venue_id} style={[styles.venue, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.venueHead}>
              <Text variant="label" style={styles.flex1}>
                {venueLabel}
              </Text>
              <SyncBadge status={status} />
              {collectiveId && !group.is_host && status !== 'up_to_date' ? (
                <Button
                  label={areaCopy(status === 'failed' ? 'svc.save.retry' : 'ov.venue.updateNow')}
                  variant="ghost"
                  size="sm"
                  disabled={disabled || retry.isPending}
                  loading={retry.isPending && retry.variables === group.venue_id}
                  accessibilityLabel={`${areaCopy(status === 'failed' ? 'svc.save.retry' : 'ov.venue.updateNow')}: ${group.venue_name}`}
                  onPress={() => updateVenue(group)}
                />
              ) : null}
            </View>
            {retryNote?.venueId === group.venue_id ? (
              <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
                {retryNote.text}
              </Text>
            ) : null}
            {warnings.map((warning) => (
              <Text key={warning} variant="caption" color={colors.warning}>
                {warning}
              </Text>
            ))}
            {group.calendars.length === 0 ? (
              <Text variant="caption" tone="muted">
                {areaCopy('svc.cal.noCalendars', { venue: group.venue_name })}
              </Text>
            ) : null}
            {group.calendars.map((calendar) => {
              const ref = { calendar_id: calendar.id, venue_id: group.venue_id };
              const assignment = calendar.assigned.find((a) => a.item_id === itemId) ?? null;
              const savedOn = assignment !== null;
              const state = collectiveCalendarState(value, ref, savedOn);
              const chips = valueChips(assignment ?? undefined, currencySymbol, hasOptions);
              const changed = lastChangedLine(assignment);
              return (
                <View key={calendar.id} style={styles.calendarRow}>
                  <View style={styles.flex1}>
                    <Text variant="bodySmall">{calendar.name}</Text>
                    {!calendar.is_active ? (
                      <Text variant="caption" tone="muted">
                        {areaCopy('svc.cal.inactiveOther', { venue: group.venue_name })}
                      </Text>
                    ) : null}
                    {chips.length > 0 ? (
                      <Text variant="caption" tone="muted">
                        {chips.join(' · ')}
                      </Text>
                    ) : null}
                    {state.pendingAdd ? (
                      <Text variant="caption" tone="brand">
                        {areaCopy('svc.cal.notSaved.add')}
                      </Text>
                    ) : null}
                    {state.pendingRemove ? (
                      <Text variant="caption" color={colors.warning}>
                        {areaCopy('svc.cal.notSaved.remove')}
                      </Text>
                    ) : null}
                    {changed ? (
                      <Text variant="caption" tone="muted">
                        {changed}
                      </Text>
                    ) : null}
                  </View>
                  {savedOn && onEditValues ? (
                    <Button
                      label={areaCopy('svc.cal.editValues')}
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      accessibilityLabel={areaCopy('svc.member.view.editValuesFor', { calendar: calendar.name })}
                      onPress={() => onEditValues(group.venue_id, calendar.id)}
                    />
                  ) : null}
                  <Switch
                    value={state.checked}
                    disabled={disabled}
                    accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                    onValueChange={(next) => onChange(toggleCollectiveCalendar(value, ref, savedOn, next))}
                    trackColor={{ true: colors.brand, false: colors.border }}
                    thumbColor={colors.surfaceRaised}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const sameRef = (a: CollectiveCalendarRef, b: CollectiveCalendarRef) =>
  a.calendar_id === b.calendar_id && a.venue_id === b.venue_id;

/**
 * The calendars for a service not on the page yet (web `NewServiceCalendars`, CQ-05): nothing saved
 * to compare with, no copies to report on, so only a tick per active calendar and one for them all.
 */
function NewServiceCalendars({
  groups,
  collectiveName,
  value,
  onChange,
  disabled,
}: {
  groups: CollectiveCalendarGroup[];
  collectiveName: string;
  value: CollectiveCalendarsDiff;
  onChange: (next: CollectiveCalendarsDiff) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const activeGroups = groups.map((g) => ({ ...g, calendars: g.calendars.filter((c) => c.is_active) }));
  const every = activeGroups.flatMap((g) => g.calendars.map((c) => ({ calendar_id: c.id, venue_id: g.venue_id })));
  const isTicked = (ref: CollectiveCalendarRef) => value.add.some((r) => sameRef(r, ref));
  const tickedCount = every.filter(isTicked).length;
  const allTicked = every.length > 0 && tickedCount === every.length;
  const someTicked = tickedCount > 0 && !allTicked;

  const setOne = (ref: CollectiveCalendarRef, on: boolean) => {
    const add = value.add.filter((r) => !sameRef(r, ref));
    if (on) add.push(ref);
    onChange({ add, remove: [] });
  };
  const setAll = (on: boolean) => {
    const others = value.add.filter((r) => !every.some((ref) => sameRef(ref, r)));
    onChange({ add: on ? [...others, ...every] : others, remove: [] });
  };

  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted">
        {areaCopy('svc.cal.heading')}
      </Text>
      <Text variant="caption" tone="muted">
        {areaCopy('svc.cal.help.collective', { collective: collectiveName })}
      </Text>
      {every.length > 0 ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={areaCopy('svc.add.allCalendars')}
          accessibilityState={{ checked: allTicked ? true : someTicked ? 'mixed' : false, disabled }}
          disabled={disabled}
          onPress={() => setAll(!allTicked)}
          style={styles.allRow}>
          <View
            style={[
              styles.allBox,
              { borderColor: allTicked || someTicked ? colors.brand : colors.borderStrong },
              allTicked ? { backgroundColor: colors.brand } : null,
            ]}>
            {allTicked ? (
              <Text variant="caption" color={colors.onBrand}>
                {'\u2713'}
              </Text>
            ) : someTicked ? (
              <View style={[styles.allDash, { backgroundColor: colors.brand }]} />
            ) : null}
          </View>
          <Text variant="bodyMedium" style={styles.flex1}>
            {areaCopy('svc.add.allCalendars')}
          </Text>
        </Pressable>
      ) : null}
      {activeGroups.map((group) => (
        <View key={group.venue_id} style={[styles.venue, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="label">
            {group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name}
          </Text>
          {group.calendars.length === 0 ? (
            <Text variant="caption" tone="muted">
              {areaCopy('svc.cal.noCalendars', { venue: group.venue_name })}
            </Text>
          ) : null}
          {group.calendars.map((calendar) => {
            const ref = { calendar_id: calendar.id, venue_id: group.venue_id };
            return (
              <View key={calendar.id} style={styles.calendarRow}>
                <Text variant="bodySmall" style={styles.flex1}>
                  {calendar.name}
                </Text>
                <Switch
                  value={isTicked(ref)}
                  disabled={disabled}
                  accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                  onValueChange={(next) => setOne(ref, next)}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={colors.surfaceRaised}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  allBox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDash: {
    width: 10,
    height: 2,
  },
  section: {
    gap: spacing.sm,
  },
  venue: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  venueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
