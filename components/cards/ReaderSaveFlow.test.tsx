/**
 * ReaderSaveFlow (card-on-file-plan §4.12, C12): connect the reader, hand the phone over, two equal
 * answers for the client, then the outcome in the server's words.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { READER_SAVE_COPY, ReaderSaveFlow } from './ReaderSaveFlow';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticTap: jest.fn(), hapticSelect: jest.fn() }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

const mockTapConnect = jest.fn();
const mockReconnect = jest.fn();
let mockBluetoothConnected: unknown = null;
jest.mock('@/lib/payments/terminal', () => ({ useTapToPayReader: () => ({ connect: mockTapConnect }) }));
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({ connected: mockBluetoothConnected, reconnectRemembered: mockReconnect }),
}));
const mockTerminal = { cancelProcessSetupIntent: jest.fn() };
jest.mock('@/lib/payments/terminal-sdk', () => ({ getTerminalSdk: () => ({ useStripeTerminal: () => mockTerminal }) }));

const mockRun = jest.fn();
jest.mock('@/lib/cards/reader-save', () => ({
  readerSaveApi: () => ({}),
  runReaderSave: (...args: unknown[]) => mockRun(...args),
}));

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  mockTapConnect.mockReset().mockResolvedValue({ ok: true, error: null });
  mockReconnect.mockReset();
  mockBluetoothConnected = null;
  mockRun.mockReset();
  mockTerminal.cancelProcessSetupIntent.mockReset();
});

describe('ReaderSaveFlow', () => {
  it('hands the phone over, asks with two equal answers and shows the saved words', async () => {
    let consent: Promise<boolean | null> | undefined;
    let finish: ((v: unknown) => void) | undefined;
    mockRun.mockImplementation((_api, _terminal, input, hooks) => {
      expect(input).toEqual({ guestId: 'g-1', device: 'tap_to_pay' });
      consent = hooks.askConsent('Save this card with Steph\'s for your future visits.') as Promise<boolean | null>;
      return consent.then((agreed: boolean | null) => {
        hooks.onProgress('Waiting for the client to tap or insert their card...');
        return new Promise((resolve) => {
          finish = () => resolve({ kind: agreed ? 'saved' : 'declined', text: 'Card saved. Visa ending 4242 is saved with Steph\'s.', save: null });
        });
      });
    });
    const onSaved = jest.fn();
    const onDone = jest.fn();
    await render(<ReaderSaveFlow device="tap_to_pay" guestId="g-1" clientFirstName="Amy" onDone={onDone} onSaved={onSaved} />);
    await flush();
    expect(screen.getByText(READER_SAVE_COPY.handTo('Amy'))).toBeTruthy();
    await fireEvent.press(screen.getByText(READER_SAVE_COPY.handedOver));
    expect(screen.getByText(READER_SAVE_COPY.title)).toBeTruthy();
    expect(screen.getByText('No thanks')).toBeTruthy();
    await fireEvent.press(screen.getByText('Yes, save my card'));
    await flush();
    expect(screen.getByTestId('reader-save-progress').props.children).toBe(
      'Waiting for the client to tap or insert their card...',
    );
    await fireEvent.press(screen.getByText('Cancel'));
    expect(mockTerminal.cancelProcessSetupIntent).toHaveBeenCalled();
    await act(async () => {
      finish?.(undefined);
    });
    await flush();
    expect(screen.getByTestId('reader-save-outcome').props.children).toBe("Card saved. Visa ending 4242 is saved with Steph's.");
    expect(onSaved).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('asks the collective question first when the server needs it', async () => {
    let answer: Promise<boolean> | undefined;
    mockRun.mockImplementation((_a, _t, _i, hooks) => {
      answer = hooks.confirmBusinessOnly("Amy already has a card saved with The Beauty Parlour. Save another for Steph's only?") as Promise<boolean>;
      return answer.then(() => ({ kind: 'cancelled', text: 'No card was saved.', save: null }));
    });
    await render(<ReaderSaveFlow device="tap_to_pay" guestId="g-1" clientFirstName="Amy" onDone={jest.fn()} />);
    await flush();
    expect(screen.getByText("Amy already has a card saved with The Beauty Parlour. Save another for Steph's only?")).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    await flush();
    expect(screen.getByTestId('reader-save-outcome').props.children).toBe('No card was saved.');
  });

  it('says the Bluetooth reader is not connected rather than starting a save', async () => {
    mockReconnect.mockResolvedValue(false);
    await render(<ReaderSaveFlow device="bluetooth_reader" guestId="g-1" clientFirstName="Amy" onDone={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('reader-save-outcome').props.children).toBe(READER_SAVE_COPY.noBluetooth);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('shows Tap to Pay connection failures in words', async () => {
    mockTapConnect.mockResolvedValue({ ok: false, error: 'Ask an admin to turn on Tap to Pay on iPhone.' });
    await render(<ReaderSaveFlow device="tap_to_pay" guestId="g-1" clientFirstName="Amy" onDone={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('reader-save-outcome').props.children).toBe('Ask an admin to turn on Tap to Pay on iPhone.');
  });
});
