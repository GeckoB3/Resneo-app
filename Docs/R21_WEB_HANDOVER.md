# R21 — handover to the web repo

Two items from the R21 delta audit (`Docs/APP_GAP_REPORT_R21_WEB_DELTA.md`), found
auditing `d0f18da7..491832ca`. **W1 stands. W2 was wrong about web** and is corrected
below — web'''s save was already safe; the bug it described was ours, and is now fixed.

Both sections carry web'''s reply of 2026-08-20.

---

## W1 — wrap `/api/venue/calendar-grid`, but split severity first

**Status:** web's own commit records this as a deliberate, deferred decision. This is the
app confirming the wrap is worth doing, and that the app is already built for it.

### The app is ready — a 503 lands correctly today

`app/(app)/(tabs)/index.tsx:2182` already renders `ErrorState` with the server's own
`ApiError.message` and a Retry button on `gridQuery.isError`. A `withScheduleFailClosed`
503 would show *"Availability is temporarily unavailable. Please try again in a moment."*
with a retry, instead of the empty day it shows now. **No app change is needed to accept
the wrap.**

### The blocker web already named, and the shape of the fix

`reportAvailabilityReadFailures` and the `withScheduleFailClosed` collector are **flat** —
`ScheduleReadFailure` carries `source`, `table`, `assumed` and ids, but no severity. So
wrapping the route as-is means a failed **`guests`** or **service-name** lookup blanks the
whole calendar, which is not the trade anyone wants. Web's own comment says exactly this
("Decide that when wrapping, not by accident").

The seven reads split cleanly along the line web already drew in the `assumed` strings:

| Read | Severity | `assumed` |
| --- | --- | --- |
| `unified_calendars` | **schedule** | the venue has no calendars, so the grid is empty |
| `bookings` | **schedule** | nothing is booked, so every column reads as free |
| `calendar_blocks` | **schedule** | no time is blocked out, so blocked slots look bookable |
| `event_sessions` | **schedule** | no sessions are scheduled, so their columns look free |
| `guests` | label only | every bar is labelled "Guest" |
| `appointment_services` | label only | unsnapshotted bars read "Service" |
| `service_items` | label only | unsnapshotted bars read "Service" |

**Suggested change, in order:**

1. Add a severity to `ScheduleReadFailure` / `AvailabilityReadFailureContext` —
   e.g. `severity?: 'schedule' | 'label'`, defaulting to `'schedule'` so all 44 existing
   call sites keep today's meaning and nothing has to be touched.
2. Make `withScheduleFailClosed` 503 only on `severity === 'schedule'`. Label failures
   stay visible in Sentry and still return 200, which is the current behaviour for the
   three label reads and is correct: a bar labelled "Guest" is a cosmetic loss, not a
   wrong schedule.
3. Mark the three label-only reads in `getCalendarGrid` (`unified-availability.ts`) —
   they already say `(label only)` in prose, so this only makes it machine-readable.
4. Wrap `/api/venue/calendar-grid`, and move it out of `MUST_NOT_WRAP` in
   `schedule-fail-closed-coverage.test.ts` with the reason updated (the recorded reason —
   "reports nothing" — stops being true the moment step 3 lands).

Splitting severity is worth doing on its own merits: it is the same distinction the
waitlist change made per-entry, and it keeps the next wrap decision from being
all-or-nothing.

### One consequence web should know about before landing it

**The app polls this route every 60 seconds** (`app/(app)/(tabs)/index.tsx:624,635` →
`useCalendarGrid`), and the screen checks `isError` before rendering data. So once the
route can 503, a single transient blip during a background refetch replaces a *working*
calendar with a full-screen error.

That is the app's problem to soften, not web's — we are tracking it as **R21-6** (hold the
last good grid and show a banner when a refetch fails, rather than an error state over
stale-but-good data). Flagging it so the wrap is not blamed for the flicker, and so the two
can be sequenced: **the app should land R21-6 first**, then web can wrap freely.

---

### Reply received, 2026-08-20 — agreed, plus two corrections from web

- The `unified-availability.ts` comment saying "The last two are LABEL-ONLY" is **stale
  and undercounts**: there are three, and all three already carry `(label only)` in their
  `assumed` strings. Implementing "the last two" would leave `guests` at schedule
  severity and a failed guest-name lookup would still blank the calendar. Web will fix
  the comment in the same change. The table above already lists all three correctly.
