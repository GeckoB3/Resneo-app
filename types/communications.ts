/**
 * GET/PUT /api/venue/notification-settings — guest + staff messaging controls.
 * @see _reference/reserve-ni/src/lib/notifications/notification-settings.ts
 */
export type MessageChannel = 'email' | 'sms';

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
  /**
   * Legacy notification-settings fields. The post-visit thank-you is now driven
   * by the `post_visit_thankyou` communication policy (enabled + `hoursAfter`),
   * which is what the dispatch cron actually reads. These two are kept on the
   * type so the settings object round-trips faithfully, but are intentionally
   * NOT surfaced in the UI — do not add a separate timing control for them.
   */
  post_visit_enabled: boolean;
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
