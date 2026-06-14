/**
 * Branded empty-state illustrations (W5.5).
 *
 * A small set of flat, geometric, navy + teal SVG scenes that render crisply at
 * ~96–140px and read correctly in BOTH light and dark mode (colours come from
 * the theme via `useIllustrationPalette`). Drop one into `EmptyState` via its
 * `illustration` prop — either the component directly, or a variant name.
 */
import type { ComponentType } from 'react';

import { EmptyBookings } from './EmptyBookings';
import { EmptyClients } from './EmptyClients';
import { EmptyInbox } from './EmptyInbox';
import { EmptySearch } from './EmptySearch';
import { EmptyWaitlist } from './EmptyWaitlist';
import type { IllustrationProps } from './palette';

export { EmptyBookings } from './EmptyBookings';
export { EmptyClients } from './EmptyClients';
export { EmptyInbox } from './EmptyInbox';
export { EmptySearch } from './EmptySearch';
export { EmptyWaitlist } from './EmptyWaitlist';
export { useIllustrationPalette, type IllustrationProps } from './palette';

/** Named variants, so callers can pass a string instead of importing a component. */
export type IllustrationVariant = 'bookings' | 'clients' | 'search' | 'inbox' | 'waitlist';

export const ILLUSTRATIONS: Record<IllustrationVariant, ComponentType<IllustrationProps>> = {
  bookings: EmptyBookings,
  clients: EmptyClients,
  search: EmptySearch,
  inbox: EmptyInbox,
  waitlist: EmptyWaitlist,
};
