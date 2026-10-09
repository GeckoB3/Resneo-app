import type { PosCopyId, PosT } from '@/lib/pos/copy';
import type { FulfilmentStatus, ShopOrderDetail, ShopOrderLine } from '@/types/shop';

/**
 * Online orders in the app (POS app step 5, plan P7-16; UX spec §8, §13.7), the pure parts, as the
 * web's `src/components/shop/orders/order-format.ts`, `src/lib/shop/pickup-code.ts` and
 * `src/lib/shop/refunds-math.ts` do them.
 */

const STATUS: Record<string, { id: PosCopyId; tone: 'brand' | 'accent' | 'warning' | 'success' | 'neutral' }> = {
  new: { id: 'ord.status.new', tone: 'brand' },
  preparing: { id: 'ord.status.preparing', tone: 'accent' },
  ready: { id: 'ord.status.ready', tone: 'warning' },
  collected: { id: 'ord.status.collected', tone: 'success' },
  dispatched: { id: 'ord.status.dispatched', tone: 'accent' },
  delivered: { id: 'ord.status.delivered', tone: 'success' },
  cancelled: { id: 'ord.status.cancelled', tone: 'neutral' },
};

export function orderStatusLabel(status: string | null | undefined, t: PosT): string {
  const s = STATUS[status ?? 'new'];
  return s ? t(s.id) : String(status ?? '');
}

export function orderStatusTone(status: string | null | undefined): 'brand' | 'accent' | 'warning' | 'success' | 'neutral' {
  return STATUS[status ?? 'new']?.tone ?? 'neutral';
}

// ─── Pickup codes (§8.4) ────────────────────────────────────────────────────

/** "ACD-479" for display; null stays null. */
export function formatPickupCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

/** What staff typed or scanned, as stored ("acd-479" to "ACD479"). The QR code carries only the code. */
export function normalisePickupCode(input: string | null | undefined): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─── Dispatching (§8.5) ─────────────────────────────────────────────────────

export const CARRIERS: { id: string; label: PosCopyId; trackingUrl?: (n: string) => string }[] = [
  { id: 'Royal Mail', label: 'dispatch.carrier.royalMail', trackingUrl: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}` },
  { id: 'Parcelforce', label: 'dispatch.carrier.parcelforce', trackingUrl: (n) => `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(n)}` },
  { id: 'DPD', label: 'dispatch.carrier.dpd', trackingUrl: (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}` },
  { id: 'Evri', label: 'dispatch.carrier.evri', trackingUrl: (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}` },
  { id: 'DHL', label: 'dispatch.carrier.dhl', trackingUrl: (n) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}` },
  { id: 'UPS', label: 'dispatch.carrier.ups', trackingUrl: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  { id: 'other', label: 'dispatch.carrier.other' },
];

/** The tracking link a known carrier's number makes (`dispatch.url`, filled and editable). */
export function suggestedTrackingUrl(carrier: string, number: string): string {
  const meta = CARRIERS.find((c) => c.id === carrier);
  return meta?.trackingUrl && number.trim() ? meta.trackingUrl(number.trim()) : '';
}

// ─── Refunds (§8.7) ─────────────────────────────────────────────────────────

/** What refunding `qty` of a line gives back (the web's `lineRefundPence`). */
export function lineRefundPence(
  l: Pick<ShopOrderLine, 'quantity' | 'refunded_quantity' | 'total_pence' | 'refunded_pence'>,
  qty: number,
): number {
  if (qty <= 0) return 0;
  const left = l.quantity - l.refunded_quantity;
  const amount = qty === left ? l.total_pence - l.refunded_pence : Math.floor((l.total_pence * qty) / l.quantity + 0.5);
  return Math.min(Math.max(amount, 0), l.total_pence - l.refunded_pence);
}

// ─── What an order allows (§8.3) ────────────────────────────────────────────

export type OrderAction =
  | 'preparing'
  | 'ready'
  | 'dispatch'
  | 'collected'
  | 'delivered'
  | 'editTracking'
  | 'recordReturn'
  | 'cancelRefund'
  | 'refund'
  | 'packingSlip';

/**
 * The actions an order's state allows, in the web's order (v1: collection and delivery only; lost
 * in transit, appointment and reserve orders are later). A refund needs `refund` and money left.
 */
