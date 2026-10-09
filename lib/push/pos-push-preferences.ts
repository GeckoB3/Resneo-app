import { posCopy } from '@/lib/pos/copy';
import type { BooleanNotificationKey } from '@/types/notification-preferences';

/** One switch on the Push notifications screen. */
export type PushToggleRow = { key: BooleanNotificationKey; label: string; description: string };

/**
 * Checkout's staff pushes (POS plan Appendix G) for the Push notifications screen, which shows
 * them only at venues with Checkout on. Each key is one of the web's `STAFF_PREFERENCE_KEYS`, so it
 * is saved in the staff namespace. "New online orders" (`shop_order_new`) sits next to "Cash-up
 * reminders" while the venue's online shop is on.
 */
export function posPushRows(opts: { shopEnabled: boolean }): PushToggleRow[] {
  const rows: PushToggleRow[] = [
    {
      key: 'pos_cash_up_reminder',
      label: posCopy('push.pref.pos_cash_up_reminder'),
      description: 'When a till is still open at the end of the day',
    },
  ];
  if (opts.shopEnabled) {
    rows.push({
      key: 'shop_order_new',
      label: posCopy('push.pref.shop_order_new'),
      description: 'When someone pays for an order in your online shop',
    });
  }
  return rows;
}
