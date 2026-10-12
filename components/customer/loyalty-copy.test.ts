/**
 * The words of the customer's "Loyalty card" (UX spec §21.4: "in the same words"): the web's
 * sentences under the web's ids, the house rules, and the same words as the settings preview,
 * which shows a venue what its clients see.
 */
import { CUSTOMER_LOYALTY_COPY, loyaltyCopy } from '@/components/customer/loyalty-copy';
import { LOYALTY_SET_COPY } from '@/lib/pos/settings-more/loyalty-copy';

// The settings deck's shared helpers read the venue's words through this provider; the deck's
// strings are all this needs.
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({}) }));

describe("the loyalty card's words", () => {
  it("fills the web's sentences", () => {
    expect(loyaltyCopy('capp.home.loyalty')).toBe('Loyalty card');
    expect(loyaltyCopy('acct.loyalty.progress', { count: 4, needed: 6, venue: 'Studio' })).toBe(
      '4 of 6 visits at Studio',
    );
    expect(loyaltyCopy('acct.loyalty.reward', { rewardText: '10% off' })).toBe(
      'Your reward is ready: 10% off. Just mention it when you pay.',
    );
    expect(loyaltyCopy('acct.loyalty.how', { venue: 'Studio' })).toBe('You get a stamp each day you visit Studio.');
  });

  it('says what the settings preview tells a venue its clients see', () => {
    for (const id of ['acct.loyalty.progress', 'acct.loyalty.reward'] as const) {
      expect(CUSTOMER_LOYALTY_COPY[id]).toBe(LOYALTY_SET_COPY[id]);
    }
  });

  it('never uses an em-dash, and uses straight apostrophes and quotes', () => {
    const all = Object.values(CUSTOMER_LOYALTY_COPY).join(' ');
    expect(all).not.toContain(String.fromCharCode(0x2014));
    for (const code of [0x2018, 0x2019, 0x201c, 0x201d]) {
      expect(all).not.toContain(String.fromCharCode(code));
    }
  });
});
