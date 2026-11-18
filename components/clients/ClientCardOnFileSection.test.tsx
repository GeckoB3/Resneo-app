/**
 * The client record's Card on file section (card-on-file-plan §6.6): a business card and a
 * collective card with its members, till cards, none, a business that can't take cards, admin
 * removal with each reason (a stop sends bookings back), no removal for non-admins, history
 * collapsed, an older server (hidden) and a load error.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { GuestCardOnFile } from '@/lib/queries/useCardsOnFile';

import { ClientCardOnFileSection, protectsLine } from './ClientCardOnFileSection';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticSelect: jest.fn(), hapticTap: jest.fn() }));

/** Render Sheet children inline (avoids gesture-handler/Modal). */
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockAddCardProps: unknown[] = [];
jest.mock('@/components/cards/AddCardSheet', () => ({
  AddCardSheet: (props: { visible: boolean }) => {
    mockAddCardProps.push(props);
    const React = require('react');
    const { Text } = require('react-native');
    return props.visible ? React.createElement(Text, null, 'ADD CARD SHEET') : null;
  },
}));

let mockQuery: { data?: GuestCardOnFile | null; isSuccess: boolean; isError: boolean; refetch: jest.Mock };
const mockRemove = jest.fn();
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  ...jest.requireActual('@/lib/queries/useCardsOnFile'),
  useGuestCardOnFile: () => mockQuery,
  useRemoveGuestCard: () => ({ mutate: mockRemove, isPending: false }),
}));

const collectiveCard: NonNullable<GuestCardOnFile['card']> = {
  id: 'card-1',
  label: 'Visa ending 4242',
  expiry: '08/28',
  cardholder_name: 'A Smith',
  saved_at: '2026-11-16T10:00:00Z',
  scope: 'collective',
  saved_with: 'The Beauty Parlour',
  members: [
    { venue_id: 'v1', name: "Steph's" },
    { venue_id: 'v2', name: 'Sage Studio' },
  ],
  linked_by: 'Matched by email and phone online',
  protects_upcoming: 3,
};

function data(over: Partial<GuestCardOnFile> = {}): GuestCardOnFile {
  return {
    card: collectiveCard,
    till_cards: [],
    history: [],
    can_take_cards: true,
    can_remove: true,
    removal_text: 'It will be deleted now.',
    add_saves_with: { scope: 'collective', name: 'The Beauty Parlour' },
    ...over,
  };
}

function setData(d: GuestCardOnFile | null) {
  mockQuery = { data: d, isSuccess: true, isError: false, refetch: jest.fn() };
}

const props = { guestId: 'g-1', clientName: 'Amy Smith', hasContact: true };

beforeEach(() => {
  mockRemove.mockReset();
  mockAddCardProps.length = 0;
  setData(data());
});

