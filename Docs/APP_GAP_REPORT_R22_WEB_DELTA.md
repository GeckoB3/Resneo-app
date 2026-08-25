# R22 — app-vs-web delta audit

**Range:** `resneo` **`main`** `491832ca..18dac985` — 2 commits, 41 files, +2429/−104.
**Audited against:** `Resneo-app` @ `3bf941e`, 2026-08-25.
**Range shape:** `491832ca` is a direct ancestor of `18dac985`; both new commits are squash
merges (`66bcba3e` "Staging (#159)", `18dac985` "Staging (#160)"), read as four granular
changes from their bodies. Every claim below was checked in code on both sides, never from
the plan docs (see `plan-docs-vs-shipped-code`).

`origin/staging` was force-updated to the same commit, so main and staging agree — there is
no unreleased web work behind this range.

Four strands:

1. **Per-visit compliance expiry** anchored to the appointment day rather than the capture
   day, with a reschedule carry-forward, `EXPIRING_SOON` suppression, and a backfill migration.
2. **Multi-service appointment emails** — the `person_label` party-vs-visit rule, the hero
   chip time, and one email per visit instead of one per row.
3. **Deposit flow** — auto-cancel goes staff-only for online abandonment, and the deposit
   payment reminder defaults to email **and** SMS.
4. **A new web audit report** (`Docs/Resneo_Codebase_Audit_August_2026.md`) — 114 confirmed
   findings, committed as a basis for remediation. Findings, not fixes.

**Verdict: one gap, and it is a latent one (R22-1) — built 2026-08-25 with a drift guard.
Everything else lands safely.** The
compliance and email work is entirely server-side behind endpoints the app already calls,
with no request or response contract change, so the app inherits all of it. The one rule in
this range that the app *does* implement client-side — the `person_label` party-vs-visit
distinction — the app already implements correctly; web was fixing its emails up to the
convention the app had already adopted.

---

## Part 1 — R22-1: the app's `deposit_payment_reminder` default has drifted

**Severity: LOW (latent).** Wrong constant, currently masked by the server.

### What web changed

`buildDefaultLanePolicies()` in `src/lib/communications/policies.ts`:

```
 deposit_payment_reminder: {
   enabled: true,
-  channels: ['sms'],
+  channels: ['email', 'sms'],
```

with a matching migration (`20270116120000_...`) changing the column default. The reason,
from the commit body: SMS is stripped for venues without the entitlement (`isSmsAllowed` in
`policy-resolver`), so an SMS-only default left those venues with **no channels at all** —
they sent no deposit reminder before the booking was auto-released, even though the email
template ("Reminder: Complete your deposit") has always existed.

Web also added `policies.defaults.test.ts`, a drift guard that parses the JSONB out of the
migration and compares it against the code default key by key — added precisely because
web's own two copies had already drifted.

### What the app has

The app holds a **third copy** of that table, and nothing guards it:

- `app/(app)/manage/communications.tsx:111` — `MESSAGE_DEFS`, entry
  `deposit_payment_reminder`, still `defaultChannels: ['sms']`.

I compared all thirteen keys the app's table covers against `buildDefaultLanePolicies()`
(enabled, channels, and the `hoursBefore`/`hoursAfter` timing default). **Twelve match
exactly. `deposit_payment_reminder` is the only drift.**

### Why it is latent rather than live

The app renders `lane?.[def.key] ?? defaultPolicy(def)` (`communications.tsx:771`), and the
server hands back a complete blob: `GET /api/venue/communication-policies` →
`getVenueCommunicationPolicies` → `parseCommunicationPolicies` →
`sanitizeLanePolicies(row.appointments_other, fallback.appointments_other)`, which fills
every missing key from web's code default. So in practice the app displays the server's
value — now email + SMS — and the local constant never fires.

It fires only where `lane` is null, which is the pre-load render. Saving is gated on
`policiesQuery.data` being present (`laneChanged` at `communications.tsx:823`), so a stale
default cannot be persisted from that state.

### Why fix it anyway

It is a wrong constant sitting in the exact table web just built a drift guard for, and it
is wrong in the direction web deemed a live money-path defect. Any future path that renders
from the local default — an offline mode, a "reset to defaults" affordance, or a server that
ever returns a partial blob — hands back the value web removed for being broken.

### Built (2026-08-25)

- The table moved out of the screen to `lib/communications/message-defs.ts` — `MessageDef`,
  `MESSAGE_DEFS`, `WAITLIST_DEF` and `defaultPolicy`, unchanged apart from the fix. It lives
  in `lib/` so the guard can import it without dragging a React Native screen into the suite;
  the screen imports it back and is 137 lines shorter.
- `deposit_payment_reminder.defaultChannels` is now `['email', 'sms']`, with the reason
  recorded inline.
- `lib/communications/message-defs.test.ts` is the drift guard. `WEB_LANE_DEFAULTS`
  transcribes `buildDefaultLanePolicies()` @ `18dac985` for the thirteen keys this screen
  offers, and every key is asserted on `enabled`, `channels`, `hoursBefore` and `hoursAfter`.
  A key present in the screen but missing from the transcription fails rather than passes,
  so adding a message to the screen forces a decision about its web default.

  Deliberately out of scope for the guard: keys web defines that the app does not surface
  (`card_hold_*`, `class_*`, `compliance_*`) — a subset is a scope decision, not drift — and
  the CDE lane's different offsets (`buildDefaultCdeLanePolicies`), which the app does not model.

Verified by injecting the old `['sms']` value: the guard fails and names
`deposit_payment_reminder`. 1953 tests pass, typecheck and lint clean.

---

## Part 2 — verified, no gap

### Per-visit compliance expiry (strand 1)

