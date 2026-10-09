import { canPos } from '@/lib/pos/pos-enabled';
import { tipConfig } from '@/lib/pos/sale-math';
import type { PosCopyId, PosT } from '@/lib/pos/copy';
import type {
  PosBootstrap,
  PosCollectScreen,
  PosPayLink,
  PosPayment,
  PosPayoutStatus,
  PosReader,
  PosSale,
  PosSavedCard,
} from '@/types/pos';

/**
 * The rules behind app step 2's card methods (POS plan §4.4, §4.36; UX spec §3.19, §3.29, §13.4,
 * §23.5), kept pure so they are tested without rendering. Each follows the web till's version of
 * the same rule (`src/components/pos/PaymentPanel.tsx`, `paylinks/`, `saved-cards/`, `tophone/`).
 */

// ─── Which methods the payment sheet offers ─────────────────────────────────

export interface CardMethodsOffered {
  /** A counter reader, driven by the server (`card_reader`): readers registered and in-person cards on. */
  cardReader: boolean;
  /** Pay by link or QR code (`pay_link`): needs only Stripe charges, not the in-person switch. */
  payLink: boolean;
  /** Cards on file (`saved_card`): the setting on, `charge_saved_card`, and a client on the sale. */
  savedCards: boolean;
}

export function cardMethodsOffered(
  bootstrap: Pick<PosBootstrap, 'card_methods' | 'capabilities' | 'settings'> | null | undefined,
  sale: Pick<PosSale, 'guest'>,
): CardMethodsOffered {
  const take = canPos(bootstrap, 'take_payment');
  return {
    cardReader: take && bootstrap?.card_methods?.card_reader === true,
    payLink: take && bootstrap?.card_methods?.pay_link === true,
    savedCards:
      take &&
      bootstrap?.settings?.card_on_file_enabled === true &&
      canPos(bootstrap, 'charge_saved_card') &&
      Boolean(sale.guest?.id),
  };
}

/** Whether a pay link may offer the client a tip: tips on, and tips on links not switched off. */
export function tipsOnLinks(bootstrap: Pick<PosBootstrap, 'tip_settings'> | null | undefined): boolean {
  return tipConfig(bootstrap?.tip_settings).enabled && bootstrap?.tip_settings?.tip_on_links !== false;
}

/**
 * `done.tipLink` (UX spec §3.29 step 1): a completed visit paid in full with no tip, at a venue
 * that takes tips on links and can take card payments, for a login that can take payments.
 */
export function tipLinkOffered(
  sale: Pick<PosSale, 'status' | 'tip_pence' | 'balance_due_pence' | 'lines'>,
  bootstrap: Pick<PosBootstrap, 'tip_settings' | 'card_methods' | 'capabilities'> | null | undefined,
): boolean {
  return (
    sale.status === 'completed' &&
    sale.tip_pence === 0 &&
    sale.balance_due_pence <= 0 &&
    sale.lines.some((l) => Boolean(l.booking_id)) &&
    tipsOnLinks(bootstrap) &&
    bootstrap?.card_methods?.pay_link === true &&
    canPos(bootstrap, 'take_payment')
  );
}

// ─── Pending payments on a sale ─────────────────────────────────────────────

/** A counter reader payment still waiting on the sale (the till follows it), else null. */
export function pendingReaderPayment(sale: Pick<PosSale, 'payments'>): PosPayment | null {
  return sale.payments.find((p) => p.status === 'pending' && p.method === 'card_reader') ?? null;
}

/** A card on file payment the bank declined, which keeps the sale locked until it is cancelled. */
export function declinedSavedCardPayment(sale: Pick<PosSale, 'payments' | 'payment_lock_payment_id'>): PosPayment | null {
  return (
    sale.payments.find(
      (p) => p.status === 'pending' && p.method === 'saved_card' && (p.id === sale.payment_lock_payment_id || Boolean(p.failure_code)),
    ) ?? null
  );
}

/** A sale sent to a phone from the web till that is still waiting (its cancel is the collect route). */
export function pendingCollectPayment(sale: Pick<PosSale, 'payments'>): PosPayment | null {
  return sale.payments.find((p) => p.status === 'pending' && Boolean(p.collect_state)) ?? null;
}

/** Pay links reserve their amount but never lock the sale (UX spec §3.19.4). */
export function waitingPayLinks(links: PosPayLink[] | undefined): PosPayLink[] {
  return (links ?? []).filter((l) => l.status === 'waiting');
}

