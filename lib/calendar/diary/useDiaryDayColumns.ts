import { useCallback, useMemo } from 'react';

import { type AllCalendarColumn } from '@/components/calendar/AllCalendarsDayGrid';
import { calendarHasAvailableHoursOnDate } from '@/lib/calendar/calendar-has-hours-on-date';
import { resolveColumnDayHours } from '@/lib/calendar/column-day-hours';
import { diaryColumnTakesNewBookings } from '@/lib/calendar/diary-columns';
import { scheduleKey } from '@/lib/calendar/diary-screen';
import { diaryColumnFlags } from '@/lib/calendar/diary-view-only';
import type {
  DiaryGetDayBlocks,
  DiaryGridQuery,
  DiaryLeavePeriods,
  DiaryOpeningHours,
  DiaryVenueWideBlocks,
} from '@/lib/calendar/diary/types';
import { patternLookupFromLinkedServices } from '@/lib/calendar/processing-gaps';
import { venueDayHours } from '@/lib/calendar/venue-closures';
import {
  linkedBusyBlock,
  linkedColumnClosureInputs,
  linkedColumnKey,
  linkedColumnUsesNativeGrid,
  linkedGridBooking,
  linkedNameRepeatsVenue,
  linkedScheduleBlocksForColumn,
  linkedVenueColumns,
  rangesToWorkingHours,
  type LinkedVenueColumn,
} from '@/lib/linked/linked-calendar-view';
import { type DiaryScope } from '@/lib/roles/roles';
import { businessBesidePerson, showsLinkedPill } from '@/lib/venue/member-label';
import type { LinkedVenueCalendar, StaffCollectiveSummary } from '@/types/linked-venues';
import type { Practitioner } from '@/types/practitioner';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

export interface DiaryDayColumnsInput {
  isWideDay: boolean;
  visibleIds: string[] | null;
  practitioners: Practitioner[];
  linkedVenues: LinkedVenueCalendar[];
  anchor: string;
  isAllView: boolean;
  workingHoursOnly: boolean;
  leavePeriods: DiaryLeavePeriods;
  openingHours: DiaryOpeningHours;
  venueWideBlocks: DiaryVenueWideBlocks;
  showAllCalendars: boolean;
  gridQuery: DiaryGridQuery;
  getDayBlocks: DiaryGetDayBlocks;
  scheduleByCalendarDate: Map<string, CalendarScheduleBlock[]>;
  diary: DiaryScope;
  staffCollective: StaffCollectiveSummary | null;
}

/**
 * The columns of the side-by-side day grid: our own calendars, then each linked
 * calendar, after the wide-day filter and the "working this day" filter. Moved
 * out of the diary screen unchanged (codebase standards P5.2).
 */
