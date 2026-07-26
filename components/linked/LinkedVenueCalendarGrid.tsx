import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import {
  CalendarDayGrid,
  type CalendarTimeBlock,
} from '@/components/calendar/CalendarDayGrid';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { type MinuteRange, type VenueDayHours } from '@/lib/calendar/venue-closures';
import {
  linkedActionLabel,
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedOpenRanges,
  linkedScheduleBlocksForDate,
  linkedVenueDayHours,
  rangesToWorkingHours,
} from '@/lib/linked/linked-calendar-view';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CalendarGridBooking,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

/**
 * Grant-gated adapter that renders ONE linked venue's day onto the shared
 * `CalendarDayGrid` (never forked — §12). Interaction is gated by the link grant
 * (§2.5):
 *
 *  · `time_only`             → bookings render as non-interactive grey "busy"
 *                              overlays ("{venue} — busy"); no tap, no drag.
 *  · `full_details`+`none`   → appointment bars open a read-only detail (lock);
 *                              drag/resize disabled.
 *  · `edit_existing` /
 *    `create_edit_cancel`    → appointment bars open the edit sheet; editable
 *                              (non-cancelled) bookings are draggable/resizable.
 *
 * The parent owns the sheets; this component only resolves which booking was
 * tapped and whether drag is wired. The detail sheet itself gates view vs edit
 * by the link grant, so a single `onOpenBooking` covers both.
 */
