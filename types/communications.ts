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
  post_visit_enabled: boolean;
  daily_schedule_enabled: boolean;
  staff_new_booking_alert: boolean;
  staff_cancellation_alert: boolean;
}

export type NotificationSettingsPatch = Partial<VenueNotificationSettings>;
