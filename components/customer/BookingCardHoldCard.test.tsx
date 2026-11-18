/**
 * A customer's booking, its card part (card-on-file-plan §5.4): Secured by your saved card with
 * "Remove my saved card" for the card kept for that business or its collective, Waiting for a card
 * with "Add a card", fees charged or refunded, and nothing for an ended hold or an older server.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { AccountCardsView } from '@/lib/queries/useAccountCards';

import { BookingCardHoldCard, bookingCardHoldWords } from './BookingCardHoldCard';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/payments/customer-card-sheet', () => ({ presentCardSheet: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticTap: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

const mockStart = jest.fn();
jest.mock('@/components/customer/profile/RemoveSavedCardFlow', () => ({
  useRemoveSavedCardFlow: () => ({ start: mockStart, sheet: null }),
}));

let mockView: AccountCardsView | undefined;
jest.mock('@/lib/queries/useAccountCards', () => ({
  ...jest.requireActual('@/lib/queries/useAccountCards'),
  useAccountCards: () => ({ data: mockView }),
}));

const card = {
  kind: 'card_on_file' as const,
  id: 'card-1',
  venue_id: null,
  label: 'Visa ending 4242',
  expiry: '08/28',
  description: 'Secures your bookings with every member.',
  removal_text: 'It will be deleted now.',
};

beforeEach(() => {
  mockStart.mockReset();
  mockView = {
    grouped: true,
    groups: [{ key: 'collective:c-1', kind: 'collective', name: 'The Beauty Parlour', members: [{ venue_id: 'v-1', name: "Steph's" }], cards: [card] }],
    addTargets: [],
  };
});

const held = { fee_pence: 1000, state: 'held' as const, charged_pence: null, charged_at: null };

describe('BookingCardHoldCard', () => {
  it('says the saved card secures the booking and removes the matching card', async () => {
    await render(<BookingCardHoldCard hold={held} venueId="v-1" currency="GBP" manageUrl={null} />);
    expect(screen.getByText('Secured by your saved card')).toBeTruthy();
    expect(screen.getByText('No-show fee up to £10.00.')).toBeTruthy();
    // No manage link on a signed-in read: "This wasn't me" lives on the web manage page.
    expect(screen.queryByText("This wasn't me")).toBeNull();
    await fireEvent.press(screen.getByText('Remove my saved card'));
    expect(mockStart).toHaveBeenCalledWith(card);
  });

  it('offers "This wasn\'t me" when the server gives a manage link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<BookingCardHoldCard hold={held} venueId="v-1" manageUrl="https://resneo.test/b/abc" />);
    await fireEvent.press(screen.getByText("This wasn't me"));
    expect(open).toHaveBeenCalledWith('https://resneo.test/b/abc');
  });

  it('hides Remove when no saved card matches the business', async () => {
    await render(<BookingCardHoldCard hold={held} venueId="v-9" />);
    expect(screen.queryByText('Remove my saved card')).toBeNull();
  });

  it('opens the card request while waiting for a card', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(
      <BookingCardHoldCard
        hold={{ fee_pence: 1000, state: 'awaiting_card', charged_pence: null, charged_at: null, payment_link: 'https://resneo.test/p/x' }}
        venueId="v-1"
      />,
    );
    expect(screen.getByText('Add a card to secure this booking')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add a card'));
    expect(open).toHaveBeenCalledWith('https://resneo.test/p/x');
  });

  it('shows nothing for an ended hold or an older server', async () => {
    await render(<BookingCardHoldCard hold={{ ...held, state: 'released' }} venueId="v-1" />);
    expect(screen.queryByTestId('booking-card-hold')).toBeNull();
    await render(<BookingCardHoldCard hold={undefined} venueId="v-1" />);
    expect(screen.queryByTestId('booking-card-hold')).toBeNull();
  });

  it('words a charged and a refunded fee', () => {
    expect(bookingCardHoldWords({ ...held, state: 'charged', charged_pence: 2500 }, 'EUR')?.title).toBe(
      'A no-show fee of €25.00 was charged.',
    );
    expect(bookingCardHoldWords({ ...held, state: 'refunded' })?.title).toBe('The no-show fee was refunded.');
  });
});
