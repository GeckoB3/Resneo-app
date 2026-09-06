import {
  calendarEntitlementPill,
  calendarLimitMessage,
  calendarLimitReached,
  type CalendarEntitlement,
} from '@/lib/venue/calendar-entitlement';

function entitlement(over: Partial<CalendarEntitlement> = {}): CalendarEntitlement {
  return {
    pricing_tier: 'plus',
    calendar_count: null,
    active_practitioners: 3,
    calendar_limit: 5,
    unlimited: false,
    at_calendar_limit: false,
    can_add_practitioner: true,
    unified_calendar_count: 3,
    ...over,
  };
}

describe('calendar entitlement copy', () => {
  it('reads the pill from the unified count over the limit, or says unlimited', () => {
    expect(calendarEntitlementPill(entitlement())).toBe('3 / 5 on plan');
    expect(calendarEntitlementPill(entitlement({ unified_calendar_count: null, active_practitioners: 2 }))).toBe(
      '2 / 5 on plan',
    );
    expect(calendarEntitlementPill(entitlement({ unlimited: true, calendar_limit: null }))).toBe(
      'Unlimited calendars',
    );
  });

  it('knows when the plan is full, and never with an unknown entitlement', () => {
    expect(calendarLimitReached(null)).toBe(false);
    expect(calendarLimitReached(entitlement())).toBe(false);
    expect(calendarLimitReached(entitlement({ can_add_practitioner: false }))).toBe(true);
    expect(calendarLimitReached(entitlement({ can_add_practitioner: false, unlimited: true }))).toBe(false);
  });

  it('words the limit per tier, pointing at the web dashboard', () => {
    expect(calendarLimitMessage(entitlement({ pricing_tier: 'light' }))).toMatch(
      /^Appointments Light includes one bookable calendar\./,
    );
    expect(calendarLimitMessage(entitlement({ pricing_tier: 'plus' }))).toMatch(
      /^Appointments Plus includes up to five bookable calendars\./,
    );
    expect(calendarLimitMessage(entitlement({ pricing_tier: 'pro', calendar_limit: 12 }))).toBe(
      'Your Pro plan includes up to 12 bookable calendars. Deactivate an existing calendar or visit Settings → Plan on the web dashboard to adjust your plan.',
    );
    expect(calendarLimitMessage(null)).toMatch(/^You've reached your plan's calendar limit\./);
    for (const tier of ['light', 'plus', 'pro']) {
      expect(calendarLimitMessage(entitlement({ pricing_tier: tier, calendar_limit: 9 }))).toContain(
        'web dashboard',
      );
    }
  });
});
