/**
 * The Availability screen's tabs (web `AppointmentAvailabilitySettings`:
 * `Tab`, `parseTabQueryParam`, `ALL_TABS`). `team` is admin-only; a non-admin
 * asking for it lands on `hours`.
 */
export type AvailabilityTab = 'team' | 'hours' | 'breaks' | 'daysoff';

export const AVAILABILITY_TABS: { key: AvailabilityTab; label: string }[] = [
  { key: 'team', label: 'Calendars' },
  { key: 'hours', label: 'Availability' },
  { key: 'breaks', label: 'Breaks' },
  { key: 'daysoff', label: 'Closures & amended hours' },
];

/** `?tab=` on /availability — the same aliases the web page accepts. */
export function parseAvailabilityTab(
  raw: string | string[] | null | undefined,
): AvailabilityTab | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const r = value.trim().toLowerCase();
  if (r === 'hours' || r === 'availability') return 'hours';
  if (r === 'team' || r === 'calendars') return 'team';
  if (r === 'breaks') return 'breaks';
  if (
    r === 'daysoff' ||
    r === 'time-off' ||
    r === 'timeoff' ||
    r === 'closures' ||
    r === 'unavailability'
  ) {
    return 'daysoff';
  }
  return null;
}

/** The tabs a viewer sees, and the one they land on without a `?tab=`. */
export function visibleAvailabilityTabs(isAdmin: boolean) {
  return isAdmin ? AVAILABILITY_TABS : AVAILABILITY_TABS.filter((t) => t.key !== 'team');
}

export function defaultAvailabilityTab(isAdmin: boolean): AvailabilityTab {
  return isAdmin ? 'team' : 'hours';
}

/** The tab to show: the URL's when valid for this viewer, else the default. */
export function resolveAvailabilityTab(
  raw: string | string[] | null | undefined,
  isAdmin: boolean,
): AvailabilityTab {
  const fromUrl = parseAvailabilityTab(raw);
  if (!fromUrl) return defaultAvailabilityTab(isAdmin);
  if (fromUrl === 'team' && !isAdmin) return 'hours';
  return fromUrl;
}