export function LinkedVenueCalendarGrid({
  venue,
  date,
  nowMinutes,
  onOpenBooking,
  onCreate,
  refreshing,
  onRefresh,
  embedded,
  compact,
}: {
  venue: LinkedVenueCalendar;
  /** The day being shown ("YYYY-MM-DD") — drives the working-hours window. */
  date: string;
  /** Minutes-since-midnight for the now-line, or null when not today. */
  nowMinutes: number | null;
  /** Open the booking's expanded detail (read-only or editable per the grant). */
  onOpenBooking: (booking: LinkedBooking) => void;
  /** Start a new cross-venue booking (only shown for create_edit_cancel). */
  onCreate: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Render the inner grid at full height (no internal scroll, no 420px cap) so
   * a PARENT scroll container owns vertical scrolling. Set when several of
   * these stack in one outer ScrollView (the "All incl. linked" calendar view,
   * the linked-calendar screen) — otherwise each grid's own ScrollView would
   * swallow the parent's pan and the venues below the first stay unreachable.
   */
  embedded?: boolean;
  /**
   * Shrink the vertical scale for an at-a-glance read (the toolbar "Compact"
   * toggle). Works here even though these grids are usually `embedded`:
   * `CalendarDayGrid` cannot measure a viewport when embedded, so it renders
   * compact at its floor scale, which is still far tighter than the default.
   */
  compact?: boolean;
}) {
  const { colors } = useTheme();

  const timeOnly = venue.visibility === 'time_only';
  const canCreate = venue.action === 'create_edit_cancel';

  // Only this date's bookings — the feed may carry a wider range (the calendar's
  // week view fetches the whole week through the same hook), so the day grid
  // narrows to the rendered day. A single-day feed makes this a no-op.
  const dayBookings = useMemo(
    () => venue.bookings.filter((b) => b.bookingDate === date),
    [venue.bookings, date],
  );

  // Index this day's bookings by id so the press handler can resolve the rich row.
  const bookingsById = useMemo(() => {
    const map = new Map<string, LinkedBooking>();
    for (const b of dayBookings) map.set(b.id, b);
    return map;
  }, [dayBookings]);

  // The linked venue's available hours for this day, unioned across its
  // practitioners' working-hours templates. Drives the grid's visible window
  // (workingHours) AND the "Closed" shading (venueHours) — mirroring the web's
  // per-linked-column closure shading, which derives from the linked column's
  // own working hours rather than the viewing venue's opening hours.
  const openRanges = useMemo<MinuteRange[]>(() => linkedOpenRanges(venue, date), [venue, date]);

  const workingHours = useMemo<CalendarGridWorkingHours[]>(
    () => rangesToWorkingHours(openRanges),
    [openRanges],
  );

  const hasTemplate = useMemo(() => linkedHasTemplate(venue), [venue]);

  // Shade the closed hours: explicit open periods when the venue works today,
  // fully closed when it has a template but no hours today, and unknown (no
  // shading) when no template is available at all.
  const venueHours = useMemo<VenueDayHours>(
    () => linkedVenueDayHours(openRanges, hasTemplate),
    [openRanges, hasTemplate],
  );

  // time_only → grey, non-interactive busy overlays (lock styling, no tap).
  const timeBlocks: CalendarTimeBlock[] = useMemo(() => {
    if (!timeOnly) return [];
    return dayBookings.map((b) => linkedBusyBlock(b, venue.venueName));
  }, [timeOnly, dayBookings, venue.venueName]);

  // full_details → appointment bars. Tap routes to edit (editable) or read-only
  // detail (everything else). Drag is wired only for editable columns; the grid
  // additionally gates drag on movable statuses.
  const gridBookings: CalendarGridBooking[] = useMemo(() => {
    if (timeOnly) return [];
    return dayBookings.map((b) => linkedGridBooking(b, venue.practitioners));
  }, [timeOnly, dayBookings, venue.practitioners]);

  // full_details → the venue's classes / ticketed events / resource bookings for
  // the day, rendered as read-only overlays via the same mapper the main
  // calendar uses (class instances deduped). time_only never carries these.
  const scheduleBlocks = useMemo<CalendarScheduleBlock[]>(() => {
    if (timeOnly) return [];
    return linkedScheduleBlocksForDate(venue, date);
  }, [timeOnly, venue, date]);

  const handleBlockPress = (bookingId: string) => {
    const booking = bookingsById.get(bookingId);
    if (booking) onOpenBooking(booking);
  };

  // Hold-drag move/resize is intentionally NOT wired: the web linked calendar
  // has no drag — every edit (including reschedule) goes through the edit sheet,
  // which records the change in the cross-venue audit log with a clear diff.
  // Omitting onDragReschedule/onDragResize disables the gesture in the grid
  // (DraggableAppointmentBlock: dragEnabled = draggable && onDragReschedule),
  // so time_only and read-only columns are non-interactive and editable columns
  // open the sheet on tap.

  // Render the grid when there's anything to show — bookings, the venue's hours
  // for today, a working-hours template (so a closed day shades correctly), or a
  // create grant (so an empty bookable day can still be tapped to add a booking).
  const hasGridContent =
    dayBookings.length > 0 ||
    scheduleBlocks.length > 0 ||
    openRanges.length > 0 ||
    hasTemplate ||
    canCreate;

  const pill = linkedActionLabel(venue);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
          {venue.venueName}
        </Text>
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
          <Button label="New booking" size="sm" variant="primary" onPress={onCreate} />
        ) : null}
      </View>

      {!hasGridContent ? (
        <Text variant="caption" tone="muted" style={styles.empty}>
          {timeOnly
            ? 'No busy time blocks for this day.'
            : 'This venue has no bookings for this day.'}
        </Text>
      ) : (
        <View style={embedded ? undefined : styles.gridWrap}>
          <CalendarDayGrid
            embedded={embedded}
            compact={compact}
            bookings={gridBookings}
            workingHours={workingHours}
            venueHours={venueHours}
            timeBlocks={timeBlocks}
            scheduleBlocks={scheduleBlocks}
            nowMinutes={nowMinutes}
            onBlockPress={handleBlockPress}
            onEmptyPress={() => {
              // Tapping empty space starts a new booking only when allowed.
              if (canCreate) onCreate();
            }}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  empty: {
    paddingVertical: spacing.lg,
  },
  gridWrap: {
    // The grid manages its own internal scroll; cap the column so several
    // venues can stack on one screen without each grabbing the full height.
    height: 420,
  },
});
