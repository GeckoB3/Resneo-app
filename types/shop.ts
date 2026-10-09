/**
 * Online orders as the staff app reads them (POS Pass 6a, app step 5; web `src/lib/shop/orders.ts`,
 * `src/lib/shop/order-facts.ts`, `src/app/api/venue/shop/orders/**`).
 */

export type OrderTab = 'todo' | 'ready' | 'sent' | 'done' | 'cancelled' | 'all';

export type FulfilmentStatus = 'new' | 'preparing' | 'ready' | 'collected' | 'dispatched' | 'delivered' | 'cancelled';

/** One row of `GET /api/venue/shop/orders`. */
export interface ShopOrderRow {
  id: string;
  number: number;
  customer_name: string;
  customer_email: string | null;
  total_pence: number;
  item_count: number;
  fulfilment_type: 'collection' | 'delivery';
  fulfilment_status: FulfilmentStatus | string;
  created_at: string;
  flags: {
    past_hold_since: string | null;
    refund_status: string;
    return_recorded: boolean;
    refund_due_by: string | null;
  };
}

export interface ShopOrdersResponse {
  orders: ShopOrderRow[];
  next_cursor: string | null;
  counts: Record<OrderTab, number>;
  venue: { name: string; currency: string; timezone: string };
}

export interface ShopOrderLine {
  id: string;
  line_type: string;
  name: string;
  option_name: string | null;
  variant_id: string | null;
  product_id: string | null;
  quantity: number;
  unit_price_pence: number;
  total_pence: number;
  tax_pence: number;
  tax_rate_bps: number;
  refunded_quantity: number;
  refunded_pence: number;
  hygiene_sealed: boolean;
  photo: string | null;
  track_stock: boolean;
}

export interface ShopOrderReturn {
  id: string;
  lines: { line_id: string; quantity: number }[];
  reason: string;
  note: string | null;
  status: string;
  goods_received_at: string | null;
  evidence_of_return_at: string | null;
  refund_due_by: string | null;
  created_at: string;
  created_by_name: string | null;
}

/** `GET /api/venue/shop/orders/[id]`. */
export interface ShopOrderDetail {
  order: {
    id: string;
    number: number;
    status: string;
    channel: string;
    fulfilment_type: 'collection' | 'delivery' | null;
    fulfilment_status: FulfilmentStatus | string | null;
    pickup_code: string | null;
    delivery_address: { line1?: string | null; line2?: string | null; town?: string | null; postcode?: string | null } | null;
    carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    created_at: string;
    completed_at: string | null;
    ready_at: string | null;
    collected_at: string | null;
    dispatched_at: string | null;
    delivered_at: string | null;
    subtotal_pence: number;
    delivery_pence: number;
    tax_pence: number;
    total_pence: number;
    paid_pence: number;
    refunded_pence: number;
    refund_status: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    marketing_consent: boolean | null;
    guest_id: string | null;
    cancel_reason: string | null;
    version: number;
    delivery_rate: { name?: string; price_pence?: number; estimate?: string | null } | null;
    hold_until: string | null;
    total_text?: string;
  };
  lines: ShopOrderLine[];
  payments: { id: string; method: string; status: string; amount_pence: number; card_brand: string | null; succeeded_at: string | null }[];
  refunds: { id: string; status: string; amount_pence: number; created_at: string; succeeded_at: string | null }[];
  returns: ShopOrderReturn[];
  timeline: { at: string; action: string; summary: string; actor_name: string | null; after: Record<string, unknown> | null }[];
  messages: { at: string; message_type: string; channel: string; status: string }[];
  return_window_ends: string | null;
  return_window_closed: boolean;
  venue: { name: string; currency: string; timezone: string; address?: unknown; logo_url?: string | null };
  settings: { refund_reasons: string[]; vat_registered: boolean };
  can: { refund: boolean; is_admin: boolean };
}
