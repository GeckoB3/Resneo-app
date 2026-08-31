/**
 * TanStack Query key factory — keeps cache keys consistent across hooks.
 *
 * Auth-scoped keys are scoped by a STABLE per-user id (set via setQueryAuthScope
 * from AuthProvider), NOT the raw access token. The Supabase token rotates on
 * hourly auto-refresh; keying on it orphaned the ENTIRE cache every hour and
 * forced a full refetch of every screen mid-shift (W1.6). Keying on the stable
 * user id keeps the cache warm across refreshes while still isolating users.
 * Before the scope is set (cold start, pre-session) we fall back to the token,
 * and sign-out clears the cache (see AuthProvider) so users never share data.
 *
 * The key builders still take `accessToken` (callers pass it unchanged) — it's
 * used only as the pre-session fallback; the stable scope takes precedence.
 */

// Stable per-user cache scope (the Supabase user id). Set from AuthProvider on
// auth-state change; null when signed out.
let authScope: string | null = null;

/** Set the stable cache scope (the Supabase user id). Call on auth change. */
export function setQueryAuthScope(scope: string | null): void {
  authScope = scope;
}

/**
 * The auth segment for a key: the stable user id when known, else the token.
 * Exported so hooks that hand-assemble a sub-key (rather than using a factory
 * builder) scope consistently and also benefit from W1.6's refresh-stable cache.
 */
export function keyScope(accessToken?: string | null): string | null {
  if (authScope !== null) return authScope;
  return accessToken ?? null;
}

