import {
  CLIENT_SEARCH_DEBOUNCE_MS,
  CLIENT_SEARCH_MIN_LENGTH,
  CLIENT_SEARCH_RESULT_LIMIT,
  calendarJumpForBooking,
  clientSearchParams,
  clientSearchResultLabel,
  clientSearchResultSubtitle,
  clientSearchStatus,
  formatClientBookingDate,
} from '@/components/calendar/calendar-client-search';
import { formatPhoneForDisplay } from '@/lib/phone/e164';
import { buildGuestListPath } from '@/lib/queries/useGuests';

/** Pins the app's toolbar search to the web's `useGuestToolbarSearch` numbers and copy. */
describe('calendar client search helpers', () => {
  it('uses the web debounce, minimum length and result limit', () => {
    expect(CLIENT_SEARCH_DEBOUNCE_MS).toBe(280);
    expect(CLIENT_SEARCH_MIN_LENGTH).toBe(2);
    expect(CLIENT_SEARCH_RESULT_LIMIT).toBe(10);
  });

  it('sends the same guest list query as the web toolbar', () => {
    const path = buildGuestListPath(clientSearchParams('  ada  '));
    const query = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/api/venue/guests?')).toBe(true);
    expect(query.get('search')).toBe('ada');
    expect(query.get('filter')).toBe('all');
    expect(query.get('sort')).toBe('name_asc');
    expect(query.get('page')).toBe('0');
    expect(query.get('limit')).toBe('10');
  });

  it('labels a result as the web does', () => {
    expect(clientSearchResultLabel({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace');
    expect(
      clientSearchResultLabel({ first_name: 'Ada', last_name: null, identifiability_tier: 'anonymous' }),
    ).toBe('Anonymous');
    expect(clientSearchResultLabel({ first_name: null, last_name: null })).toBe('Guest');
  });

  it('subtitles a result with email and phone, or says there are none', () => {
    expect(clientSearchResultSubtitle({ email: 'ada@example.com', phone: null })).toBe('ada@example.com');
    expect(clientSearchResultSubtitle({ email: ' ', phone: null })).toBe('No contact details on file');
    // The phone in the app's readable form, as every contact row shows it.
    expect(clientSearchResultSubtitle({ email: 'ada@example.com', phone: '+447911123456' })).toBe(
      `ada@example.com · ${formatPhoneForDisplay('+447911123456')}`,
    );
    expect(clientSearchResultSubtitle({ email: null, phone: '+447911123456' })).toBe(
      formatPhoneForDisplay('+447911123456'),
    );
  });

  it('shows the hint below two characters and the empty state only after a finished search', () => {
    expect(
      clientSearchStatus({ query: 'a', debouncedQuery: 'a', loading: false, hasError: false, resultCount: 0 }),
    ).toEqual({ showHint: true, showEmpty: false, searching: false });
    expect(
      clientSearchStatus({ query: 'ad', debouncedQuery: 'ad', loading: true, hasError: false, resultCount: 0 }),
    ).toEqual({ showHint: false, showEmpty: false, searching: true });
    expect(
      clientSearchStatus({ query: 'ad', debouncedQuery: 'ad', loading: false, hasError: false, resultCount: 0 }),
    ).toEqual({ showHint: false, showEmpty: true, searching: true });
    expect(
      clientSearchStatus({ query: 'ad', debouncedQuery: 'ad', loading: false, hasError: true, resultCount: 0 })
        .showEmpty,
    ).toBe(false);
    expect(
      clientSearchStatus({ query: '', debouncedQuery: '', loading: false, hasError: false, resultCount: 0 }),
    ).toEqual({ showHint: false, showEmpty: false, searching: false });
  });

  it('jumps to the booking day and its own calendar when the diary has it', () => {
    const row = {
      id: 'b1',
      booking_date: '2026-11-03',
      calendar_id: 'cal-2',
      practitioner_id: 'prac-legacy',
    };
    expect(calendarJumpForBooking(row, ['cal-1', 'cal-2'])).toEqual({
      bookingId: 'b1',
      date: '2026-11-03',
      calendarId: 'cal-2',
    });
    // Falls back to the practitioner id, then to no calendar at all.
    expect(calendarJumpForBooking({ ...row, calendar_id: null }, ['prac-legacy']).calendarId).toBe(
      'prac-legacy',
    );
    expect(calendarJumpForBooking(row, ['cal-9']).calendarId).toBeNull();
  });

  it('formats a history date with its year', () => {
    expect(formatClientBookingDate('2026-10-09')).toBe('Fri 9 Oct 2026');
    expect(formatClientBookingDate('not-a-date')).toBe('not-a-date');
  });
});