- **No web code fetches `/api/venue/calendar-grid`** — it is the app's calendar's only
  source, so the flicker is entirely ours and web has no surface to protect. Web will
  **hold the wrap until the app says R21-6 has landed.**

**R21-6 has landed (2026-08-20) — the wrap is unblocked.** The calendar now keeps the
last good grid and shows a thin "Couldn'''t refresh — showing the last update, which may be
out of date" banner with a Retry, instead of replacing the screen. The full-screen error is
kept for two cases: a cold load with nothing to fall back on, and a failure while
`keepPreviousData` is holding a DIFFERENT range — degrading there would put one day'''s
bookings under another day'''s date, which is the wrong-answer trade `withScheduleFailClosed`
exists to avoid. The rule is a pure, unit-tested helper
(`lib/calendar/grid-error-state.ts`, 5 tests) rather than an `isError` check at the render
site, so it cannot drift back.

A 503 from the wrapped route will therefore read as a one-line banner during a poll and as
the server'''s own "Availability is temporarily unavailable" copy on a cold load. Go ahead
when you are ready.

---

## W2 — WITHDRAWN as stated; the app half is now fixed, and web has a smaller one

**Correction, 2026-08-20.** The original W2 claimed both repos post
`service_variant_id: null` for an archived service. **That was wrong about web**, and web
was right to push back. Verified in the reference clone:

`buildPatchPayload` (`StaffAppointmentModifyForm.tsx:96`) only sets the key when there is
something to say —

```
if (params.requiresVariant && params.serviceVariantId) {
  body.service_variant_id = params.serviceVariantId;
}
```

— so the route's `service_variant_id !== undefined` branch never runs, and both the id and
`service_variant_name_snapshot` survive. `491832ca` did not make web worse. The line
originally cited (`:823`) is the **validate dry-run** body, not the save. Mis-read on our
side; the two bodies are built in different places on web and the same place on the app,
which is how it happened.

### What web still has

The dry-run body does send `service_variant_id: requiresVariant ? variantId : null`
unconditionally, so for an archived-service booking the dry run judges "no variant" while
the save preserves one — under a comment claiming it "judges exactly what the PATCH will
persist". Web's plan to apply the omission to the validate body only is right, and adding
it to `buildPatchPayload` would indeed be a no-op.

### What the app had, and what we changed

Confirmed on our side: **the app's save did post `null`**, so this was real data loss here.
`ModifyBookingSheet` builds the dry-run and PATCH bodies inline, and both carried
`service_variant_id: requiresVariant ? variantId : null` (`:1102` and `:1316`).

Both now spread a single derived value, so the two cannot disagree:

```
const variantIdToSend = serviceInCatalog ? (requiresVariant ? variantId : null) : undefined;
...(variantIdToSend !== undefined ? { service_variant_id: variantIdToSend } : {}),
```

Four tests in `ModifyBookingSheet.test.tsx` pin it; restoring the old expression turns the
archived-service one red.

### One difference worth a look on your side

We keyed the omission on **whether the catalogue resolved the service**, not on
`!serviceVariantId` as `buildPatchPayload` does. Both are client-side omission, and on the
archived-service case they agree. They differ on one other case:

**Switching a booking from a variant service to a plain one.** `requiresVariant` goes
false, so web omits the key — and `bookingUpdate.service_variant_id` is written in exactly
one place (`route.ts:2663`), gated on the key being present. The stored id therefore
**survives, pointing at a variant of a service the booking no longer has**, while the
service-change block nulls `service_variant_name_snapshot` beside it. Reads prefer the
snapshot so nothing looks wrong, but the row is inconsistent.

Keying on the catalogue keeps `null` for that case, which is what clears it. Not urgent —
the visible symptom is nil — but if web would rather the two clients stay identical, the
narrower condition is `selectedService ? … : omit` and we are happy either way. Tell us
which and we will match it.

### Server-side alternative: dropped

Agreed, and web's reason is better than ours: the form blocks save on
`requiresVariant && !variantId`, so "deliberately clear a variant on a service that still
has variants" is unreachable, and `null` + unchanged service is not a signal the server
could act on without changing documented field semantics for every client. Client-side
omission it is.
