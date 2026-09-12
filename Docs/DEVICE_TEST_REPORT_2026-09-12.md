# Device test report — 2026-09-12

Samsung SM-S918B (Galaxy S23 Ultra), Android 16, driven over adb. The app was the **current working
tree** (commit `01da581` plus nothing uncommitted) running through Expo Go against **staging**
(`reserve-ni.vercel.app`), signed in as **plus1 / Plus 1 Staging (admin)**, a venue in the "Plus 1
Staging" collective with a linked partner calendar ("John Light 3" at Light 3).

Everything written below was seen on the phone. Staging data was returned to its starting state:
two test bookings created and then cancelled, every hours change reverted, every closure and
amended-hours entry removed.

## 1. What works

**Booking**

- The seven-step wizard on an own calendar: service (with per-service duration override and
  "Override availability"), practitioner, date, time, review, guest, confirm. Created correctly
  and landed on the diary at the right place.
- The same wizard on the **linked partner calendar** — and its date step shows the PARTNER's
  availability, not ours (their Sundays closed, our 25th/29th closures absent).
- Collective awareness throughout: "For Plus 1 Staging: every member venue's calendars and the
  combined services", and the partner offered as a bookable practitioner.
- Month availability marking ("Green dates have open times for this service") and the grouped
  slot list (Morning / Afternoon / Evening).

**The diary**

- Bars: correct start, height equal to duration, service and time labels, status pill, and inline
  Arrived / Start quick actions. A completed booking renders grey with a Reopen pill.
- **Drag to move** on an own column: moves, asks "Booking moved — let <guest> know?" with Notify /
  Don't notify / Undo change, and persists (re-checked against the server in the booking panel).
- **Drag across columns**: engages, and a drop onto an occupied slot is refused with "Conflicts
  with another booking" — the bar snaps back.
- **Drag on the partner's column**: moves, persists, and offers to notify the partner's guest.
- Week view (calendar × day counts) and Month view (per-day counts, heat map, Open/Closed labels).
- The date-jump sheet (month grid + "Visible hours" From/Until), and the toolbar clock button that
  opens "Amend calendar hours" / "Amend business hours".

**Modify**

- Change the **service**: the duration adopts the new service's catalogue length, "Ends at" updates
  everywhere, and the dry run answers "Time available ✓".
- Change the **duration** by preset or ± stepper.
- Change the **date and time** through the in-sheet steps (no stacked modal), with "Green dates can
  fit this appointment" and the slot list; Done saves and raises the notify prompt.
- Change the **staff member**: re-checks availability, saves, and the bar moves column.
- Status flow: Arrived → Start → Complete → Reopen; Cancel (two-tap confirm) leaves a Cancelled
  booking with Rebook / New for guest.

**Hours — all verified end to end on the grid**

| Change | What the diary showed |
|---|---|
| Calendar weekly hours (Staff 1, Mon 09:00–17:00) | "Staff 1 unavailable 17:00 to 22:00" band from exactly 17:00, and every Monday in the by-date preview switched to 09:00–17:00 |
| Break (Staff 1, Mon 12:00–13:00) | Cream "Break" band exactly 12:00–13:00 |
| Amended hours (Staff 1, Thu 24 Sep, 11:00–17:00) | Column header read "11:00–17:00" with bands either side ("unavailable 09:00 to 11:00", "unavailable 17:00 to 22:00") |
| All-day closure (Staff 1, Sat 26 Sep) | Violet band across the whole day |
| Venue business hours (Sat 10:00–22:00) | Rose "Venue closed 09:00 to 10:00" across every column, grid still starting at 09:00 (the widest-of rule) |
| Planned change from a date (from Mon 5 Oct, Mondays 10:00–22:00) | October preview tinted from the 5th, every Monday reading 10:00–22:00, September untouched |

The "Bookable hours by date" month preview agreed with the diary every time, and the venue's own
closures (25 and 29 Sep) showed as "Venue closed" in both.

**Elsewhere**

