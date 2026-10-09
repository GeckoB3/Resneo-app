/**
 * Online orders' pure parts (POS app step 5, UX spec §8): which actions an order's state allows,
 * pickup codes, tracking links, refund amounts and the timeline's words.
 */
import { posCopyFor } from '@/lib/pos/copy';
import {
  formatPickupCode,
  lineRefundPence,
  normalisePickupCode,
  orderActions,
  orderStatusLabel,
  suggestedTrackingUrl,
  timelineText,
} from '@/lib/shop/order-words';
import type { ShopOrderDetail, ShopOrderLine } from '@/types/shop';

const t = posCopyFor('client');
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

function line(over: Partial<ShopOrderLine> = {}): ShopOrderLine {
  return {
    id: 'l1',
    line_type: 'product',
    name: 'Shampoo',
    option_name: null,
    variant_id: 'v1',
    product_id: 'p1',
    quantity: 3,
    unit_price_pence: 1200,
    total_pence: 3600,
    tax_pence: 600,
    tax_rate_bps: 2000,
    refunded_quantity: 0,
    refunded_pence: 0,
    hygiene_sealed: false,
    photo: null,
    track_stock: true,
    ...over,
  };
}

function detail(over: Partial<ShopOrderDetail['order']> = {}, can = { refund: true, is_admin: false }) {
  return {
    order: {
      fulfilment_type: 'collection',
      fulfilment_status: 'new',
      paid_pence: 3600,
      refunded_pence: 0,
      ...over,
    } as ShopOrderDetail['order'],
    lines: [line()],
    can,
  };
}

describe('what an order allows', () => {
  it('follows the collection path', () => {
    expect(orderActions(detail())).toEqual(['preparing', 'ready', 'cancelRefund', 'packingSlip']);
    expect(orderActions(detail({ fulfilment_status: 'ready' }))).toEqual(['collected', 'cancelRefund', 'packingSlip']);
    expect(orderActions(detail({ fulfilment_status: 'collected' }))).toEqual(['recordReturn', 'refund', 'packingSlip']);
  });

  it('follows the delivery path, with no cancelling once dispatched', () => {
    expect(orderActions(detail({ fulfilment_type: 'delivery', fulfilment_status: 'preparing' }))).toEqual([
      'dispatch',
      'cancelRefund',
      'packingSlip',
    ]);
    expect(orderActions(detail({ fulfilment_type: 'delivery', fulfilment_status: 'dispatched' }))).toEqual([
      'delivered',
      'editTracking',
      'refund',
      'packingSlip',
    ]);
  });

  it('offers no money back without `refund` or with nothing left, and nothing on a cancelled order', () => {
    expect(orderActions(detail({}, { refund: false, is_admin: false }))).toEqual(['preparing', 'ready', 'packingSlip']);
    expect(orderActions(detail({ fulfilment_status: 'collected', refunded_pence: 3600 }))).toEqual(['recordReturn', 'packingSlip']);
    expect(orderActions(detail({ fulfilment_status: 'cancelled' }))).toEqual([]);
  });
});

describe('pickup codes and tracking', () => {
  it('shows a code with a hyphen and reads one in any case, with or without it', () => {
    expect(formatPickupCode('acd479')).toBe('ACD-479');
    expect(normalisePickupCode(' acd-479 ')).toBe('ACD479');
  });

  it("fills a known carrier's tracking link", () => {
    expect(suggestedTrackingUrl('DPD', ' 1234 ')).toBe('https://track.dpd.co.uk/parcels/1234');
    expect(suggestedTrackingUrl('other', '1234')).toBe('');
  });
});

describe('refunds and words', () => {
  it('refunds part of a line pro rata, and the rest exactly', () => {
    expect(lineRefundPence(line(), 1)).toBe(1200);
    expect(lineRefundPence(line({ total_pence: 1000, quantity: 3 }), 1)).toBe(333);
    expect(lineRefundPence(line({ total_pence: 1000, quantity: 3, refunded_quantity: 1, refunded_pence: 333 }), 2)).toBe(667);
  });

  it('reads statuses and timeline entries in the deck words', () => {
    expect(orderStatusLabel('ready', t)).toBe('Ready to collect');
    expect(
      timelineText({ at: '', action: 'order.status', summary: '', actor_name: 'Sam', after: { fulfilment_status: 'ready' } }, t, money),
    ).toBe('Marked ready, by Sam');
    expect(
      timelineText({ at: '', action: 'order.status', summary: '', actor_name: 'Sam', after: { fulfilment_status: 'collected', without_code: true } }, t, money),
    ).toBe('Collected without a pickup code, by Sam');
    expect(timelineText({ at: '', action: 'refund.create', summary: '', actor_name: null, after: { amount_pence: 1200 } }, t, money)).toBe(
      'Refunded £12.00',
    );
  });
});
