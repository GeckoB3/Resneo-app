import { parseNotificationRoute } from './parseNotificationRoute';

describe('parseNotificationRoute', () => {
  it('opens the calendar on the day, and the Linked Venues hub for link activity', () => {
    expect(parseNotificationRoute('/dashboard/calendar?date=2026-06-11')).toEqual({ type: 'calendar', date: '2026-06-11' });
    expect(parseNotificationRoute('/dashboard/settings?tab=linked-accounts')).toEqual({ type: 'linked-venues' });
  });

  it("opens Services with a member's suggestion chosen (N25)", () => {
    expect(parseNotificationRoute('/dashboard/appointment-services?add_from=v-zen&service=svc%201')).toEqual({
      type: 'services',
      addFrom: 'v-zen',
      service: 'svc 1',
    });
    // A suggestion stored before it carried its venue and service: Services lists every one waiting.
    expect(parseNotificationRoute('/dashboard/appointment-services')).toEqual({ type: 'services', addFrom: null, service: null });
  });

  it('goes nowhere for anything else', () => {
    expect(parseNotificationRoute(null)).toBeNull();
    expect(parseNotificationRoute('/dashboard/appointment-services-old')).toBeNull();
    expect(parseNotificationRoute('/dashboard/reports')).toBeNull();
  });
});