- Appointments list: Day/Week/Month/Custom scopes, search, stat tiles, date grouping.
- Reports → Overview (113 appointments created, status and channel bars) and → **Revenue** (range
  and show-by controls, include-no-shows toggle, stacked per-day chart, per-calendar table with
  totals, CSV export). The linked calendar IS included here, named "John Light 3 (Light 3)".
- Today: KPI tiles, "next up", the 7-day bar chart (correct — Sunday genuinely zero), today's diary.
- Contacts: 2,001 clients, server-side search, sort and filter chips.
- Booking page: correctly defaults to the collective's combined page with the venue's own page as
  the other tab, combined address, and a live preview.
- Ask ResNeo: asked "How do I add a break" and got an accurate numbered procedure, the caveat about
  resources, and a link to the help article.

## 2. Issues found

### A. "Price not set" after a Modify save (moderate, reproduced twice) — FIXED

After saving a service change — and again after a date/time change — the booking panel showed
**"Price not set"** on the service line and **"Total: Not set"**, while **"Outstanding" still showed
the OLD service's amount** (£55.00 after switching to a £25.00 service). The two lines contradict
each other in the same card. Reopening the booking shows the correct £25.00 everywhere, so the
server is right and the panel is briefly wrong. A staff member who glances at the card after saving
sees a price that does not exist.

### B. Linked bookings are invisible outside the day view (moderate) — FIXED

The partner-calendar booking I created (ZZLinked Beta, Mon 21 Sep) appears **only** as a bar on the
Day diary and in the Revenue report. It is missing from:

- the **Appointments list** and its search — searching "ZZLinked" over the whole month returned
  "No appointments", while the booking was live on the diary;
- the **Week view** (no row for the partner calendar at all);
- the **Month view** counts (Mon 21 read 8 = 7 Andrew + 1 David, excluding it);
- the Day view's "All" chip count (7, same exclusion).

So a booking you can make in the app cannot be found again by searching for the guest.

### C. A guest with no email or phone cannot be found in Contacts (moderate, product call)

Both test guests were created through the wizard with a name only — every field there is marked
optional. Neither appears in Contacts search ("No contacts match 'Alpha'"), while a search for "ZZ"
happily returns "Ian Ga**zz**ard". The booking shows the name, so the record exists; it just is not
reachable, which means no notes, tags or history for anyone booked in as a walk-in by name.

### D. A booking counts itself as a previous visit (minor)

Marking the (future-dated, 21 Sep) booking Arrived/Started flipped the guest header from "First
visit" to "**1 previous visit**", and the card gained "**Last visit Sat 12 Sep**" — today's date, on
a booking that is three weeks away, for a guest with no other bookings.

### E. An all-day closure labelled "Closed" shows as "On leave" (minor)

The entry was created with the label **Closed** (and the settings list confirms "Staff 1 · Closed"),
but the diary band reads "**On leave 09:00 to 22:00**". The label picker (Closed / Unavailable /
Other) does not reach the band text.

### F. The wizard's step counter is unstable (minor)

It reads "Step 1 of 5", then "Step 2 of 6", then "Step 5 of 7", then "Step 7 of 7" — the total grows
as you advance, so the progress indicator never means what it says.

### G. The diary's + button ignores the day you are looking at (minor)

Pressing + while viewing Saturday 19 September opened the wizard on **today** (12 September). The
day has to be picked again.

### H. A linked booking's panel shows "Service" instead of the service name (minor)

The partner booking's panel reads "Service · 15 min · with John Light 3 · £15.00". Our own bookings
name the service ("Blow Dry"). The bar on the grid carries no service line either.

*(Corrected 2026-09-12 while fixing it: the bar is not part of this. A 15-minute bar is too short
for a second line whoever owns it — the layout is chosen by height — and a 90-minute partner bar
prints its service fine. The panel was the whole defect, and it was ours.)*

### I. DateTimePicker deprecation warning (minor, dev builds only)

Every time a time picker opens, a LogBox toast appears: "DateTimePicker: `onChange` is deprecated."
Invisible in release builds, but it means the app is using a prop the library has already
deprecated.

