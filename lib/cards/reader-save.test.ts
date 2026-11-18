/**
 * Saving a card on Tap to Pay or the Bluetooth reader with no charge (card-on-file-plan §4.12,
 * C12): the request order, the collective question, the client's answer, the SDK steps and the
 * outcome shown in the server's words.
 */
import { ApiError } from '@/lib/api/client';
import { runReaderSave, type ReaderSaveApi, type ReaderSaveDto, type ReaderSaveTerminal } from '@/lib/cards/reader-save';

jest.mock('@/lib/payments/terminal-sdk', () => ({
  terminalErrorMessage: (error: { message?: string } | undefined, fallback: string) => error?.message || fallback,
}));

function save(over: Partial<ReaderSaveDto> = {}): ReaderSaveDto {
  return {
    id: 'rs-1',
    status: 'asking',
    outcome: null,
    text: 'Waiting for the client to agree on the screen...',
    channel: 'till_app_setup',
    reader_label: null,
    card: null,
    setup_intent_id: 'seti_1',
    open: true,
    ...over,
  };
}

const SAVED = save({ status: 'saved', open: false, text: "Card saved. Visa ending 4242 is saved with Steph's." });

type MockApi = ReaderSaveApi & { start: jest.Mock; answer: jest.Mock; read: jest.Mock; cancel: jest.Mock };

function makeApi(over: Partial<ReaderSaveApi> = {}): MockApi {
  const api = {
    options: jest.fn(),
    start: jest.fn().mockResolvedValue({
      save: save(),
      client_secret: 'seti_1_secret',
      setup_intent_id: 'seti_1',
      consent_text: "Save this card with Steph's for your future visits.",
      allow_redisplay: 'always',
    }),
    answer: jest.fn().mockImplementation(({ agreed }: { agreed: boolean }) =>
      Promise.resolve(
        agreed
          ? { save: save({ status: 'agreed', text: 'Waiting for the client to tap or insert their card...' }), allow_redisplay: 'always' }
          : { save: save({ status: 'declined', open: false, text: 'The client chose not to save their card.' }) },
      ),
    ),
    read: jest.fn().mockResolvedValue({ save: SAVED }),
    cancel: jest.fn().mockResolvedValue({ save: save({ status: 'cancelled', open: false, text: 'Cancelled. No card was saved.' }) }),
    ...over,
  };
  return api as unknown as MockApi;
}

function makeTerminal(over: Partial<ReaderSaveTerminal> = {}): ReaderSaveTerminal & { processSetupIntent: jest.Mock } {
  return {
    retrieveSetupIntent: jest.fn().mockResolvedValue({ setupIntent: { id: 'seti_1' } }),
    processSetupIntent: jest.fn().mockResolvedValue({ setupIntent: { id: 'seti_1', status: 'succeeded' } }),
    ...over,
  } as ReaderSaveTerminal & { processSetupIntent: jest.Mock };
}

const hooks = (over: Partial<Parameters<typeof runReaderSave>[3]> = {}) => ({
  confirmBusinessOnly: jest.fn().mockResolvedValue(true),
  askConsent: jest.fn().mockResolvedValue(true),
  onProgress: jest.fn(),
  ...over,
});

const fast = { sleep: () => Promise.resolve(), tries: 3, intervalMs: 0 };

