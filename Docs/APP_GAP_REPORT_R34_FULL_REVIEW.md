# App gap report R34: a full review against web `9ebfc03e` (2026-09-11)

Not a delta audit. The owner asked for the whole app to be re-read against the read-only web
reference (`_reference/Resneo`, detached at `origin/staging` `9ebfc03e`) looking for bugs,
inconsistencies and places the app does not meet parity — including in work landed earlier the
same day as [[web-delta-audit-r33]].

Six reviews ran in parallel, one per domain, each required to cite both sides and to skip the
app's documented deliberate divergences: the diary, Reports, guest messaging and marketing,
booking write contracts, hours and availability contracts, and contacts plus the booking panel.
Every finding below was verified against the implementation in both trees, never against a plan
document ([[plan-docs-vs-shipped-code]]). The highest-severity claims were then re-checked by
hand before any code changed.

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R34-1 | The R33 closure partition clipped leave bands to the venue's OPEN minutes. Those minutes then redrew as `venue_closed`, which is non-occupying, so the diary accepted a drag onto leave that the server refuses (full-day leave survives even `allow_outside_hours`) | **Bug** (regression from the same day) | **Built** (§3) |
| R34-2 | `POST .../validate-appointment-modification` requires `practitioner_id`; the Modify sheet sent it only on a real reassign, so every ordinary edit was answered 400 and the live availability check never ran | **Bug** | **Built** (§4) |
| R34-3 | The appointment confirmation gated its deposit and payment-link lines on `requires_deposit` / `deposit_amount_pence`, which that 201 has never returned — so a deposit booking confirmed with no notice at all | **Bug** | **Built** (§5) |
| R34-4 | The deferred "your booking changed" notify answers 200 with `skipped` / `skippedReason` when it sent nothing; both app call sites toasted "notified of the change" regardless | **Bug** | **Built** (§6) |
| R34-5 | Editing amended hours from the planning calendar rebuilt a one-day run with `reason: null` whenever the closures list did not carry the date (chip filter, ±90-day window), and the save then wiped the run's reason | **Bug** | **Built** (§7) |
| R34-6 | The bulk contacts message counted a contact with no email or phone, and a delivery failure, as *sent*; its "SMS will be cut short" hint was false on that path; and its stated reason for diverging from the web (that the web ignores consent) is no longer true | **Bug + parity gap** | **Built** (§9) |
| R34-7 | The contacts message sheet showed "Request failed (502)" instead of the route's per-channel reasons | **Bug** | **Built** (§9) |
| R34-8 | The inline hours-mismatch advice was wiped by the editor's remount the moment it appeared; the marketing toggles snapped back until the refetch landed; the revenue stepper computed from stale placeholder data; a developer note ("Install expo-file-system…") shipped to users | **Bugs** (small) | **Built** (§7, §8, §9) |
| R34-9 | Per-service "Undo start" returned a service to Booked; the web returns it to Confirmed, and calls the reverse action "Undo complete" | Parity gap | **Built** (§6) |
| R34-10 | A weekday missing from a configured `opening_hours` map read as "unknown" (unconstrained) instead of closed, so the diary drew it bookable where the engine refuses guests; and the app could itself write such a partial map | Parity gap | **Built** (§3, §7) |
| R34-11 | The amend-hours clock was on the day grids only; the web offers it in every view mode | Parity gap | **Built** (§3) |
| R34-12 | Inactive calendars were absent from the Availability screen, so their hours, breaks and closures could not be seen or edited | Parity gap | **Built** (§7) |
| R34-13 | Reports Overview lacked the web's event ticket tiers, resource utilisation and table utilisation sections; its custom range was capped at today; the no-show chart kept only the last 14 active days; several CSV headers, filenames and columns differed; the by-booking-type rule and columns differed | Parity gaps | **Built** (§8) |
| R34-14 | Reports Clients tab sent no identity filter (so its default list differed from the web's), and had no Show or Sort controls, no phone / visit-count / no-show columns, and different history CSV columns | Parity gaps | **Built** (§8) |
| R34-15 | The contacts filter sheet hid the date range for the last-staff and last-service lists, though its own hint promised it; the contact header dropped visit count, last visit and next visit | Parity gaps | **Built** (§9) |
| R34-16 | The closures editor enforced a second-period ordering rule neither the web form nor the route imposes; the booking composer defaulted to Email where the web defaults to Both | Parity gaps | **Built** (§7, §9) |
| R34-17 | Minor drift: leave stripe label without its range, empty-day window 08–20 vs the web's 07–21, single-calendar bounds ignoring the roster, "Enter an amount" vs "Price not set", "Consented" vs "Subscribed", week header off by a day at UTC+13, a dead `created_by_name` branch, a stale walk-in comment, live time pickers in a read-only week, device-local "today" on the closures card, a screen-reader label reading the time twice | Minor | **Built** (§3–§9) |
| R34-18 | The booking summary route now returns `visit_payment.lines`, and the web merge keeps them. The app never merges the summary over the detail key (it is `placeholderData` on its own key), so the web's "Price not set" flicker has no app counterpart | No gap | Nothing to build |
| R34-19 | `POST /api/venue/staff/change-password` now serves Bearer callers — the web's answer to `Docs/R32_WEB_HANDOVER.md`. The app moved to `POST /api/account/password` in `f243ff1` and needs nothing further | Closed | Nothing to build |

## 2. What was checked and found consistent

Recorded so the next audit does not re-walk it: the booking create / patch / visit-schedule
bodies and their enums, statuses and duration floors; the 409 / 400 / 412 bodies the app
special-cases; `types/calendar-grid.ts` against `getCalendarGrid`; the optional-phone rule (R31-1)
across all five staff flows; the marketing-permission rule and the consent/opt-out exclusion the
server enforces; message length caps and the SMS segment budget; the guest-document limits and
their gating; the guest list's params, segments and sort values; the amended-hours, leave,
opening-hours and availability-block contracts including day-key and time formats and the
acknowledge flow; the staff allowlist on `PATCH /api/venue/practitioners`; the hours-mismatch
sentences and the roster each side checks; and the booked-revenue wire contract and CSV.

## 3. The diary (R34-1, R34-10, R34-11, part of R34-17)

**Leave.** Web's `partitionScheduleClosureBlocks` passes `practitioner_leave` through untouched;
only the venue-closed and calendar-closed stripes are partitioned. R33's port subtracted the
venue's shut minutes from leave so the bands would not overlap. Those minutes then came out as
`venue_closed`, which `occupying-blocks` treats as advice, so a bar could be dropped onto a
calendar that is on leave — and `POST /api/venue/bookings` refuses exactly that. Leave now passes
through whole (`lib/calendar/schedule-closures.ts`), drawn after the venue stripes so it covers
them, and relabelled with its own minutes; the note is dropped, as the web's leave blocks carry
no reason. `buildCalendarClosureOverlays` emits the plain label.

**The weekday rule.** `venueWeekDayHours` (`lib/calendar/venue-closures.ts`) now mirrors
`resolveVenueWideAllowedMinuteRanges`: an absent or empty map imposes nothing, but inside a
CONFIGURED map a weekday that is missing, marked closed, or carries no usable periods is closed,
and a legacy day-level `{ open, close }` is one open period. This feeds the shading, the grid
bounds, the month grid's Open/Closed label, the working-today filter and the dated hours advice.

**Bounds.** All three grids take a `boundsRanges` prop — every active non-resource calendar's
resolved hours for the dates shown, the web's `calendarWorkingBoundsForDates` over the roster —
alongside the venue's open periods, so the visible window no longer changes with the column
filter. The empty-day default is the web's 07:00–21:00.

**The clock.** Added to the week grid's corner (where the day headers meet the time column), to
the week matrix's header corner, and — the month having no time column — to the toolbar in month
scope. The screen-reader label for a stripe no longer repeats the range it already says. The week
header's weekday is computed at local noon, so it no longer shifts a day at UTC+13 and +14; the
month grid's anchor likewise.

## 4. The Modify sheet's dry run (R34-2)

`validate-appointment-modification` types `practitioner_id` as a required uuid and answers 400
"Invalid request" without it, so R16-1's rule (send the calendar only on a real reassign, because
its presence arms the managed-calendar gate) was right for the PATCH and wrong for the dry run.
The sheet now sends the booking's own calendar to validate and keeps the PATCH silent. A non-admin
dry-running a colleague's booking gets the route's 403, which the sheet already reads as
"unknown" — the same outcome as the web form, which always sends the field.

