/**
 * Per-user push notification preferences.
 *
 * Stored on `user_profiles.notification_preferences` (jsonb) and read/written via
 * `GET/PATCH /api/v1/me/profile`. The backend push sender reads these exact keys
 * to decide whether to push a given event to a staff member's devices — keep the
 * key names in sync with Docs/PUSH_NOTIFICATIONS_BACKEND_SPEC.md.
 */

/** Whose bookings a staff member is alerted about. */
export type BookingNotificationScope = 'all' | 'mine';

export interface NotificationPreferences {
  /** Master switch — when false, no push is sent to this user regardless of the rest. */
  push_enabled: boolean;
  // Bookings
  new_booking: boolean;
  cancellation: boolean;
  reschedule: boolean;
  payment: boolean;
  // Reminders & operations
  no_show: boolean;
  waitlist: boolean;
  daily_summary: boolean;
  // Account
  review: boolean;
  low_sms_credit: boolean;
  billing: boolean;
  /** Limit booking alerts to the staff member's own appointments, or all of them. */
  booking_scope: BookingNotificationScope;
  /** Suppress non-urgent push during an overnight window. */
  quiet_hours_enabled: boolean;
  /** HH:mm (venue timezone) — start of the quiet window. */
  quiet_hours_start: string;
  /** HH:mm (venue timezone) — end of the quiet window. */
  quiet_hours_end: string;
}

/** The boolean-valued preference keys (used to render simple toggle rows). */
export type BooleanNotificationKey =
  | 'push_enabled'
  | 'new_booking'
  | 'cancellation'
  | 'reschedule'
  | 'payment'
  | 'no_show'
  | 'waitlist'
  | 'daily_summary'
  | 'review'
  | 'low_sms_credit'
  | 'billing'
  | 'quiet_hours_enabled';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  new_booking: true,
  cancellation: true,
  reschedule: true,
  payment: true,
  no_show: true,
  waitlist: true,
  daily_summary: false,
  review: false,
  low_sms_credit: true,
  billing: true,
  booking_scope: 'all',
  quiet_hours_enabled: false,
  quiet_hours_start: '21:00',
  quiet_hours_end: '07:00',
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function timeOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME_RE.test(value) ? value : fallback;
}

/**
 * Merge a raw `notification_preferences` bag (untyped jsonb from the API) onto
 * the defaults, validating each field. Unknown keys are ignored here but MUST be
 * preserved on write — see useUpdateNotificationPreferences.
 */
export function resolveNotificationPreferences(
  raw: Record<string, unknown> | null | undefined,
): NotificationPreferences {
  const r = raw ?? {};
  const d = DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    push_enabled: boolOr(r.push_enabled, d.push_enabled),
    new_booking: boolOr(r.new_booking, d.new_booking),
    cancellation: boolOr(r.cancellation, d.cancellation),
    reschedule: boolOr(r.reschedule, d.reschedule),
    payment: boolOr(r.payment, d.payment),
    no_show: boolOr(r.no_show, d.no_show),
    waitlist: boolOr(r.waitlist, d.waitlist),
    daily_summary: boolOr(r.daily_summary, d.daily_summary),
    review: boolOr(r.review, d.review),
    low_sms_credit: boolOr(r.low_sms_credit, d.low_sms_credit),
    billing: boolOr(r.billing, d.billing),
    booking_scope: r.booking_scope === 'mine' ? 'mine' : 'all',
    quiet_hours_enabled: boolOr(r.quiet_hours_enabled, d.quiet_hours_enabled),
    quiet_hours_start: timeOr(r.quiet_hours_start, d.quiet_hours_start),
    quiet_hours_end: timeOr(r.quiet_hours_end, d.quiet_hours_end),
  };
}