describe('runReaderSave', () => {
  it('starts, asks the client, reads the card and shows the saved words', async () => {
    const api = makeApi();
    const terminal = makeTerminal();
    const h = hooks();
    const out = await runReaderSave(api, terminal, { guestId: 'g-1', device: 'tap_to_pay' }, h, fast);
    expect(api.start).toHaveBeenCalledWith({ guestId: 'g-1', device: 'tap_to_pay' });
    expect(h.askConsent).toHaveBeenCalledWith("Save this card with Steph's for your future visits.");
    expect(api.answer).toHaveBeenCalledWith({ id: 'rs-1', agreed: true, consentText: "Save this card with Steph's for your future visits." });
    expect(h.onProgress).toHaveBeenCalledWith('Waiting for the client to tap or insert their card...');
    expect(terminal.retrieveSetupIntent).toHaveBeenCalledWith('seti_1_secret');
    expect(terminal.processSetupIntent).toHaveBeenCalledWith({ setupIntent: { id: 'seti_1' }, allowRedisplay: 'always' });
    expect(out).toEqual({ kind: 'saved', text: SAVED.text, save: SAVED });
  });

  it('asks the collective question on a 409 and starts again for this business only', async () => {
    const api = makeApi();
    api.start
      .mockRejectedValueOnce(
        new ApiError('q', 409, {
          error: "Amy already has a card saved with The Beauty Parlour. Save another for Steph's only?",
          code: 'CARD_ALREADY_SAVED_COLLECTIVE',
        }),
      );
    const h = hooks();
    await runReaderSave(api, makeTerminal(), { guestId: 'g-1', device: 'bluetooth_reader' }, h, fast);
    expect(h.confirmBusinessOnly).toHaveBeenCalledWith(
      "Amy already has a card saved with The Beauty Parlour. Save another for Steph's only?",
    );
    expect(api.start).toHaveBeenLastCalledWith({ guestId: 'g-1', device: 'bluetooth_reader', confirmBusinessOnly: true });
  });

  it('stops without a save when staff say no to the question', async () => {
    const api = makeApi();
    api.start.mockRejectedValueOnce(new ApiError('q', 409, { error: 'Save another?', code: 'CARD_ALREADY_SAVED_COLLECTIVE' }));
    const out = await runReaderSave(api, makeTerminal(), { guestId: 'g-1', device: 'tap_to_pay' }, hooks({ confirmBusinessOnly: jest.fn().mockResolvedValue(false) }), fast);
    expect(out.kind).toBe('cancelled');
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('records a no from the client and reads no card', async () => {
    const api = makeApi();
    const terminal = makeTerminal();
    const out = await runReaderSave(api, terminal, { guestId: 'g-1', device: 'tap_to_pay' }, hooks({ askConsent: jest.fn().mockResolvedValue(false) }), fast);
    expect(out).toMatchObject({ kind: 'declined', text: 'The client chose not to save their card.' });
    expect(terminal.retrieveSetupIntent).not.toHaveBeenCalled();
  });

  it('cancels the save when staff stop before the client answers', async () => {
    const api = makeApi();
    const out = await runReaderSave(api, makeTerminal(), { guestId: 'g-1', device: 'tap_to_pay' }, hooks({ askConsent: jest.fn().mockResolvedValue(null) }), fast);
    expect(api.cancel).toHaveBeenCalledWith('rs-1');
    expect(out).toMatchObject({ kind: 'cancelled', text: 'Cancelled. No card was saved.' });
  });

  it('cancels on the server when the reader was cancelled', async () => {
    const api = makeApi();
    const terminal = makeTerminal({ processSetupIntent: jest.fn().mockResolvedValue({ error: { code: 'CANCELED', message: 'x' } }) });
    const out = await runReaderSave(api, terminal, { guestId: 'g-1', device: 'tap_to_pay' }, hooks(), fast);
    expect(api.cancel).toHaveBeenCalledWith('rs-1');
    expect(out.kind).toBe('cancelled');
  });

  it('shows the server outcome when the webhook already knows why the card failed', async () => {
    const declined = save({ status: 'not_saved', open: false, text: "This card can't be saved. Ask for a physical card, or use the screen or a code instead." });
    const api = makeApi({ read: jest.fn().mockResolvedValue({ save: declined }) } as never);
    const terminal = makeTerminal({ processSetupIntent: jest.fn().mockResolvedValue({ error: { code: 'DECLINED_BY_STRIPE_API', message: 'Declined' } }) });
    const out = await runReaderSave(api, terminal, { guestId: 'g-1', device: 'bluetooth_reader' }, hooks(), fast);
    expect(out).toMatchObject({ kind: 'not_saved', text: declined.text });
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('falls back to the reader message and cancels when the server still waits', async () => {
    const api = makeApi({ read: jest.fn().mockResolvedValue({ save: save({ status: 'processing' }) }) } as never);
    const terminal = makeTerminal({ processSetupIntent: jest.fn().mockResolvedValue({ error: { code: 'READER_BUSY', message: 'The reader is busy.' } }) });
    const out = await runReaderSave(api, terminal, { guestId: 'g-1', device: 'bluetooth_reader' }, hooks(), fast);
    expect(api.cancel).toHaveBeenCalled();
    expect(out).toMatchObject({ kind: 'failed', text: 'The reader is busy.' });
  });

  it('says it could not start when the server made no SetupIntent', async () => {
    const api = makeApi();
    api.start.mockResolvedValueOnce({ save: save(), client_secret: null, setup_intent_id: null, consent_text: 'x' });
    const out = await runReaderSave(api, makeTerminal(), { guestId: 'g-1', device: 'tap_to_pay' }, hooks(), fast);
    expect(out).toMatchObject({ kind: 'failed', text: 'The card reader could not be started. Please try again.' });
  });
});
