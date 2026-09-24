# R43: web delta since R42, the 2026-09-23 QA round (2026-09-24)

From the web repo (`C:\Resneo`, `staging` at `7e6dc740`), for the app. R42 covered web
`1ae17617..50d32e2b`, so this round is `50d32e2b..7e6dc740` (four commits). The read-only web
reference `_reference/Resneo` was moved to `7e6dc740`.

Every route the app calls was asked the usual three questions (request schema, response shape,
new error status). The QA round changed several responses the app reads, and one staff route
the app needs did not accept its sign-in. Device testing then found five more problems, three in
the app and two in the web, all fixed below.

---

## What changed on the web

| Commit | Change | App impact |
|---|---|---|
| `6bce3020` | CI: static image imports declared without `next-env.d.ts`. | None. |
| `b403e2b1` | The web half of the 2026-09-23 app device test (staff month past filter, faster staff creates, Ask ResNeo in app terms). | Already in the app since `d345bcb`. |
| `d3e760fa` | **QA round 2026-09-23**: every critical, high and medium finding fixed across bookings, classes and events, contacts, compliance, reports, services and settings. | **Built, below.** |
| `7e6dc740` | GDPR erase also deletes the messages logged against the contact. | None. Server only; the app's erase calls the same route. |

## Done in the app

**New booking**

| # | Change | Web QA | Where |
|---|---|---|---|
| 1 | A service whose options are priced differently says "from" the cheapest option (Gents Cut: Short £18, Long £25 read "£18.00"), on the service and practitioner steps. | G-4 | `ServicePickerStep.tsx` (`optionFromPricePence`), `PractitionerStep.tsx` (+ tests) |
| 2 | A full class session and a sold-out event are listed, marked **Full** / **Sold out**, dimmed and not pickable, on the list, the month picker (with a legend) and the session list, instead of vanishing. | E-9 | `lib/booking/offering-availability.ts`, `ClassBookingFlow.tsx`, `EventBookingFlow.tsx`, `MonthDatePicker.tsx`, `booking-format.ts` (+ tests) |
| 3 | Inside a live collective, Classes and Events list the venue's own classes and events (listed on the combined page or not) beside the other members' listed ones, from the staff routes; a listed item books for the collective, an unlisted one as the venue's own (`staffCreateOwnerVenueId`). | E-5 | `useBookableOfferings.ts`, both flows (+ tests) |
| 4 | Multi-service visit times come from the staff chain availability (`staff=1`). | B-series | `useChainAvailability.ts` (+ test) |
| 5 | A booking that sent the guest a deposit or card link says **Waiting for the deposit** / **Waiting for card details** and where the link went, not "Booking confirmed". | B-9 | `ConfirmStep.tsx` (+ new test) |
| 6 | The comment box stops at 1,000 characters, the server's limit. | B-3 | `GuestDetailsStep.tsx` |

**Bookings and visits**

| # | Change | Web QA | Where |
|---|---|---|---|
| 7 | The Activity timeline names every status change in the buttons' words (Started, Start undone, Completion undone, Booking reinstated, No-show undone, Confirmation undone) and shows **Client arrived** / **Arrival undone**. | B-5 | `lib/booking/booking-timeline.ts` (+ tests) |
| 8 | A visit service's **Undo start** returns it to Confirmed only when staff or the guest had confirmed it, else Booked (it always wrote Confirmed, a false "Confirmed by staff"); a refused change shows the server's reason. | B-4 | `VisitSummary.tsx`, `useGroupVisit.ts` (+ tests) |

**Classes and events setup**

| # | Change | Web QA | Where |
|---|---|---|---|
| 9 | Editing an event says a date or time change moves its bookings and tells those guests. | E-1 | `EventEditorSheet.tsx` |
| 10 | The event switch is **Show on booking page**, with "Turn this off to hide this event from guests. Bookings it already has stay as they are, and nobody is contacted."; the manager's badge reads **Hidden**. | E-10 | `EventEditorSheet.tsx`, `EventManagerSheet.tsx` (+ test) |
| 11 | The combined page's team profiles read the collective's `team` block. | E-series | `useCollectives.ts`, `CombinedPageTeamProfiles.tsx`, `types/collectives.ts` (+ tests) |

