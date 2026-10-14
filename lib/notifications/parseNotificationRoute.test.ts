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

  it('opens Commission splits for its notices, whatever else the link carries (2026-10-14)', () => {
    expect(parseNotificationRoute('/dashboard/settings?tab=commission')).toEqual({ type: 'commission-splits', splitId: null });
    expect(parseNotificationRoute('/dashboard/settings?tab=commission&section=businesses')).toEqual({
      type: 'commission-splits',
      splitId: null,
    });
    expect(parseNotificationRoute('/dashboard/settings?from=notice&tab=commission#statements')).toEqual({
      type: 'commission-splits',
      splitId: null,
    });
    expect(parseNotificationRoute('https://www.resneo.com/dashboard/settings?tab=commission&split=s-1')).toEqual({
      type: 'commission-splits',
      splitId: 's-1',
    });
    // Another Settings tab, or a tab that only starts with the word, is not this one.
    expect(parseNotificationRoute('/dashboard/settings?tab=checkout')).toBeNull();
    expect(parseNotificationRoute('/dashboard/settings?tab=commission-old')).toBeNull();
  });

  it('goes nowhere for anything else', () => {
    expect(parseNotificationRoute(null)).toBeNull();
    expect(parseNotificationRoute('/dashboard/appointment-services-old')).toBeNull();
    expect(parseNotificationRoute('/dashboard/reports')).toBeNull();
  });
});