The whole change lives server-side, and the app holds no part of it.

- **No `computeExpiresAt` in the app.** The app's `lib/compliance/form-schema.ts` is a
  partial port that stops after `computeResult` / `resolveDateDefault` /
  `seedDefaultResponses`. Expiry has always been computed server-side only, so web's new
  `visitDateYmd` parameter and the `endOfLocalDayForYmd` split have no app-side twin to
  update.
- **`EXPIRING_SOON` suppression is server-side.** The app has the
  `COMPLIANCE_EXPIRING_SOON_DAYS = 30` constant in `lib/compliance/constants.ts` but no
  resolver — `ComplianceCard.tsx:48` colours a `state` the server computed, and
  `app/(app)/manage/compliance.tsx:246` renders `dashboard.data.expiring_soon` as given. Both
  inherit the fix.
- **Dashboard filtering is server-side.** `loadComplianceDashboard` now drops validity-0 rows
  from `expiring_soon` before serialising; the app's list shortens on its own.
- **The reschedule carry-forward changes no contract.**
  `rescheduleBookingComplianceRecords` is called inside `PATCH /api/venue/bookings/[id]` and
  `PATCH /api/venue/visits/[groupBookingId]/schedule` — both routes the app already calls,
  both with unchanged request and response shapes.
- **Capture needs no new field from the app.**
  `POST /api/venue/compliance/records` is **not** in this range's changed-file list. Web's
  `captureComplianceRecord` resolves the visit date as *explicit `visitDate`, else the
  attached booking's date, else the capture day*. The app's `useCaptureComplianceRecord`
  (`lib/queries/useCompliance.ts:212`) sends `booking_id`, so the server's booking lookup
  resolves the date for it. A capture with no booking falls back to the capture day —
  identical to web's own staff capture.

### Multi-service appointment emails (strand 2)

Guest email rendering; the app renders no guest emails. The one shared rule checks out:

Web's new `isVisitLines()` — *lines are a visit when no row carries a `person_label`; a party
when any does* — is the rule the app already uses. `components/bookings/GroupVisitCards.tsx:67`
computes `isGroupPeopleVisit = rows.some((r) => !!r.person_label?.trim())`, and the two
branches are correct:

- **Party branch** — renders `row.person_label?.trim() || row.guest_name || 'Guest'` (line 90).
  This is the same `'Guest'` string web deleted, but in the branch where it belongs: a party
  row is *expected* to carry a label, so a fallback is a real fallback.
- **Visit branch** — renders "Services in this visit" with the service name per line and no
  person name anywhere. That is exactly what web's emails now do.

Web's hero-chip fix (`bookingDisplayStart` — use the earliest line, not the row that
triggered the send) has no app analogue: it exists because a reminder is *sent per row*, and
the app's booking detail deliberately shows the row being viewed. The calendar already spans
a visit correctly via `clusterCalendarBookings` (see `multi-service-calendar-bars`).

### Deposit auto-cancel (strand 3)

`sendAutoCancelNotifications` gaining a `notifyGuest` flag is a cron-internal decision with
no app surface. The app's `auto_cancel_notification` policy default (`['email','sms']`,
enabled) already matches web's, and the flag does not change that key's meaning.

### The guest create routes

The app **does** call `POST /api/booking/create-group` and
`POST /api/booking/create-multi-service` (`lib/queries/useCreateGroupBooking.ts:31`,
`useCreateMultiServiceBooking`), with `source: 'phone' | 'walk-in'`. Both gained a `visitDate`
derived server-side from the request's own segment dates — nothing the caller sends.

The app never sends `compliance_submissions` (no occurrence anywhere in `app/`,
`components/`, `lib/`), so that branch is inert for app-originated bookings. See O2.

---

## Part 3 — observations, not gaps

**O1 — the dry-run per-visit trade-off is shared, not app-only.**
`PATCH /api/venue/visits/[groupBookingId]/schedule` skips the compliance carry-forward when
`dry_run === true`, because a dry run must not write. Web records the consequence in a
comment: *a dry run can still report a per-visit block that the real save would clear.*

The app dry-runs that route from `ModifyBookingSheet.tsx` (lines 1055, 1066, 1167), so it is
exposed — but so is web, whose own `StaffAppointmentModifyForm.tsx` dry-runs it at lines 781
and 877. **Identical behaviour on both sides.** Recorded so that if a user reports "the
modify sheet says a form is missing but saving works", the cause is known and it sits with
web, not the app.

**O2 — the app still cannot capture compliance inline at booking creation.**
Web's guest booking flow can complete a per-visit form inline and now anchors it to the
visit date. The app instead catches the `COMPLIANCE_REQUIREMENT_UNMET` 409 and offers an
`override_compliance` retry (the R7 design). Pre-existing and deliberate — listed because
this range is what makes advance completion genuinely useful, so it is the strongest reason
yet to revisit that decision. Not opened as an R22 gap.

**O3 — `Docs/Resneo_Codebase_Audit_August_2026.md` is findings, not fixes.**
114 confirmed findings against web `main` @ 491832c, committed as a remediation basis.
Per `plan-docs-vs-shipped-code`, nothing in it may be read as shipped web behaviour. Worth
reading before R23, since the next few web ranges will likely be drawn from it.

---

## Summary

| Id | Severity | Area | Status |
|----|----------|------|--------|
| R22-1 | LOW (latent) | Comms defaults — `deposit_payment_reminder` channels | **Built**, + drift guard |
| O1 | — | Visit dry-run reports a per-visit block the save would clear | Shared with web |
| O2 | — | No inline compliance capture at create | Pre-existing, deliberate |
| O3 | — | Web audit doc is findings only | Informational |

Strands 1–3 otherwise land in the app for free.
