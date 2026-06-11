/**
 * GET/PUT /api/venue/notification-settings — guest + staff messaging controls.
 * @see _reference/reserve-ni/src/lib/notifications/notification-settings.ts
 */
export type MessageChannel = 'email' | 'sms';

/**
 * How many hours after a visit to send the post-visit thank-you.
 * Mirrors `venues.notification_settings.post_visit_timing` on the backend.
 */
export type PostVisitTiming =
  | '1_hour_after'
  | '2_hours_after'
  | '4_hours_after'
  | '6_hours_after'
  | '12_hours_after'
  | '24_hours_after'
  | '48_hours_after';

export const POST_VISIT_TIMING_OPTIONS: { value: PostVisitTiming; label: string }[] = [
  { value: '1_hour_after', label: '1 hour after' },
  { value: '2_hours_after', label: '2 hours after' },
  { value: '4_hours_after', label: '4 hours after' },
  { value: '6_hours_after', label: '6 hours after' },
  { value: '12_hours_after', label: '12 hours after' },
  { value: '24_hours_after', label: '24 hours after' },
  { value: '48_hours_after', label: '48 hours after' },
];

export interface VenueNotificationSettings {
  confirmation_enabled: boolean;
  confirmation_channels: MessageChannel[];
  confirmation_sms_custom_message: string | null;
  reminder_1_enabled: boolean;
  reminder_1_hours_before: number;
  reminder_1_channels: MessageChannel[];
  reminder_2_enabled: boolean;
  reminder_2_hours_before: number;
  reminder_2_channels: MessageChannel[];
  reschedule_notification_enabled: boolean;
  cancellation_notification_enabled: boolean;
  no_show_notification_enabled: boolean;
  post_visit_enabled: boolean;
  /** Hours-after bucket for the post-visit thank-you email (default: '4_hours_after'). */
  post_visit_timing: string;
  daily_schedule_enabled: boolean;
  staff_new_booking_alert: boolean;
  staff_cancellation_alert: boolean;
}

/**
 * POST /api/venue/communication-preview — request body.
 */
export interface CommunicationPreviewRequest {
  lane: CommunicationLane;
  messageKey: CommunicationMessageKey;
  channel: MessageChannel;
  customMessage?: string | null;
}

/**
 * POST /api/venue/communication-preview — response shape.
 */
export interface CommunicationPreviewResponse {
  messageKey: CommunicationMessageKey;
  channel: MessageChannel;
  lane: CommunicationLane;
  subject: string | null;
  html: string | null;
  text: string | null;
  previewSampleKind: string | null;
}

export type NotificationSettingsPatch = Partial<VenueNotificationSettings>;

/**
 * GET/PUT /api/venue/communication-policies — the web "Guest communications"
 * surface: a per-message policy map per lane.
 * @see _reference/reserve-ni/src/lib/communications/policies.ts
 */
export type CommunicationLane = 'table' | 'appointments_other';

export type CommunicationMessageKey =
  | 'booking_confirmation'
  | 'confirm_or_cancel_prompt'
  | 'pre_visit_reminder'
  | 'deposit_payment_request'
  | 'deposit_confirmation'
  | 'deposit_payment_reminder'
  | 'booking_modification'
  | 'cancellation_confirmation'
  | 'auto_cancel_notification'
  | 'no_show_notification'
  | 'post_visit_thankyou'
  | 'custom_message'
  | 'appointment_waitlist_offer';

export interface LaneMessagePolicy {
  enabled: boolean;
  channels: MessageChannel[];
  emailCustomMessage?: string | null;
  smsCustomMessage?: string | null;
  /** Only on timing-controlled messages (e.g. reminders). */
  hoursBefore?: number | null;
  hoursAfter?: number | null;
}

export type LaneCommunicationPolicies = Partial<
  Record<CommunicationMessageKey, LaneMessagePolicy>
>;

export interface VenueCommunicationPolicies {
  table?: LaneCommunicationPolicies;
  appointments_other?: LaneCommunicationPolicies;
}
