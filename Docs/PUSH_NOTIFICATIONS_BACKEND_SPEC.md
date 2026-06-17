# Push notifications — backend sending spec

**Goal:** make the web backend (Next.js + Supabase, repo `C:\Resneo` / mirror `_reference/Resneo`) **send Expo push notifications to the staff mobile app**. The mobile client is already fully wired to *receive* push; the only missing link is the server *sending* it.

**Audience:** staff/owners using the mobile app. (Guests have no app — their confirmations/reminders stay on email + SMS. Do **not** add push to the guest policy system.)

**Status of the other half (already done, no change needed):**
- App registers an Expo push token after login → `POST /api/v1/me/devices` → stored in `user_devices.push_token`.
- App handles foreground display, tap routing, Android channels, iOS actions, cold-start, badge. See `providers/PushNotificationsProvider.tsx` + `lib/push/registerDevice.ts` in the mobile repo.
- Per-user preferences already persist in `user_profiles.notification_preferences` (jsonb), written by the app's new Notification-preferences screen via `PATCH /api/v1/me/profile`. **The sender's job is to read those and fan out.**

---

## 1. What to add (overview)

1. Dependency `expo-server-sdk` + env `EXPO_ACCESS_TOKEN`.
2. A low-level Expo sender: `src/lib/push/expo-push.ts` (chunk, send, collect tickets/receipts, prune dead tokens).
3. A staff fan-out helper: `src/lib/push/sendStaffPush.ts` (venue → active staff → device tokens, gated by per-user prefs + quiet hours + scope).
4. Wire `sendStaffPush(...)` calls at the existing booking trigger sites (all inside the existing `after(async …)` blocks, next to the guest-notification calls).
5. (Optional) dual-write an in-app row for the bell.

Everything runs in the already-present `after()` deferred blocks so it never blocks the API response. Fan-out uses the **service-role admin client** (`getSupabaseAdminClient()`) because `user_devices` RLS is own-rows-only.

---

## 2. The preference contract (source of truth = the app)

The app reads/writes these keys on `user_profiles.notification_preferences`. The sender MUST honour them. Keep in sync with `types/notification-preferences.ts` in the mobile repo.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `push_enabled` | boolean | `true` | Master. If false → send nothing to this user. |
| `new_booking` | boolean | `true` | A booking was created. |
| `cancellation` | boolean | `true` | A booking was cancelled. |
| `reschedule` | boolean | `true` | A booking moved / was modified. |
| `payment` | boolean | `true` | Deposit paid, or payment failed. |
| `no_show` | boolean | `true` | Guest overdue / no-show prompt. |
| `waitlist` | boolean | `true` | A slot opened for a waitlisted guest. |
| `daily_summary` | boolean | `false` | Morning rundown (cron). |
| `review` | boolean | `false` | New guest review/feedback. |
| `low_sms_credit` | boolean | `true` | SMS balance is running low. |
| `billing` | boolean | `true` | Payment failure / subscription notices. |
| `booking_scope` | `'all' \| 'mine'` | `'all'` | Booking events: all venue bookings, or only this staff member's. |
| `quiet_hours_enabled` | boolean | `false` | Suppress push during the window. |
| `quiet_hours_start` | `"HH:mm"` | `"21:00"` | Quiet window start (venue timezone). |
| `quiet_hours_end` | `"HH:mm"` | `"07:00"` | Quiet window end (venue timezone). |

Missing keys ⇒ use the default above. Add a small server-side parser mirroring `resolveNotificationPreferences` (mobile `types/notification-preferences.ts`) — copy the validation so a malformed bag can't crash a send.

> Per-user prefs read via the user-scoped client are fine in the route handlers, but the **sender runs in `after()` without the user's session**, so read prefs with the admin client: `select notification_preferences from user_profiles where id = <user_id>`.

---

## 3. The payload contract (what the app expects)

The app routes and renders based on these fields — match them exactly (see `providers/PushNotificationsProvider.tsx`).

- **`data.booking_id`** (string) — REQUIRED for booking notifications. Tap → app navigates to `/booking/{booking_id}`. (`bookingId` / `booking.id` also accepted, but send `booking_id`.)
- **`channelId`** (Android) — one of: `'bookings-new'`, `'bookings-changed'`, `'reminders'`. If omitted, Android drops it on a generic channel.
- **`categoryId`** (iOS, `expo-server-sdk` field name) — set `'booking'` for booking notifications to render the **View / Confirm** action buttons (the app registered this category).
- **`sound: 'default'`**, **`priority: 'high'`** for booking events. Optional `badge`.
- `title`, `body` — see the catalog below.
- Put a `type` string in `data` (e.g. `'new_booking'`) for future routing/analytics.

