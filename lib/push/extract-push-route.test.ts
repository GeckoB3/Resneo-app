/**
 * C6: what a notification tap opens.
 *
 * Three payload shapes now arrive. Reminders and booking changes carry a
 * booking id and have since long before customer mode; a waitlist offer
 * PRECEDES any booking, so it carries a venue and a link instead. The rule that
 * keeps the old behaviour safe is that a booking id always wins, so no existing
 * notification changes.
 */
import { extractPushRoute } from '@/lib/push/extract-push-route';

describe('booking notifications, which must not change', () => {
  it.each(['booking_id', 'bookingId'])('routes on %s', async (key) => {
    expect(extractPushRoute({ [key]: 'bk-1' })).toEqual({ kind: 'booking', bookingId: 'bk-1' });
  });

  it('routes on a nested booking object', async () => {
    expect(extractPushRoute({ booking: { id: 'bk-1' } })).toEqual({
      kind: 'booking',
      bookingId: 'bk-1',
    });
  });

  it('prefers the booking id even when a url is also present', async () => {
    /*
      The rule that makes this change safe. A reminder carries a booking id, and
      if a url ever appeared beside one, opening the browser instead of the
      booking would be a regression in the majority case to serve the minority.
    */
    expect(
      extractPushRoute({
        type: 'reminder',
        booking_id: 'bk-1',
        url: 'https://www.resneo.com/book/the-studio',
      }),
    ).toEqual({ kind: 'booking', bookingId: 'bk-1' });
  });

  it('ignores an empty booking id rather than routing to nowhere', async () => {
    expect(extractPushRoute({ booking_id: '' })).toBeNull();
  });
});

describe('a waitlist offer, which has no booking to route to', () => {
  it('opens the venue booking page it was sent', async () => {
    expect(
      extractPushRoute({
        type: 'waitlist_offer',
        venue_id: 'v-1',
        url: 'https://www.resneo.com/book/the-studio',
      }),
    ).toEqual({ kind: 'url', url: 'https://www.resneo.com/book/the-studio' });
  });

  it('falls back to the customer’s own bookings when the venue has no slug', async () => {
    /*
      `venue_id` is always present but there is no native booking screen to
      route it to, so the honest landing is where the waitlist entry itself
      shows that a place has come up.
    */
    expect(extractPushRoute({ type: 'waitlist_offer', venue_id: 'v-1' })).toEqual({
      kind: 'customerHome',
    });
  });
});

describe('the url is checked before it is opened', () => {
  /*
    A payload is attacker-controllable in the sense that matters: whoever gets a
    push delivered chooses this string. Opening it unchecked turns a
    notification into an open redirect inside the app.
  */
  it.each([
    ['javascript:alert(1)', 'a script url'],
    ['http://www.resneo.com/book/x', 'plain http'],
    ['https://resneo.com.evil.test/book/x', 'a lookalike host'],
    ['https://evil.test/book/x', 'somebody else entirely'],
    ['not a url', 'nonsense'],
  ])('refuses %s (%s)', async (url) => {
    // Refused BY FALLING BACK, not by throwing: the customer still lands
    // somewhere that shows the offer.
    expect(extractPushRoute({ type: 'waitlist_offer', venue_id: 'v-1', url })).toEqual({
      kind: 'customerHome',
    });
  });

  it('accepts the apex and any resneo.com subdomain', async () => {
    for (const host of ['resneo.com', 'www.resneo.com', 'staging.resneo.com']) {
      expect(
        extractPushRoute({ type: 'waitlist_offer', url: `https://${host}/book/x` }),
      ).toEqual({ kind: 'url', url: `https://${host}/book/x` });
    }
  });
});

describe('anything else', () => {
  it('parks nothing for an unrecognised payload', async () => {
    // Better to open the app where it was than to invent a destination.
    expect(extractPushRoute({ type: 'something_new' })).toBeNull();
    expect(extractPushRoute(null)).toBeNull();
    expect(extractPushRoute(undefined)).toBeNull();
    expect(extractPushRoute({})).toBeNull();
  });
});