describe('ClientCardOnFileSection', () => {
  it('shows a collective card, how it was linked, what it protects, and its members on tap', async () => {
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText('Protected')).toBeTruthy();
    expect(screen.getByText(/, expires 08\/28, cardholder A Smith\./)).toBeTruthy();
    expect(
      screen.getByText('Saved with The Beauty Parlour on 16 November. Protects bookings with every member.'),
    ).toBeTruthy();
    expect(screen.getByText('Matched by email and phone online.')).toBeTruthy();
    expect(screen.getByText('Protects 3 upcoming bookings.')).toBeTruthy();
    expect(screen.queryByTestId('card-members-sheet')).toBeNull();
    await fireEvent.press(screen.getByLabelText('See members of The Beauty Parlour'));
    expect(screen.getByText('Sage Studio')).toBeTruthy();
    expect(screen.getByText("Steph's")).toBeTruthy();
  });

  it('a business card has no members link', async () => {
    setData(data({ card: { ...collectiveCard, scope: 'business', saved_with: "Steph's", members: [], protects_upcoming: 0 } }));
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText("Saved with Steph's on 16 November.")).toBeTruthy();
    expect(screen.queryByText('See members')).toBeNull();
    expect(screen.getByText('Protects no upcoming bookings here yet.')).toBeTruthy();
  });

  it('lists till cards here', async () => {
    setData(
      data({
        till_cards: [
          { id: 't1', label: 'Mastercard ending 1111', expiry: '01/27', protects_bookings: true },
          { id: 't2', label: 'Visa ending 0005', expiry: null, protects_bookings: false },
        ],
      }),
    );
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText('Till cards here')).toBeTruthy();
    expect(screen.getByText('Mastercard ending 1111, expires 01/27. Also protects bookings here.')).toBeTruthy();
    expect(screen.getByText('Visa ending 0005. For payments only.')).toBeTruthy();
  });

  it('with no card offers Add card, which opens the desk sheet for the collective', async () => {
    setData(data({ card: null }));
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText('No card on file.')).toBeTruthy();
    expect(screen.queryByText('Remove card')).toBeNull();
    await fireEvent.press(screen.getByText('Add card'));
    expect(screen.getByText('ADD CARD SHEET')).toBeTruthy();
    expect(mockAddCardProps[mockAddCardProps.length - 1]).toEqual(
      expect.objectContaining({ guestId: 'g-1', clientFirstName: 'Amy', hasContact: true, savedWith: 'The Beauty Parlour', scope: 'collective' }),
    );
  });

  it('says a card is not possible when the business cannot take card payments', async () => {
    setData(data({ card: null, can_take_cards: false }));
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText("Card not possible: this business can't take card payments yet.")).toBeTruthy();
    expect(screen.queryByText('Add card')).toBeNull();
  });

  it('lets an admin remove the card with a reason, after saying what happens', async () => {
    mockRemove.mockImplementation((_input, opts) => opts.onSuccess({ ok: true, status: 'removed', returned_bookings: 0 }));
    await render(<ClientCardOnFileSection {...props} />);
    await fireEvent.press(screen.getByText('Remove card'));
    expect(screen.getByText('It will be deleted now.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Client asked'));
    await fireEvent.press(screen.getAllByText('Remove card')[1]);
    expect(mockRemove.mock.calls[0][0]).toEqual({ reason: 'client_asked' });
    expect(screen.getByTestId('client-card-message').props.children).toBe(
      'Card removed. It will not be used for new bookings.',
    );
  });

  it('stops a lost or stolen card and says the bookings went back', async () => {
    mockRemove.mockImplementation((_input, opts) => opts.onSuccess({ ok: true, status: 'stopped', returned_bookings: 2 }));
    await render(<ClientCardOnFileSection {...props} />);
    await fireEvent.press(screen.getByText('Remove card'));
    await fireEvent.press(screen.getByLabelText('Card lost or stolen'));
    expect(screen.getByText(/The card is stopped\./)).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Remove card')[1]);
    expect(mockRemove.mock.calls[0][0]).toEqual({ reason: 'lost_or_stolen' });
    expect(screen.getByTestId('client-card-message').props.children).toBe(
      'Card stopped. 2 bookings went back to Waiting for card and Amy has been sent a card request.',
    );
  });

  it('sends Other as the reason', async () => {
    await render(<ClientCardOnFileSection {...props} />);
    await fireEvent.press(screen.getByText('Remove card'));
    await fireEvent.press(screen.getByLabelText('Other'));
    await fireEvent.press(screen.getAllByText('Remove card')[1]);
    expect(mockRemove.mock.calls[0][0]).toEqual({ reason: 'other' });
  });

  it('offers no removal to someone who is not an admin', async () => {
    setData(data({ can_remove: false }));
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.queryByText('Remove card')).toBeNull();
    expect(screen.getByText('Add a new card')).toBeTruthy();
  });

  it('keeps the history collapsed until asked', async () => {
    setData(data({ history: [{ id: 'h1', at: '2026-11-16T10:00:00Z', text: 'Card saved by the client' }] }));
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.queryByText(/Card saved by the client/)).toBeNull();
    await fireEvent.press(screen.getByText('History (1)'));
    expect(screen.getByText(/: Card saved by the client$/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Hide history'));
    expect(screen.queryByText(/Card saved by the client/)).toBeNull();
  });

  it('is hidden on an older server without the route', async () => {
    setData(null);
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.queryByTestId('client-card-on-file')).toBeNull();
  });

  it('says so when the section cannot load', async () => {
    mockQuery = { data: undefined, isSuccess: false, isError: true, refetch: jest.fn() };
    await render(<ClientCardOnFileSection {...props} />);
    expect(screen.getByText("We couldn't load the card on file.")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockQuery.refetch).toHaveBeenCalled();
  });

  it('words what a card protects', () => {
    expect(protectsLine(1)).toBe('Protects 1 upcoming booking.');
  });
});
