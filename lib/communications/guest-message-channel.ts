/**
 * The channel a staff-authored message goes out on.
 *
 * Port of the web `src/lib/booking/guest-message-channel.ts`: the same three
 * options, in the same order, with the same labels, and `both` the default.
 * The web offers all three whatever the guest has on file — picking a channel
 * the guest cannot receive is answered by the route ("Guest has no phone on
 * file"), not hidden from the sender — so the app's composers do the same
 * (`GuestMessageChannelPicker`).
 */
export type GuestMessageChannel = 'email' | 'sms' | 'both';

export const GUEST_MESSAGE_CHANNEL_OPTIONS: { value: GuestMessageChannel; label: string }[] = [
  { value: 'both', label: 'Email & SMS (if available)' },
  { value: 'email', label: 'Email only' },
  { value: 'sms', label: 'SMS only' },
];

/** Web `BulkGuestMessageModal` / `ContactDetailPanel` / `BookingDetailContent` all seed `both`. */
export const DEFAULT_GUEST_MESSAGE_CHANNEL: GuestMessageChannel = 'both';
