/**
 * The visit card's read-only line for another business's service (web split-visit plan 7.3), and,
 * since 2026-11-05, whether that business has taken payment for its part.
 */
import { partnerLineText, type VisitPartnerLine } from '@/lib/queries/useVisitPartnerLines';

const line = (over: Partial<VisitPartnerLine> = {}): VisitPartnerLine => ({
  booking_id: 'p-1',
  linked_visit_id: 'lv',
  venue_id: 'v-l16',
  venue_name: 'Light 16',
  booking_date: '2026-11-05',
  start_time: '09:00',
  end_time: '09:30',
  service_name: 'Test',
  person_name: 'Andrew',
  status: 'Booked',
  ...over,
});

describe('partnerLineText', () => {
  it('names the service, person, business and status, as the web does', () => {
    expect(partnerLineText(line())).toBe('09:00 Test with Andrew, Light 16, Booked');
  });

  it('says when that business has taken payment, so nobody sends the client there to pay', () => {
    expect(partnerLineText(line({ paid: true }))).toBe('09:00 Test with Andrew, Light 16, Booked, paid');
  });
});
