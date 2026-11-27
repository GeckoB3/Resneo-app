/**
 * The server's quote for a staff booking (web `POST /api/venue/bookings/quote`, codebase standards
 * plan P4.2 and P4.3). Review & confirm used to work out times, prices and charges here with copies
 * of the server's rules, so the screen could promise something the server then did differently.
 * It now shows the server's answer.
 *
 * The fallback: a quote is used only when it carries `quote_version` (1 or later). A server without
 * the route (404), any refusal, a network failure, or an answer without the version leaves the
 * screen on today's local rules (`appointment-online-charge.ts`, `staff-deposit-deadline.ts`,
 * `multi-service-chain.ts`), unchanged.
 *
 * Pure: the request builders, the parser and the overlays are unit-tested; the hook that asks is
 * `lib/queries/useBookingQuote.ts`.
 */

import {
  segmentCustomDurationMinutes,
  type GroupPerson,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';
import type { StaffDepositOutcome } from '@/lib/booking/staff-deposit-deadline';

/** The oldest quote shape this build reads. */
export const BOOKING_QUOTE_VERSION = 1;

export type QuoteMode = 'single' | 'visit' | 'group';
export type QuoteChargeKind = 'none' | 'deposit' | 'full_payment' | 'card_hold';

export interface BookingQuoteItemRequest {
  service_id: string;
  variant_id?: string | null;
  calendar_id: string;
  /** HH:mm. */
  start: string;
  date?: string;
  custom_duration_minutes?: number | null;
  addon_ids?: string[];
}

export interface BookingQuoteRequest {
  date: string;
  mode: QuoteMode;
  source: 'phone' | 'walk-in';
  staff_charge?: {
    require_deposit?: boolean;
    require_card_hold?: boolean;
    cancel_if_no_card?: boolean;
    cancel_if_unpaid?: boolean;
  };
  owner_venue_id?: string;
  override_availability?: boolean;
  client?: { email?: string; phone?: string; guest_id?: string };
  items: BookingQuoteItemRequest[];
}

export interface BookingQuoteItem {
  index: number;
  service_id: string;
  calendar_id: string;
  date: string;
  start: string;
  end: string;
  duration_minutes: number;
  buffer_minutes: number;
  processing_tail_minutes: number;
  estimated_end_time: string | null;
  price: { service_pence: number | null; addons_pence: number; total_pence: number };
  charge: {
    kind: QuoteChargeKind;
    amount_pence: number;
    card_hold_fee_pence: number | null;
    offered_kind: QuoteChargeKind;
    offered_amount_pence: number;
    card_hold_percent: number | null;
  };
}

export interface BookingQuote {
  quote_version: number;
  mode: QuoteMode;
  cancellation_notice_hours: number;
  card_payments_available: boolean;
  items: BookingQuoteItem[];
  totals: {
    price_pence: number;
    duration_minutes: number;
    starts_at: string;
    ends_at: string;
    charge_now_pence: number;
    offered_charge_pence: number;
    card_hold_fee_pence: number;
  };
  deposit: {
    required: boolean;
    amount_pence: number;
    offered_amount_pence: number;
    word: 'deposit' | 'payment';
    cancel_choice: boolean;
    deadline_text: string | null;
    cancel_label: string | null;
    kept: boolean | null;
    cancel_at: string | null;
    outcome_line: string | null;
  };
  card_hold: {
    required: boolean;
    fee_pence: number;
    consent_text: string | null;
    percent: number | null;
    percent_label: string | null;
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The quote, or null when the answer is not one this build reads (no `quote_version`, or a shape it
 * cannot use): the caller then keeps its local rules.
 */
export function parseBookingQuote(body: unknown, expectedItems?: number): BookingQuote | null {
  if (!isObj(body) || !isNum(body.quote_version) || body.quote_version < BOOKING_QUOTE_VERSION) return null;
  if (!Array.isArray(body.items) || !isObj(body.totals) || !isObj(body.deposit) || !isObj(body.card_hold)) return null;
  if (expectedItems != null && body.items.length !== expectedItems) return null;
  const itemsOk = body.items.every(
    (item) =>
      isObj(item) &&
      isNum(item.index) &&
      typeof item.start === 'string' &&
      typeof item.end === 'string' &&
      isNum(item.duration_minutes) &&
      isObj(item.price) &&
      isNum(item.price.total_pence) &&
      isObj(item.charge) &&
      isNum(item.charge.offered_amount_pence),
  );
  if (!itemsOk) return null;
  const deposit = body.deposit;
  if (!isNum(deposit.offered_amount_pence) || !isNum(deposit.amount_pence) || typeof deposit.required !== 'boolean') return null;
  if (!isNum(body.card_hold.fee_pence)) return null;
  return body as unknown as BookingQuote;
}

/** One request, as a stable key: the same inputs are asked once and answered from the cache. */
export function bookingQuoteKey(request: BookingQuoteRequest | null): string | null {
  return request ? JSON.stringify(request) : null;
}

/** Who the booking is for, as the quote takes it (only to tell whether a payment link can reach them). */
export function quoteClient(guest: { email?: string | null; phone?: string | null; guest_id?: string | null }) {
  const email = guest.email?.trim() || undefined;
  const phone = guest.phone?.trim() || undefined;
  const guestId = guest.guest_id || undefined;
  return email || phone || guestId
    ? { ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(guestId ? { guest_id: guestId } : {}) }
    : undefined;
}

/** A visit's segments as quote items, with the same fields the create sends. */
export function visitQuoteItems(segments: readonly MultiServiceSegment[]): BookingQuoteItemRequest[] {
  return segments.map((seg) => {
    const custom = segmentCustomDurationMinutes(seg);
    return {
      service_id: seg.serviceId,
      ...(seg.serviceVariantId ? { variant_id: seg.serviceVariantId } : {}),
      calendar_id: seg.practitionerId,
      start: seg.startTime.slice(0, 5),
      ...(custom != null ? { custom_duration_minutes: custom } : {}),
      ...(seg.addonIds?.length ? { addon_ids: seg.addonIds } : {}),
    };
  });
}

/** A group's people as quote items (each on their own day). */
export function groupQuoteItems(people: readonly GroupPerson[]): BookingQuoteItemRequest[] {
  return people.map((p) => ({
    service_id: p.serviceId,
    ...(p.serviceVariantId ? { variant_id: p.serviceVariantId } : {}),
    calendar_id: p.practitionerId,
    start: p.bookingTime.slice(0, 5),
    date: p.bookingDate,
    ...(p.addonIds?.length ? { addon_ids: p.addonIds } : {}),
  }));
}

/** What a service asks for online (before staff choose), in the shape a segment carries. */
function offeredCharge(item: BookingQuoteItem): { chargePence: number | null; chargeLabel: 'deposit' | 'full_payment' | 'card_hold' | null } {
  const kind = item.charge.offered_kind;
  if (kind === 'none' || item.charge.offered_amount_pence <= 0) return { chargePence: null, chargeLabel: null };
  return { chargePence: item.charge.offered_amount_pence, chargeLabel: kind };
}

/**
 * The visit's segments with the server's figures: each service's length, end, price, add-on price,
 * processing tail and what it asks for online. Starts stay as laid out (they are what was asked).
 * Without a matching quote the segments come back as they are.
 */
export function applyQuoteToSegments(
  segments: MultiServiceSegment[],
  quote: BookingQuote | null,
): MultiServiceSegment[] {
  if (!quote || quote.items.length !== segments.length) return segments;
  return segments.map((seg, i) => {
    const item = quote.items.find((it) => it.index === i);
    if (!item || item.service_id !== seg.serviceId) return seg;
    // A segment without a staff length keeps none: its natural length moves with the server's, so
    // the create sends exactly what it sent before (`segmentCustomDurationMinutes`).
    const custom = segmentCustomDurationMinutes(seg);
    return {
      ...seg,
      durationMinutes: item.duration_minutes,
      naturalDurationMinutes: custom == null ? item.duration_minutes : seg.naturalDurationMinutes,
      processingTailMinutes: item.processing_tail_minutes,
      bufferMinutes: item.buffer_minutes,
      pricePence: item.price.service_pence,
      addonTotalPence: item.price.addons_pence,
      ...offeredCharge(item),
    };
  });
}

/** The group's people with the server's figures (length, price, add-on price, charge). */
export function applyQuoteToGroupPeople(people: GroupPerson[], quote: BookingQuote | null): GroupPerson[] {
  if (!quote || quote.items.length !== people.length) return people;
  return people.map((p, i) => {
    const item = quote.items.find((it) => it.index === i);
    if (!item || item.service_id !== p.serviceId) return p;
    return {
      ...p,
      durationMinutes: item.duration_minutes,
      pricePence: item.price.service_pence,
      addonTotalPence: item.price.addons_pence,
      ...offeredCharge(item),
    };
  });
}

/** What ticking "Require deposit" would ask for, and its word, from the quote. */
export function quoteOfferedCharge(quote: BookingQuote): { amountPence: number; chargeLabel: 'deposit' | 'full_payment' } {
  return {
    amountPence: quote.deposit.offered_amount_pence,
    chargeLabel: quote.deposit.word === 'payment' ? 'full_payment' : 'deposit',
  };
}

/**
 * The confirmation's deposit outcome from the quote (kept, or waiting until the deadline), or null
 * when the quote asked for no deposit or the server keeps its older rule (a visit with a card hold).
 */
export function quoteDepositOutcome(quote: BookingQuote): StaffDepositOutcome | null {
  const d = quote.deposit;
  if (!d.required || d.kept == null) return null;
  if (d.kept) return { kept: true, cancelOn: null, word: d.word };
  return d.cancel_at && d.deadline_text ? { kept: false, cancelOn: d.deadline_text, word: d.word } : null;
}
