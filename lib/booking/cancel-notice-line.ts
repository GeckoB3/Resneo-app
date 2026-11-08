import type {
  CommunicationLane,
  LaneMessagePolicy,
  VenueCommunicationPolicies,
} from '@/types/communications';

/**
 * What the cancel prompt promises about telling the client, for a visit across businesses (web QA
 * 2026-11-08 BKG-B-F13, the web's `cancelNoticeLine`). It said "They will be told what is cancelled
 * and what stays." whether or not anything would be sent: with the business's cancellation message
 * switched off, nothing goes, and nobody rings the client.
 */
export function cancelNoticeLine(input: {
  /** The business's cancellation message setting; null while loading or for a linked venue's booking. */
  policy: Pick<LaneMessagePolicy, 'enabled' | 'channels'> | null;
  guestEmail: string | null | undefined;
  guestPhone: string | null | undefined;
  /** This person cannot see the client's contact details, so whether they have any is unknown. */
  contactsHidden?: boolean;
}): string {
  const { policy } = input;
  if (!policy) return 'Make sure they know what is cancelled and what stays.';
  if (!policy.enabled) return 'Cancellation messages are switched off, so tell them yourself.';
  if (input.contactsHidden) return 'If we have their email or mobile number, we will tell them what is cancelled and what stays.';
  const byEmail = policy.channels.includes('email') && Boolean(input.guestEmail?.trim());
  const bySms = policy.channels.includes('sms') && Boolean(input.guestPhone?.trim());
  if (!byEmail && !bySms) {
    return 'We have no email or mobile number to send the cancellation to, so tell them yourself.';
  }
  const how = byEmail && bySms ? 'email and text' : byEmail ? 'email' : 'text';
  return `We will ${how} them what is cancelled and what stays.`;
}

/** The lane's cancellation message setting, or null when it is not known. */
export function laneCancellationPolicy(
  policies: VenueCommunicationPolicies | null | undefined,
  lane: CommunicationLane,
): Pick<LaneMessagePolicy, 'enabled' | 'channels'> | null {
  const entry = policies?.[lane]?.cancellation_confirmation;
  if (!entry || typeof entry.enabled !== 'boolean') return null;
  return { enabled: entry.enabled, channels: Array.isArray(entry.channels) ? entry.channels : [] };
}
