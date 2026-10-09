import type { PosCopyId, PosT } from '@/lib/pos/copy';
import type { MovementReason, StockMovement, StocktakeLine, StocktakeStatus } from '@/types/retail';

/**
 * Small, pure helpers the products and stock screens share (UX spec §6.1, §6.8 to §6.11), as the
 * web's `stock-api.ts`, `MovementsTab.tsx` and `StocktakesTab.tsx` word them.
 */

/** "Shampoo, 250 ml" or "Shampoo". */
export function productLabel(productName: string | null | undefined, optionName: string | null | undefined): string {
  return [productName, optionName].filter((x) => typeof x === 'string' && x.trim()).join(', ') || 'Product';
}

/** A whole number as typed, with an optional minus sign; null for anything else. */
export function parseWhole(raw: string): number | null {
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** `+3` or `-2`. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

const REASON_IDS: Record<MovementReason, PosCopyId> = {
  opening: 'mov.reason.opening',
  receive: 'mov.reason.receive',
  sale: 'mov.reason.sale',
  refund_restock: 'mov.reason.refund_restock',
  adjustment: 'mov.reason.adjustment',
  stocktake: 'mov.reason.stocktake',
  wastage: 'mov.reason.wastage',
  damaged: 'mov.reason.damaged',
  expired: 'mov.reason.expired',
  theft: 'mov.reason.theft',
  professional_use: 'mov.reason.professional_use',
  professional_use_reversal: 'mov.reason.professional_use_reversal',
  transfer_out: 'mov.reason.transfer_out',
  transfer_in: 'mov.reason.transfer_in',
  import: 'mov.reason.import',
};

/** `mov.reason.*`; an unknown reason reads as a count correction. */
export function movementReasonId(reason: string): PosCopyId {
  return REASON_IDS[reason as MovementReason] ?? 'mov.reason.adjustment';
}

/** What a movement points at (`mov.ref.*`): the sale, its return, the stocktake, the order or a booking. */
export function movementReference(m: StockMovement, t: PosT): string | null {
  if (m.sale_id && m.sale_number) {
    return m.return_id ? t('mov.ref.return', { saleNo: m.sale_number }) : t('mov.ref.sale', { saleNo: m.sale_number });
  }
  if (m.stocktake_id && m.stocktake_number) return t('mov.ref.stocktake', { number: m.stocktake_number });
  if (m.purchase_order_id && m.purchase_order_number) return t('mov.ref.po', { poNumber: m.purchase_order_number });
  if (m.booking_id) {
    let shortDate = m.business_date;
    try {
      shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${m.business_date}T12:00:00Z`),
      );
    } catch {
      // Keep the plain date.
    }
    return t('mov.ref.booking', { shortDate });
  }
  return null;
}

/** `take.status.*`. */
export function stocktakeStatusId(status: StocktakeStatus): PosCopyId {
  return status === 'review'
    ? 'take.status.review'
    : status === 'committed'
      ? 'take.status.committed'
      : status === 'cancelled'
        ? 'take.status.cancelled'
        : 'take.status.counting';
}

/** The date in `take.name.default` ("Stocktake Friday 9 October"), as the web's till date. */
export function stocktakeDefaultName(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A date and time as the stock screens show them ("9 Oct, 14:20"), in the venue's time zone. */
export function shortWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function timeOfDay(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** "Sam, Ali and Jo" (`take.counters`). */
export function joinNames(names: string[]): string {
  const list = names.filter((n) => n.trim());
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * What the review shows and committing sends (§6.11 Review): the lines that change, the difference
 * at cost of those, the uncounted lines, and how many options a commit changes (with "count
 * anything not counted as zero" on a full count, the uncounted ones that hold stock too).
 */
export function reviewSummary(
  lines: StocktakeLine[],
  opts: { full: boolean; zeroUncounted: boolean },
): { changed: StocktakeLine[]; uncounted: StocktakeLine[]; variancePence: number; commitCount: number; counted: number } {
  const uncounted = lines.filter((l) => l.counted === null);
  const changed = lines.filter((l) => l.counted !== null && l.change !== null && l.change !== 0);
  const variancePence = changed.reduce((sum, l) => sum + (l.value_pence ?? 0), 0);
  const zero = opts.full && opts.zeroUncounted;
  const commitCount = changed.length + (zero ? uncounted.filter((l) => l.on_hand_now !== 0).length : 0);
  return { changed, uncounted, variancePence, commitCount, counted: lines.length - uncounted.length };
}
