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
  linkedColumnUsesNativeGrid,
  linkedDayHeading,
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
 * calendar the partner shares, named after the calendar ("Jenny", not
 * "light2"), as the web diary draws them. With a single column the grid draws
 * no column header, as the own single-calendar view has none, and the card
 * header above names the calendar with the venue under it; with several the
 * columns carry the names and the card names the venue (`linkedDayHeading`).
 * The columns come from `linkedVenueColumns`, the builder the calendar tab's
 * combined grid uses too, so the two views cannot diverge.
 * Interaction is gated by the link grant (§2.5, web `linkedColumnUsesNativeGrid`):
 *
 *  · `time_only`             → bookings render as non-interactive grey "busy"
 *                              overlays ("{venue} — busy"); no tap, no drag.
 *  · `full_details`+`none`   → appointment bars open the full booking panel,
 *                              read only; no tray, no drag.
 *  · `edit_existing` /
 *    `create_edit_cancel`    → the bars are the interactive bars an own column
 *                              has: the quick-action tray, hold-drag move and
 *                              resize (across the partner's own calendars only)
 *                              and the full booking panel, through the drag and
 *                              action callbacks the host passes in.
 *
 * The parent owns the sheets and the writes; this component only resolves which
 * booking was tapped and which calendar's column an empty-slot tap landed on.
 */
export function LinkedVenueCalendarGrid({
  venue,
  date,
  nowMinutes,
  onOpenBooking,
  onCreate,
  onCreateRefused,
  showCreateButton = true,
  onStatusChange,
  onArrivalToggle,
  pendingActionIds,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  onDragMoveToColumn,
  onDragColumnReject,
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
  /** Open the booking's detail (the host picks the panel by the grant). */
  onOpenBooking: (booking: LinkedBooking) => void;
  /**
   * Start a new cross-venue booking (only shown for create_edit_cancel). An
   * empty-slot tap passes the slot time and the calendar whose column was
   * tapped, so the booking opens at that time on that calendar (web parity: a
   * linked column is one calendar); a tap on the venue-level column names no
   * calendar, and the header button passes neither.
   */
  onCreate: (time?: string, practitionerId?: string) => void;
  /**
   * An empty slot was tapped on a column the grant lets us edit but not book
   * on (`edit_existing`). The web answers with a note naming the venue; the
   * host shows it. A read-only column's slots stay inert, as on the web.
   */
  onCreateRefused?: () => void;
  /**
   * Show the header's "New booking" button (default true; the grant still
   * gates it, and empty-slot taps are unaffected). The calendar tab passes
   * false for a partner that books through the caller's live collective, whose
   * New and Walk-in live on the tab's Plus button over the collective instead
   * (web parity: a partner column inside the collective loses its own button,
   * since the toolbar already books that calendar through the collective
   * form), and while that lookup is still pending, since shown-then-taken-away
   * is worse than shown a moment late.
   */
  showCreateButton?: boolean;
  /**
   * The bar's quick actions and hold-drag gestures, exactly as the calendar
   * tab wires them for its own columns (`AllCalendarsDayGrid`'s props). Only
   * used on a link the grant lets us edit; a read-only link ignores them.
   */
  onStatusChange?: (bookingIds: string[], status: string) => void;
  onArrivalToggle?: (bookingIds: string[], arrived: boolean) => void;
  pendingActionIds?: Set<string>;
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  onDragConflictReject?: () => void;
  /** A drop on another of the partner's calendars; the target is that column's key. */
  onDragMoveToColumn?: (
    bookingId: string,
    newTime: string,
    targetCalendarId: string,
    fromCalendarId: string,
  ) => void;
  onDragColumnReject?: () => void;
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
  // The link shares full details and lets us edit: the bars are interactive.
  const editable = linkedColumnUsesNativeGrid(venue);

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
        // Drawn like an own column: the card header above already carries the
        // Linked pill, and the owner wants no amber (2026-09-06).
        linked: true,
        // Interactive on an edit grant (web `linkedColumnUsesNativeGrid`); a
        // move may cross onto the partner's other calendars, never onto the
        // venue-level column, which names no calendar to reassign to.
        editable,
        moveGroup: col.practitionerId ? venue.venueId : undefined,
        processingPatternFor,
      })),
    [linkedColumns, timeOnly, venue, date, processingPatternFor, editable],
  );

  const handleBlockPress = (bookingId: string) => {
    const booking = bookingsById.get(bookingId);
    if (booking) onOpenBooking(booking);
  };

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

  // The calendar's name when it is the only column (the grid then draws no
  // column header), the venue's otherwise; see `linkedDayHeading`.
  const heading = linkedDayHeading(venue, linkedColumns);

  return (
    <View style={styles.card}>
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
        {/* `onCreate` is wrapped, not passed directly: `onPress` hands the press
            event to its handler, which would arrive as the slot time. */}
        {canCreate && showCreateButton ? (
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
            // One column needs no header over it (the own single-calendar view
            // has none; the card above names the calendar); several do.
            showColumnHeaders={columns.length > 1}
            calendars={columns}
            nowMinutes={nowMinutes}
            onBlockPress={handleBlockPress}
            onEmptyPress={(calendarId, time) => {
              // Tapping empty space starts a new booking only when allowed, at
              // the tapped time (the grid resolves it from the tap's Y) on the
              // tapped column's calendar; the venue-level column names none. On
              // an editable link without a create grant the web says why.
              if (!canCreate) {
                if (editable) onCreateRefused?.();
                return;
              }
              onCreate(time, parseLinkedColumnKey(calendarId)?.practitionerId ?? undefined);
            }}
            // The interactive bars' callbacks, on an edit grant only; the grid
            // draws a static bar otherwise and would ignore them anyway.
            onStatusChange={editable ? onStatusChange : undefined}
            onArrivalToggle={editable ? onArrivalToggle : undefined}
            pendingActionIds={editable ? pendingActionIds : undefined}
            onDragReschedule={editable ? onDragReschedule : undefined}
            onDragResize={editable ? onDragResize : undefined}
            onDragConflictReject={editable ? onDragConflictReject : undefined}
            onDragMoveToColumn={editable ? onDragMoveToColumn : undefined}
            onDragColumnReject={editable ? onDragColumnReject : undefined}
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
