/**
 * BookingAddCardSheet: the desk screen for a booking's client says where the card will be kept,
 * the business's name until the client record answers, then the collective's.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import { BookingAddCardSheet } from './BookingAddCardSheet';

let mockSection: unknown = undefined;
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useBookingMutations', () => ({ invalidateBookingCaches: jest.fn() }));
jest.mock('@/lib/queries/useCardsOnFile', () => ({ useGuestCardOnFile: () => ({ data: mockSection }) }));
jest.mock('@/components/cards/AddCardSheet', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    AddCardSheet: (p: { savedWith: string; scope: string; clientFirstName: string; bookingId: string }) =>
      React.createElement(Text, null, `${p.clientFirstName} ${p.bookingId} ${p.scope} ${p.savedWith}`),
  };
});

describe('BookingAddCardSheet', () => {
  it("uses the business's name until the client record answers", async () => {
    mockSection = undefined;
    await render(
      <BookingAddCardSheet onClose={jest.fn()} guestId="g-1" bookingId="b-1" clientName="Ada Lovelace" hasContact businessName="Sage Studio" />,
    );
    expect(screen.getByText('Ada b-1 business Sage Studio')).toBeTruthy();
  });

  it('says the collective when the card would be kept there', async () => {
    mockSection = { add_saves_with: { scope: 'collective', name: 'The Beauty Parlour' } };
    await render(
      <BookingAddCardSheet onClose={jest.fn()} guestId="g-1" bookingId="b-1" clientName="Ada" hasContact businessName="Sage Studio" />,
    );
    expect(screen.getByText('Ada b-1 collective The Beauty Parlour')).toBeTruthy();
  });
});
