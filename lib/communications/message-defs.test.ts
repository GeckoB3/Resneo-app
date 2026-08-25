/**
 * Drift guard for the app's copy of the lane communication-policy defaults.
 *
 * There are THREE copies of this table in the product:
 *
 *   1. web `src/lib/communications/policies.ts` → `buildDefaultLanePolicies()`
 *   2. the `venues.communication_policies` column default, set by migration
 *   3. this app's `MESSAGE_DEFS` / `WAITLIST_DEF`, which render the settings screen
 *
 * Web found (1) and (2) had silently drifted and added `policies.defaults.test.ts` to
 * pin them to each other. Nothing was pinning (3), and R22 found it had drifted too:
 * `deposit_payment_reminder` was still SMS-only after web moved it to email + SMS
 * because SMS is stripped for venues without the entitlement, which left those venues
 * sending no deposit reminder at all before the booking was auto-released.
 *
 * WEB_LANE_DEFAULTS below is a transcription of `buildDefaultLanePolicies()` at
 * resneo `main` @ 18dac985, restricted to the keys this screen offers. When web changes
 * a default, this test fails and both sides get updated together.
 *
 * Deliberately NOT asserted here:
 *   - keys web defines but the app's screen does not surface (card_hold_*, class_*,
 *     compliance_*, post_visit_thankyou is surfaced, custom_message is surfaced). The
 *     app showing a subset is a scope decision, not drift.
 *   - the CDE lane's different `hoursBefore` offsets (`buildDefaultCdeLanePolicies`),
 *     which the app does not model.
 */
import {
  defaultPolicy,
  MESSAGE_DEFS,
  WAITLIST_DEF,
  type MessageDef,
} from '@/lib/communications/message-defs';
import type { CommunicationMessageKey, MessageChannel } from '@/types/communications';

interface WebDefault {
  enabled: boolean;
  channels: MessageChannel[];
  hoursBefore?: number;
  hoursAfter?: number;
}

/** Transcribed from web `buildDefaultLanePolicies()` @ 18dac985. */
const WEB_LANE_DEFAULTS: Partial<Record<CommunicationMessageKey, WebDefault>> = {
  booking_confirmation: { enabled: true, channels: ['email'] },
  confirm_or_cancel_prompt: { enabled: true, channels: ['email', 'sms'], hoursBefore: 24 },
  pre_visit_reminder: { enabled: true, channels: ['email'], hoursBefore: 2 },
  deposit_payment_request: { enabled: true, channels: ['email', 'sms'] },
  deposit_confirmation: { enabled: true, channels: ['email'] },
  // The R22-1 key: email AND sms.
  deposit_payment_reminder: { enabled: true, channels: ['email', 'sms'], hoursBefore: 2 },
  booking_modification: { enabled: true, channels: ['email'] },
  cancellation_confirmation: { enabled: true, channels: ['email'] },
  auto_cancel_notification: { enabled: true, channels: ['email', 'sms'] },
  no_show_notification: { enabled: false, channels: ['email'] },
  post_visit_thankyou: { enabled: true, channels: ['email'], hoursAfter: 4 },
  custom_message: { enabled: true, channels: ['email', 'sms'] },
  appointment_waitlist_offer: { enabled: false, channels: ['email'] },
};

const ALL_DEFS: MessageDef[] = [...MESSAGE_DEFS, WAITLIST_DEF];

describe('lane policy defaults match web', () => {
  it.each(ALL_DEFS.map((def) => [def.key, def] as const))(
    '%s',
    (key, def) => {
      const web = WEB_LANE_DEFAULTS[key];
      // A def with no entry here is a key we forgot to transcribe, not a pass.
      expect(web).toBeDefined();

      const policy = defaultPolicy(def);
      expect(policy.enabled).toBe(web!.enabled);
      expect(policy.channels).toEqual(web!.channels);
      expect(policy.hoursBefore ?? undefined).toBe(web!.hoursBefore);
      expect(policy.hoursAfter ?? undefined).toBe(web!.hoursAfter);
    },
  );

  it('covers every key the settings screen renders', () => {
    expect(ALL_DEFS.map((d) => d.key).sort()).toEqual(Object.keys(WEB_LANE_DEFAULTS).sort());
  });

  it('offers no channel outside the ones it defaults to allowing', () => {
    // A default channel the venue cannot see a chip for would be unremovable.
    for (const def of ALL_DEFS) {
      expect(def.allowedChannels).toEqual(expect.arrayContaining(def.defaultChannels));
    }
  });
});
