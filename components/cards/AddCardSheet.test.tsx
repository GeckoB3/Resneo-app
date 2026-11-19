/**
 * AddCardSheet (card-on-file-plan §6.7): the three ways in, what each says about its reach, the QR
 * code's waiting state and every outcome in words, and the hand-over page's way back.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { LinkedVenueContext } from '@/providers/LinkedVenueProvider';

import {
  AddCardSheet,
  addCardReachLine,
  deskOutcomeText,
  isDeskHandBackNavigation,
  READER_OTHER_BUSINESS_LINE,
} from './AddCardSheet';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticTap: jest.fn(), hapticSelect: jest.fn() }));

/** Render Sheet children inline (avoids gesture-handler/Modal). */
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockCreate = jest.fn();
const mockCancel = jest.fn();
let mockStatus: unknown = undefined;
let mockTerminal = false;
let mockReaderOptions: unknown = undefined;
jest.mock('@/lib/payments/terminal-sdk', () => ({ isTerminalSdkAvailable: () => mockTerminal }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getStripePublishableKey: () => 'pk_test' }));
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => true }));
jest.mock('@/lib/queries/useReaderSaveOptions', () => ({ useReaderSaveOptions: () => ({ data: mockReaderOptions }) }));
jest.mock('@/components/cards/ReaderSaveFlow', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ReaderSaveFlow: ({ device }: { device: string }) => React.createElement(Text, null, `reader flow ${device}`) };
});
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { id: 'venue-own' } }) }));
/** Shows which business's account the reader is pointed at. */
jest.mock('@/components/bookings/CardAccountScope', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    CardAccountScope: ({ ownerVenueId, children }: { ownerVenueId: string | null; children: React.ReactNode }) =>
      React.createElement(View, null, React.createElement(Text, null, `reader account ${ownerVenueId ?? 'app'}`), children),
  };
});
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  useCreateDeskSession: () => ({ mutate: mockCreate, isPending: false, variables: undefined }),
  useCancelDeskSession: () => ({ mutate: mockCancel, isPending: false }),
  useDeskSessionStatus: () => ({ data: mockStatus }),
}));

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  guestId: 'g-1',
  bookingId: 'b-1',
  clientFirstName: 'Amy',
  hasContact: true,
  savedWith: 'The Beauty Parlour',
  scope: 'collective' as const,
};

beforeEach(() => {
  mockTerminal = false;
  mockReaderOptions = undefined;
  mockCreate.mockReset();
  mockCancel.mockReset();
  mockStatus = undefined;
});

