/**
 * Checkout's switches on Push notifications: "New online orders" (`shop_order_new`, one of the
 * web's STAFF_PREFERENCE_KEYS since 2026-10-09) sits next to "Cash-up reminders", only while the
 * venue's online shop is on, and is on unless turned off, as the web reads it.
 */
import { posPushRows } from '@/lib/push/pos-push-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES, resolveNotificationPreferences } from '@/types/notification-preferences';

describe('posPushRows', () => {
  it('adds "New online orders" next to "Cash-up reminders" at venues with the online shop on', () => {
    expect(posPushRows({ shopEnabled: true }).map((r) => [r.key, r.label])).toEqual([
      ['pos_cash_up_reminder', 'Cash-up reminders'],
      ['shop_order_new', 'New online orders'],
    ]);
  });

  it('shows only "Cash-up reminders" while the shop is off', () => {
    expect(posPushRows({ shopEnabled: false }).map((r) => r.key)).toEqual(['pos_cash_up_reminder']);
  });

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    for (const row of posPushRows({ shopEnabled: true })) {
      expect(row.label + row.description).not.toContain(EM_DASH);
    }
  });
});

describe('shop_order_new preference', () => {
  it('is on unless turned off', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.shop_order_new).toBe(true);
    expect(resolveNotificationPreferences({}).shop_order_new).toBe(true);
    expect(resolveNotificationPreferences({ shop_order_new: false }).shop_order_new).toBe(false);
    expect(resolveNotificationPreferences({ shop_order_new: 'no' }).shop_order_new).toBe(true);
  });
});
