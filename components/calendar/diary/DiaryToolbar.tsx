import { useRouter } from 'expo-router';
import { type Dispatch, type SetStateAction } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { type AmendHoursTarget } from '@/components/calendar/AmendHoursSheet';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { diaryColumnLabel } from '@/lib/calendar/diary-columns';
import { SCOPE_OPTIONS, type Scope } from '@/lib/calendar/diary-screen';
import { hapticSelect } from '@/lib/haptics';
import {
  linkedColumnKey,
  linkedSwitcherEntryCount,
  type LinkedSwitcherEntry,
} from '@/lib/linked/linked-calendar-view';
import { motionSafe, useReduceMotion } from '@/lib/motion';
import { type useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { type useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

export interface DiaryToolbarProps {
  scope: Scope;
  setScope: Dispatch<SetStateAction<Scope>>;
  isLinkedActive: boolean;
  clearOwnerVenue: () => void;
  liveState: ReturnType<typeof useVenueLiveSync>;
  compactDay: boolean;
  setCompactDay: Dispatch<SetStateAction<boolean>>;
  anchor: string;
  today: string;
  setAmendHoursTarget: Dispatch<SetStateAction<AmendHoursTarget | null>>;
  setToolsOpen: Dispatch<SetStateAction<boolean>>;
  step: (direction: -1 | 1) => void;
  setMonthPickerOpen: Dispatch<SetStateAction<boolean>>;
  label: string;
  isToday: boolean;
  goToday: () => void;
  showChips: boolean;
  isWideDay: boolean;
  totalDayCount: number;
  visibleIds: string[] | null;
  selectAllCalendars: () => void;
  workingHoursOnly: boolean;
  setWorkingHoursOnly: Dispatch<SetStateAction<boolean>>;
  practitioners: Practitioner[];
  perPractitionerCounts: Record<string, number>;
  toggleVisibleCalendar: (id: string) => void;
  linkedEntries: LinkedSwitcherEntry[];
  isAllView: boolean;
  isWeekAllView: boolean;
  selectedId: string | null;
  /** The `selectedId` that means every calendar side by side. */
  ALL_CALENDARS: 'all';
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  effectiveId: string | null;
  ownerVenueId: string | null;
  activeLinkedCalendarId: string | null;
  setOwnerVenueId: ReturnType<typeof useLinkedVenueContext>['setOwnerVenueId'];
}

/**
 * The diary's toolbar: Day / Week / Month, the date and its arrows, and the
 * calendar switcher chips. Moved out of the diary screen unchanged (codebase
 * standards P5.2).
 */
export function DiaryToolbar({
  scope,
  setScope,
  isLinkedActive,
  clearOwnerVenue,
  liveState,
  compactDay,
  setCompactDay,
  anchor,
  today,
  setAmendHoursTarget,
  setToolsOpen,
  step,
  setMonthPickerOpen,
  label,
  isToday,
  goToday,
  showChips,
  isWideDay,
  totalDayCount,
  visibleIds,
  selectAllCalendars,
  workingHoursOnly,
  setWorkingHoursOnly,
  practitioners,
  perPractitionerCounts,
  toggleVisibleCalendar,
  linkedEntries,
  isAllView,
  isWeekAllView,
  selectedId,
  ALL_CALENDARS,
  setSelectedId,
  effectiveId,
  ownerVenueId,
  activeLinkedCalendarId,
  setOwnerVenueId,
}: DiaryToolbarProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
      <View style={styles.scopeRow}>
        <View style={styles.scopeControl}>
          <Segmented
            value={scope}
            onChange={(s) => {
              // Linked calendars support day + week; month is own-venue
              // only, so switching to month exits the linked context back
              // to the primary venue.
              if (isLinkedActive && s === 'month') clearOwnerVenue();
              setScope(s);
            }}
            options={SCOPE_OPTIONS}
          />
        </View>
        {/* Realtime indicator — green live / amber reconnecting, hidden when
            idle (matches Resources/Contacts). Realtime invalidates the grid
            promptly; the 60s poll is the fallback. */}
        <LiveDot state={liveState} />
        {/* Compact day rows (web parity: the toolbar "Compact" toggle) —
            day scope only, like the web. Shown in the linked-venue context
            too: the linked grid is embedded and so cannot fit-to-screen,
            but `CalendarDayGrid` falls back to its floor scale there, which
            is still much tighter than the default. It used to be hidden,
            leaving no way to compact a linked venue's day. */}
        {scope === 'day' ? (
          <IconButton
            icon={{
              ios: 'rectangle.compress.vertical',
              android: 'compress',
              web: 'compress',
            }}
            accessibilityLabel="Compact day rows: fit the whole day on one screen"
            variant="bordered"
            active={compactDay}
            onPress={() => setCompactDay((c) => !c)}
          />
        ) : null}
        {/* The month has no time column to hang the clock in, so it sits
            in the toolbar there — the web offers Amend hours in every
            view mode. Day and week carry it in the grid's own corner. */}
        {scope === 'month' ? (
          <IconButton
            icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
            accessibilityLabel="Amend hours"
            variant="bordered"
            onPress={() => setAmendHoursTarget({ date: anchor })}
          />
        ) : null}
        {/* Quick jump to the "Today" home (KPI / day-at-a-glance), distinct
            from the in-grid Today pill that re-anchors the diary to today. */}
        <IconButton
          icon={{ ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' }}
          accessibilityLabel="Open Today overview"
          variant="bordered"
          onPress={() => router.push('/today')}
        />
        {/* The web toolbar's contact search and colour key, behind one
            button so the phone row keeps room for Day / Week / Month. */}
        <IconButton
          icon={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          accessibilityLabel="More: search contacts, colour key"
          variant="bordered"
          onPress={() => setToolsOpen(true)}
        />
      </View>

      <View style={styles.dateNav}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          accessibilityLabel="Previous"
          onPress={() => step(-1)}
        />
        {/* Label flexes, so the Today pill appearing never moves the arrows.
            Tapping it opens the month-picker sheet to jump to any date; the
            separate Today pill (shown when off-today) returns to today. */}
        <Pressable
          onPress={() => {
            hapticSelect();
            setMonthPickerOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Pick a date to jump to"
          style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
          <Text variant="heading" numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        {!isToday ? (
          <Animated.View
            entering={motionSafe(FadeIn.duration(160), reduceMotion)}
            exiting={motionSafe(FadeOut.duration(120), reduceMotion)}>
            <Pressable
              onPress={goToday}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              style={({ pressed }) => [
                styles.todayPill,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text variant="label" color={colors.brand}>
                Today
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        <IconButton
          icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          accessibilityLabel="Next"
          onPress={() => step(1)}
        />
      </View>

      {/* Calendar switcher. Phone single-pane day + week scope: single-
          select (one calendar, or "All" → side-by-side day / week matrix).
          Wide day viewport: a MULTI-SELECT filter over the side-by-side
          columns (show one, a subset, or all). Linked-venue chips follow. */}
      {showChips ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {isWideDay ? (
            // Wide DAY view: ONE multi-select column filter (web parity)
            // spanning OWN calendars AND linked venues — "All" plus a toggle
            // each. Any non-empty subset renders side-by-side; only the
            // selected columns show. Highlighted = visible (everything is
            // highlighted when no filter is active).
            <>
              <Chip
                label="All"
                count={totalDayCount}
                selected={visibleIds == null}
                onPress={selectAllCalendars}
              />
              {/* Only the columns with working hours on the selected date
                  (web 2026-09-05's Filter menu toggle). */}
              <Chip
                label={anchor === today ? 'Working today' : 'Working this day'}
                selected={workingHoursOnly}
                onPress={() => {
                  hapticSelect();
                  setWorkingHoursOnly((value) => !value);
                }}
              />
              {practitioners.map((p) => (
                <Chip
                  key={p.id}
                  label={diaryColumnLabel(p)}
                  count={perPractitionerCounts[p.id]}
                  selected={visibleIds == null || visibleIds.includes(p.id)}
                  onPress={() => toggleVisibleCalendar(p.id)}
                />
              ))}
              {linkedEntries.map((entry) => (
                <Chip
                  key={entry.key}
                  label={entry.label}
                  count={linkedSwitcherEntryCount(entry, anchor)}
                  selected={
                    visibleIds == null ||
                    visibleIds.includes(entry.key) ||
                    visibleIds.includes(linkedColumnKey(entry.venue.venueId))
                  }
                  onPress={() => toggleVisibleCalendar(entry.key)}
                />
              ))}
            </>
          ) : (
            <>
              {(scope === 'day' || scope === 'week') && practitioners.length > 1 ? (
                <Chip
                  label="All"
                  count={scope === 'day' ? totalDayCount : undefined}
                  selected={!isLinkedActive && (isAllView || isWeekAllView)}
                  onPress={() => {
                    if (isLinkedActive || selectedId !== ALL_CALENDARS) {
                      hapticSelect();
                      clearOwnerVenue();
                      setSelectedId(ALL_CALENDARS);
                    }
                  }}
                />
              ) : null}
              {/* Everyone side by side, less the people not down to work
                  (the wide view's chip, on a phone's "All" day). */}
              {isAllView && !isLinkedActive ? (
                <Chip
                  label={anchor === today ? 'Working today' : 'Working this day'}
                  selected={workingHoursOnly}
                  onPress={() => {
                    hapticSelect();
                    setWorkingHoursOnly((value) => !value);
                  }}
                />
              ) : null}
              {practitioners.map((p) => (
                <Chip
                  key={p.id}
                  label={diaryColumnLabel(p)}
                  count={scope === 'day' ? perPractitionerCounts[p.id] : undefined}
                  selected={
                    !isLinkedActive && !isAllView && !isWeekAllView && p.id === effectiveId
                  }
                  onPress={() => {
                    if (isLinkedActive || isAllView || isWeekAllView || p.id !== effectiveId) {
                      hapticSelect();
                      clearOwnerVenue();
                      setSelectedId(p.id);
                    }
                  }}
                />
              ))}
              {/* Linked calendars, one chip each like our own (web
                  parity) — selecting one sets the linked context
                  (ownerVenueId plus the calendar) and renders that
                  calendar's day/week grid full-screen; a partner that
                  lists no calendars is one chip for the whole venue. (On
                  a wide day they instead appear as toggleable columns in
                  the multi-select above.) */}
              {linkedEntries.map((entry) => {
                const active =
                  ownerVenueId === entry.venue.venueId &&
                  activeLinkedCalendarId === entry.practitionerId;
                return (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    count={
                      scope === 'day' ? linkedSwitcherEntryCount(entry, anchor) : undefined
                    }
                    selected={active}
                    onPress={() => {
                      if (!active) {
                        hapticSelect();
                        setOwnerVenueId(
                          entry.venue.venueId,
                          entry.venue.venueName,
                          entry.practitionerId,
                        );
                      }
                    }}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      ) : null}

      {/* No status-filter pill row here — intentionally omitted on the
          calendar diary (status filtering lives on the Bookings tab). */}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scopeControl: {
    flex: 1,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateLabel: {
    flex: 1,
    alignItems: 'center',
  },
  todayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
});
