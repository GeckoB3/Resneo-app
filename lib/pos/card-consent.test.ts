/**
 * Saving a card with the client's consent (POS plan §4.4.5, D18; web `card-consent` route): the
 * question is asked only when the server says this payment can save a card, the words the client
 * saw go back with the answer, and afterwards staff hear whether the card was kept.
 */
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { answerCardConsent, cardSaveCopyId, followCardSave, readCardConsent } from '@/lib/pos/card-consent';

const PATH = '/api/venue/pos/sales/sale-1/payments/pay-1/card-consent';

beforeEach(() => mockApiFetch.mockReset());

describe('readCardConsent', () => {
  it('answers the words to show when the payment can save a card', async () => {
    mockApiFetch.mockResolvedValueOnce({ consent_text: 'Save this card so Studio can...', can_save: true, card_save_status: null });
    await expect(readCardConsent('tok', 'sale-1', 'pay-1')).resolves.toMatchObject({ can_save: true });
    expect(mockApiFetch.mock.calls[0][0]).toBe(PATH);
  });

  it('asks nothing when it cannot, or the server is older', async () => {
    mockApiFetch.mockResolvedValueOnce({ consent_text: 'x', can_save: false, card_save_status: null });
    await expect(readCardConsent('tok', 'sale-1', 'pay-1')).resolves.toBeNull();
    mockApiFetch.mockRejectedValueOnce(new Error('404'));
    await expect(readCardConsent('tok', 'sale-1', 'pay-1')).resolves.toBeNull();
  });
});

describe('answerCardConsent', () => {
  it('sends the answer with the exact words the client saw', async () => {
    mockApiFetch.mockResolvedValueOnce({ card_save_status: 'agreed', changed: true, allow_redisplay: 'always' });
    await answerCardConsent('tok', 'sale-1', 'pay-1', { agreed: true, consentText: 'The words.' });
    const [path, init] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe(PATH);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ agreed: true, consent_text: 'The words.' });
  });
});

describe('followCardSave', () => {
  const wait = () => Promise.resolve();

  it('stops at the first final status', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ consent_text: 'x', can_save: false, card_save_status: 'agreed' })
      .mockResolvedValueOnce({ consent_text: 'x', can_save: false, card_save_status: 'saved' });
    await expect(followCardSave('tok', 'sale-1', 'pay-1', { wait })).resolves.toBe('saved');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up quietly when the webhook is slow', async () => {
    mockApiFetch.mockResolvedValue({ consent_text: 'x', can_save: false, card_save_status: 'agreed' });
    await expect(followCardSave('tok', 'sale-1', 'pay-1', { wait, tries: 3 })).resolves.toBe('agreed');
    expect(cardSaveCopyId('agreed')).toBeNull();
  });

  it('says what happened to the card', () => {
    expect(cardSaveCopyId('saved')).toBe('reader.saved');
    expect(cardSaveCopyId('declined')).toBe('reader.notSaved');
    expect(cardSaveCopyId('not_saved')).toBe('reader.notSaved.wallet');
  });
});
