/**
 * Per-message definitions for the guest-communication settings screen — ported
 * from the web `CommunicationTemplatesSection` (appointments_other lane). Order
 * matches the web page.
 *
 * Lives in `lib/` rather than beside the screen so `message-defs.test.ts` can pin
 * the default column against web's `buildDefaultLanePolicies()` without dragging
 * a React Native screen into the suite. That guard exists because this table is a
 * THIRD copy of those defaults — web keeps one in `src/lib/communications/policies.ts`
 * and another in the `communication_policies` column default, and web added its own
 * drift guard (`policies.defaults.test.ts`) after finding those two had drifted.
 * Ours had too: R22-1 found `deposit_payment_reminder` still on SMS only.
 */
import type {
  CommunicationMessageKey,
  LaneMessagePolicy,
  MessageChannel,
} from '@/types/communications';

export type MessageDef = {
  key: CommunicationMessageKey;
  label: string;
  description: string;
  allowedChannels: MessageChannel[];
  /** Timing-controlled messages: hours before start / after end. */
  timing?: { field: 'hoursBefore' | 'hoursAfter'; label: string; default: number };
  defaultEnabled: boolean;
  defaultChannels: MessageChannel[];
};

export const MESSAGE_DEFS: MessageDef[] = [
  {
    key: 'booking_confirmation',
    label: 'Booking confirmation',
    description: 'Sent as soon as the booking is confirmed',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'confirm_or_cancel_prompt',
    label: 'Confirm or cancel prompt',
    description: 'Ask the guest to confirm or cancel before the visit',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before the visit', default: 24 },
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'pre_visit_reminder',
    label: 'Pre-visit reminder',
    description: 'Reminder shortly before the booking starts',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before the visit', default: 2 },
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'deposit_payment_request',
    label: 'Deposit payment request',
    description: 'Used when a booking needs a separate deposit payment link',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'deposit_confirmation',
    label: 'Deposit confirmation',
    description: 'Confirms that a deposit has been paid successfully',
    allowedChannels: ['email'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'deposit_payment_reminder',
    label: 'Deposit payment reminder',
    description: 'Reminder for unpaid deposit bookings before they are released',
    allowedChannels: ['email', 'sms'],
    timing: { field: 'hoursBefore', label: 'before release', default: 2 },
    defaultEnabled: true,
    // Email as well as SMS. SMS is stripped for venues without the entitlement
    // (web's `isSmsAllowed` in policy-resolver), so an SMS-only default left those
    // venues with no channels at all and no deposit reminder went out before the
    // booking was released. Web fixed its own default in 18dac985; this is the
    // app's copy of the same table (R22-1).
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'booking_modification',
    label: 'Booking modification',
    description: 'Sent when the booking details are changed',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'cancellation_confirmation',
    label: 'Cancellation confirmation',
    description: 'Sent when a booking is cancelled',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'auto_cancel_notification',
    label: 'Auto-cancel notification',
    description: 'Sent when an unpaid booking is automatically cancelled',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
  {
    key: 'no_show_notification',
    label: 'No-show notification',
    description: 'Optional notice when staff mark a booking as a no-show',
    allowedChannels: ['email'],
    defaultEnabled: false,
    defaultChannels: ['email'],
  },
  {
    key: 'post_visit_thankyou',
    label: 'Post-visit thank you',
    description: 'Follow-up after the booking has taken place',
    allowedChannels: ['email'],
    timing: { field: 'hoursAfter', label: 'after the visit', default: 4 },
    defaultEnabled: true,
    defaultChannels: ['email'],
  },
  {
    key: 'custom_message',
    label: 'Custom message',
    description: 'Staff-composed message sent directly to the guest',
    allowedChannels: ['email', 'sms'],
    defaultEnabled: true,
    defaultChannels: ['email', 'sms'],
  },
];

export const WAITLIST_DEF: MessageDef = {
  key: 'appointment_waitlist_offer',
  label: 'Waitlist invite',
  description: 'Sent when staff offer an appointment slot to someone on the waitlist',
  allowedChannels: ['email', 'sms'],
  defaultEnabled: false,
  defaultChannels: ['email'],
};

export function defaultPolicy(def: MessageDef): LaneMessagePolicy {
  return {
    enabled: def.defaultEnabled,
    channels: def.defaultChannels,
    emailCustomMessage: null,
    smsCustomMessage: null,
    ...(def.timing ? { [def.timing.field]: def.timing.default } : {}),
  };
}
