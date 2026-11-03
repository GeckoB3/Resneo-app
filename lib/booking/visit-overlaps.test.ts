import { ApiError } from '@/lib/api/client';
import {
  VISIT_OVERLAP_MESSAGE,
  visitOverlapNote,
  visitOverlapRefusal,
  visitTwoPlacesNote,
  type VisitOverlap,
} from '@/lib/booking/visit-overlaps';

const MANI: VisitOverlap = {
  booking_id: 'cut',
  other_id: 'mani',
  other_name: 'Gel Manicure with Steph',
  venue_name: null,
  start: '10:45',
};

describe('visitOverlapNote', () => {
  it('says where the client would be, in the web wording', () => {
    expect(visitOverlapNote([MANI])).toBe(
      'Gel Manicure with Steph is at 10:45, so the client would be in two places.',
    );
  });

  it('names another business when the server does', () => {
    expect(visitOverlapNote([{ ...MANI, venue_name: 'SV Nails' }])).toBe(
      'Gel Manicure with Steph at SV Nails is at 10:45, so the client would be in two places.',
    );
  });

  it('is null when nothing overlaps', () => {
    expect(visitOverlapNote([])).toBeNull();
    expect(visitOverlapNote(undefined)).toBeNull();
  });
});

describe('visitTwoPlacesNote', () => {
  it('builds the drag note from the grid', () => {
    expect(visitTwoPlacesNote({ serviceName: 'Gel Manicure', personName: 'Steph', start: '10:45:00' })).toBe(
      'Gel Manicure with Steph is at 10:45, so the client would be in two places.',
    );
  });

  it('falls back for an unnamed service and person', () => {
    expect(visitTwoPlacesNote({ serviceName: ' ', start: '09:00' })).toBe(
      'Another service is at 09:00, so the client would be in two places.',
    );
  });

  it('never uses an em-dash', () => {
    const emDash = String.fromCharCode(0x2014);
    expect(visitTwoPlacesNote({ serviceName: 'Cut', personName: 'Aisha', start: '10:00' })).not.toContain(emDash);
    expect(VISIT_OVERLAP_MESSAGE).not.toContain(emDash);
  });
});

describe('visitOverlapRefusal', () => {
  it('reads a 409 visit_overlap, preferring the overlap note', () => {
    const error = new ApiError(VISIT_OVERLAP_MESSAGE, 409, {
      error: VISIT_OVERLAP_MESSAGE,
      code: 'visit_overlap',
      visit_overlaps: [MANI],
    });
    expect(visitOverlapRefusal(error)).toEqual({
      note: 'Gel Manicure with Steph is at 10:45, so the client would be in two places.',
      message: VISIT_OVERLAP_MESSAGE,
    });
  });

  it('falls back to the message when the server listed no overlap', () => {
    const error = new ApiError(VISIT_OVERLAP_MESSAGE, 409, { error: VISIT_OVERLAP_MESSAGE, code: 'visit_overlap' });
    expect(visitOverlapRefusal(error)?.note).toBe(VISIT_OVERLAP_MESSAGE);
  });

  it('ignores every other refusal', () => {
    expect(visitOverlapRefusal(new ApiError('Taken', 409, { error: 'Taken', code: 'SLOT_NO_LONGER_AVAILABLE' }))).toBeNull();
    expect(visitOverlapRefusal(new Error('offline'))).toBeNull();
  });
});