## 5. The appointment confirmation (R34-3)

Every model's 201 carries `booking_id`, `payment_url`, `card_hold_requested`, `message` and the
two warning arrays, and nothing about the deposit's size or the cancellation notice. The single
create mapped `requires_deposit`, `deposit_amount_pence` and `cancellation_notice_hours` off it,
all undefined, so the notice never rendered. A `payment_url` IS the deposit request, which is how
the web's success card reads it (`hasDeposit = Boolean(result.payment_url)`); the confirmation now
does the same and carries the web's lines, including the 24-hour auto-cancel warning for both a
deposit link and a card request. The multi-service create genuinely returns the figures, so its
notice keeps the amount. `CreateBookingResponse` was trimmed to what the route sends.

## 6. Visit and notify (R34-4, R34-9)

Per-service Undo start returns a service to Confirmed and the reverse action reads "Undo
complete", matching `segmentLifecycleActions`. Dropping to Booked discarded the guest's
confirmation and let the visit's derived status fall back far enough to offer Accept again.

`lib/booking/modification-notify-result.ts` ports the web's formatter, and both notify call sites
(the calendar's move bar and the Modify sheet) now report what actually went out: sent by email,
by SMS, by both, the server's skip reason, or "no email or phone on file".

## 7. Hours and availability (R34-5, R34-10, R34-12, R34-16, parts of R34-8 and R34-17)

- The planner's "Amend hours for this date" rebuilds the whole run from the calendar's own stored
  overrides (`amendedRunFromExceptions`), reason included, instead of a one-day run with none.
- The advice card lives on the Availability screen, not inside the editor, so the refetch that
  remounts the editor no longer wipes it; the schedule timeline feeds the same card.
- The Availability screen lists inactive calendars, as the web's does.
- The closures editor drops the second-period ordering rule; its "today" is the venue's date.
- Business hours writes all seven weekdays, so the app can no longer create the partial map that
  reads as closed to the engine and as unset to the calendar-hours editor; arriving from the clock
  button scrolls to the closures card; read-only weeks no longer let the time pickers move.

## 8. Reports (R34-13, R34-14, parts of R34-8 and R34-17)

**Revenue.** The stepper added the day before computed its next range from `data`, which the
query keeps showing while the next range loads, so a second quick tap re-requested the window it
had just asked for. Stepping also switched the choice to custom, which opened the From/To editor
underneath. And the route's two 400s (an inverted range, a span over 400 days) were only ever
discovered by sending them: on the error the table vanished behind an ErrorState whose Retry
re-sent the same rejected range.

**Overview.** Three web sections had no app counterpart and no types: event ticket sales by tier,
resource utilisation and table utilisation. The custom range was capped at today, so the app could
not report on upcoming bookings and deposits as the web can. The no-show chart dropped quiet days
and kept only the last 14 points under a "Daily rate" heading, with no sign it had truncated
anything, and hid the overall rate entirely when the denominator was zero instead of printing
0.0%. "By booking type" appeared on a different rule from the web's and lacked the Covers,
Cancelled and Checked-in columns. Six CSV exports differed from the web's in filename, header
wording, column order or missing total rows. The Team card disappeared when its three breakdowns
were empty rather than explaining itself, "Auto-cancelled" lost the web's "Auto (unpaid)" meaning,
and the baseline snapshot banner had lost its saved date and several detail lines. A stale
developer note — "Install expo-file-system for native file sharing." — was on screen for users.

**Clients.** The tab had no Show control and no Sort control, filtered by a single tag, and its
rows carried neither phone nor visit count nor the no-show badge; the walk-in caveat and the web's
tile labels were missing, and the guest-history CSV had different columns. One correction to the
audit: the route already defaults `filter` to `identified`, so the app's list matched the web's by
accident rather than by intent; the parameter is now sent explicitly, as the web sends it.

## 9. Contacts, messaging and marketing (R34-6, R34-7, R34-15, parts of R34-8 and R34-16)

**The bulk message.** The app sent one consent-gated broadcast
(`POST /api/venue/contacts/bulk`, `marketing_message`) where the web fans out
`POST /api/venue/guests/{id}/message` per contact. Three things followed. The broadcast route
answers `sent: true` for a permitted contact who has no email or phone for the chosen channel, and
for a provider failure, so the sheet's "N skipped (no marketing permission)" was counting the
wrong people — and its own note told staff those contacts were skipped. Its email went out raw
and unbranded behind a staff-typed Subject, its SMS carried no venue name and no clip, and both
logged as a different message type. And the long comment justifying the divergence rested on the
web reaching everyone regardless of consent, which stopped being true when the web started
sending `respect_marketing_permission: true`. The composer's "SMS will be cut short" hint was
false on that path too: the 459-character budget belongs to the custom-message renderer the
broadcast never used.

**The rest.** The contacts message sheet read `e.message` on a failure, so the route's 502
`{ errors: [...] }` surfaced as "Request failed (502)" instead of the per-channel reasons. The
booking composer defaulted to Email and offered Both only when the guest had both details, where
the web's select defaults to "Email & SMS (if available)". The marketing Switches were driven
straight from server data, so each tap visibly snapped back until the refetch landed. The
collapsed card said "Consented" where the web says "Subscribed". The filter sheet hid the date
range for the last-staff and last-service lists although its own hints promised it, and its
marketing options carried no descriptions. The contact header dropped the visit count, the last
visit and the next visit, all of which the route returns. A booking whose only contact is
`bookings.guest_email` could be messaged on the web but not in the app.

## 10. Verification

On the combined tree, after all three tracks landed: `npx tsc --noEmit` clean; `npx jest` 295
suites and 2,902 tests passing; `npx expo lint` 0 errors (264 warnings, every one the repo's
long-standing test-file import-order and `require()`-in-factory pattern).

Not done here, and owed before release: a device pass of the diary (the stripes on own, linked and
amended-hours columns, the clock in each view mode, a drag onto leave over closed hours), the
Revenue and Clients tabs against staging with a linked venue, and a bulk message to a small real
selection. Then an OTA — the R28 to R31 batches, R33 and this pass are all still unshipped.

## 11. Built: Reports

- **Revenue**: `bookedRevenueStepBase` steps from the range last REQUESTED (a custom choice from
  its own dates, a preset only once its answer has arrived, otherwise the arrows wait and are
  disabled); the From/To editor opens only from the Custom range chip;
  `bookedRevenueRangeError` mirrors the route's two refusals word for word and is checked before
  a step and before an apply, with an inline error above the tiles that keeps the table on screen.
- **Overview**: `types/reports.ts` gained the three payload shapes read off the route;
  `components/reports/UtilisationCards.tsx` (table and resource) and `EventTicketTiersCard.tsx`
  carry the web's thresholds, captions and exports, gated exactly as the web gates them. The date
  pickers are uncapped; the no-show chart plots the whole series (`SvgLineChart` thins its dots
  when points crowd, so a year of days stays readable) and always prints the overall rate;
  "By booking type" follows the web's rule and full column set; `lib/reports/overview-report.ts`
  holds web-exact CSV builders for reports 1 to 5, 7, the tiers and resource utilisation, and
  `report-by-model.ts` emits the web's header and filename. The Team card always renders for
  appointment venues with the web's intro and empty message, "Auto (unpaid)" is restored, and
  `BaselineMetricsCard` carries the web's banner, detail lines and empty state again. The
  developer note is gone.
- **Clients**: the web's Show chips (default `identified`, now sent explicitly), its six sorts and
  stacking multi-tag filter (`types/guest-list.ts` `tags[]`, sent as `tags=a,b` and only keyed
  into the query when set), rows with phone, visit count, the red no-show badge and last visit,
  the walk-in note, the web's four summary tiles with the range as sub-value, and the web's
  guest-history CSV columns and filename.
- Shared furniture moved to `components/reports/ReportCardParts.tsx`. The Clients tab's own copy
  of the web's display-name rule was folded into the shared `lib/guests/name.ts` port that the
  bulk-message summary uses, so a list row and a send summary cannot drift on what a contact is
  called. Tests: `overview-report`,
  `report-by-model`, `booked-revenue`, `useGuests`, `BookedRevenueSection`, `UtilisationCards`,
  `EventTicketTiersCard`, `BaselineMetricsCard`, `DataExportCard`, `ClientsTab` and `reports`.

Two things were deliberately left. CSV exports keep the web's own source-label map so the files
stay byte-identical, while the on-screen charts keep the app's friendlier "Staff" and "Unknown";
if the two should agree with each other instead of with the web, that is a small change. And two
web behaviours stay out of scope for this pass: the Overview renders its first card only when the
payload carries a summary (the web always renders it with "No activity data for this range yet."),
and the app keeps its own section order, with Team after Deposits rather than before No-shows.

## 12. Built: contacts, messaging and marketing

- **Bulk message is the web's fan-out.** `lib/communications/bulk-guest-message.ts` classifies
  each reply the way the web does (200 `success` → sent, 200 `skipped` → deliberately left out,
  400/502 → a problem worth naming), runs the sends at most five at a time while keeping
  selection order, never rejects, and carries the web's result copy verbatim.
  `useBulkGuestMessage` (`lib/queries/useContactsBulk.ts`) posts
  `{ message, channel, respect_marketing_permission: true }` per contact;
  `useBulkMarketingMessage` is gone. `BulkMessageSheet` lost its Subject, took the web's title,
  description, channel select and 2,000-character cap, and names the contact on a failure.
- **One send-error helper** (`lib/communications/message-send-error.ts`) reads `errors[]` before
  `error`, used by both composers and the bulk classifier.
- **Channel parity**: `lib/communications/guest-message-channel.ts` +
  `components/messaging/GuestMessageChannelPicker.tsx` — the web's three options and labels,
  defaulting to both, in both composers.
- **Optimistic marketing flags**: `useUpdateGuest` cancels in-flight detail queries, patches the
  cached contact through `lib/guests/marketing-patch.ts` (the route's own consent-timestamp rules
  and mutual exclusion) and rolls back on error, so the toggles move on tap.
- `marketingSummaryHint` says "Subscribed"; the filter sheet shows the booking-date range for the
  last-staff and last-service lists and the web's marketing descriptions; the contact header
  carries the visit count, bookings on file, last visit and next visit
  (`lib/guests/contact-formatting.ts`, next visit judged in the venue's timezone); and
  `MessageGuestSection` falls back to `bookings.guest_email`.
- Tests: `bulk-guest-message`, `message-send-error`, `marketing-patch`, `contact-formatting`,
  `marketing-permission`, `GuestMessageSheet`, `BulkMessageSheet` (rewritten), `ContactFilterSheet`
  and `MessageGuestSection`.

Two judgement calls worth knowing. The web clears the selection and puts its longer summary in a
page-level banner; the app has no such banner, so on a partial or failed send the sheet stays open
showing that text with a Done button, and the composer is replaced so a second press cannot
double-message the contacts that already received it. And the channel options are deliberately not
filtered by what a contact has on file, as on the web: choosing an unreachable channel is answered
by the route ("Guest has no phone on file"). Older audit records (`Docs/APP_GAP_REPORT_R7.md`,
`Docs/audit-r7/05-*.md`, `Docs/PARITY_GAP_REPORT.md`) still describe the retired broadcast as an
intentional divergence; they are historical and were left alone.