export const queryKeys = {
  all: ['reserveNI'] as const,

  staff: {
    all: () => [...queryKeys.all, 'staff'] as const,
    me: (accessToken?: string | null) =>
      [...queryKeys.staff.all(), 'me', keyScope(accessToken)] as const,
  },

  /**
   * The customer's own account, which is a different surface from `venue`:
   * these routes answer about the caller, never about a venue, and they are
   * scoped server-side from the session rather than by any id we send.
   */
  customer: {
    all: () => [...queryKeys.all, 'customer'] as const,
    profile: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'profile', keyScope(accessToken)] as const,
    home: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'home', keyScope(accessToken)] as const,
    bookings: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'bookings', keyScope(accessToken)] as const,
    booking: (bookingId: string | null, accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'booking', bookingId, keyScope(accessToken)] as const,
    rescheduleOptions: (bookingId: string | null, accessToken?: string | null) =>
      [
        ...queryKeys.customer.all(),
        'rescheduleOptions',
        bookingId,
        keyScope(accessToken),
      ] as const,
    venues: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'venues', keyScope(accessToken)] as const,
    memberships: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'memberships', keyScope(accessToken)] as const,
    credits: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'credits', keyScope(accessToken)] as const,
    courses: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'courses', keyScope(accessToken)] as const,
    recurring: (accessToken?: string | null) =>
      [...queryKeys.customer.all(), 'recurring', keyScope(accessToken)] as const,
    /** Public appointment slots for a reschedule. Not scoped to the caller. */
    slots: (venueId: string | null, date: string | null, serviceId: string | null, practitionerId: string | null) =>
      [...queryKeys.customer.all(), 'slots', venueId, date, serviceId, practitionerId] as const,
  },

  venue: {
    all: () => [...queryKeys.all, 'venue'] as const,
    bootstrap: (accessToken?: string | null) =>
      [...queryKeys.venue.all(), 'bootstrap', keyScope(accessToken)] as const,
  },

  dashboard: {
    all: () => [...queryKeys.all, 'dashboard'] as const,
    home: (accessToken?: string | null) =>
      [...queryKeys.dashboard.all(), 'home', keyScope(accessToken)] as const,
    today: (accessToken?: string | null, date?: string) =>
      [...queryKeys.dashboard.all(), 'today', keyScope(accessToken), date ?? null] as const,
  },

  waitlist: {
    all: () => [...queryKeys.all, 'waitlist'] as const,
    list: (accessToken?: string | null, kind?: string | null) =>
      [...queryKeys.waitlist.all(), keyScope(accessToken), kind ?? null] as const,
  },

  notifications: {
    all: () => [...queryKeys.all, 'notifications'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.notifications.all(), keyScope(accessToken)] as const,
  },

  services: {
    all: () => [...queryKeys.all, 'services'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.services.all(), keyScope(accessToken)] as const,
  },

  team: {
    all: () => [...queryKeys.all, 'team'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.team.all(), 'list', keyScope(accessToken)] as const,
    sessionSettings: (accessToken?: string | null) =>
      [...queryKeys.team.all(), 'sessionSettings', keyScope(accessToken)] as const,
  },

  communications: {
    all: () => [...queryKeys.all, 'communications'] as const,
    notificationSettings: (accessToken?: string | null) =>
      [...queryKeys.communications.all(), 'notificationSettings', keyScope(accessToken)] as const,
    policies: (accessToken?: string | null) =>
      [...queryKeys.communications.all(), 'policies', keyScope(accessToken)] as const,
  },

  compliance: {
    all: () => [...queryKeys.all, 'compliance'] as const,
    dashboard: (accessToken?: string | null) =>
      [...queryKeys.compliance.all(), 'dashboard', keyScope(accessToken)] as const,
    formLinks: (accessToken?: string | null) =>
      [...queryKeys.compliance.all(), 'formLinks', keyScope(accessToken)] as const,
    booking: (accessToken?: string | null, bookingId?: string | null) =>
      [...queryKeys.compliance.all(), 'booking', keyScope(accessToken), bookingId ?? null] as const,
  },

  addonGroups: {
    all: () => [...queryKeys.all, 'addonGroups'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.addonGroups.all(), keyScope(accessToken)] as const,
  },

  reports: {
    all: () => [...queryKeys.all, 'reports'] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.reports.all(), keyScope(accessToken), from ?? null, to ?? null] as const,
  },

  referrals: {
    all: () => [...queryKeys.all, 'referrals'] as const,
    dashboard: (accessToken?: string | null) =>
      [...queryKeys.referrals.all(), 'dashboard', keyScope(accessToken)] as const,
  },

  availabilityManage: {
    all: () => [...queryKeys.all, 'availabilityManage'] as const,
    blocks: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.availabilityManage.all(), 'blocks', keyScope(accessToken), from ?? null, to ?? null] as const,
    leave: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.availabilityManage.all(), 'leave', keyScope(accessToken), from ?? null, to ?? null] as const,
  },

  bookings: {
    all: () => [...queryKeys.all, 'bookings'] as const,
    list: (accessToken?: string | null, date?: string | null) =>
      [...queryKeys.bookings.all(), 'list', keyScope(accessToken), date ?? null] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [
        ...queryKeys.bookings.all(),
        'range',
        keyScope(accessToken),
        from ?? null,
        to ?? null,
      ] as const,
    detail: (accessToken?: string | null, bookingId?: string | null) =>
      [
        ...queryKeys.bookings.all(),
        'detail',
        keyScope(accessToken),
        bookingId ?? null,
      ] as const,
    groupVisit: (accessToken?: string | null, groupBookingId?: string | null) =>
      [
        ...queryKeys.bookings.all(),
        'groupVisit',
        keyScope(accessToken),
        groupBookingId ?? null,
      ] as const,
  },

  guests: {
    all: () => [...queryKeys.all, 'guests'] as const,
    list: (accessToken?: string | null, params?: Record<string, unknown>) =>
      [
        ...queryKeys.guests.all(),
        'list',
        keyScope(accessToken),
        params ?? null,
      ] as const,
    detail: (
      accessToken?: string | null,
      guestId?: string | null,
      bookingHistoryLimit?: number,
    ) =>
      [
        ...queryKeys.guests.all(),
        'detail',
        keyScope(accessToken),
        guestId ?? null,
        bookingHistoryLimit ?? null,
      ] as const,
    timeline: (accessToken?: string | null, guestId?: string | null) =>
      [...queryKeys.guests.all(), 'timeline', keyScope(accessToken), guestId ?? null] as const,
  },

  practitioners: {
    all: () => [...queryKeys.all, 'practitioners'] as const,
    list: (
      accessToken?: string | null,
      ownerVenueId?: string | null,
      includeResources = false,
    ) =>
      [
        ...queryKeys.practitioners.all(),
        'list',
        keyScope(accessToken),
        ownerVenueId ?? null,
        // Resource columns are a different roster, not a filter over the same
        // one — they must not share a cache entry with the staff-assignable list.
        includeResources ? 'with-resources' : 'staff-assignable',
      ] as const,
  },

  schedule: {
    all: () => [...queryKeys.all, 'schedule'] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.schedule.all(), keyScope(accessToken), from ?? null, to ?? null] as const,
  },

  calendar: {
    all: () => [...queryKeys.all, 'calendar'] as const,
    grid: (
      accessToken?: string | null,
      calendarIds?: string | null,
      from?: string | null,
      to?: string | null,
    ) =>
      [
        ...queryKeys.calendar.all(),
        'grid',
        keyScope(accessToken),
        calendarIds ?? null,
        from ?? null,
        to ?? null,
      ] as const,
  },

  appointments: {
    all: () => [...queryKeys.all, 'appointments'] as const,
    catalog: (venueId?: string | null) =>
      [...queryKeys.appointments.all(), 'catalog', venueId ?? null] as const,
    /**
     * Prefix of every {@link queryKeys.appointments.availability} key. Taking a
     * booking invalidates through this rather than through `all()`, which would
     * drag the service CATALOGUE along — that only changes when services or
     * practitioners do, never when a slot is filled.
     */
    availabilityAll: () => [...queryKeys.appointments.all(), 'availability'] as const,
    /** Prefix of every {@link queryKeys.appointments.monthAvailability} key. */
    monthAvailabilityAll: () =>
      [...queryKeys.appointments.all(), 'monthAvailability'] as const,
    availability: (
      accessToken?: string | null,
      date?: string | null,
      serviceId?: string | null,
      practitionerId?: string | null,
      ownerVenueId?: string | null,
      variantId?: string | null,
      addonsKey?: string | null,
      durationMinutes?: number | null,
      excludeBookingId?: string | null,
    ) =>
      [
        ...queryKeys.appointments.all(),
        'availability',
        keyScope(accessToken),
        date ?? null,
        serviceId ?? null,
        practitionerId ?? null,
        ownerVenueId ?? null,
        variantId ?? null,
        addonsKey ?? null,
        durationMinutes ?? null,
        excludeBookingId ?? null,
      ] as const,
    monthAvailability: (
      accessToken?: string | null,
      serviceId?: string | null,
      practitionerId?: string | null,
      year?: number,
      month?: number,
      variantId?: string | null,
      addonsKey?: string | null,
      durationMinutes?: number | null,
    ) =>
      [
        ...queryKeys.appointments.all(),
        'monthAvailability',
        keyScope(accessToken),
        serviceId ?? null,
        practitionerId ?? null,
        year ?? null,
        month ?? null,
        variantId ?? null,
        addonsKey ?? null,
        durationMinutes ?? null,
      ] as const,
  },

  linkedVenues: {
    all: () => [...queryKeys.all, 'linkedVenues'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'list', keyScope(accessToken)] as const,
    detail: (accessToken?: string | null, linkId?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'detail', keyScope(accessToken), linkId ?? null] as const,
    incoming: (accessToken?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'incoming', keyScope(accessToken)] as const,
    search: (accessToken?: string | null, q?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'search', keyScope(accessToken), q ?? null] as const,
    lookup: (accessToken?: string | null, slug?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'lookup', keyScope(accessToken), slug ?? null] as const,
    invite: (accessToken?: string | null, token?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'invite', keyScope(accessToken), token ?? null] as const,
    myCalendars: (accessToken?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'myCalendars', keyScope(accessToken)] as const,
    notificationPrefs: (accessToken?: string | null) =>
      [...queryKeys.linkedVenues.all(), 'notificationPrefs', keyScope(accessToken)] as const,
    audit: (accessToken?: string | null, linkId?: string | null, filtersKey?: string | null) =>
      [
        ...queryKeys.linkedVenues.all(),
        'audit',
        keyScope(accessToken),
        linkId ?? null,
        filtersKey ?? null,
      ] as const,
  },

  linkedCalendar: {
    all: () => [...queryKeys.all, 'linkedCalendar'] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.linkedCalendar.all(), keyScope(accessToken), from ?? null, to ?? null] as const,
    guests: (accessToken?: string | null, venueId?: string | null, q?: string | null) =>
      [
        ...queryKeys.linkedCalendar.all(),
        'guests',
        keyScope(accessToken),
        venueId ?? null,
        q ?? null,
      ] as const,
    venueProfile: (accessToken?: string | null, venueId?: string | null) =>
      [...queryKeys.linkedCalendar.all(), 'venueProfile', keyScope(accessToken), venueId ?? null] as const,
  },

  collectives: {
    all: () => [...queryKeys.all, 'collectives'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.collectives.all(), 'list', keyScope(accessToken)] as const,
    detail: (accessToken?: string | null, collectiveId?: string | null) =>
      [...queryKeys.collectives.all(), 'detail', keyScope(accessToken), collectiveId ?? null] as const,
    catalogue: (accessToken?: string | null, collectiveId?: string | null) =>
      [...queryKeys.collectives.all(), 'catalogue', keyScope(accessToken), collectiveId ?? null] as const,
    slug: (accessToken?: string | null, slug?: string | null) =>
      [...queryKeys.collectives.all(), 'slug', keyScope(accessToken), slug ?? null] as const,
  },
} as const;
