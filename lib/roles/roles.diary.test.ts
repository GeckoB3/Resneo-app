/**
 * Web roles plan A2 and A2b in the app (§5.11, §7.3): other people's diaries. Which calendars a
 * View only or Hidden person may book and change on, what the diary, the booking form and the
 * linked calendars offer them, and how a Hidden person reads someone else's visit in a client's
 * history (UR20). Mirrors the web's `diary-access` `diaryCalendarOf` / `diaryAllows`.
 */
import {
  catalogForDiary,
  diaryCalendarOf,
  diaryScopeOf,
  FULL_VIEWER_ACCESS,
  linkedVenuesForDiary,
  OPEN_DIARY_SCOPE,
  restrictedVisitLabels,
  ROLES_COPY,
  viewerAccessOf,
} from '@/lib/roles/roles';
import { diaryColumnFlags, diarySlotAnswer } from '@/lib/calendar/diary-view-only';
import type { LinkedVenueCalendar } from '@/types/linked-venues';

const staff = { role: 'staff', role_key: 'staff' as const, permissions: {} };

describe('viewerAccessOf: their calendars', () => {
  it('reads them from staff/me for View only and Hidden', () => {
    expect(
      viewerAccessOf({ ...staff, linked_calendar_ids: ['cal-1'], permissions: { other_diaries: 'view' } }),
    ).toEqual({ canSeeClientContact: true, canExportClients: true, otherDiaries: 'view', ownCalendarIds: ['cal-1'] });
    expect(
      viewerAccessOf({ ...staff, linked_calendar_ids: ['cal-2'], permissions: { other_diaries: 'hidden' } }),
    ).toMatchObject({ otherDiaries: 'hidden', ownCalendarIds: ['cal-2'] });
  });

  it('carries none for Can book and change, so nothing changes for them', () => {
    expect(viewerAccessOf({ ...staff, linked_calendar_ids: ['cal-1'] })).toEqual({
      canSeeClientContact: true,
      canExportClients: true,
      otherDiaries: 'book',
    });
  });

  it('reads none while only the venue payload has answered', () => {
    const venue = {
      current_user_role: 'staff' as const,
      current_user_is_owner: false,
      current_user_role_key: 'staff' as const,
      current_user_permissions: { other_diaries: 'hidden' as const },
    };
    expect(viewerAccessOf(null, venue)).toMatchObject({ otherDiaries: 'hidden', ownCalendarIds: [] });
  });
});

describe('diaryScopeOf', () => {
  const view = diaryScopeOf({ otherDiaries: 'view', ownCalendarIds: ['mine'] });
  const hidden = diaryScopeOf({ otherDiaries: 'hidden', ownCalendarIds: ['mine'] });

  it('is the open scope for Can book and change: everything passes', () => {
    const open = diaryScopeOf(FULL_VIEWER_ACCESS);
    expect(open).toBe(OPEN_DIARY_SCOPE);
    expect(open.restricted).toBe(false);
    expect(open.writable).toBeNull();
    expect(open.allows('anyone')).toBe(true);
    expect(open.allows({ calendar_id: 'anyone' })).toBe(true);
  });

  it('allows only their own calendars for View only and Hidden', () => {
    for (const scope of [view, hidden]) {
      expect(scope.restricted).toBe(true);
      expect(scope.allows('mine')).toBe(true);
      expect(scope.allows('theirs')).toBe(false);
      expect(scope.allows({ calendar_id: 'mine' })).toBe(true);
      expect(scope.allows({ calendar_id: 'theirs' })).toBe(false);
      // A legacy row names its practitioner instead.
      expect(scope.allows({ practitioner_id: 'theirs' })).toBe(false);
    }
    expect(view.access).toBe('view');
    expect(hidden.access).toBe('hidden');
  });

  it('never limits classes, events, resources, tables or a booking with no calendar', () => {
    expect(view.allows({ calendar_id: 'theirs', class_instance_id: 'c' })).toBe(true);
    expect(view.allows({ calendar_id: 'theirs', experience_event_id: 'e' })).toBe(true);
    expect(view.allows({ calendar_id: 'res-1', resource_id: 'res-1' })).toBe(true);
    expect(view.allows({ calendar_id: 'theirs', booking_model: 'resource_booking' })).toBe(true);
    expect(view.allows({ calendar_id: 'theirs', inferred_booking_model: 'class_session' })).toBe(true);
    expect(view.allows({})).toBe(true);
    expect(view.allows(null)).toBe(true);
    expect(view.allows(undefined)).toBe(true);
  });

  it('reads no calendars as none writable, as the server refuses', () => {
    const none = diaryScopeOf({ otherDiaries: 'view' });
    expect(none.writable?.size).toBe(0);
    expect(none.allows('anyone')).toBe(false);
    expect(none.allows({ calendar_id: 'anyone' })).toBe(false);
  });

  it('finds the calendar a row sits on as the server does', () => {
    expect(diaryCalendarOf({ calendar_id: 'a', practitioner_id: 'b' })).toBe('a');
    expect(diaryCalendarOf({ practitioner_id: 'b' })).toBe('b');
    expect(diaryCalendarOf({ calendar_id: 'a', class_instance_id: 'c' })).toBeNull();
    expect(diaryCalendarOf({})).toBeNull();
  });
});