### J. "Plan hours ahead" defaults to a past Monday (minor)

The card says "Change this calendar's hours **from a date in the future**", but the editor opens with
"New hours from **7 Sep 2026**" — the Monday of the current week, five days in the past. The picker
also lets past dates be chosen.

### K. A multi-service visit counts differently in different places (minor)

Today's screen counts today's two-service visit as **2** appointments (KPI tile and diary list),
while the Appointments list counts it as **1**. Both are defensible; they disagree.

### L. Two-tap confirms re-arm very briefly (observation, not a defect)

Destructive actions (Cancel booking, Remove closure) turn into "Tap to confirm" and revert after a
few seconds. Deliberate and safe, but the window is short enough that a distracted user will often
have to tap twice again.

## 3. Not covered

Payments and card readers (no reader present, and Tap to Pay cannot run in a debuggable build),
push notifications, compliance forms, classes/events/resources editors, waitlist offers, group
bookings, and the customer-facing side of the app. Guest emails were never exercised because both
test guests were created without an email address.

## 4. Fixes applied (2026-09-12, same day)

**A — the money block never shows half a story.** `resolveBookingTotalPence` is now exported from
`lib/payments/payment-display.ts`, and both the hero summary (`VisitSummary`) and the Payments card
hold back the deposit / paid / outstanding lines while the total is unknown AND the detail is still
being fetched: they come out of one server snapshot and are only worth showing together. The
detail sheet and the full-screen route also count a REFETCH as hydrating
(`isPlaceholderData || isFetching`), not just the first paint — the post-save refetch was the window
where the contradiction appeared. Tests in `VisitSummary.test.tsx` pin both halves: nothing
contradictory while settling, and "Not set" still shown once the refetch has landed.

**B — linked bookings count where they are shown.** Four changes:

- the Appointments list starts on this venue **and every linked one** (`defaultVenueSelection`,
  extracted as a pure function and tested) instead of leaving partners unticked;
- the Day view's "All" badge adds the linked bookings on that date, so it matches the columns
  actually drawn;
- the linked feed is fetched for the **month** range in month scope, which is what the month grid's
  "+N linked" chip was already written to count — it read zero everywhere but the anchor day;
- the week matrix takes linked rows (named by venue) with their counts supplied separately, and a
  linked cell opens the day rather than scoping the day view to a calendar this venue does not own.

Both fixes are unit-tested (full suite: 299 files, 2,951 tests) but **not yet re-verified on the
device** — the phone was unplugged before the confirmation run.

## 5. Fixes applied (2026-09-12, C and D)

**C — the directory says what it is hiding.** Not a defect in the machinery: `GET /api/venue/guests`
defaults its `filter` to **`identified`**, which it reads as `identifiability_tier = 'identified'`
("has an email or phone"), and the app's own default scope ("With contact details") matches it. The
web dashboard defaults the same way ("Saved contact details"), so hiding a name-only contact is the
product's intent — what it lacked was any way to find that out. Both test guests were in Contacts
all along; switching the scope to "All" showed them (2001 → 2004 clients).

So the screen now answers the question it was failing to answer. When the scope is the default and
the list either comes back empty or is being searched, the app asks the same question again at scope
`all`, one row, for the count alone (`useGuests` gained an `enabled` option that can only narrow),
and compares the totals. Anything held back is said plainly, in the empty state or under the last
row, with one tap to lift it:

> 1 client matches "Alpha" but has no saved email or phone. The 'With contact details' filter is
> hiding them. **[Show them]**

Copy is a pure function (`lib/guests/identity-scope.ts`) with the venue's own terminology and its own
tests. Verified on the device both ways: a search that finds nobody (empty state, "Show them" reveals
ZZTest Alpha) and a search that finds somebody but not everybody — "ZZ" listing Ian Gazzard with
"2 clients match "ZZ" but have no saved email or phone" under it.

