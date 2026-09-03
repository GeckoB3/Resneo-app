# R23 — app-vs-web delta audit

**Range:** `resneo` **`main`** `a20a54ba..7acff0ba` — 3 commits, 226 files, +14811/−4569.
**Audited against:** `Resneo-app` @ `ce1d85c`, 2026-09-03.
**Range shape:** `a20a54ba` is a direct ancestor of `7acff0ba`. One commit went straight to
main (`e6553941`, #170); the other two are squash merges (`05713908` "Staging (#171)",
`7acff0ba` "Staging (#172)") whose bodies read as sixteen granular changes. `origin/staging`
(`c610fafa`) has a byte-identical tree, so there is no unreleased web work behind this range.
Every claim below was checked in code on both sides, never from the plan docs (see
`plan-docs-vs-shipped-code`).

**The stretch before this range** (`18dac985..a20a54ba`: #161–#169, the three auth fixes) was
never given its own audit; it was consumed by the app's customer-mode build (`d30850e..ce1d85c`,
2026-08-26 to 2026-08-31 — account, marketing consent by `guest_id`, push, typed-code sign-in)
and is not re-examined here. The one standing note from it — recovery links deliberately stay
on the web while builds ≤ 1.0.7 matter — is recorded in the `reference-repo` memory.

Six strands in this range:

1. **Auth #170** — staff email fallback bounded to unclaimed rows; the mobile sign-in contract
   docs corrected (OTP length is not fixed; `GET /api/venue/staff/me` keeps a bare 401).