export function orderActions(d: Pick<ShopOrderDetail, 'order' | 'lines' | 'can'>): OrderAction[] {
  const o = d.order;
  const status = (o.fulfilment_status ?? 'new') as FulfilmentStatus;
  const isDelivery = o.fulfilment_type === 'delivery';
  const cancellable = status === 'new' || status === 'preparing' || (!isDelivery && status === 'ready');
  const refundable = o.paid_pence - o.refunded_pence > 0;
  const goods = d.lines.filter((l) => l.line_type === 'product');
  const out: OrderAction[] = [];
  if (status === 'new') out.push('preparing');
  if (!isDelivery && (status === 'new' || status === 'preparing')) out.push('ready');
  if (isDelivery && (status === 'new' || status === 'preparing')) out.push('dispatch');
  if (status === 'ready') out.push('collected');
  if (status === 'dispatched') out.push('delivered', 'editTracking');
  if ((status === 'collected' || status === 'delivered') && goods.some((l) => l.quantity - l.refunded_quantity > 0)) out.push('recordReturn');
  if (cancellable && d.can.refund && refundable) out.push('cancelRefund');
  if (!cancellable && status !== 'cancelled' && d.can.refund && refundable) out.push('refund');
  if (status !== 'cancelled') out.push('packingSlip');
  return out;
}

// ─── The timeline (§8.2) ────────────────────────────────────────────────────

/** One timeline entry in the deck's words (the web's `timelineText`). */
export function timelineText(entry: ShopOrderDetail['timeline'][number], t: PosT, money: (pence: number) => string): string {
  const who = entry.actor_name ?? 'Team member';
  const after = (entry.after ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case 'order.placed':
      return t('ord.tl.placed');
    case 'order.status': {
      const s = String(after.fulfilment_status ?? '');
      if (s === 'preparing') return t('ord.tl.preparing', { staffName: who });
      if (s === 'ready') return t('ord.tl.ready', { staffName: who });
      if (s === 'collected') return after.without_code ? t('ord.tl.collectedNoCode', { staffName: who }) : t('ord.tl.collected');
      if (s === 'dispatched') return after.carrier ? t('ord.tl.dispatched', { carrier: String(after.carrier) }) : t('ord.tl.dispatchedNoCarrier');
      if (s === 'delivered') return t('ord.tl.delivered');
      return entry.summary;
    }
    case 'order.tracking':
      return t('ord.tl.tracking', { staffName: who });
    case 'order.cancelled':
      return t('ord.tl.cancelled', { staffName: who, reason: String(after.reason ?? '') });
    case 'order.return':
      return t('ord.tl.returnRecorded', { staffName: who });
    case 'order.return.received':
      return t('ord.tl.returnReceived');
    case 'order.return.evidence':
      return t('ord.tl.returnEvidence');
    case 'refund.create':
      return typeof after.amount_pence === 'number' ? t('ord.tl.refunded', { amount: money(after.amount_pence) }) : entry.summary;
    case 'payment.settle':
    case 'payment.succeeded':
      return typeof after.amount_pence === 'number' ? t('ord.tl.paid', { amount: money(after.amount_pence) }) : entry.summary;
    default:
      return entry.summary;
  }
}

/** The order's messages by name, as the web lists them. */
export const MESSAGE_TITLES: Record<string, string> = {
  shop_order_confirmed_email: 'Order confirmation',
  shop_order_new_venue_email: 'New order alert to you',
  shop_order_ready_for_collection_email: 'Ready to collect',
  shop_order_ready_for_collection_sms: 'Ready to collect (text)',
  shop_order_dispatched_email: 'On its way',
  shop_order_delivered_email: 'Delivered',
  shop_order_refunded_email: 'Refund',
  shop_order_cancelled_email: 'Cancelled',
  shop_return_received_email: 'Return received',
  shop_order_stock_conflict_venue_email: 'Stock check alert to you',
  shop_return_refund_due_venue_email: 'Refund due alert to you',
};

/** "2 hours ago", "3 days ago", "just now" (`ord.row.placed`). */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "Thursday 9 October" in the venue's time zone (the web's `orderDate`). */
export function orderDate(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((x) => x.type === type)?.value ?? '';
    return `${get('weekday')} ${get('day')} ${get('month')}`;
  } catch {
    return iso.slice(0, 10);
  }
}