describe('AddCardSheet', () => {
  it('offers the screen, a code and a message, and says the reach', async () => {
    await render(<AddCardSheet {...baseProps} />);
    expect(screen.getByText('Saves the card for all of The Beauty Parlour.')).toBeTruthy();
    expect(screen.getByText('Hand the screen to your client')).toBeTruthy();
    expect(screen.getByText('Show a code for their phone')).toBeTruthy();
    expect(screen.getByText('Send by email or text')).toBeTruthy();
    // No Terminal SDK in this build: no reader options.
    expect(screen.queryByText('Tap to Pay on this phone')).toBeNull();
    expect(screen.queryByText('Bluetooth reader')).toBeNull();
  });

  it('hides "Send by email or text" when the client has no details', async () => {
    await render(<AddCardSheet {...baseProps} hasContact={false} />);
    expect(screen.queryByText('Send by email or text')).toBeNull();
  });

  it('shows the code and waits, then says the card was saved', async () => {
    mockCreate.mockImplementation((_input, opts) =>
      opts.onSuccess({ session_id: 's-1', url: 'https://resneo.test/desk/dk_1', expires_at: '', mode: 'qr' }),
    );
    const onSaved = jest.fn();
    const view = await render(<AddCardSheet {...baseProps} onSaved={onSaved} />);
    await fireEvent.press(screen.getByText('Show a code for their phone'));
    expect(mockCreate.mock.calls[0][0]).toEqual({ guestId: 'g-1', bookingId: 'b-1', mode: 'qr' });
    expect(screen.getByTestId('add-card-waiting').props.children).toBe(
      'Waiting for the client... The code works once, for 15 minutes.',
    );
    mockStatus = { id: 's-1', mode: 'qr', status: 'saved', opened: true, expires_at: '', card: { brand: 'visa', last4: '4242' }, declined: false };
    await act(async () => {
      await view.rerender(<AddCardSheet {...baseProps} onSaved={onSaved} />);
    });
    expect(screen.getByTestId('add-card-outcome').props.children).toBe(
      'Card saved. Visa ending 4242 is saved with The Beauty Parlour.',
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('cancels a waiting code in words', async () => {
    mockCreate.mockImplementation((_input, opts) =>
      opts.onSuccess({ session_id: 's-2', url: 'https://resneo.test/desk/dk_2', expires_at: '', mode: 'qr' }),
    );
    mockCancel.mockImplementation((_id, opts) => opts.onSettled());
    await render(<AddCardSheet {...baseProps} />);
    await fireEvent.press(screen.getByText('Show a code for their phone'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(mockCancel.mock.calls[0][0]).toBe('s-2');
    expect(screen.getByTestId('add-card-outcome').props.children).toBe('Cancelled. No card was saved.');
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('says how the request was sent', async () => {
    mockCreate.mockImplementation((_input, opts) => opts.onSuccess({ sent: true, email: true, sms: false }));
    await render(<AddCardSheet {...baseProps} />);
    await fireEvent.press(screen.getByText('Send by email or text'));
    expect(screen.getByText('Card request sent by email.')).toBeTruthy();
  });

  it('shows the refusal in words', async () => {
    mockCreate.mockImplementation((_input, opts) =>
      opts.onError(new Error("Card not possible: this business can't take card payments yet.")),
    );
    await render(<AddCardSheet {...baseProps} />);
    await fireEvent.press(screen.getByText('Hand the screen to your client'));
    expect(screen.getByText("Card not possible: this business can't take card payments yet.")).toBeTruthy();
  });
});

describe('AddCardSheet reader options (plan §4.12, C12)', () => {
  it('offers Tap to Pay and the Bluetooth reader with their reach when the business can save', async () => {
    mockTerminal = true;
    mockReaderOptions = { can_save: true, reader_reach: "Saves the card for Steph's only." };
    await render(<AddCardSheet {...baseProps} />);
    expect(screen.getByTestId('add-card-reader-reach').props.children).toBe("Saves the card for Steph's only.");
    await fireEvent.press(screen.getByText('Tap to Pay on this phone'));
    expect(screen.getByText('reader flow tap_to_pay')).toBeTruthy();
  });

  it("keeps the reader on the app's account when the app is on the signed-in business", async () => {
    mockTerminal = true;
    mockReaderOptions = { can_save: true, reader_reach: "Saves the card for Steph's only." };
    await render(<AddCardSheet {...baseProps} />);
    await fireEvent.press(screen.getByText('Tap to Pay on this phone'));
    expect(screen.getByText('reader account app')).toBeTruthy();
  });

  it('points the reader at the signed-in business inside a collective booking form (2026-11-19)', async () => {
    // The collective form scopes the app to the collective id, which the connection token route
    // reads as a linked venue: "You do not have an active link with that venue".
    mockTerminal = true;
    mockReaderOptions = { can_save: true, reader_reach: "Saves the card for Steph's only." };
    const scope = {
      ownerVenueId: 'collective-1',
      ownerVenueName: 'The Beauty Parlour',
      ownerPractitionerId: null,
      hydrated: true,
      setOwnerVenueId: jest.fn(),
      clearOwnerVenue: jest.fn(),
      reconcileOwnerVenue: jest.fn(),
    };
    await render(
      <LinkedVenueContext.Provider value={scope}>
        <AddCardSheet {...baseProps} />
      </LinkedVenueContext.Provider>,
    );
    await fireEvent.press(screen.getByText('Tap to Pay on this phone'));
    expect(screen.getByText('reader account venue-own')).toBeTruthy();
    expect(screen.getByText('reader flow tap_to_pay')).toBeTruthy();
  });

  it('hides the reader options when the server says no, or is older', async () => {
    mockTerminal = true;
    mockReaderOptions = { can_save: false, reader_reach: 'x' };
    const view = await render(<AddCardSheet {...baseProps} />);
    expect(screen.queryByText('Bluetooth reader')).toBeNull();
    mockReaderOptions = null;
    await view.rerender(<AddCardSheet {...baseProps} />);
    expect(screen.queryByText('Bluetooth reader')).toBeNull();
    expect(screen.queryByTestId('add-card-reader-other-business')).toBeNull();
  });

  it("says why the reader is not offered for another business's client (2026-11-19)", async () => {
    mockTerminal = true;
    mockReaderOptions = 'other_business';
    await render(<AddCardSheet {...baseProps} />);
    expect(screen.queryByText('Bluetooth reader')).toBeNull();
    expect(screen.getByTestId('add-card-reader-other-business').props.children).toBe(READER_OTHER_BUSINESS_LINE);
    expect(READER_OTHER_BUSINESS_LINE).not.toContain('—');
  });

  it('names the booking business to the desk session before a booking exists', async () => {
    await render(<AddCardSheet {...baseProps} bookingId={null} bookingVenueId="venue-a" />);
    await fireEvent.press(screen.getByText('Show a code for their phone'));
    expect(mockCreate.mock.calls[0][0]).toEqual({ guestId: 'g-1', bookingId: null, bookingVenueId: 'venue-a', mode: 'qr' });
  });
});

describe('helpers', () => {
  it('words every finished session', () => {
    const base = { id: 's', mode: 'qr' as const, opened: true, expires_at: '', card: null, declined: false };
    expect(deskOutcomeText({ ...base, status: 'cancelled' }, 'X', 'Amy')?.text).toBe('Amy cancelled. No card was saved.');
    expect(deskOutcomeText({ ...base, status: 'expired' }, 'X', 'Amy')?.text).toBe('The code expired. No card was saved.');
    expect(deskOutcomeText({ ...base, mode: 'handover', status: 'expired' }, 'X', '')?.text).toBe(
      'The screen timed out. No card was saved.',
    );
    expect(deskOutcomeText({ ...base, status: 'open' }, 'X', 'Amy')).toBeNull();
    expect(addCardReachLine('business', "Steph's")).toBe("Saves the card for Steph's.");
  });

  it('closes the hand-over only for the page leaving the desk on its own site', () => {
    const desk = 'https://resneo.test/desk/dk_1';
    expect(isDeskHandBackNavigation(desk, { url: 'https://resneo.test/dashboard' })).toBe(true);
    expect(isDeskHandBackNavigation(desk, { url: 'https://resneo.test/desk/dk_1?x=1' })).toBe(false);
    expect(isDeskHandBackNavigation(desk, { url: 'https://hooks.stripe.com/3d' })).toBe(false);
    expect(isDeskHandBackNavigation(desk, { url: 'https://resneo.test/dashboard', isTopFrame: false })).toBe(false);
  });
});
