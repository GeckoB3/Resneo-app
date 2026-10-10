/**
 * The link between a `pos_collect_request` push and the in-app prompt (owner, 2026-10-10): only a
 * collect push is offered, with its ids; nothing registered, a refusal or a failure all mean "show
 * the phone's own banner".
 */
import { offerCollectPrompt, registerCollectPrompt } from '@/lib/push/collect-prompt';

const PAYMENT = '0f8b7c1e-1a2b-4c3d-8e9f-001122334455';
const push = { type: 'pos_collect_request', payment_id: PAYMENT, sale_id: 's-1', venue_id: 'venue-1' };

describe('offerCollectPrompt', () => {
  it('says no when no prompt is mounted', () => {
    expect(offerCollectPrompt(push)).toBe(false);
  });

  it('offers a collect push with its payment and venue, and returns what the prompt answers', () => {
    const offer = jest.fn(() => true);
    const off = registerCollectPrompt(offer);
    expect(offerCollectPrompt(push)).toBe(true);
    expect(offer).toHaveBeenCalledWith(PAYMENT, 'venue-1');
    offer.mockReturnValueOnce(false);
    expect(offerCollectPrompt(push)).toBe(false);
    off();
    expect(offerCollectPrompt(push)).toBe(false);
  });

  it('never offers another kind of push', () => {
    const offer = jest.fn(() => true);
    const off = registerCollectPrompt(offer);
    expect(offerCollectPrompt({ type: 'booking_new', booking_id: 'b-1' })).toBe(false);
    expect(offerCollectPrompt({ type: 'pos_collect_request', payment_id: 'not-an-id' })).toBe(false);
    expect(offerCollectPrompt(null)).toBe(false);
    expect(offer).not.toHaveBeenCalled();
    off();
  });

  it('falls back to the banner when the prompt throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const off = registerCollectPrompt(() => {
      throw new Error('boom');
    });
    expect(offerCollectPrompt(push)).toBe(false);
    off();
    warn.mockRestore();
  });

  it('keeps the newest prompt when an older one unregisters late', () => {
    const first = jest.fn(() => false);
    const second = jest.fn(() => true);
    const offFirst = registerCollectPrompt(first);
    const offSecond = registerCollectPrompt(second);
    offFirst();
    expect(offerCollectPrompt(push)).toBe(true);
    expect(second).toHaveBeenCalled();
    offSecond();
  });
});
