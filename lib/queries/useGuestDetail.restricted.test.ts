/**
 * A client's history for a person set to "Hidden" (web roles plan A2b, §5.11, UR20). The server
 * sends someone else's visit with only its date, model, labels, who it was with, the service and
 * the status. Every history list sorts and groups on the time and the other fields, so the gaps are
 * filled with empty values on the way in; the row keeps `restricted` so no screen opens it.
 */
jest.mock('@/lib/api/client', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/client';
import { splitGuestHistory } from '@/lib/guests/guest-history-sections';
import { fetchGuestDetail, normalizeGuestDetail, normalizeGuestHistoryRow } from '@/lib/queries/useGuestDetail';
import type { GuestBookingHistoryRow, GuestDetailResponse } from '@/types/guest-detail';

const SERVER_RESTRICTED = {
  id: 'b-theirs',
  restricted: true,
  booking_date: '2026-03-02',
  booking_model: 'unified_scheduling',
  kind_label: 'Appointment',
  detail_label: 'Colour',
  practitioner_name: 'Marcus',
  calendar_name: 'Marcus',
  service_name: 'Colour',
  status: 'Completed',
} as unknown as GuestBookingHistoryRow;

const OWN: GuestBookingHistoryRow = {
  id: 'b-mine',
  booking_date: '2026-03-01',
  booking_time: '10:00:00',
  party_size: 1,
  status: 'Completed',
  deposit_status: null,
  deposit_amount_pence: null,
  booking_model: 'unified_scheduling',
  kind_label: 'Appointment',
  detail_label: 'Cut',
  practitioner_name: 'Sam',
  service_name: 'Cut',
  area_name: null,
};

function response(history: GuestBookingHistoryRow[]): GuestDetailResponse {
  return { booking_history: history } as unknown as GuestDetailResponse;
}

describe('normalizeGuestHistoryRow', () => {
  it('fills what a restricted row leaves out, and keeps what it says', () => {
    expect(normalizeGuestHistoryRow(SERVER_RESTRICTED)).toEqual({
      ...SERVER_RESTRICTED,
      booking_time: '',
      party_size: null,
      deposit_status: null,
      deposit_amount_pence: null,
      area_name: null,
    });
  });

  it('leaves an ordinary row untouched', () => {
    expect(normalizeGuestHistoryRow(OWN)).toBe(OWN);
  });
});

describe('normalizeGuestDetail', () => {
  it('leaves a history with nothing restricted untouched (everyone not set to Hidden)', () => {
    const detail = response([OWN]);
    expect(normalizeGuestDetail(detail)).toBe(detail);
  });

  it('makes a mixed history safe to group', () => {
    const detail = normalizeGuestDetail(response([SERVER_RESTRICTED, OWN]));
    const sections = splitGuestHistory(detail.booking_history, new Date('2026-10-22T09:00:00Z'), 'Europe/London');
    expect(sections.previous.map((r) => r.id).sort()).toEqual(['b-mine', 'b-theirs']);
  });

  it('is what the fetch hands on', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(response([SERVER_RESTRICTED]));
    const detail = await fetchGuestDetail('g1', 80, 'token');
    expect(apiFetch).toHaveBeenCalledWith('/api/venue/guests/g1?booking_history_limit=80', { accessToken: 'token' });
    expect(detail.booking_history[0]).toMatchObject({ id: 'b-theirs', restricted: true, booking_time: '' });
  });
});