export function useDiaryDayColumns({
  isWideDay,
  visibleIds,
  practitioners,
  linkedVenues,
  anchor,
  isAllView,
  workingHoursOnly,
  leavePeriods,
  openingHours,
  venueWideBlocks,
  showAllCalendars,
  gridQuery,
  getDayBlocks,
  scheduleByCalendarDate,
  diary,
  staffCollective,
}: DiaryDayColumnsInput): { allColumnsForDay: AllCalendarColumn[] } {
  // ---- Multi-calendar day view data ----
  // One column per practitioner for the anchor date, sharing the time gutter.
  // Assembled whenever the side-by-side grid will render (explicit "All" chip
  // OR a wide viewport).
  //
  // The wide-day visible set spans BOTH own calendar ids and linked venue keys
  // (`linked:<venueId>`); null = all. Resolve each axis from it, with a safety
  // fallback to "all" if a (stale) filter would select nothing — so the grid is
  // never blank. Phone single-pane day + week scope ignore the filter entirely.
  const wideFilterActive = isWideDay && visibleIds != null;
  const wideFilterSet = useMemo(() => new Set(visibleIds ?? []), [visibleIds]);

  const dayOwnPractitioners = useMemo(
    () => (wideFilterActive ? practitioners.filter((p) => wideFilterSet.has(p.id)) : practitioners),
    [wideFilterActive, practitioners, wideFilterSet],
  );

  // Linked venues shown as columns: on a wide day filtered by the visible set;
  // on a phone only when "All" (selectedId) is picked (existing behaviour).
  // A linked column is visible under its own key or, from an older preference
  // that toggled the partner as a whole, its venue-level key.
  const linkedColumnVisible = useCallback(
    (col: LinkedVenueColumn) =>
      wideFilterSet.has(col.key) || wideFilterSet.has(linkedColumnKey(col.venue.venueId)),
    [wideFilterSet],
  );
  const linkedVenuesForDay = useMemo(() => {
    if (isWideDay) {
      return wideFilterActive
        ? linkedVenues.filter((v) => linkedVenueColumns(v, anchor).some(linkedColumnVisible))
        : linkedVenues;
    }
    return isAllView ? linkedVenues : [];
  }, [isWideDay, wideFilterActive, linkedColumnVisible, linkedVenues, isAllView, anchor]);

  // If a (stale) filter resolves to zero columns, show everything instead.
  const wideFilterEmpty =
    wideFilterActive && dayOwnPractitioners.length + linkedVenuesForDay.length === 0;
  const ownColumnsSource = wideFilterEmpty ? practitioners : dayOwnPractitioners;
  const linkedColumnsSource = wideFilterEmpty ? linkedVenues : linkedVenuesForDay;

  // "Only calendars working on the selected day" (web 2026-09-05). An own
  // column answers from its rota-resolved hours minus leave and the venue's
  // closures; a linked column from the weekly template its owner shares (not
  // its leave or closures, which are not in the feed). It asks whether the
  // column has hours to show, not whether it is busy, so block time does not
  // count. Never a blank grid: if nobody works, every column stays.
  // A phone's "All" view takes it too (The Beauty Parlour, 2026-11-18), with its chip beside "All".
  const workingFilterOn = (isWideDay || isAllView) && workingHoursOnly;
  // A linked venue becomes one column per calendar the partner shares, named
  // after the calendar (web §8.2: "Jenny", not "light2"), each with its own
  // template; see `linkedVenueColumns`.
  const linkedSourceColumns = useMemo<LinkedVenueColumn[]>(() => {
    const columns = linkedColumnsSource.flatMap((v) => linkedVenueColumns(v, anchor));
    // The wide-day filter picks linked columns one calendar at a time.
    return wideFilterActive && !wideFilterEmpty ? columns.filter(linkedColumnVisible) : columns;
  }, [linkedColumnsSource, anchor, wideFilterActive, wideFilterEmpty, linkedColumnVisible]);
  const { ownColumnsShown, linkedColumnsShown } = useMemo(() => {
    if (!workingFilterOn) {
      return { ownColumnsShown: ownColumnsSource, linkedColumnsShown: linkedSourceColumns };
    }
    const own = ownColumnsSource.filter((p) =>
      calendarHasAvailableHoursOnDate({
        calendarId: p.id,
        row: p,
        dateYmd: anchor,
        leavePeriods,
        openingHours,
        venueWideBlocks,
      }),
    );
    // A linked column answers from its own calendar's weekly template (the
    // venue-level column from the venue's union).
    const linked = linkedSourceColumns.filter((c) => c.openRanges.length > 0);
    if (own.length + linked.length === 0) {
      return { ownColumnsShown: ownColumnsSource, linkedColumnsShown: linkedSourceColumns };
    }
    return { ownColumnsShown: own, linkedColumnsShown: linked };
  }, [
    workingFilterOn,
    ownColumnsSource,
    linkedSourceColumns,
    anchor,
    leavePeriods,
    openingHours,
    venueWideBlocks,
  ]);

  const allCalendarsForDay = useMemo(() => {
    if (!showAllCalendars) return [];
    const venueHoursForDay = venueDayHours(openingHours, anchor, venueWideBlocks);
    return ownColumnsShown.map((p) => {
      const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === p.id);
      const calDay = calendar?.dates.find((d) => d.date === anchor) ?? null;
      // A paused calendar, drawn for the bookings still on it (R44-3): marked,
      // and no bar may be dropped on it. Its own bars still open and move away.
      const paused = !diaryColumnTakesNewBookings(p);
      // The feed carries the WEEKLY hours only; the column takes the resolved
      // ones (amended hours, days off, schedule periods) so the day's bounds,
      // the closed shading and the drag follow them. An amended day widens
      // this column's venue window; the other columns keep the venue's.
      const column = resolveColumnDayHours(p, anchor, venueHoursForDay);
      return {
        calendarId: p.id,
        calendarName: p.name,
        workingHours: column.workingHours ?? calDay?.workingHours ?? [],
        bookings: calDay?.bookings ?? [],
        sessions: calDay?.sessions ?? [],
        timeBlocks: getDayBlocks(p.id, anchor, calDay),
        // This practitioner's class/event/resource blocks for the anchor date.
        scheduleBlocks: scheduleByCalendarDate.get(scheduleKey(p.id, anchor)) ?? [],
        ...(column.amended ? { venueHours: column.venueHours } : {}),
        ...(paused ? { badge: 'Paused', acceptsDrops: false } : {}),
        // View only and Hidden (§5.11): someone else's column is look only for this person. Its
        // bars open but take no quick actions, drag or resize, and nothing may be dropped on it.
        ...diaryColumnFlags(diary, p.id),
      };
    });
  }, [
    diary,
    showAllCalendars,
    ownColumnsShown,
    gridQuery.data,
    anchor,
    getDayBlocks,
    scheduleByCalendarDate,
    openingHours,
    venueWideBlocks,
  ]);

  // Linked calendars as side-by-side columns in the SAME grid: one column per
  // calendar the partner shares, headed with the calendar's name and the venue
  // under it, appended after the own practitioners. Driven by
  // `linkedColumnsSource`: on a wide day the multi-select subset, on a phone the
  // explicit "All" view, otherwise none.
  // Grant-gated like the linked day grid: time_only → grey "busy" overlays
  // (no appointment bars), full_details → appointment bars + class/event blocks.
  const linkedColumnsForDay = useMemo<AllCalendarColumn[]>(() => {
    return linkedColumnsShown.map((col) => {
      const v = col.venue;
      const timeOnly = v.visibility === 'time_only';
      // The partner's closures, resolved as its own diary resolves them (venue
      // shut, calendar not working, both, leave), or its weekly template on an
      // older feed. Shown on every grant, as on the web: a time-only link still
      // learns when a calendar is unavailable.
      const closures = linkedColumnClosureInputs(v, col, anchor);
      return {
        calendarId: col.key,
        calendarName: col.name,
        // The venue under the calendar's name, unless the calendar is named
        // after the venue and the caption would only repeat it.
        caption:
          col.practitionerId && !linkedNameRepeatsVenue(col.name, v.venueName)
            ? // "Aura Hair Studio" under "Jenny", not "Aura Hair Studio (Jenny)" (2026-11-22).
              businessBesidePerson(col.name, v.venueName)
            : undefined,
        workingHours: closures.workingHours ?? rangesToWorkingHours(col.openRanges),
        // The header names the calendar, so a bar keeps the bare service.
        bookings: timeOnly
          ? []
          : col.bookings.map((b) =>
              linkedGridBooking(b, v.practitioners, { practitionerInLabel: false }),
            ),
        sessions: [],
        timeBlocks: [
          ...closures.closureBlocks,
          ...(timeOnly ? col.bookings.map((b) => linkedBusyBlock(b, v.venueName)) : []),
        ],
        scheduleBlocks: timeOnly ? [] : linkedScheduleBlocksForColumn(v, col, anchor),
        // The partner's OWN hours drive its column's closure shading.
        venueHours: closures.venueHours,
        linked: true,
        linkedClosures: closures.source,
        // Drawn like an own column, marked by the small Linked pill next to
        // the calendar's name (the owner wants no amber, 2026-09-06). A member
        // of our collective is named like any member, with no pill (2026-11-22).
        badge: showsLinkedPill(v.venueId, staffCollective?.member_venue_ids) ? 'Linked' : undefined,
        // A link that shares full details and grants edits joins the
        // interactive grid (web `linkedColumnUsesNativeGrid`): the same bars,
        // tray, move and resize as our own columns, moving only among this
        // partner's calendars (never onto the venue-level column, which names
        // no calendar to reassign to).
        editable: linkedColumnUsesNativeGrid(v),
        moveGroup: col.practitionerId ? v.venueId : undefined,
        // The partner's own service patterns draw its bars' gaps (R24-6).
        processingPatternFor: patternLookupFromLinkedServices(v.services),
      };
    });
  }, [linkedColumnsShown, anchor, staffCollective]);

  // Own practitioner columns + linked venue columns, side by side in one grid.
  const allColumnsForDay = useMemo(
    () => [...allCalendarsForDay, ...linkedColumnsForDay],
    [allCalendarsForDay, linkedColumnsForDay],
  );

  return { allColumnsForDay };
}
