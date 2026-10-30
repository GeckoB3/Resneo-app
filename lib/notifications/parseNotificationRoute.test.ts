import { parseNotificationRoute } from './parseNotificationRoute';

describe('parseNotificationRoute', () => {
  it('opens the calendar on the day, and the Linked Venues hub for link activity', () => {
    expect(parseNotificationRoute('/dashboard/calendar?date=2026-06-11')).toEqual({ type: 'calendar', date: '2026-06-11' });
    expect(parseNotificationRoute('/dashboard/settings?tab=linked-accounts')).toEqual({ type: 'linked-venues' });
  });

  it("still opens Services for a member's suggestion stored before 2026-10-27 (N25); Services sends a host on", () => {
    expect(parseNotificationRoute('/dashboard/appointment-services?add_from=v-zen&service=svc%201')).toEqual({
      type: 'services',
      addFrom: 'v-zen',
      service: 'svc 1',
    });
    // A suggestion stored before it carried its venue and service: Services lists every one waiting.
    expect(parseNotificationRoute('/dashboard/appointment-services')).toEqual({ type: 'services', addFrom: null, service: null });
  });

  it("opens Manage Collective on every venue's services for a bell about curating the page (2026-10-27)", () => {
    // A member's suggestions: that venue, on the suggestions waiting.
    expect(parseNotificationRoute('/dashboard/collective?view=venues&venue=v-zen&filter=suggested')).toEqual({
      type: 'collective-area',
      view: 'venues',
      venue: 'v-zen',
      filter: 'suggested',
    });
    // A suggestion left off, or the page curated: every venue's services, no venue or filter.
    expect(parseNotificationRoute('/dashboard/collective?view=venues')).toEqual({
      type: 'collective-area',
      view: 'venues',
      venue: null,
      filter: null,
    });
    // Manage Collective itself, on a full address too; an unknown view or filter is ignored.
    expect(parseNotificationRoute('https://www.resneo.com/dashboard/collective')).toEqual({
      type: 'collective-area',
      view: null,
      venue: null,
      filter: null,
    });
    expect(parseNotificationRoute('/dashboard/collective?view=grid&filter=all#top')).toEqual({
      type: 'collective-area',
      view: null,
      venue: null,
      filter: null,
    });
    // A longer path that only starts with the word is not Manage Collective.
    expect(parseNotificationRoute('/dashboard/collectives')).toBeNull();
    expect(parseNotificationRoute('/dashboard/collective-old?view=venues')).toBeNull();
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

  // CQ-10.5 (2026-10-29): a collective notice opens the screen that answers it, not Linked venues.
  it("follows the server's read-time links: Manage Collective, Services, Booking page and Calendar Availability", () => {
    expect(parseNotificationRoute('/dashboard/collective', 'collective_service_offered')).toEqual({
      type: 'collective-area',
      view: null,
      venue: null,
      filter: null,
    });
    expect(parseNotificationRoute('/dashboard/appointment-services', 'collective_n19')).toEqual({
      type: 'services',
      addFrom: null,
      service: null,
    });
    expect(parseNotificationRoute('/dashboard/settings?tab=booking-page', 'collective_n38')).toEqual({ type: 'booking-page' });
    // A collective calendar notice carried /dashboard/availability, which opened nothing.
    expect(parseNotificationRoute('/dashboard/availability', 'collective_calendar')).toEqual({ type: 'availability' });
    expect(parseNotificationRoute('/dashboard/availability-old')).toBeNull();
  });

  it('opens Venue collectives for an invitation, whatever link it carries', () => {
    expect(parseNotificationRoute('/dashboard/settings?tab=linked-accounts', 'collective_member_invited')).toEqual({
      type: 'collectives',
    });
    expect(parseNotificationRoute('/dashboard/settings?tab=linked-accounts', 'collective_n1')).toEqual({ type: 'collectives' });
  });

  it('routes by type a collective notice an older server sent with the Linked Accounts link', () => {
    const linked = '/dashboard/settings?tab=linked-accounts';
    for (const type of ['collective_service_offered', 'collective_joined', 'collective_values_cleared', 'collective_left']) {
      expect(parseNotificationRoute(linked, type)).toEqual({ type: 'collective-area', view: null, venue: null, filter: null });
    }
    // An ended collective, a removal, or a link that ended: never Manage Collective (the venue may have left).
    for (const type of ['collective_n19', 'collective_removed', 'collective_link_ended']) {
      expect(parseNotificationRoute(linked, type)).toEqual({ type: 'services', addFrom: null, service: null });
    }
    expect(parseNotificationRoute(linked, 'collective_n38')).toEqual({ type: 'booking-page' });
    // Link activity, and any other type, still opens Linked venues.
    expect(parseNotificationRoute(linked, 'link_request')).toEqual({ type: 'linked-venues' });
    expect(parseNotificationRoute(linked)).toEqual({ type: 'linked-venues' });
    // A link the notice carries itself wins over its type.
    expect(parseNotificationRoute('/dashboard/calendar?date=2026-11-02', 'collective_joined')).toEqual({
      type: 'calendar',
      date: '2026-11-02',
    });
  });

  it('goes nowhere for anything else', () => {
    expect(parseNotificationRoute(null)).toBeNull();
    expect(parseNotificationRoute('/dashboard/appointment-services-old')).toBeNull();
    expect(parseNotificationRoute('/dashboard/reports')).toBeNull();
  });
});
