import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import {
  AllCalendarsDayGrid,
  type AllCalendarColumn,
} from '@/components/calendar/AllCalendarsDayGrid';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { patternLookupFromLinkedServices } from '@/lib/calendar/processing-gaps';
import {
  linkedActionLabel,
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedScheduleBlocksForColumn,
  linkedVenueColumns,
  linkedVenueDayHours,
  parseLinkedColumnKey,
  rangesToWorkingHours,
} from '@/lib/linked/linked-calendar-view';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';

/**
 * Grant-gated adapter that renders ONE linked venue's day onto the shared
 * multi-calendar `AllCalendarsDayGrid` (never forked — §12): one column per
 * calendar the partner shares, headed with the calendar's name ("Jenny", not
 * "light2"), as the web diary draws them, with the venue named in the card
 * header above. The columns come from `linkedVenueColumns`, the builder the
 * calendar tab's combined grid uses too, so the two views cannot diverge.
 * Interaction is gated by the link grant (§2.5):
 *
 *  · `time_only`             → bookings render as non-interactive grey "busy"
 *                              overlays ("{venue} — busy"); no tap, no drag.
 *  · `full_details`+`none`   → appointment bars open a read-only detail (lock);
 *                              drag/resize disabled.
 *  · `edit_existing` /
 *    `create_edit_cancel`    → appointment bars open the edit sheet.
 *
 * The parent owns the sheets; this component only resolves which booking was
 * tapped and which calendar's column an empty-slot tap landed on. The detail
 * sheet itself gates view vs edit by the link grant, so a single
 * `onOpenBooking` covers both.
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
  /**
   * Start a new cross-venue booking (only shown for create_edit_cancel). An
   * empty-slot tap passes the slot time and the calendar whose column was
   * tapped, so the booking opens at that time on that calendar (web parity: a
   * linked column is one calendar); a tap on the venue-level column names no
   * calendar, and the header button passes neither.
   */
  onCreate: (time?: string, practitionerId?: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Render the inner grid at full height (no internal scroll, no 420px cap) so
   * a PARENT scroll container owns vertical scrolling. Set when several of
   * these stack in one outer ScrollView (the linked-calendar screen) or when
   * the parent already scrolls (the calendar tab's single linked venue view) —
   * otherwise each grid's own ScrollView would swallow the parent's pan and
   * the venues below the first stay unreachable.
   */
  embedded?: boolean;
  /**
   * Shrink the vertical scale for an at-a-glance read (the toolbar "Compact"
   * toggle). Works here even though these grids are usually `embedded`:
   * `AllCalendarsDayGrid` cannot measure a viewport when embedded, so it renders
   * compact at its floor scale, which is still far tighter than the default.
   */
  compact?: boolean;
}) {
  const { colors } = useTheme();

  const timeOnly = venue.visibility === 'time_only';
  const canCreate = venue.action === 'create_edit_cancel';

  // One column per calendar the partner shares on this date (an inactive one
  // only while it holds a booking; a venue-level column for bookings naming no
  // listed calendar). The feed may carry a wider range (the calendar's week
  // view fetches the whole week through the same hook), so the builder narrows
  // to the rendered day.
  const linkedColumns = useMemo(() => linkedVenueColumns(venue, date), [venue, date]);

  // Index this day's bookings by id so the press handler can resolve the rich row.
  const bookingsById = useMemo(() => {
    const map = new Map<string, LinkedBooking>();
    for (const col of linkedColumns) for (const b of col.bookings) map.set(b.id, b);
    return map;
  }, [linkedColumns]);

  // Processing gaps for the partner's bars: the linked feed carries no
  // snapshot, so every gap comes from the service and option patterns the
  // venue shares (web #176/#178); see `lib/calendar/processing-gaps`.
  const processingPatternFor = useMemo(
    () => patternLookupFromLinkedServices(venue.services),
    [venue.services],
  );

  // The grid columns. Each calendar's own weekly template drives its column's
  // visible window AND its "Closed" shading (web parity: a linked column's
  // closure derives from its own working hours, not the viewing venue's
  // opening hours; the venue-level column reads the venue's union).
  //  · time_only    → grey, non-interactive busy overlays (lock styling, no tap).
  //  · full_details → appointment bars, keeping the bare service since the
  //                   header already names the practitioner, plus the
  //                   calendar's classes / ticketed events / resource bookings
  //                   as read-only overlays via the same mapper the main
  //                   calendar uses (class instances deduped).
  const columns = useMemo<AllCalendarColumn[]>(
    () =>
      linkedColumns.map((col) => ({
        calendarId: col.key,
        calendarName: col.name,
        workingHours: rangesToWorkingHours(col.openRanges),
        bookings: timeOnly
          ? []
          : col.bookings.map((b) =>
              linkedGridBooking(b, venue.practitioners, { practitionerInLabel: false }),
            ),
        sessions: [],
        timeBlocks: timeOnly ? col.bookings.map((b) => linkedBusyBlock(b, venue.venueName)) : [],
        scheduleBlocks: timeOnly ? [] : linkedScheduleBlocksForColumn(venue, col, date),
        venueHours: linkedVenueDayHours(col.openRanges, col.hasTemplate),
        linked: true,
        accent: colors.warning,
        processingPatternFor,
      })),
    [linkedColumns, timeOnly, venue, date, colors.warning, processingPatternFor],
  );

  const handleBlockPress = (bookingId: string) => {
    const booking = bookingsById.get(bookingId);
    if (booking) onOpenBooking(booking);
  };

  // Hold-drag move/resize is intentionally NOT wired: the web linked calendar
  // has no drag — every edit (including reschedule) goes through the edit sheet,
  // which records the change in the cross-venue audit log with a clear diff.
  // Omitting onDragReschedule/onDragResize disables the gesture in the grid, a
  // `linked` column never offers the own-column quick actions or the
  // cross-column move, so time_only and read-only columns are non-interactive
  // and editable columns open the sheet on tap.

  // Render the grid when there's anything to show — bookings, hours today on
  // any calendar, a working-hours template (so a closed day shades correctly),
  // or a create grant (so an empty bookable day can still be tapped to add a
  // booking).
  const hasGridContent =
    columns.some(
      (c) =>
        c.bookings.length > 0 ||
        c.timeBlocks.length > 0 ||
        c.scheduleBlocks.length > 0 ||
        c.workingHours.length > 0,
    ) ||
    linkedHasTemplate(venue) ||
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
        {/* `onCreate` is wrapped, not passed directly: `onPress` hands the press
            event to its handler, which would arrive as the slot time. */}
        {canCreate ? (
          <Button label="New booking" size="sm" variant="primary" onPress={() => onCreate()} />
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
          <AllCalendarsDayGrid
            embedded={embedded}
            compact={compact}
            calendars={columns}
            nowMinutes={nowMinutes}
            onBlockPress={handleBlockPress}
            onEmptyPress={(calendarId, time) => {
              // Tapping empty space starts a new booking only when allowed, at
              // the tapped time (the grid resolves it from the tap's Y) on the
              // tapped column's calendar; the venue-level column names none.
              if (!canCreate) return;
              onCreate(time, parseLinkedColumnKey(calendarId)?.practitionerId ?? undefined);
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