// ─── Counter readers ────────────────────────────────────────────────────────

export function readerStatusCopyId(reader: Pick<PosReader, 'busy' | 'status'>): PosCopyId {
  if (reader.busy) return 'reader.status.busy';
  if (reader.status === 'offline') return 'reader.status.offline';
  return 'reader.status.online';
}

/** The reader to offer first: the sale's till's default, else the first that is not offline or busy. */
export function defaultReaderFor(readers: PosReader[], tillId: string | null): PosReader | null {
  const active = readers.filter((r) => r.is_active);
  const forTill = tillId ? active.find((r) => (r.default_for_till_ids ?? []).includes(tillId)) : undefined;
  return forTill ?? active.find((r) => !r.busy && r.status !== 'offline') ?? active[0] ?? null;
}

// ─── Saved cards ────────────────────────────────────────────────────────────

const BRAND: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
};

export function cardBrandName(brand: string | null | undefined): string {
  const b = (brand ?? '').toLowerCase();
  return BRAND[b] ?? (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
}

/** `saved.card`, or "{brand} ending {last4}" when Stripe sent no expiry. */
export function savedCardLabel(card: Pick<PosSavedCard, 'brand' | 'last4' | 'exp_month' | 'exp_year'>, t: PosT): string {
  const brand = cardBrandName(card.brand);
  const last4 = card.last4 ?? '????';
  if (card.exp_month && card.exp_year) {
    const expiry = `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`;
    return t('saved.card', { brand, last4, expiry });
  }
  return `${brand} ending ${last4}`;
}

/** `saved.consent`: "Saved with permission on {date}, {channel}". */
export function savedCardConsentLine(card: Pick<PosSavedCard, 'consent_at' | 'consent_channel'>, t: PosT, timeZone: string): string {
  let date = '';
  try {
    date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(card.consent_at));
  } catch {
    date = card.consent_at.slice(0, 10);
  }
  const channelId = `saved.channel.${card.consent_channel}` as PosCopyId;
  const channel = (['reader', 'app', 'online_booking', 'shop', 'account'] as const).includes(card.consent_channel)
    ? t(channelId)
    : t('saved.channel.reader');
  return t('saved.consent', { date, channel });
}

// ─── Pay links ──────────────────────────────────────────────────────────────

/** `link.expires`: the time and date a link stops working, in the venue's time. */
export function payLinkExpiry(expiresAt: string, timeZone: string): { time: string; date: string } {
  try {
    const d = new Date(expiresAt);
    return {
      time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d),
      date: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(d),
    };
  } catch {
    return { time: expiresAt.slice(11, 16), date: expiresAt.slice(0, 10) };
  }
}

// ─── A sale sent to this phone ──────────────────────────────────────────────

/** The bank wants the card inserted with a PIN, which a phone cannot do (plan §4.22). */
export function isPinRequired(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.toLowerCase();
  return c === 'offline_pin_required' || c === 'online_or_offline_pin_required' || c === 'tap_to_pay_pin_unavailable';
}

/**
 * Stripe's limit of three businesses in 24 hours for Tap to Pay on one iPhone (plan §4.22). The
 * pinned SDK has no code of its own for it, so the error's words are read.
 */
export function isAccountLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /(too many|three|3)\b[^.]*\b(accounts?|merchants?|businesses)\b/i.test(message) || /\baccount limit\b/i.test(message);
}

/** The screens that mean the payment has ended, one way or another. */
export function collectEnded(screen: PosCollectScreen): boolean {
  return screen === 'paid' || screen === 'cancelled' || screen === 'expired' || screen === 'timed_out' || screen === 'failed';
}

/**
 * What the collect screen says when a request has ended without this phone taking the card, from
 * the server's state. `paid` is said separately (`app.collect.done`).
 */
export function collectEndedCopyId(screen: PosCollectScreen, wasMine: boolean): PosCopyId {
  switch (screen) {
    case 'expired':
      return 'app.collect.expired';
    case 'timed_out':
      return 'app.collect.timeout';
    case 'cancelled':
      return wasMine ? 'app.collect.cancelledByDesk' : 'app.collect.gone';
    case 'paid':
      return 'app.collect.done';
    default:
      return 'app.collect.gone';
  }
}

// ─── Payouts ────────────────────────────────────────────────────────────────

export function payoutStatusCopyId(status: PosPayoutStatus): PosCopyId {
  return `rep.payout.status.${status}` as PosCopyId;
}
