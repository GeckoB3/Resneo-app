/**
 * The plan's calendar allowance, as `GET /api/venue/calendar-entitlement`
 * answers it, and the copy the Calendars screen shows around it (web
 * `BookableCalendarsPanel` + `CalendarLimitMessage`). Plan changes happen on
 * the web dashboard (the app never sells a subscription), so every line points
 * there.
 */

export interface CalendarEntitlement {
  pricing_tier: string;
  calendar_count: number | null;
  active_practitioners: number;
  calendar_limit: number | null;
  unlimited: boolean;
  at_calendar_limit: boolean;
  can_add_practitioner: boolean;
  unified_calendar_count?: number | null;
  staff_limit?: number | null;
  active_staff?: number;
  can_invite_staff?: boolean;
}

/** The "3 / 5 on plan" pill, or "Unlimited calendars". */
export function calendarEntitlementPill(entitlement: CalendarEntitlement): string {
  if (entitlement.unlimited) return 'Unlimited calendars';
  const used = entitlement.unified_calendar_count ?? entitlement.active_practitioners;
  return `${used} / ${entitlement.calendar_limit ?? '∞'} on plan`;
}

/** True when the plan has no room for another calendar. */
export function calendarLimitReached(entitlement: CalendarEntitlement | null): boolean {
  return Boolean(entitlement && !entitlement.can_add_practitioner && !entitlement.unlimited);
}

/** What to say when the plan has no room for another calendar (web `CalendarLimitMessage`). */
export function calendarLimitMessage(entitlement: CalendarEntitlement | null): string {
  if (!entitlement) {
    return "You've reached your plan's calendar limit. Visit Settings → Plan on the web dashboard to review your plan.";
  }
  const tier = entitlement.pricing_tier.toLowerCase();
  if (tier === 'light') {
    return 'Appointments Light includes one bookable calendar. Upgrade to Appointments Plus or Pro under Settings → Plan on the web dashboard to add more columns.';
  }
  if (tier === 'plus') {
    return 'Appointments Plus includes up to five bookable calendars. Deactivate an existing calendar or upgrade to Appointments Pro under Settings → Plan on the web dashboard to add more.';
  }
  if (entitlement.calendar_limit != null) {
    const plan = tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : 'current';
    return `Your ${plan} plan includes up to ${entitlement.calendar_limit} bookable calendar${entitlement.calendar_limit === 1 ? '' : 's'}. Deactivate an existing calendar or visit Settings → Plan on the web dashboard to adjust your plan.`;
  }
  return "You've reached your plan's calendar limit. Visit Settings → Plan on the web dashboard to review your plan.";
}