Example `ExpoPushMessage`:
```ts
{
  to: 'ExponentPushToken[…]',
  title: 'New booking',
  body: 'Jane Doe · Reformer Pilates · Tue 14:00',
  data: { type: 'new_booking', booking_id: '…' },
  channelId: 'bookings-new',
  categoryId: 'booking',
  sound: 'default',
  priority: 'high',
}
```

---

## 4. Notification catalog (event → pref key → channel → trigger site)

Booking events (`new_booking`, `cancellation`, `reschedule`, `payment`, `no_show`) are subject to `booking_scope`. The rest go to the relevant staff (see §6).

| Event | Pref key | `channelId` | `data.type` | Suggested title / body |
|---|---|---|---|---|
| Booking created | `new_booking` | `bookings-new` | `new_booking` | "New booking" / "{guest} · {service} · {date time}" |
| Cancelled | `cancellation` | `bookings-changed` | `cancellation` | "Booking cancelled" / "{guest} · {service} · {date time}" |
| Rescheduled / modified | `reschedule` | `bookings-changed` | `reschedule` | "Booking changed" / "{guest} moved to {new date time}" |
| Deposit paid | `payment` | `bookings-changed` | `payment` | "Deposit paid" / "{guest} paid {amount}" |
| Payment failed / auto-cancel | `payment` | `bookings-changed` | `payment_failed` | "Payment failed" / "{guest}'s deposit wasn't paid" |
| No-show prompt | `no_show` | `reminders` | `no_show` | "Guest overdue" / "{guest} hasn't arrived for {time}" |
| Waitlist slot opened | `waitlist` | `reminders` | `waitlist` | "Waitlist match" / "A slot opened for {guest}" |
| Daily summary (cron) | `daily_summary` | `reminders` | `daily_summary` | "Today at {venue}" / "{n} bookings, first at {time}" |
| New review | `review` | `reminders` | `review` | "New review" / "{guest} left {rating}★" |
| Low SMS credit | `low_sms_credit` | `reminders` | `low_sms_credit` | "SMS credit low" / "Top up so reminders keep sending" |
| Billing issue | `billing` | `reminders` | `billing` | "Action needed" / "Your subscription payment failed" |

**Exact trigger sites** (reference repo; line numbers approximate — search the named function). Add a `sendStaffPush(...)` call next to each existing guest call, inside the same `after()` block:

- **Create (public):** `src/app/api/booking/create/route.ts` — `after(...)` calling `sendBookingConfirmationNotifications(...)` (~L556–559, table path; the model B–E block in `handleNonTableBooking` similarly).
- **Create (staff):** `src/lib/booking/staff-booking-payment-comms.ts` — `applyStaffBookingPaymentAndComms(...)` (called from `src/app/api/venue/bookings/route.ts` at ~L436/597/803). One call here covers appointment/class/event/resource staff creates. (Appointment deposit path also at `venue/bookings/route.ts` ~L1283.)
- **Cancel:** `src/app/api/venue/bookings/[id]/route.ts` — `after()` → `sendCancellationNotification(...)` (~L789).
- **No-show:** same file — `after()` → `communicationService.send('no_show_notification', …)` (~L847).
- **Reschedule/modify:** same file — `after()` → `executeBookingModificationGuestNotification(...)` (~L1376) and sibling model blocks; shared sender `src/lib/booking/send-booking-modification-guest-notification.ts`.
- **Auto-cancel:** `src/app/api/cron/auto-cancel-bookings/route.ts` — guest notify ~L96 (emit a `payment_failed` staff push here).
- **Daily summary / reminders:** `src/app/api/cron/send-communications/route.ts` (add a staff-summary task). Crons authenticate via `requireCronAuthorisation` (`src/lib/cron-auth.ts`).
- **Low SMS credit / billing / review:** wire where those conditions are detected (SMS balance check in the SMS send path / Stripe webhook handler / review-ingest). These are lower priority; ship bookings first.

---

## 5. Low-level Expo sender — `src/lib/push/expo-push.ts`

Mirror the channel-secret convention in `src/lib/communications/channels/email.ts` (read env at module load, no-op + log if missing).