**D — a booking no longer counts itself.** The server increments `guests.visit_count` and stamps
`last_visit_date` with **the day of the transition** the moment a booking is seated (web
`src/lib/table-management/lifecycle.ts`), so from Arrived onwards the guest's totals include the
booking you are looking at — which is how a booking three weeks away came to report "1 previous
visit · Last visit Sat 12 Sep" for a guest with no other bookings.

`lib/booking/guest-visit-history.ts` takes this booking back out of the totals for the three places
the panel speaks about history: the line under the guest's name, the summary's context line, and the
Details rows ("Previous visit", "Visits"). Once seated, the stored date IS this booking's attendance
and the date it overwrote is not sent to us, so the panel names no date at all and falls back to the
count behind it. Nothing else changes before Arrived.

Verified on the device against a booking that was already Started: the partner's Andrew Courtney has
two visits on the server, and the panel reads "**1 previous visit**" with the context line
"2 hr 45 min · Saturday 12 September · **1 previous visit**" — where it would have said "2 previous
visits · Last visit Sat 12 Sep". A Cancelled booking is untouched, as it should be: the visit it
produced is still the guest's.

One limit, recorded rather than worked around: a booking cancelled *after* being seated keeps its
visit on the server (no decrement, and `checked_in_at` is a separate flag the status change does not
set), so the app cannot tell that this booking is the one behind the count. The web's own panel side-
steps the whole question by labelling the raw number "N visits"; ours answers "has this person been
here before?", which is the more useful question and the one the app has always asked.

Full suite green: 301 files, 2,969 tests.

## 6. Fixes applied (2026-09-12, E to L)

All verified on the same S23 over adb, on staging, with the staging data put back afterwards
(one closure created and removed; nothing else written).

**E — a closure says the word it was given.** The editor calls that field "Label" and offers
Closed / Unavailable / Other; the diary said "On leave" whatever was picked. `leaveBandLabel` now
carries the choice onto the stripe and `partitionClosureBands` re-adds the minutes to *that* word
rather than a fixed one. "Other" keeps "On leave" — a stripe reading "Other 09:00 to 22:00" would
explain less. On the device: an all-day entry labelled Closed drew "**Closed 08:00 to 22:00**".
Note the divergence: web labels every leave band "On leave"
(`src/lib/calendar/schedule-closure-blocks.ts`) while offering the same three-way Label field, so
this wants raising with them rather than reverting here.

**F — the wizard counts phases, not steps.** The step list is derived from what has been chosen, so
the total could only grow: "Step 1 of 5", "2 of 6", "5 of 7". Web hit this first and answered it by
folding its own flow into three phases (`appointmentProgressPhase`); the app now does the same —
Choose → Schedule → Confirm, ported as `appointmentWizardPhase`. Each step already carries its own
heading ("Choose a service", "Pick a time"), so nothing is lost. Walked end to end on the device:
Choose (service) → Choose (practitioner) → Schedule (date) → Schedule (time) → Schedule (visit
review) → Confirm (guest). The denominator never moved.

**G — "+" books the day you are looking at.** The FAB sent no date at all, so pressing it on a
Saturday three weeks out opened the form on today — while Walk-in, on the same sheet, carried the
day correctly. Both now go through one builder (`newBookingParams`), tested. On the device, "+" on
Sat 19 Sep opened the date step with the 19th selected.

**H — a partner's booking is named.** The panel resolves a plain service's name out of OUR services
catalogue, which cannot name a partner's service, and the diary — unlike the Appointments list —
handed it no fallback: every linked booking's panel read "Service". The diary now passes the name
from the row that opened it, its own columns and a partner's alike. Where the partner's server
resolves no name (`serviceName: null` on the linked feed, which is also why the bar carried no
service line) the panel still has nothing to show: that half is the web's, and is the more likely
explanation for the original ZZLinked Beta observation.

