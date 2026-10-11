/**
 * A client's cards on file in the payment sheet (UX spec §3.19.5), as tiles in its grid (Part 2
 * mock-up 1): one per card, naming the card and when and where the client agreed, held while the
 * amount can't be taken.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { timezone: 'Europe/London' },
    terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' },
  }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
let mockCards: unknown;
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  useGuestSavedCards: () => ({ data: mockCards }),
}));

import { SavedCardMethods } from '@/components/pos/SavedCards';
import { makeSale } from '@/lib/pos/test-sale';

const card = {
  id: 'card-1',
  brand: 'visa',
  last4: '4242',
  exp_month: 12,
  exp_year: 2028,
  consent_at: '2026-10-03T10:00:00Z',
  consent_channel: 'reader',
};
const sale = { ...makeSale(), guest: { id: 'g-1', name: 'Ada Lovelace', email: null, phone: null } };

beforeEach(() => {
  mockCards = { card_on_file_enabled: true, cards: [card] };
});

it('shows each card as a tile with when and where the client agreed, and chooses it', async () => {
  const onChoose = jest.fn();
  await render(<SavedCardMethods sale={sale} onChoose={onChoose} />);
  expect(screen.getByText('Card on file')).toBeTruthy();
  expect(screen.getByText('Visa ending 4242')).toBeTruthy();
  expect(screen.getByText('Saved with permission on 3 October 2026, at the desk')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Card on file: Visa ending 4242' }));
  });
  expect(onChoose).toHaveBeenCalledWith(card);
});

it('is held while the amount to pay cannot be taken', async () => {
  await render(<SavedCardMethods sale={sale} onChoose={jest.fn()} disabled />);
  expect(screen.getByRole('button', { name: 'Card on file: Visa ending 4242' })).toBeDisabled();
});

it('shows nothing when cards on file are off', async () => {
  mockCards = { card_on_file_enabled: false, cards: [card] };
  await render(<SavedCardMethods sale={sale} onChoose={jest.fn()} />);
  expect(screen.queryByText('Card on file')).toBeNull();
});