**Contacts and compliance**

| # | Change | Web QA | Where |
|---|---|---|---|
| 12 | The message log reads the web's labels ("Booking confirmation", "Compliance form request"), the channel as SMS / Email, **To {recipient}**, and a failed message's reason. | D-4 | `CommunicationsSection.tsx`, `types/guest-detail.ts` (+ test) |
| 13 | Household: each member can be **Unlinked** (with a confirm that says bookings stay), the current client reads "(this client)", and the link search leaves them out. | D-series | `HouseholdSection.tsx`, `useGuestHousehold.ts` (+ tests) |
| 14 | Contact create and edit show the server's per-field messages under the fields and stop at the server's lengths (100 / 100 / 24 / 255). | D-6 | `GuestEditSheet.tsx`, `CreateContactSheet.tsx` (+ tests) |
| 15 | Compliance capture shows per-field messages. | D-5 | `ComplianceCaptureSheet.tsx` (+ test) |
| 16 | An expired form link is listed on the client page under **Expired links** with Email / SMS; the booking card says the last link expired; resending an expired link sends a fresh one and says so. | FD-8 | `ComplianceSection.tsx`, `ComplianceCard.tsx`, `compliance.tsx`, `useCompliance.ts` (+ tests) |
| 17 | The link-expiry setting says booking links last until the end of the appointment day. | FD-7 | `compliance-settings.tsx` |

**Home, reports, settings**

| # | Change | Web QA | Where |
|---|---|---|---|
| 18 | Today: a dismissed setup checklist can be brought back (**Show setup checklist**); the tiles say "appointments" where they count appointments only, and the diary reads "Today's bookings" when the venue runs other types. | A-2 | `today.tsx`, `useSetupStatus.ts`, `KpiGrid.tsx`, `DiarySection.tsx` (+ tests) |
| 19 | Booked revenue explains that classes, events and resource bookings count on the calendar they appear on, and names the kinds counted. | Reports | `BookedRevenueSection.tsx`, `lib/reports/booked-revenue-copy.ts`, `types/reports.ts` (+ test) |
| 20 | CSV exports neutralise cells that a spreadsheet would run as a formula and start with a byte-order mark so Excel reads £ and accents. | A-6, D-11 | `lib/csv/csv-cell.ts`, `lib/reports/csv-export.ts`, `clients.tsx` (+ tests) |
| 21 | Services: the add-on editor receives every option, archived ones included, so saving a group no longer deletes its archived options (the save is a diff by id); a new group starts optional; clearing a service's price saves it as no price. | FC-6, FC-5, FC-3 | `services.tsx`, `lib/addons/visible-addon-library.ts`, `AddonGroupEditorSheet.tsx` (+ tests) |
| 22 | Communications: the SMS reminder help says the booking details come first. Venue profile: a website the server refuses is marked on the field. | F-1, F-5 | `communications.tsx`, `venue-profile.tsx` |

## Found on the phone, fixed

