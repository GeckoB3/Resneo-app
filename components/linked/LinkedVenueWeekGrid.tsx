import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { format, parseISO } from 'date-fns';

import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  linkedActionLabel,
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedOpenRanges,
  linkedScheduleBlocksForDate,
  linkedVenueDayHours,
  linkedWeekHeading,
  rangesToWorkingHours,
} from '@/lib/linked/linked-calendar-view';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';

/**
 * Grant-gated WEEK view for ONE linked venue — the week-scope sibling of
 * {@link LinkedVenueCalendarGrid}. Builds seven {@link WeekDayColumn}s from the
 * linked venue's range feed (bookings + classes/events/resources + working
 * hours) and renders them onto the SHARED {@link WeekGrid} (never forked — §12),
 * so a linked venue's week looks, shades and pages exactly like the primary
 * venue's week.
 *
 * Interaction matches the day grid's grant gating (§2.5):
 *  · `time_only`          → bookings render as grey, non-interactive "busy"
 *                           bands; no tap.
 *  · `full_details`       → appointment bars open the detail/edit sheet on tap.
 *  · `create_edit_cancel` → tapping an empty slot (or "New booking") opens the
 *                           linked slot menu — New booking or Walk-in — for a
 *                           cross-venue booking on that day.
 *
 * Like the week view everywhere, it's read-first: drag/resize and the on-bar
 * quick actions live in the Day view — tap a day header to jump there.
 */
export function LinkedVenueWeekGrid({
  venue,
  weekDays,
  today,
  nowMinutes,
  onOpenBooking,
  onCreate,
  onDayPress,
  refreshing,
  onRefresh,
}: {
  venue: LinkedVenueCalendar;
  /** The seven dates to render (Monday→Sunday), each "YYYY-MM-DD". */
  weekDays: string[];
  /** Today in the venue timezone ("YYYY-MM-DD") — flags today's column. */
  today: string;
  /** Minutes-since-midnight for the now-line, or null when today isn't in view. */
  nowMinutes: number | null;
  /** Open a booking's detail (read-only or editable per the grant). */
  onOpenBooking: (booking: LinkedBooking) => void;
  /**
   * Start a new booking; the optional date re-anchors to the tapped day and the
   * time opens the booking at that slot. The header button passes neither.
   */
  onCreate: (date?: string, time?: string) => void;
  /** Tap a day header to open that day in the Day view (stays in linked context). */
  onDayPress: (date: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { colors } = useTheme();

  const timeOnly = venue.visibility === 'time_only';
  const canCreate = venue.action === 'create_edit_cancel';

  // Resolve a tapped bar back to its rich booking row. Indexed across the whole
  // week feed (the WeekGrid spans all seven days).
  const bookingsById = useMemo(() => {
    const map = new Map<string, LinkedBooking>();
    for (const b of venue.bookings) map.set(b.id, b);
    return map;
  }, [venue.bookings]);

  // Venue-level (date-independent): whether any practitioner publishes hours.
  const hasTemplate = useMemo(() => linkedHasTemplate(venue), [venue]);

  // One WeekDayColumn per day — the linked analogue of the primary venue's
  // `weekColumns`, sharing the exact same column shape so WeekGrid renders both
  // identically.
  const columns = useMemo<WeekDayColumn[]>(
    () =>
      weekDays.map((date) => {
        const dayBookings = venue.bookings.filter((b) => b.bookingDate === date);
        const openRanges = linkedOpenRanges(venue, date);
        const d = parseISO(`${date}T12:00:00.000Z`);
        const weekday = d.getDay();
        return {
          date,
          weekdayLabel: format(d, 'EEE'),
          dayNumber: format(d, 'd'),
          isToday: date === today,
          isWeekend: weekday === 0 || weekday === 6,
          workingHours: rangesToWorkingHours(openRanges),
          // time_only redacts bookings to grey busy bands; full_details shows bars.
          bookings: timeOnly ? [] : dayBookings.map((b) => linkedGridBooking(b, venue.practitioners)),
          // Linked venues carry classes/events/resources as scheduleBlocks (not
          // the grid `sessions` feed), so the session lane is always empty here.
          sessions: [],
          scheduleBlocks: timeOnly ? [] : linkedScheduleBlocksForDate(venue, date),
          timeBlocks: timeOnly ? dayBookings.map((b) => linkedBusyBlock(b, venue.venueName)) : [],
          venueHours: linkedVenueDayHours(openRanges, hasTemplate),
        };
      }),
    [venue, weekDays, today, timeOnly, hasTemplate],
  );

  const handleBlockPress = (bookingId: string) => {
    const booking = bookingsById.get(bookingId);
    if (booking) onOpenBooking(booking);
  };

  const pill = linkedActionLabel(venue);

  // Headed with the calendar's name when the partner shares one ("Jenny", as
  // its day column is), with the venue under it; the venue's name over several,
  // listing them, since this one grid merges every calendar's week. See
  // `linkedWeekHeading`.
  const heading = linkedWeekHeading(venue);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.title}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {heading.title}
          </Text>
          {heading.caption ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {heading.caption}
            </Text>
          ) : null}
        </View>
        <Badge label="Linked" tone="warning" />
        {pill ? (
          <View style={styles.lockPill}>
            {timeOnly || venue.action === 'none' ? (
              <SymbolView
                name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
                tintColor={colors.textMuted}
                size={11}
              />
            ) : null}
            <Badge label={pill} tone="neutral" />
          </View>
        ) : null}
        {canCreate ? (
          <Button label="New booking" size="sm" variant="primary" onPress={() => onCreate()} />
        ) : null}
      </View>

      <WeekGrid
        days={columns}
        nowMinutes={nowMinutes}
        onBlockPress={handleBlockPress}
        onEmptyPress={(date, time) => {
          // Tapping empty space starts a new booking only when allowed; carry
          // the tapped day AND time so the create sheet targets both.
          if (canCreate) onCreate(date, time);
        }}
        onDayPress={onDayPress}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
