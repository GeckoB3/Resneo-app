/**
 * TanStack Query key factory — keeps cache keys consistent across hooks.
 * Include accessToken in auth-scoped keys so caches invalidate on sign-in/out.
 */
export const queryKeys = {
  all: ['reserveNI'] as const,

  staff: {
    all: () => [...queryKeys.all, 'staff'] as const,
    me: (accessToken?: string | null) =>
      [...queryKeys.staff.all(), 'me', accessToken ?? null] as const,
  },

  venue: {
    all: () => [...queryKeys.all, 'venue'] as const,
    bootstrap: (accessToken?: string | null) =>
      [...queryKeys.venue.all(), 'bootstrap', accessToken ?? null] as const,
  },

  dashboard: {
    all: () => [...queryKeys.all, 'dashboard'] as const,
    home: (accessToken?: string | null) =>
      [...queryKeys.dashboard.all(), 'home', accessToken ?? null] as const,
    today: (accessToken?: string | null, date?: string) =>
      [...queryKeys.dashboard.all(), 'today', accessToken ?? null, date ?? null] as const,
  },

  waitlist: {
    all: () => [...queryKeys.all, 'waitlist'] as const,
    list: (accessToken?: string | null, kind?: string | null) =>
      [...queryKeys.waitlist.all(), accessToken ?? null, kind ?? null] as const,
  },

  notifications: {
    all: () => [...queryKeys.all, 'notifications'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.notifications.all(), accessToken ?? null] as const,
  },

  services: {
    all: () => [...queryKeys.all, 'services'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.services.all(), accessToken ?? null] as const,
  },

  team: {
    all: () => [...queryKeys.all, 'team'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.team.all(), accessToken ?? null] as const,
  },

  communications: {
    all: () => [...queryKeys.all, 'communications'] as const,
    notificationSettings: (accessToken?: string | null) =>
      [...queryKeys.communications.all(), 'notificationSettings', accessToken ?? null] as const,
    policies: (accessToken?: string | null) =>
      [...queryKeys.communications.all(), 'policies', accessToken ?? null] as const,
  },

  compliance: {
    all: () => [...queryKeys.all, 'compliance'] as const,
    dashboard: (accessToken?: string | null) =>
      [...queryKeys.compliance.all(), 'dashboard', accessToken ?? null] as const,
    formLinks: (accessToken?: string | null) =>
      [...queryKeys.compliance.all(), 'formLinks', accessToken ?? null] as const,
  },

  addonGroups: {
    all: () => [...queryKeys.all, 'addonGroups'] as const,
    list: (accessToken?: string | null) =>
      [...queryKeys.addonGroups.all(), accessToken ?? null] as const,
  },

  reports: {
    all: () => [...queryKeys.all, 'reports'] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.reports.all(), accessToken ?? null, from ?? null, to ?? null] as const,
  },

  availabilityManage: {
    all: () => [...queryKeys.all, 'availabilityManage'] as const,
    blocks: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.availabilityManage.all(), 'blocks', accessToken ?? null, from ?? null, to ?? null] as const,
    leave: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.availabilityManage.all(), 'leave', accessToken ?? null, from ?? null, to ?? null] as const,
  },

  bookings: {
    all: () => [...queryKeys.all, 'bookings'] as const,
    list: (accessToken?: string | null, date?: string | null) =>
      [...queryKeys.bookings.all(), 'list', accessToken ?? null, date ?? null] as const,
    range: (accessToken?: string | null, from?: string | null, to?: string | null) =>
      [
        ...queryKeys.bookings.all(),
        'range',
        accessToken ?? null,
        from ?? null,
        to ?? null,
      ] as const,
    detail: (accessToken?: string | null, bookingId?: string | null) =>
      [
        ...queryKeys.bookings.all(),
        'detail',
        accessToken ?? null,
        bookingId ?? null,
      ] as const,
  },

  guests: {
    all: () => [...queryKeys.all, 'guests'] as const,
    list: (accessToken?: string | null, params?: Record<string, unknown>) =>
      [
        ...queryKeys.guests.all(),
        'list',
        accessToken ?? null,
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
        accessToken ?? null,
        guestId ?? null,
        bookingHistoryLimit ?? null,
      ] as const,
    timeline: (accessToken?: string | null, guestId?: string | null) =>
      [...queryKeys.guests.all(), 'timeline', accessToken ?? null, guestId ?? null] as const,
  },

  practitioners: {
    all: () => [...queryKeys.all, 'practitioners'] as const,
    list: (accessToken?: string | null, ownerVenueId?: string | null) =>
      [...queryKeys.practitioners.all(), 'list', accessToken ?? null, ownerVenueId ?? null] as const,
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
        accessToken ?? null,
        calendarIds ?? null,
        from ?? null,
        to ?? null,
      ] as const,
  },

  appointments: {
    all: () => [...queryKeys.all, 'appointments'] as const,
    catalog: (venueId?: string | null) =>
      [...queryKeys.appointments.all(), 'catalog', venueId ?? null] as const,
    availability: (
      accessToken?: string | null,
      date?: string | null,
      serviceId?: string | null,
      practitionerId?: string | null,
      ownerVenueId?: string | null,
      variantId?: string | null,
      addonsKey?: string | null,
      durationMinutes?: number | null,
    ) =>
      [
        ...queryKeys.appointments.all(),
        'availability',
        accessToken ?? null,
        date ?? null,
        serviceId ?? null,
        practitionerId ?? null,
        ownerVenueId ?? null,
        variantId ?? null,
        addonsKey ?? null,
        durationMinutes ?? null,
      ] as const,
    monthAvailability: (
      accessToken?: string | null,
      serviceId?: string | null,
      practitionerId?: string | null,
      year?: number,
      month?: number,
      variantId?: string | null,
      addonsKey?: string | null,
    ) =>
      [
        ...queryKeys.appointments.all(),
        'monthAvailability',
        accessToken ?? null,
        serviceId ?? null,
        practitionerId ?? null,
        year ?? null,
        month ?? null,
        variantId ?? null,
        addonsKey ?? null,
      ] as const,
  },
} as const;
