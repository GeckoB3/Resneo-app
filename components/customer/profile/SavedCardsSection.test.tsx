/**
 * The customer's one "Saved cards" section (card-on-file-plan §5.5, §5.6): grouped by where the
 * card is kept, "See members" for a collective, removal with the server's words, Add card with a
 * picker (or straight in with one choice), and an older server keeping the per-business list.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AccountCardGroup, AccountCardsView } from '@/lib/queries/useAccountCards';

import { SavedCardsSection } from './SavedCardsSection';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/payments/customer-card-sheet', () => ({ presentCardSheet: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticTap: jest.fn(), hapticSuccess: jest.fn(), hapticSelect: jest.fn() }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/ui/ConfirmSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ConfirmSheet: (p: { visible: boolean; title: string; message: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void }) =>
      p.visible
        ? React.createElement(
            View,
            null,
            React.createElement(Text, null, p.title),
            React.createElement(Text, null, p.message),
            React.createElement(Pressable, { onPress: p.onConfirm }, React.createElement(Text, null, p.confirmLabel)),
            React.createElement(Text, null, p.cancelLabel),
          )
        : null,
  };
});

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockView: AccountCardsView | undefined;
const mockStart = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/queries/useAccountCards', () => ({
  ...jest.requireActual('@/lib/queries/useAccountCards'),
  useAccountCards: () => ({ data: mockView, isLoading: false, isError: false, refetch: jest.fn() }),
  useStartAccountCardSetup: () => ({ mutate: mockStart, isPending: false }),
  useRemoveAccountCard: () => ({ mutate: mockRemove, isPending: false }),
  useCardRemovalText: () => () => Promise.resolve('It stays saved for your 2 upcoming bookings until 23 December, and is then deleted.'),
}));
jest.mock('@/lib/queries/useSaveAccountCard', () => ({ useSaveAccountCard: () => ({ mutate: mockSave, isPending: false }) }));
jest.mock('@/lib/queries/useCustomerVenues', () => ({
  useCustomerVenueRelationships: () => ({ data: { venues: [{ venue_id: 'v-1', venue_name: "Steph's" }] } }),
}));
jest.mock('@/lib/queries/useCustomerAccount', () => ({
  useSavedCards: () => ({ data: { payment_methods: [{ id: 'pm_9', brand: 'visa', last4: '1111' }] }, isLoading: false }),
  useRemoveCard: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useCustomerPurchase', () => ({ useCustomerPurchase: () => ({ mutate: jest.fn(), isPending: false }) }));

const collective: AccountCardGroup = {
  key: 'collective:c-1',
  kind: 'collective',
  name: 'The Beauty Parlour',
  members: [
    { venue_id: 'v-1', name: "Steph's" },
    { venue_id: 'v-2', name: 'Sage Studio' },
  ],
  cards: [
    {
      kind: 'card_on_file',
      id: 'card-1',
      venue_id: null,
      label: 'Visa ending 4242',
      expiry: '08/28',
      description: 'Secures your bookings with every member.',
      removal_text: 'It will be deleted now.',
    },
  ],
};
const till: AccountCardGroup = {
  key: 'business:v-3',
  kind: 'business',
  name: 'Sage Studio',
  members: [],
  cards: [
    {
      kind: 'till_card',
      id: 'pm_1',
      venue_id: 'v-3',
      label: 'Mastercard ending 1111',
      expiry: null,
      description: 'For payments you agree to at Sage Studio, and no-show fees there.',
      removal_text: 'It will be removed now.',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockView = {
    grouped: true,
    groups: [collective, till],
    addTargets: [
      { key: 'collective:c-1', kind: 'collective', name: 'The Beauty Parlour', guest_id: 'g-1' },
      { key: 'business:v-3', kind: 'business', name: 'Sage Studio', guest_id: 'g-3' },
    ],
  };
});

describe('SavedCardsSection', () => {
  it('lists cards grouped by where they are kept, with See members for a collective', async () => {
    await render(<SavedCardsSection />);
    expect(screen.getByText('The Beauty Parlour')).toBeTruthy();
    expect(screen.getByText('Visa ending 4242, expires 08/28')).toBeTruthy();
    expect(screen.getByText('Secures your bookings with every member.')).toBeTruthy();
    expect(screen.getByText('Mastercard ending 1111')).toBeTruthy();
    expect(screen.queryByText('Sage Studio', { exact: true })).toBeTruthy();
    // Replace only for the card on file.
    expect(screen.getAllByText('Replace card')).toHaveLength(1);
    await fireEvent.press(screen.getByText('See members'));
    expect(screen.getByText("Steph's")).toBeTruthy();
    expect(screen.getByText('Hide members')).toBeTruthy();
  });

  it('says so when there are none', async () => {
    mockView = { grouped: true, groups: [], addTargets: [] };
    await render(<SavedCardsSection />);
    expect(screen.getByText('No saved cards.')).toBeTruthy();
    expect(screen.queryByText('Add card')).toBeNull();
  });

  it('asks before removing, with what happens to the bookings it protects', async () => {
    await render(<SavedCardsSection />);
    await fireEvent.press(screen.getAllByText('Remove')[0]);
    expect(screen.getByText('Remove your saved card?')).toBeTruthy();
    expect(await screen.findByText('It stays saved for your 2 upcoming bookings until 23 December, and is then deleted.')).toBeTruthy();
    expect(screen.getByText('Keep card')).toBeTruthy();
    mockRemove.mockImplementation((_args, opts) => opts.onSuccess({ status: 'removed', text: null }));
    await fireEvent.press(screen.getByText('Remove card'));
    expect(mockRemove.mock.calls[0][0]).toEqual({ card: collective.cards[0], acknowledge: false });
    expect(mockToast.success).toHaveBeenCalledWith('Card removed.');
  });

  it('removes a till card with its own words', async () => {
    await render(<SavedCardsSection />);
    await fireEvent.press(screen.getAllByText('Remove')[1]);
    expect(await screen.findByText('It stays saved for your 2 upcoming bookings until 23 December, and is then deleted.')).toBeTruthy();
    mockRemove.mockImplementation((_args, opts) => opts.onSuccess({ status: 'needs_confirmation', message: 'This card pays for your membership.' }));
    await fireEvent.press(screen.getByText('Remove card'));
    expect(screen.getByText('This card pays for your membership.')).toBeTruthy();
    expect(screen.getByText('Remove anyway')).toBeTruthy();
  });

  it('Add card picks where to save it, then shows the agreement and saves', async () => {
    mockStart.mockImplementation((_key, opts) =>
      opts.onSuccess({
        client_secret: 's',
        setup_intent_id: 'seti_1',
        heading: 'Save a card',
        button_label: 'Save card',
        scope: 'business',
        scope_name: 'Sage Studio',
        members: [],
        consent_text: 'Your card is saved with Sage Studio. No payment is taken now.',
      }),
    );
    await render(<SavedCardsSection />);
    await fireEvent.press(screen.getByText('Add card'));
    expect(screen.getByText('Choose where to save your card.')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Sage Studio').at(-1)!);
    expect(mockStart.mock.calls[0][0]).toBe('business:v-3');
    expect(screen.getByText('Your card is saved with Sage Studio. No payment is taken now.')).toBeTruthy();
    mockSave.mockImplementation((_s, opts) => opts.onSuccess({ status: 'failed', message: 'Your bank declined this card. Try another card.' }));
    await fireEvent.press(screen.getByText('Save card'));
    expect(screen.getByText('Your bank declined this card. Try another card.')).toBeTruthy();
    mockSave.mockImplementation((_s, opts) => opts.onSuccess({ status: 'saved', label: 'Visa ending 4242', securedBookings: 0 }));
    await fireEvent.press(screen.getByText('Save card'));
    expect(mockToast.success).toHaveBeenCalledWith('Card saved. Visa ending 4242 is saved with Sage Studio.');
  });

  it('goes straight to the card screen with one place to save, and stays quiet when closed', async () => {
    mockView = { grouped: true, groups: [], addTargets: [{ key: 'business:v-3', kind: 'business', name: 'Sage Studio', guest_id: 'g' }] };
    mockStart.mockImplementation((_key, opts) =>
      opts.onSuccess({ client_secret: 's', setup_intent_id: 'i', heading: 'Save a card', button_label: 'Save card', scope: 'business', scope_name: 'Sage Studio', members: [], consent_text: 'Agreement.' }),
    );
    await render(<SavedCardsSection />);
    await fireEvent.press(screen.getByText('Add card'));
    expect(screen.queryByText('Choose where to save your card.')).toBeNull();
    expect(screen.getByTestId('save-card-sheet')).toBeTruthy();
    mockSave.mockImplementation((_s, opts) => opts.onSuccess({ status: 'cancelled' }));
    await fireEvent.press(screen.getByText('Save card'));
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-card-sheet')).toBeTruthy();
  });

  it('keeps the per-business list on an older server', async () => {
    mockView = { grouped: false };
    await render(<SavedCardsSection />);
    expect(screen.getByText('Visa ending 1111')).toBeTruthy();
    expect(screen.getByText('Add a card')).toBeTruthy();
  });
});
