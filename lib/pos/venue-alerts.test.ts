/**
 * "Needs your attention" words and links, in step with the web's src/lib/pos/venue-alerts.ts, with
 * the venue's own client word filled in.
 */
import { posCopyFor } from '@/lib/pos/copy';
import { knownVenueAlerts, venueAlertLink, venueAlertSentence } from '@/lib/pos/venue-alerts';
import type { PosVenueAlert } from '@/types/pos';

const t = posCopyFor('patient');
const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const alert = (over: Partial<PosVenueAlert>): PosVenueAlert => ({
  id: 'a1',
  kind: 'dispute',
  created_at: '2026-10-11T10:30:00Z',
  sale_id: 'sale-1',
  amount_pence: 400,
  ...over,
});

describe('venue alerts', () => {
  it("words each kind in the web's words, with the venue's client word", () => {
    expect(venueAlertSentence(alert({}), t, money)).toBe('A patient has disputed a card payment of £4.00. Respond in your Stripe dashboard.');
    expect(venueAlertSentence(alert({ amount_pence: null }), t, money)).toBe(
      'A patient has disputed a card payment. Respond in your Stripe dashboard.',
    );
    expect(venueAlertSentence(alert({ kind: 'refund_failed' }), t, money)).toBe(
      "A card refund didn't go through. Refund the patient another way.",
    );
    expect(venueAlertSentence(alert({ kind: 'stock_conflict' }), t, money)).toBe(
      'An online order was paid after its items were released. Check you have them.',
    );
  });

  it('leads to the sale, the online order, or for a dispute with no sale the payment settings on the web', () => {
    expect(venueAlertLink(alert({}), t)).toEqual({ kind: 'app', href: '/checkout/sale-1', label: 'Open the sale' });
    expect(venueAlertLink(alert({ kind: 'refund_failed' }), t)).toEqual({ kind: 'app', href: '/checkout/sale-1', label: 'Open the sale' });
    expect(venueAlertLink(alert({ kind: 'stock_conflict', sale_id: 'order-9' }), t)).toEqual({
      kind: 'app',
      href: '/orders/order-9',
      label: 'Open the order',
    });
    expect(venueAlertLink(alert({ sale_id: null }), t)).toEqual({
      kind: 'web',
      path: '/dashboard/settings?tab=payments',
      label: 'Open payment settings',
    });
    expect(venueAlertLink(alert({ kind: 'refund_failed', sale_id: null }), t)).toBeNull();
  });

  it('leaves out a kind the app cannot word yet', () => {
    const rows = [alert({}), { ...alert({ id: 'x' }), kind: 'something_new' } as unknown as PosVenueAlert];
    expect(knownVenueAlerts(rows).map((a) => a.id)).toEqual(['a1']);
    expect(knownVenueAlerts(null)).toEqual([]);
  });
});
