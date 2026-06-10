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
