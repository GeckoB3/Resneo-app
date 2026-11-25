/**
 * Which tabs the bell shows (web booking-activity plan, BA2): Bookings first and by default,
 * Linked businesses only where the venue has linked-business activity, and today's screen alone
 * when the server has no booking activity route.
 */
import { hasLinkedBusinessActivity, visibleNotificationTabs } from './notification-tabs';

describe('hasLinkedBusinessActivity', () => {
  it('is true when the linked feed has rows or unread ones', () => {
    expect(hasLinkedBusinessActivity({ notificationCount: 2, unreadCount: 0, links: null })).toBe(true);
    expect(hasLinkedBusinessActivity({ notificationCount: 0, unreadCount: 1, links: null })).toBe(true);
  });

  it('is true for an accepted link (an admin, before any notice arrives)', () => {
    expect(
      hasLinkedBusinessActivity({ notificationCount: 0, unreadCount: 0, links: [{ status: 'accepted' }] }),
    ).toBe(true);
  });

  it('is true for any team member when the bell says the venue has links, before any notice arrives', () => {
    expect(hasLinkedBusinessActivity({ notificationCount: 0, unreadCount: 0, hasLinks: true, links: null })).toBe(true);
    expect(hasLinkedBusinessActivity({ notificationCount: 0, unreadCount: 0, hasLinks: false, links: null })).toBe(false);
  });

  it('is false with no rows and no accepted link', () => {
    expect(hasLinkedBusinessActivity({ notificationCount: 0, unreadCount: 0, links: undefined })).toBe(false);
    expect(
      hasLinkedBusinessActivity({
        notificationCount: 0,
        unreadCount: 0,
        links: [{ status: 'pending' }, { status: 'revoked' }],
      }),
    ).toBe(false);
  });
});

describe('visibleNotificationTabs', () => {
  it('shows both tabs, Bookings first, for a venue with linked businesses', () => {
    expect(visibleNotificationTabs({ bookingsAvailable: true, hasLinked: true })).toEqual(['bookings', 'linked']);
  });

  it('shows Bookings alone for a venue with no linked businesses', () => {
    expect(visibleNotificationTabs({ bookingsAvailable: true, hasLinked: false })).toEqual(['bookings']);
  });

  it('keeps today\'s linked list alone on a server without the Bookings route', () => {
    expect(visibleNotificationTabs({ bookingsAvailable: false, hasLinked: false })).toEqual(['linked']);
    expect(visibleNotificationTabs({ bookingsAvailable: false, hasLinked: true })).toEqual(['linked']);
  });
});
