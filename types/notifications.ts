/**
 * GET /api/venue/notifications — in-app notification feed (spec §17.2).
 * @see _reference/reserve-ni/src/lib/linked-accounts/notification-center.ts
 */
export interface VenueNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  /** Web dashboard path the notification deep-links to (display-only on mobile). */
  href: string;
  actorVenueName: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: VenueNotification[];
  unreadCount: number;
  venueId: string;
}

// ---------------------------------------------------------------------------
// Linked Accounts email notification preferences (spec §17.4)
// Mirrors _reference/Resneo/src/lib/linked-accounts/notification-prefs.ts
// ---------------------------------------------------------------------------

/** The cross-venue write categories a venue can be emailed about. */
export type LinkedNotificationCategory = 'cancel' | 'reschedule' | 'create' | 'notes';

/** Email-on flags per category. */
export type LinkedNotificationPrefs = Record<LinkedNotificationCategory, boolean>;

export const LINKED_NOTIFICATION_CATEGORIES: LinkedNotificationCategory[] = [
  'cancel',
  'reschedule',
  'create',
  'notes',
];

/**
 * Defaults: every category is off. Most venues do not want cross-venue activity
 * emails, so a newly linked venue starts quiet and opts in per category.
 * In-app bell notifications (§17.2) are unaffected.
 */
export const DEFAULT_LINKED_NOTIFICATION_PREFS: LinkedNotificationPrefs = {
  cancel: false,
  reschedule: false,
  create: false,
  notes: false,
};

/** Human-readable labels for the settings matrix (from web reference). */
export const LINKED_NOTIFICATION_LABELS: Record<LinkedNotificationCategory, string> = {
  cancel: 'Cancels a booking',
  reschedule: 'Reschedules a booking',
  create: 'Creates a new booking',
  notes: 'Edits booking notes or service',
};

export interface LinkedNotificationPrefsResponse {
  prefs: LinkedNotificationPrefs;
}