**I — off the deprecated picker callback.** `DateTimePicker`'s `onChange` is deprecated in
@react-native-community/datetimepicker 9.1.0; all three pickers (`TimePickerField`,
`DatePickerField`, the booking-log email card) now use `onValueChange` + `onDismiss`. On the device
the native dialog opens with no LogBox toast, and Cancel closes it leaving the value alone.

**J — "Plan hours ahead" starts ahead.** A new change seeded the Monday of the CURRENT week — five
days in the past on a Saturday — under copy promising "a date in the future", and the picker allowed
any past date. `scheduleChangeStart` snaps a pick to its own Monday and then holds it at the coming
one; the picker takes today as its minimum. An existing period keeps its own start, which may
legitimately be in the past. On the device the form opened on "14 Sep 2026" and the picker greys out
everything before today.

**L — the confirm window is long enough to use.** Eleven two-tap destructive buttons each had their
own copy of 4000 ms, which closed while the reader was still reading it. One constant
(`CONFIRM_ARM_MS`, 8 s) now governs all of them. On the device, "Tap to confirm" was still armed six
seconds after the first tap.

**Also here — D, tightened.** A visit is counted once, on whichever of its services is seated first,
so the panel now reads the visit's siblings: seating the 09:00 service used to leave the 11:30 one
still claiming that visit as the guest's past ("2 previous visits" against the other row's "1").
Both rows now say "1 previous visit".

### K is not fixed, deliberately

The Today tile's count comes from the server (`/api/venue/dashboard-home`, which counts booking
ROWS), and the Appointments list collapses a multi-service visit to one row before counting — the
web does exactly the same on both sides (`AppointmentBookingsDashboard.tsx:876` collapses;
`dashboard-home-payload.ts` does not). Making the app agree with itself would mean either undoing a
deliberate, web-parity collapse or overriding a server count with a number derived from a capped
"recent" list. It is one question for the web team — should a visit count once or once per service?
— and the answer belongs on their side of the line.

Full suite green: 303 files, 2,985 tests.

## 7. Final device sweep (2026-09-12, 20:08–20:18)

Everything in §4–§6 re-checked together on one cold start of the finished bundle — Expo Go force
stopped and relaunched, so nothing rested on a chain of Fast Refreshes. Staging was returned to its
starting state: one closure created and removed, no bookings made.

| Fix | What the phone showed |
|---|---|
| A, B | Verified earlier in the session and shipped (`3feed4d`) |
| C | "Alpha" → "1 client matches "Alpha" but has no saved email or phone. The 'With contact details' filter is hiding them." + **Show them**, which reveals ZZTest Alpha |
| D | Seated booking: "1 previous visit" in the header AND the summary line, and Details reading "Previous visit: None yet · Visits: 1". A Booked sibling of the same visit agrees |
| E | A closure labelled **Unavailable** drew "Unavailable 08:00 to 22:00" (and **Closed** drew "Closed 08:00 to 22:00" on the earlier run) — both branches of the label reach the diary |
| F | Choose → Choose → Schedule → Schedule → Schedule → Confirm, "Step N of 3" throughout; the denominator never moved |
| G | "+" on Sat 26 Sep opened the date step with the 26th selected, today only outlined |
| H | **Decisive**: a single-service partner booking (Fri 18 Sep, 09:00) now reads "**Beard Trim** · 15 min · with John Light 3 · £15.00" where the report recorded "Service · 15 min · …". Its Details card names it too |
| I | The native time dialog opened with no LogBox toast; Cancel closed it and left 09:00 alone |
| J | "New hours from **14 Sep 2026** · Monday 14 September 2026"; the picker greys out every date before today |
| L | "Tap to confirm" still armed seven seconds after the first tap |

H is worth one line of its own: the linked feed was carrying the service name correctly all along
(`serviceName` on `/api/venue/linked-calendar`, resolved for any `full_details` link). The app was
dropping it on the diary path — the Appointments list passed it down, the diary did not — so the
whole finding was ours, and there is nothing to ask the web for.

The three findings that ARE the web's (K, the closure label, and the `last_visit_date` stamp) are
written up for them in `Docs/R36_WEB_HANDOVER.md`.
