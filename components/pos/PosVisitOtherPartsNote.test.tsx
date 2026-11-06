/**
 * The till's note on a sale for a visit across businesses (web 2026-11-05): the other business's
 * services and what they come to, and that the other business takes that payment.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client' } }),
}));
let mockVisitDetail: unknown = null;
jest.mock('@/lib/queries/useVisitPartnerLines', () => ({ useVisitDetail: () => mockVisitDetail }));

import { PosVisitOtherPartsNote } from '@/components/pos/PosVisitOtherPartsNote';

const lines = [
  { booking_id: 'a', linked_visit_id: 'lv', venue_id: 'v-aura', venue_name: 'Aura Hair Studio', booking_date: '2026-11-07', start_time: '09:30', end_time: '10:30', service_name: 'Cut & Blow Dry', person_name: 'Aisha', status: 'Booked', own: true, price_pence: 5500 },
  { booking_id: 'b', linked_visit_id: 'lv', venue_id: 'v-light', venue_name: 'Light 16', booking_date: '2026-11-07', start_time: '10:30', end_time: '10:50', service_name: 'Root Tint', person_name: 'Andrew', status: 'Booked', own: false, price_pence: 6500 },
];
const part = (paid: number) => [
  { venue_id: 'v-aura', venue_name: 'Aura Hair Studio', own: true, total_pence: 5500, paid_pence: 0, outstanding_pence: 5500 },
  { venue_id: 'v-light', venue_name: 'Light 16', own: false, total_pence: 6500, paid_pence: paid, outstanding_pence: 6500 - paid },
];

describe('PosVisitOtherPartsNote', () => {
  afterEach(() => {
    mockVisitDetail = null;
  });

  it("says what the other business's services come to and that it takes that payment", async () => {
    mockVisitDetail = { lines, parts: part(0) };
    await render(<PosVisitOtherPartsNote linkedVisitId="lv" />);
    expect(
      screen.getByText(
        'This visit also has Root Tint with Andrew at Light 16 (£65.00). Light 16 takes that payment, so it is not on this sale.',
      ),
    ).toBeTruthy();
  });

  it('says the other business has been paid once it has', async () => {
    mockVisitDetail = { lines, parts: part(6500) };
    await render(<PosVisitOtherPartsNote linkedVisitId="lv" />);
    expect(screen.getByText('This visit also has Root Tint with Andrew at Light 16, which they have been paid for.')).toBeTruthy();
  });

  it('says nothing for a sale outside a visit across businesses, or against an older server', async () => {
    await render(<PosVisitOtherPartsNote linkedVisitId={null} />);
    expect(screen.queryByText(/This visit also has/)).toBeNull();
    mockVisitDetail = { lines, parts: [], legacy: true };
    await render(<PosVisitOtherPartsNote linkedVisitId="lv" />);
    expect(screen.queryByText(/This visit also has/)).toBeNull();
  });
});