2. **Compliance (#171)** — staff are never blocked; every unmet requirement comes back as a
   warning carrying a new `severity`; the admin `override_compliance` field is gone;
   requirements can be **venue-wide** (`scope: 'venue'`); the two public pre-check routes are
   replaced by one.
3. **Service categories (#172)** — new table + API, headings on every booking surface, catalog
   additive (`categories[]` + `service.category`), collective inheritance.
4. **Multi-service picker (#172)** — choose every service first; `GET /api/booking/availability`
   takes a `services` chain; `create-multi-service` takes a staff per-segment
   `duration_minutes` and resolves collectives; `create-group` accepts 40 rows.
5. **Rotating schedules / schedule periods (#172)** — `unified_calendars.schedule_periods`
   (+ the older `working_hours_rota` fallback) change a calendar's effective hours by date;
   resolved server-side everywhere hours are read, and **returned on the practitioners feed**.
6. **Booking page (#172)** — `brand_accent` dropped (dead); `brand_emails` switch; the
   `services_layout` chooser; venue address parsing by position.

Plus marketing/homepage work, onboarding link fixes, E2E/CI fixes and a Collective RLS
recursion fix — none of which reach the app.

**Verdict (R23-1 built 2026-09-03, the rest open): seven gaps — two of them live behaviour regressions the app inherits the moment a
venue uses the new web features (R23-1, R23-2), three feature gaps (R23-3, R23-4, R23-5) and
two small ones (R23-6, R23-7). Nothing in the range breaks an endpoint the app calls.** The
auth work is already matched by the app's own 2026-08-31 commits; the deleted public compliance
routes were never called from the app; the removed `override_compliance` field is stripped, not
rejected.

---

## Part 1 — R23-1: staff are never blocked, and the app cannot tell a `required` warning from an advisory one

**Severity: HIGH (live).** A venue's "Block all bookings" rule now degrades to a soft amber note
on single bookings and to **nothing at all** on multi-service and group bookings.

**BUILT 2026-09-03.** `ComplianceBookingWarning.severity` added; `ComplianceWarningNotice`
rebuilt on web's two tiers (`required` in the danger tone with the venue's-requirement copy,
advisory in the warning tone) with a "Capture in venue" action that opens the booking;
`GroupedBookingResponse.compliance_warnings` added and forwarded by the multi-service
confirmation; the group flow (which has no confirmation screen — it lands on the booking) raises
a long-lived error/info toast on the way; every `override_compliance` / "admin override" path
removed (ConfirmStep, BookingFlowPrimitives, Class/Event/Resource flows, GroupBookingFlow,
RescheduleSheet, useBookingMutations, useCreateBooking). The 409 handling stays as a plain
refusal — it is the helper's contract for the online context. Tests:
`components/compliance/ComplianceWarningNotice.test.tsx`.

### What web changed

`src/lib/compliance/resolve-requirements.ts` — `isBlocking()` returns `false` for
`context === 'staff'` unconditionally. `summariseBlocking()` now returns every unmet requirement
as a warning, sorted `required` first, with a new field:

```ts
export type ComplianceWarningSeverity = 'required' | 'advisory';
// required = a block_all rule (the venue requires it of everyone; staff only proceed
//            because staff are never blocked); advisory = everything else
```

`enforce-booking.ts` drops `adminOverride`; `POST /api/venue/bookings`, `walk-in` and
`PATCH /api/venue/bookings/[id]` no longer read `override_compliance` (their schemas strip the
key). The 409 `COMPLIANCE_REQUIREMENT_UNMET` branch is kept as "the helper's contract" but is
unreachable for staff. `create-multi-service` and `create-group` now merge warnings by type and
return `compliance_warnings` in the 201 for the `staff` context (group did not return them before).

Web's staff confirmation (`AppointmentBookingFlow.tsx` → `StaffComplianceWarningsCard`) renders
`required` items **first, in red**, with the copy "this venue requires X for this booking and it
is not on file. Capture the record in venue or send the form before the appointment", then the
advisory items in amber, then a **"Capture in venue"** link that opens the booking.

### What the app has

- `lib/queries/useCreateBooking.ts:72` — `ComplianceBookingWarning` has no `severity`;
  `components/compliance/ComplianceWarningNotice.tsx` renders every warning identically in amber
  as "not on file yet. Collect the record or send the form". A `block_all` rule that yesterday
  hard-stopped the booking with "Book anyway (admin override)" now reads like a reminder.
- `components/booking-wizard/ConfirmStep.tsx:444-476` (multi-service) and
  `components/booking-wizard/GroupBookingFlow.tsx:384-398` (group) **do not forward
  `compliance_warnings`** from the response; `GroupedBookingResponse`
  (`lib/queries/useCreateMultiServiceBooking.ts:18`) has no such field. Before this range that
  hid only warn_* rules; now it hides the venue's block_all rule too.
- Dead code the change leaves behind: the 409 override retry in `ConfirmStep.tsx:420,635`,
  `BookingFlowPrimitives.tsx:279,483`, `GroupBookingFlow.tsx:404`, `RescheduleSheet.tsx:168,250`,
  `useBookingMutations.ts:248,344,422`, `useCreateBooking.ts:68` and the `override_compliance`
  spreads in the Class/Event/Resource flows. Harmless (ignored server-side), but every "Ask an
  admin to override" string is now a lie.

### Build

1. Add `severity?: 'required' | 'advisory'` to `ComplianceBookingWarning`; add
   `compliance_warnings?: ComplianceBookingWarning[]` to `GroupedBookingResponse` and forward it
   in both success handlers.
2. Rebuild `ComplianceWarningNotice` on web's two-tier copy: required first in the danger tone,
   advisory in warning tone, plus a "Capture in venue" action that opens the booking detail
   (`BookingDetailSheet` already hosts the capture flow).
3. Remove the override UI and the `override_compliance` plumbing (keep `complianceBlockMessage`
   — the 409 still exists for the online context and is the helper's contract). Note
   `lib/api/error-codes` on web now documents the app's retry as "dormant".

---

## Part 2 — R23-2: schedule periods change a calendar's hours by date; the app's diary still draws the base week

**Severity: HIGH (live, data correctness).** A calendar on a rota or with hours planned from a
future date shows the wrong closed bands and the wrong hours summary in the app.

### What web changed

Migration `20270203120000` added `unified_calendars.working_hours_rota`; `20270204120000`
added `schedule_periods` and backfilled each rota into a one-period timeline:

```
schedule_periods = { version: 1, periods: [
  { id, from: <Monday>, until: <Sunday> | null, cycle_start: <Monday>,
    weeks: [ working_hours-shaped object × 1..6 ] } ] }
```

`src/lib/availability/working-hours-rota.ts` (362 lines, pure) is the single resolver:
`resolveScheduleForDate(row, ymd)` → the covering period's week
(`weekIndex = floor((day − cycle_start) / 7) mod weeks.length`), else the base `working_hours`;
a null `schedule_periods` falls back to `working_hours_rota`. `calendarHours()` now calls
`effectiveWorkingHoursForDate` in place of its direct `working_hours` read, so every engine,
month grid, break block, hosted resource and write gate follows the timeline. **Both columns are
now returned on `GET /api/venue/practitioners`** (`unifiedCalendarToPractitionerRow`) and on a
resource's `host_calendar`. `PATCH /api/venue/practitioners` accepts `schedule_periods`
(null removes; writing it also nulls the old rota) on both the admin and staff paths, and runs
the existing narrowing-hours orphan check against the *effective* hours of old and new.

### What the app has

The app deliberately derives calendar closure bands itself (`calendar-closure-bands` memory:
the grid feed carries no closures). `lib/calendar/calendar-hours.ts:116` reads
`row.working_hours` only; `CalendarScheduleRow` has no `schedule_periods` /
`working_hours_rota`. Consumers: `lib/calendar/schedule-closures.ts:189` (the diary's closed
bands + "no template" test) and `app/(app)/availability.tsx:664` (`summariseWorkingHours(p.working_hours)`,
the per-calendar hours line). The `WorkingHoursEditor` edits base `working_hours` only — which is
still the right thing to save (dates outside every period keep it), so saving is not wrong, only
the picture is.

Consequence on a rota week: the diary greys the base week's off-hours over slots the server will
happily book, and leaves ungreyed the hours the calendar is actually closed. The
`calendarHasWeeklyTemplate` test is also wrong for a calendar whose base week is empty but whose
periods are not.

### Build

1. Port the resolver (parse + `resolveScheduleForDate` + `weekIndexInPeriod` + the legacy rota
   fallback; skip the editing half) to `lib/calendar/working-hours-rota.ts`, with the web tests'
   fixtures (`working-hours-rota.test.ts`: parsing, week index, cycle arithmetic, malformed → no
   periods).
2. `calendar-hours.ts`: read `schedule_periods` / `working_hours_rota` on the row and resolve
   through it; `calendarHasWeeklyTemplate` true when any period week has hours. Same precedence
   as web — below per-date overrides and days off.
3. Availability screen: resolve the summary line for *today* through the same helper and show a
   "Rotating schedule / planned changes" line when periods exist; a read-only list of the
   periods (from/until/N-week pattern) with "Edit on the web dashboard" is the honest first
   cut. Web's `ScheduleTimelineEditor` + `SchedulePeriodForm` + `ScheduleCalendarPreview`
   (~900 lines with tests) is a phase 2.
4. Hosted resources (`ResourceEditorSheet` / `schedule-calendars.ts`) take the host calendar's
   two new columns through the same path.

---

## Part 3 — R23-3: service categories

**Severity: MEDIUM (feature).** Additive on the wire; the app lists flat and cannot manage
headings.

### What web changed

New table `service_categories` (`id, venue_id, name, sort_order`), nullable
`service_items.category_id` (SET NULL on delete). API, all staff-authed:

- `GET /api/venue/service-categories` → `{ categories: [{ id, name, sort_order }] }`;
  `POST { name }` (201 `{ category }`, 409 on a duplicate name); `PATCH { id, name }`;
  `DELETE ?id=`; `PUT /api/venue/service-categories/reorder { category_ids: [] }`.
- `GET /api/venue/appointment-services` now also returns `categories`; `POST`/`PATCH` accept
  `category_id: uuid | null` (400 "That category no longer exists" for a foreign id).
- `GET /api/booking/appointment-catalog` — top-level `categories[]` in booking-page order
  (including empty ones) and `category: { id, name, sort_order } | null` per service.
  Documented for the mobile app in `Docs/MOBILE_API.md`: "a client that groups should list
  services under `category` in `categories` order, with uncategorised services last under
  'Other services'".
- `booking_page_config.services_layout: 'sections' | 'accordion'` (default absent = sections).
- Pure helpers in `src/lib/booking/service-categories.ts` — `compareByCategoryThenServiceOrder`
  (category position → venue drag order; uncategorised last; a venue with no categories sorts
  exactly as before), `groupServicesByCategory`, `serviceMatchesSearch` (every word must appear
  in name, description or category name; search shown from six services).
- Collectives: `collective_service_categories`, inheritance from member venues, six new
  catalogue PATCH actions; the free-text `collective_service_items.category` column stays dead.

### What the app has

- `components/booking-wizard/ServicePickerStep.tsx:111` sorts the picker **alphabetically** —
  it never honoured the venue's `sort_order` either, so this was already a divergence from web.
  `types/appointment-catalog.ts` has no `category` / `categories`.
- `app/(app)/manage/services.tsx` lists by `sort_order` with no grouping; the service form has
  no Category select; `types/services-manage.ts` has no `category_id` / `categories`.
- `app/(app)/manage/booking-page.tsx` has no "How services are listed" control.
- `components/linked/CollectiveCatalogueBuilder.tsx` sends no category actions.

### Build (in this order)

1. Types + picker: `category`/`categories` on the catalog types; port
   `compareByCategoryThenServiceOrder` + `groupServicesByCategory` + `serviceMatchesSearch` with
   their tests; render the picker as headed sections (flat when the venue has none) with the
   search box from six services. This also fixes the alphabetical ordering.
2. Services screen: a Categories manager (add / rename inline / delete with confirm / reorder)
   on the new routes, the list grouped under headings, a Category select on the service form
   (`category_id`, null clears).
3. Booking-page editor: `services_layout` segmented control, shown only when the venue has
   categories.
4. Collective catalogue categories — optional; the host manages these on the web today.

---

## Part 4 — R23-4: the multi-service picker, and what it unlocked on the server

**Severity: MEDIUM (feature + one correctness improvement).**

### What web changed

Guests and staff tick up to four services first; the practitioner list narrows to whoever offers
them all; the day view calls `GET /api/booking/availability?services=[...]` and gets only the
starts where the **whole chain** fits back to back with one person (first segment from the slot
generator, later ones via `validateExactAppointmentStart` with phantoms — the same walk
`create-multi-service` performs on write). Slots are labelled with the first `service_id` and
carry the span as `duration_minutes`. `create-multi-service` now accepts a staff-only per-segment
`duration_minutes` (honoured for `phone` / `walk-in`) and resolves collective offering ids;
`create-group` takes 40 rows (ten people × four services; an attendee with several services
becomes consecutive rows shown as one card).

### What the app has

The app keeps the older model (`ServiceBookingFlow.tsx:352` — pick one service and slot, then
"+ Add another service" with the same practitioner; `lib/booking/multi-service-chain.ts`
recomputes starts client-side). The server still validates that exactly as before, so nothing
breaks. Three concrete deltas:

- **Staff duration overrides are dropped on chains.** `ServiceBookingFlow.tsx:366-376` and
  `multi-service-chain.ts` (`naturalDurationMinutes`) reset a custom duration to the catalogue
  length the moment a second service is appended, because the route had no per-segment field.
  It has one now — send `duration_minutes` per segment for staff sources and keep the override.
- **No pre-check that appended segments fit.** The app never sends `phantoms` or `services`;
  a chain whose second segment collides only fails at confirm (400 "must be consecutive" /
  slot taken). Adopting `services` on the availability call (web's chain payload) removes that.
- **Group attendees are one service each** (`GroupBookingFlow.tsx`); web allows four.

### Build

Minimum: per-segment `duration_minutes` (small, correctness). Recommended: port the picker —
tick services on the service step, `services` chain on availability, review shows "Change
services". Group multi-service rows last.

---

## Part 5 — R23-5: venue-wide compliance requirements

**Severity: MEDIUM (feature; the app cannot see or create them).**

### What web changed

Migration `20270201120000`: `service_compliance_requirements.scope ('service' | 'venue')`, the
one-service check relaxed, a partial unique index per venue+type for venue rows. Every loader
merges venue rows with the service row winning on the same type
(`mergeRequirementsServiceWins`). API: `GET /api/venue/compliance/requirements?scope=venue`;
`POST` takes `scope` (default `service`; `service_id` required only for `service`); rows now
carry `scope`. Settings → Compliance → Requirements gains a pinned **"All bookings"** row; the
service editor shows the venue-wide types read-only.

### What the app has

`lib/queries/useComplianceRequirements.ts:99` — `ComplianceRequirementRow` has no `scope`;
`useComplianceRequirementCounts` skips rows with both FKs null (so venue rows are invisible,
not crashing); `useAddComplianceRequirement` requires `service_id`;
`ComplianceServiceRequirementsPanel` is per-service only; the per-service editor's GET is
server-filtered by service, so venue-wide rules never appear there.

### Build

`scope` on the row type; an "All bookings" `CollapsibleCard` pinned above the services using
`?scope=venue` with the same editor (POST `{ scope: 'venue', … }`); the venue-wide types listed
read-only inside each service's card; counts pill reads "N required · +M for all bookings".

---

## Part 6 — R23-6: booking-page editor fields

**Severity: LOW.**

- `brand_accent` is **dead**: web's `sanitizeBookingPageConfig` no longer keeps it, the venue
  route schema dropped it (unknown keys stripped, not rejected), and nothing on the booking page
  ever consumed it. The app still shows an Accent input and a second swatch
  (`app/(app)/manage/booking-page.tsx:91,117,206`, `lib/booking/bookingPageConfig.ts:103`) and
  the same in `components/linked/CombinedPageConfigEditor.tsx:78,142,178,199` (the collective
  config goes through the same sanitiser). Remove both; a saved value is silently discarded.
- `brand_emails` — "Use my brand colour in customer emails", off by default, under Brand colour,
  disabled without a valid primary; **venue page only** (combined pages send from the host).
  The app has no switch.
- `services_layout` — see R23-3.

---

## Part 7 — R23-7: venue address parsing

**Severity: LOW.** `lib/venue/addressFormat.ts` is a port of web's old `parseAddress`: it
decides whether the last part is a postcode with a UK regex, so a French or US postcode falls
to the count-of-parts branch and a three-part address loses its building name; and an address
saved with no building name reloads with the street in the Name field. Web now parses **by
position** (≥4 parts → name, street…, town, postcode; 3 → street, town, postcode; fewer →
leading fields) and, on save, fills a blank building name with the business name once a street
exists (so the stored string is always the unambiguous four-part form and Maps can find the
venue). Port the parser (web has Belfast/Paris/New York/Dublin round-trip tests) and the save
fill in `app/(app)/manage/venue-profile.tsx:142,444`.

---

## Landed for free / no gap

- **Auth #170.** The app's 2026-08-31 commits already match: `ef0896f` made the code input
  length-agnostic (the very truncation web's note describes), `8c457dc` dropped password reset,
  and `useRole` already relies on the bare 401 from `GET /api/venue/staff/me` that
  `mobile-401-contract.test.ts` now locks. The staff-email fallback bound is server-side.
- **Deleted `compliance/inline-forms` and `compliance/pre-check`.** The app never called them
  (they were guest-flow routes); the replacement `booking-requirements` is guest-only too.
- **`override_compliance` removal.** Stripped by the staff schemas; the app's field is ignored,
  not rejected. Cleanup folded into R23-1.
- **Compliance submission hardening** (`version_id`, inline-only types) — public routes.
- **Add-ons in staff price/duration** — the app's `ConfirmStep.tsx:263-276` already folds add-ons
  into both, and `StaffChargeControls` reads the segment totals.
- **Services "Active (visible to guests)" per-card switch** — the app has the switch in the
  editor and an Inactive badge on the card; functional parity, different placement.
- **`create-group` 40 rows** — the app's cap of 10 is the *people* cap, which is unchanged.
- **Email brand colour plumbing, comms preview, ~25 widened venue selects** — server-side.
- **Collective RLS recursion fix** — the app reads collectives through the API (service role).
- **Homepage / marketing / Restaurant plan retirement / E2E and CI fixes** — not app surface.
- **Onboarding link fixes** — onboarding is deliberately not ported (see `web-parity-2026-08`).
- **Calendar processing strips on multi-service bars** — cosmetic; not verified against the
  app's clustered bars. Worth a glance when R23-4 is built.

## Suggested order

R23-1 (half a day, live regression) → R23-2 steps 1–3 (a day) → R23-3 steps 1–2 → R23-5 →
R23-4 minimum (`duration_minutes`) → R23-6/R23-7 → R23-4 picker → R23-3 step 3–4, R23-2 step 3.
