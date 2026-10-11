import type { PosT } from '@/lib/pos/copy';
import type { PosVenueAlert } from '@/types/pos';

/**
 * "Needs your attention" on Checkout (UX spec §2.2), in step with the web's
 * `src/lib/pos/venue-alerts.ts`: what each open alert says and where its row leads. Pure, so the
 * words and links are tested without rendering. The route sends only the venue's own kinds; any
 * other kind a later server adds is left out until the app knows how to word it.
 */

const KINDS: readonly PosVenueAlert['kind'][] = ['refund_failed', 'dispute', 'stock_conflict'];

/** The rows the app can word, in the server's order (newest first). */
export function knownVenueAlerts(alerts: PosVenueAlert[] | null | undefined): PosVenueAlert[] {
  return (alerts ?? []).filter((a) => KINDS.includes(a.kind));
}

/** What a row says (`home.alerts.*`). */
export function venueAlertSentence(alert: PosVenueAlert, t: PosT, money: (pence: number) => string): string {
  if (alert.kind === 'refund_failed') return t('home.alerts.refundFailed');
  if (alert.kind === 'stock_conflict') return t('home.alerts.stockConflict');
  return alert.amount_pence != null
    ? t('home.alerts.dispute', { amount: money(alert.amount_pence) })
    : t('home.alerts.dispute.noAmount');
}

/**
 * Where a row leads: its sale, its online order, or, for a dispute with no sale, the payment
 * settings on the web (the only place to reach Stripe's dispute response from the dashboard).
 */
export type VenueAlertLink =
  | { kind: 'app'; href: string; label: string }
  | { kind: 'web'; path: string; label: string };

export function venueAlertLink(alert: PosVenueAlert, t: PosT): VenueAlertLink | null {
  if (alert.sale_id) {
    const id = encodeURIComponent(alert.sale_id);
    return alert.kind === 'stock_conflict'
      ? { kind: 'app', href: `/orders/${id}`, label: t('home.alerts.openOrder') }
      : { kind: 'app', href: `/checkout/${id}`, label: t('home.alerts.openSale') };
  }
  return alert.kind === 'dispute'
    ? { kind: 'web', path: '/dashboard/settings?tab=payments', label: t('home.alerts.openPayments') }
    : null;
}