| # | Problem | Fix | Where |
|---|---|---|---|
| 23 | **In a live collective, New booking offered only Appointments.** The collective's profile carries no models, so items 2 and 3 could not be reached at all. | The venue's own Classes, Events and Resources tabs stay (web `StaffSurfaceBookingStack`); resources run as the venue's own. | `app/(app)/booking/new.tsx` (+ `new.collective-tabs.test.tsx`) |
| 24 | **Creating an event whose ticket had no capacity failed**: "Invalid request (ticket types: expected number, received null)". Pre-existing since June. | A blank capacity is left out, as on the web; ticket ids are sent on edit so a renamed tier keeps its sales (web C3). | `EventEditorSheet.tsx`, `types/events-manage.ts` (+ tests) |
| 25 | Full and Sold out rows never dimmed and kept a chevron. Reanimated's animated opacity overrode the row's own. | `PressableScale` folds a caller's opacity in; a disabled row has no chevron. | `components/ui/PressableScale.tsx`, `BookingFlowPrimitives.tsx` (+ test) |
| 26 | Resending a form link said "Sent a fresh link." when nothing went out (the client had no email): the route answers 200 with `dispatched: false`. On all three resend buttons. | The toast says it could not send and why, and copies the link to share another way. | `lib/compliance/resend-outcome.ts` (+ test), `ComplianceSection.tsx`, `ComplianceCard.tsx`, `compliance.tsx` |
| 27 | The client page's expired-link line said "Send link sends a fresh one" beside Email and SMS buttons. | It names Email or SMS there; the booking card keeps "Send link". | `ComplianceCard.tsx` (`expiredLinkHint`) |

## Web (C:\Resneo, uncommitted)

| # | Change | Where |
|---|---|---|
| W1 | `GET /api/venue/event-offerings` read cookies only, so the app's collective Events step got 401. It uses `createVenueRouteClient(request)` like its class twin. | `src/app/api/venue/event-offerings/route.ts` (+ `route.bearer.test.ts`) |
| W2 | **An event with no calendar could not be edited, or hidden, once it had an upcoming booking**: both editors send `calendar_id: null` on every save, and the route treated that as taking the event off a calendar ("Can't remove this event from the calendar"). This defeated E-10 on the web too. The guard now returns early when the event has no calendar. | `src/lib/experience-events/experience-event-guards.ts` (+3 tests) |
| W3 | An option's name was doubled ("Gents Cut - Short - Short") in the multi-service, single and group create routes, which apply the variant twice (into the engine input, then over the practitioner link). Seen in a visit's override warnings; it is also the `service_display_name` the notices use. The variant name is now added once. | `src/lib/appointments/service-variant.ts` (+ test) |

## Tested

- Jest 343 suites, 3,267 tests; typecheck and lint clean (warnings only). Web: the touched
  suites (vitest), `tsc` and lint clean.
- On the owner's Galaxy S23 Ultra (Expo Go, dev database) as sept19@resneo.com, with the app
  pointed at the owner's local web server:
  - New booking in the collective: Classes and Events tabs; an unlisted own event listed, booked
    (saved with no collective) and then shown **Sold out**, dimmed, not pickable; "from £18.00"
    against the Short / Long option step; a two-service visit booked with Override availability.
  - A booking's Activity: Started, Start undone, Client arrived, Arrival undone, Confirmed by staff.
    A visit service's Undo start went back to Booked when unconfirmed and to Confirmed after Confirm.
  - Contacts: the message log (labels, channel, recipient); a household linked, the current client
    marked, then **Unlinked** (the household dissolved); a bad email marked under Email.
  - Compliance: an expired link (inserted for a test client) under **Expired links**; resend with no
    email on file said it could not send and copied the link.
  - Today: checklist restored and dismissed again; "0% of appointments". Revenue explainer and
    table; the revenue CSV opened the share sheet (not sent).
  - Services: a new add-on group started optional; its archived option was kept after an edit and
    save; a test service's price cleared to none.
  - Events: new-event copy, edit-mode note, Hidden badge; an event with a booking hidden (W2), its
    booking left Booked.
  - Test data (event, bookings, clients, add-on group, service, form links) was deleted afterwards.

## Notes, not changed

- After Undo start on a confirmed service the timeline says "Confirmed by staff" (the server
  re-stamps the confirmation). The web shows the same; a server wording point.
- A client's "Guest bookings" summary counts a two-service visit as two upcoming. The web has no such
  line; the visit counting rule (R36) would count it once.
- Several screens use "—" for an empty value (Last visit, Deposits). It is a placeholder, not
  punctuation, and the web does the same.