```ts
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';

const accessToken = process.env.EXPO_ACCESS_TOKEN; // optional but recommended
const expo = new Expo(accessToken ? { accessToken } : undefined);

export interface PushResult { sent: number; invalidTokens: string[]; }

/** Send to many Expo tokens. Filters invalid tokens, chunks, returns dead tokens to prune. */
export async function sendExpoPush(
  tokens: string[],
  message: Omit<ExpoPushMessage, 'to'>,
): Promise<PushResult> {
  const valid = [...new Set(tokens)].filter((t) => Expo.isExpoPushToken(t));
  if (valid.length === 0) return { sent: 0, invalidTokens: [] };

  const messages: ExpoPushMessage[] = valid.map((to) => ({ ...message, to }));
  const invalidTokens: string[] = [];
  let sent = 0;

  for (const chunk of expo.chunkPushMessages(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket: ExpoPushTicket, i) => {
        if (ticket.status === 'ok') sent += 1;
        else if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(chunk[i].to as string);
        }
      });
    } catch (err) {
      console.error('[push] send chunk failed', err);
    }
  }
  return { sent, invalidTokens };
}
```

**Receipts (recommended, async):** Expo tickets only confirm *acceptance*. Schedule a follow-up (cron, ~15 min later) that calls `expo.getPushNotificationReceiptsAsync(ticketIds)` and deletes any token whose receipt error is `DeviceNotRegistered`. For v1 you can rely on the synchronous `invalidTokens` from tickets plus this periodic sweep.

**Prune dead tokens:** `delete from user_devices where push_token = any($invalidTokens)` via the admin client.

---

## 6. Staff fan-out — `src/lib/push/sendStaffPush.ts`

Models on `src/lib/communications/owner-booking-notification.ts` (venue-level sender), but resolves *multiple* staff devices and gates per-user.

```ts
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/push/expo-push';

type StaffPushKey =
  | 'new_booking' | 'cancellation' | 'reschedule' | 'payment'
  | 'no_show' | 'waitlist' | 'daily_summary' | 'review' | 'low_sms_credit' | 'billing';

interface SendStaffPushOpts {
  venueId: string;
  prefKey: StaffPushKey;
  message: { title: string; body: string; channelId: string; data: Record<string, unknown> };
  /** For booking events: the assigned practitioner/calendar, to honour `booking_scope: 'mine'`. */
  assignedUserIds?: string[] | null;
  /** Override default recipients (e.g. billing → admins only). */
  recipientRoles?: ('admin' | 'staff')[];
}

export async function sendStaffPush(opts: SendStaffPushOpts): Promise<void> {
  const admin = getSupabaseAdminClient();

  // 1. Active staff for the venue (+ their auth user ids), optionally role-filtered.
  let staffQ = admin.from('staff').select('user_id, role')
    .eq('venue_id', opts.venueId).is('revoked_at', null).not('user_id', 'is', null);
  if (opts.recipientRoles?.length) staffQ = staffQ.in('role', opts.recipientRoles);
  const { data: staff } = await staffQ;
  let userIds = [...new Set((staff ?? []).map((s) => s.user_id as string))];
  if (userIds.length === 0) return;

  // 2. Quiet-hours window: venue timezone.
  const { data: venue } = await admin.from('venues').select('timezone').eq('id', opts.venueId).single();
  const tz = venue?.timezone ?? 'Europe/London';

  // 3. Per-user prefs + scope + quiet-hours gate.
  const { data: profiles } = await admin
    .from('user_profiles').select('id, notification_preferences').in('id', userIds);
  const allowed = (profiles ?? []).filter((p) => {
    const prefs = parsePrefs(p.notification_preferences);     // mirror resolveNotificationPreferences
    if (!prefs.push_enabled) return false;
    if (prefs[opts.prefKey] === false) return false;
    if (isBookingEvent(opts.prefKey) && prefs.booking_scope === 'mine') {
      if (!opts.assignedUserIds?.includes(p.id)) return false;
    }
    if (prefs.quiet_hours_enabled && withinQuietHours(tz, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
      return false; // suppress push; the booking still appears in-app
    }
    return true;
  }).map((p) => p.id);
  if (allowed.length === 0) return;

  // 4. Their device tokens.
  const { data: devices } = await admin
    .from('user_devices').select('push_token').in('user_id', allowed).not('push_token', 'is', null);
  const tokens = (devices ?? []).map((d) => d.push_token as string);
  if (tokens.length === 0) return;

  // 5. Send + prune dead tokens.
  const { invalidTokens } = await sendExpoPush(tokens, {
    title: opts.message.title, body: opts.message.body,
    data: opts.message.data, channelId: opts.message.channelId,
    categoryId: 'booking', sound: 'default', priority: 'high',
  });
  if (invalidTokens.length) {
    await admin.from('user_devices').delete().in('push_token', invalidTokens);
  }
}
```