describe('the diary columns', () => {
  const view = diaryScopeOf({ otherDiaries: 'view', ownCalendarIds: ['mine'] });

  it('opens the usual menu on their own column and for everyone on Can book and change', () => {
    expect(diarySlotAnswer(view, 'mine', false)).toBe('open');
    expect(diarySlotAnswer(OPEN_DIARY_SCOPE, 'theirs', false)).toBe('open');
    // No column at all (no calendars yet): the FAB's menu, as before.
    expect(diarySlotAnswer(view, '', false)).toBe('open');
  });

  it("refuses an empty slot on someone else's column, unless it hosts a resource", () => {
    expect(diarySlotAnswer(view, 'theirs', false)).toBe('refuse');
    expect(diarySlotAnswer(view, 'theirs', true)).toBe('resources_only');
  });

  it("marks someone else's column read only and closed to drops, and leaves the rest alone", () => {
    expect(diaryColumnFlags(view, 'theirs')).toEqual({ readOnly: true, acceptsDrops: false });
    expect(diaryColumnFlags(view, 'mine')).toEqual({});
    expect(diaryColumnFlags(OPEN_DIARY_SCOPE, 'theirs')).toEqual({});
  });
});

describe('what a View only or Hidden person books from', () => {
  const catalog = { practitioners: [{ id: 'mine' }, { id: 'theirs' }], categories: [] };

  it('offers only their own calendars in a catalogue', () => {
    expect(catalogForDiary(catalog, diaryScopeOf({ otherDiaries: 'view', ownCalendarIds: ['mine'] }))).toEqual({
      practitioners: [{ id: 'mine' }],
      categories: [],
    });
  });

  it('hands everyone else the very same catalogue', () => {
    expect(catalogForDiary(catalog, OPEN_DIARY_SCOPE)).toBe(catalog);
    expect(catalogForDiary(undefined, OPEN_DIARY_SCOPE)).toBeUndefined();
  });

  it('reads every link as view only for View only, and leaves the list alone for everyone else', () => {
    const venues = [
      { venueId: 'v1', action: 'create_edit_cancel' },
      { venueId: 'v2', action: 'none' },
    ] as unknown as LinkedVenueCalendar[];
    expect(linkedVenuesForDiary(venues, OPEN_DIARY_SCOPE)).toBe(venues);
    const narrowed = linkedVenuesForDiary(venues, { restricted: true });
    expect(narrowed.map((v) => v.action)).toEqual(['none', 'none']);
    expect(narrowed[1]).toBe(venues[1]);
  });
});

describe('restrictedVisitLabels (UR20)', () => {
  it('says the service and who it was with, nothing more', () => {
    expect(restrictedVisitLabels({ service_name: 'Cut', practitioner_name: 'Jo', detail_label: 'x' })).toEqual({
      service: 'Cut',
      withWhom: 'With Jo',
    });
    expect(restrictedVisitLabels({ detail_label: 'Colour', calendar_name: 'Chair 2' })).toEqual({
      service: 'Colour',
      withWhom: 'With Chair 2',
    });
    expect(restrictedVisitLabels({})).toEqual({ service: 'Booking', withWhom: null });
  });
});

describe('the diary copy', () => {
  it("says why an action is missing, in the copy deck's words", () => {
    expect(ROLES_COPY['diary.booking']).toBe(
      'You can see this booking, but you can only change bookings on your own calendar.',
    );
    expect(ROLES_COPY['diary.new']).toBe(
      'You can see this calendar, but you can only add bookings to your own calendar.',
    );
  });
});
