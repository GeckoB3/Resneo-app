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
    ) =>
      [
        ...queryKeys.appointments.all(),
        'availability',
        accessToken ?? null,
        date ?? null,
        serviceId ?? null,
        practitionerId ?? null,
        ownerVenueId ?? null,
      ] as const,
  },
} as const;