Helpers to implement: `parsePrefs` (copy mobile `resolveNotificationPreferences`), `isBookingEvent` (`new_booking|cancellation|reschedule|payment|no_show`), `withinQuietHours(tz, start, end)` (compare `Intl.DateTimeFormat(en-GB,{timeZone:tz,hour,minute})` "now" against the window, handling the overnight wrap where `end < start`).

**Scope ('mine') resolution:** for booking events pass `assignedUserIds` = the staff users linked to the booking's practitioner/calendar. Use `src/lib/venue-auth.ts` helpers (`getLinkedPractitionerId`, `staffManagesCalendar`/`getStaffManagedCalendarIds`) to map the booking's `practitioner_id`/`calendar_id` → staff `user_id`(s). If you can't resolve it, treat as venue-wide (don't silently drop).

**Default recipients by event:** bookings/no-show/waitlist/review/low-SMS → all active staff; `billing` → `recipientRoles: ['admin']`.

---

## 7. Optional: in-app bell row (dual write)

To also show these in an in-app feed, either reuse `account_link_notifications` (venue-scoped; INSERT via admin with a new `category`/`type`; it's already on the `supabase_realtime` publication — see `20261209120000_linked_notifications_realtime.sql`) or add a user-scoped sibling table if you want per-user read state. Not required for push; ship later. The mobile feed currently reads `GET /api/venue/notifications` (`account_link_notifications`).

---

## 8. Preferences endpoint (already covered — no new work required)

The app reads/writes prefs via existing `GET/PATCH /api/v1/me/profile` (`src/app/api/account/profile/route.ts`, re-exported at `src/app/api/v1/me/profile/route.ts`), which already accepts `notification_preferences` (zod `z.record`). **No new endpoint or migration is needed.** If you later want a typed, validated surface, add `GET/PUT /api/v1/me/notification-preferences` following the same `createRouteHandlerClient(request)` + `getUser()` Bearer pattern and a `parse/merge` helper like `src/lib/notifications/notification-settings.ts`.

> Note: `PATCH /api/v1/me/profile` **replaces** `notification_preferences` wholesale. The app already sends the full merged object, so a typed endpoint isn't required — but if web also writes this column, keep both writers merge-safe.

---

## 9. Deps, env, security

- **Dependency:** `npm i expo-server-sdk` (server only).
- **Env:** add `EXPO_ACCESS_TOKEN` (Expo dashboard → Access Tokens; enables enhanced security + receipts). Optional but recommended; the SDK works without it for basic sends.
- **No FCM/APNs keys needed** — Expo's push service brokers to APNs/FCM for Expo-built apps. (If the app later ejects from Expo push, switch this channel to FCM v1 + APNs.)
- **RLS:** fan-out reads `staff` / `user_profiles` / `user_devices` and deletes dead tokens — all via `getSupabaseAdminClient()` (service role).
- **Never block the response:** all sends inside `after(async () => …)` (already the pattern at every trigger site) or in cron.
- **Venue-level kill switch (optional):** the dead-but-present `staff_new_booking_alert` / `staff_cancellation_alert` (`src/lib/notifications/notification-settings.ts`) can gate the venue-wide categories in addition to per-user prefs, if admins should be able to disable a category for everyone.

---

## 10. Testing & rollout

1. Unit-test `withinQuietHours` (overnight wrap, tz), `parsePrefs` (defaults/malformed), and the fan-out filter.
2. Manual: register a dev build, set prefs, create a booking → confirm the push arrives, tap → opens `/booking/{id}`; verify Android lands on `bookings-new` and iOS shows View/Confirm.
3. Token hygiene: delete the app / revoke permission → next send marks `DeviceNotRegistered` → confirm the token is pruned.
4. Roll out by category: ship `new_booking` + `cancellation` first (highest value, channels already exist), then the rest.

## File checklist (reference repo)
- **New:** `src/lib/push/expo-push.ts`, `src/lib/push/sendStaffPush.ts`, `src/lib/push/prefs.ts` (parse/quiet-hours helpers).
- **Edit (add a `sendStaffPush` call in the existing `after()` block):** `src/app/api/booking/create/route.ts`, `src/lib/booking/staff-booking-payment-comms.ts`, `src/app/api/venue/bookings/[id]/route.ts`, `src/app/api/cron/auto-cancel-bookings/route.ts`, `src/app/api/cron/send-communications/route.ts`.
- **Config:** `package.json` (+`expo-server-sdk`), deployment env (`EXPO_ACCESS_TOKEN`).
- **No migration required** (tokens, staff link, and `user_profiles.notification_preferences` all already exist).
```
