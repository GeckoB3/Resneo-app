# App gap report R26: linked venue columns at web parity (2026-09-06)

The owner asked for a partner's calendar columns on the calendar screen to work as they do
on the web: a tap on one of its bars opens the full booking panel, the bars carry the
quick-action buttons, and the grips to move the start time and change the duration are
there. This report records what the web does (a survey of the reference clone at web #178,
`_reference/Resneo`), what the app did before, and what was built.

## 1. What the web does

### 1.1 The rule

`src/lib/linked-accounts/calendar.ts` `linkedColumnUsesNativeGrid`:

| link visibility | link action | column on the diary |
|---|---|---|
| `full_details` | `edit_existing` | interactive (the native day grid, mixed with the own columns) |
| `full_details` | `create_edit_cancel` | interactive |
| `full_details` | `none` | read only (`LinkedDayColumn`, day view only) |
| `time_only` | any | read only |

The venue collective plays no part in this decision. It only decides where a NEW booking is
made: the collective form for a member's column, the partner's own form otherwise, and the
per-column "New booking" header button is withheld for a column the collective reaches (the
rule the app shipped on 2026-09-06 as `67ee066`).

### 1.2 An interactive linked column

- The partner's bookings become ordinary grid rows (`linkedBookingToGridBooking`), stamped
  with the owner venue and the column key `linked:<venueId>:<practitionerId>`; the bar
  itself draws no venue chip, the column header says "Linked · {venue}".
- **Tap**: a fire-and-forget `POST /api/venue/linked-calendar/booking/view` (the read
  audit), then the same `BookingDetailPanel` an own booking opens, with `linkedAct` set to
  the grant. The panel loads `GET /api/venue/bookings/{id}/summary` then
  `GET /api/venue/bookings/{id}` with **no owner-venue parameter**: the server loads the
  booking by id, derives the owner venue from the row, and applies the grant
  (`loadStaffAccessibleBooking`). A `time_only` link is refused by that route (403), which is
  why it keeps the small `LinkedBookingDetailModal`.
- **Quick actions on the bar**: unchanged from an own bar, by status: Pending → Arrived/Clear
  + Confirm; Booked/Confirmed → Arrived/Clear + Start; Seated → Undo start + Complete;
  Completed → Reopen. All `PATCH /api/venue/bookings/{id}` with `{ status }` or
  `{ client_arrived }`; the optimistic patch lands on the linked feed's copy of the row; the
  unpaid-promotion guard applies.
- **Drag to move**: `PATCH /api/venue/bookings/{id}` with `booking_date`, `booking_time`,
  `practitioner_id` (the RAW calendar id behind the column key), `booking_end_time`,
  `allow_manual_overlap: true`, `allow_outside_hours`, `allow_during_breaks`,
  `defer_modification_guest_notification: true`; on success the linked feed is re-read.
  Cross-venue drops are refused at the drop: "A booking can only be moved within the same
  venue." A move between two columns of the SAME partner is allowed, and the server checks
  the target calendar against the link's scope.
- **Drag to resize**: the same PATCH with `booking_end_time` and re-fitted
  `processing_time_blocks`, `skip_booking_modification_guest_notification: true`.
- **Empty slot**: `create_edit_cancel` → the linked slot menu (New appointment / Walk-in, "In
  {venue}", no Block time); `edit_existing` → the note "{venue} hasn't granted permission to
  create bookings on this calendar."; a read-only column has no slot buttons at all.
- **Week view**: every linked column is read only, and a tap opens the panel as above.

### 1.3 The panel under a grant (`ExpandedBookingContent`, `linkedAct`)

| feature | view only (`none`) | `edit_existing` | `create_edit_cancel` |
|---|---|---|---|
| banner | "Linked booking, view only. You can see full details here but cannot edit, reschedule or cancel this booking." | "Linked booking. You can edit existing bookings but cannot create new ones or cancel." | none |
| status actions, attendance, Modify, Reschedule | hidden | shown | shown |
| Cancel; deleting a cancelled booking | hidden | hidden | shown |
| Rebook | hidden | hidden | shown, over the owner venue |
| "New booking" from the panel; "Open in Contacts"; Records | hidden | hidden | hidden |
| message composer | disabled (log shown) | shown | shown |
| notes | disabled | editable | editable |
| deposit and card actions | hidden (figures shown) | shown | shown |
| guest history | the owner venue's, via `owner_venue_id` on the list route | same | same |
| compliance | read through the link | same | same |
| timeline, payments summary | shown | shown | shown |

The Modify form reads the OWNER venue's services and staff (`owner_venue_id` on the
catalogue and roster routes) and dry-runs
`POST /api/venue/bookings/{id}/validate-appointment-modification`.

## 2. What the app did before

- Every linked column drew a static, tap-to-open bar: no tray, no grips, no cross-column
  move; the module doc said "the web linked calendar has no drag", which stopped being true
  when the web moved editable links onto its native grid (spec §8.2, correction row).
- A tap opened `LinkedBookingDetailSheet`, the small sheet built for the linked feed's
  redacted row (date, time, status, a note), which writes through
  `PATCH /api/venue/linked-calendar/booking`. The web's diary does not use that route.
- The booking detail and mutation hooks already called the ordinary booking routes with no
  venue scope, which is exactly what the web does; nothing routed a partner's booking to them.

## 3. What was built (all on `main`, this working tree)

1. **The rule, shared.** `linkedColumnUsesNativeGrid`, `linkedBookingUsesExpandedDetail` and
   `linkedColumnPractitionerIdForPatch` in `lib/linked/linked-calendar-view.ts`, with the
   web's two strings (`LINKED_MOVE_SAME_VENUE_ERROR`, `linkedCreateNotGrantedMessage`).
2. **The grid.** `AllCalendarColumn` gains `editable` and `moveGroup`. A linked column marked
   editable renders `DraggableAppointmentBlock` with the full callback set (tray, move,
   resize, cross-column), as an own column does; other linked columns keep the static bar.
   Cross-column travel is clamped to the bar's own venue by index range
   (`lib/calendar/column-move-groups.ts`: own columns are one group, each partner's calendars
   another, the venue-level column alone); a drop on another venue's column snaps home and
   fires `onDragColumnReject`, which the tab turns into the web's toast; a drop past the grid
   just glides home as before. `DraggableAppointmentBlock` takes the range as
   `crossColumnMinIndex` / `crossColumnMaxIndex`.
3. **The calendar tab.** Linked columns are built with `editable` and `moveGroup`; the drag
   commit path looks a partner's bar up in the linked feed when the own grid does not know it
   (`findBookingOnAnchor`), resolves the raw calendar ids behind column keys for the PATCH and
   for Undo, and skips the R16-1 own-calendar gate for a partner's booking (the server applies
   the grant instead of its role check for a cross-venue write). A tap on a full-details
   link's bar sends the read-audit ping and opens `BookingDetailSheet` with the link context;
   a time-only link keeps the small sheet. The same handlers are handed to the partner's
   single-venue day view (the phone's chip view) and the week view's taps route the same way.
   An empty slot on an `edit_existing` column shows the web's note.
4. **The caches.** `patchCalendarGridBookings` / `applyOptimisticGridPatch` /
   `revertCalendarGridBookings` also patch the linked feed (`status`, `clientArrivedAt`) so a
   partner's bar answers on press, cancelling that feed's in-flight read too;
   `invalidateCalendarQuickAction` and `invalidateBookingCaches` refresh the linked feed after
   every booking write, so a move, resize, status change or Modify from the panel lands on the
   partner's column without waiting for the 60 s poll.
5. **The panel.** `BookingDetailSheet`, `BookingDetailContent` and the full-screen route
   `/booking/[id]` take a `LinkedBookingContext` (grant, venue, PII flag, the calendar's name);
   `lib/linked/linked-detail-policy.ts` turns the grant into the table in §1.3, with the
   web's banner copy verbatim. The sheet's header reads "Linked · {venue}" and its pinned
   status action goes with the actions card on a view-only link. "Open full screen" carries
   the context as route params. The Modify sheet reads the partner's catalogue
   (`useAppointmentCatalog(ownerVenueId)`) and diary (`owner_venue_id` on the availability
   and month routes) and does not narrow the calendar picker to our own assignments.
6. **The other hosts.** The linked calendar screen (`/linked-venues/calendar`) and the
   Bookings tab route a full-details link's booking to the full panel too; the small sheet
   stays for time-only links.

## 4. Decisions, and where the app deliberately differs

- **Cross-venue drops are clamped, not refused after the fact.** The block never lets the bar
  land on another venue's column; the web lets it land and refuses. Same outcome, and the
  toast is still shown when a drop is attempted there.
- **A partner's move skips the guest email and offers Undo only.** The web defers the email
  and arms Notify / a countdown, but releases it through
  `POST /api/venue/bookings/{id}/guest-modification-notify`, which looks the booking up under
  the caller's own venue and answers 404 for a partner's booking, so on the web a linked move
  never emails the guest either. The app sends `skip_booking_modification_guest_notification`
  and says nothing it cannot do; see `Docs/R26_WEB_HANDOVER.md`. The partner's own staff are
  told by the server's cross-venue notification, as before.
- **Guest history is hidden on a partner's booking.** The web reads it from the bookings list
  route with `owner_venue_id`; the app's history reads our own guests route, which does not
  know the partner's client. Building a list-route history for linked bookings is the one
  piece of §1.3 not ported.
- **Customer notes and tags are read only on any linked booking**, whatever the grant: they
  are written through our guests route, which is our own venue's. The booking's own notes
  follow the grant, through the booking route the link covers.
- **Compliance** shows through the link when the link shares personal details (the R24-4
  decision); the web always renders the card and lets the route say no.
- **Rebook** on a full grant opens the booking form over the partner's venue (the
  `ownerVenueId` route params the slot sheet already uses), with the guest's details seeded;
  "New for guest" stays off a partner's booking, as on the web.
- **The venue-level column** (bookings naming no listed calendar; the web has none) takes no
  cross-column move in or out, since it names no calendar to reassign to.
- **Visits** on a partner's column are separate bars: the linked feed carries no group id, and
  neither does the web's grid row for a linked booking.
- **The linked calendar screen** keeps static bars: it has no commit pipeline of its own, and
  the calendar tab is the diary. Its taps open the full panel.
- **Processing blocks on a drag resize** are not re-fitted before the PATCH, on own or linked
  columns alike (the web's `bookingProcessingBlocksForPatch`); a shrink that would cut a
  processing gap comes back as the server's 400, shown as a toast. Pre-existing, unchanged.

## 5. Web handover

`Docs/R26_WEB_HANDOVER.md`: the deferred-notification route is scoped to the caller's own
venue, so neither the web's follow-up bar nor the app can release a partner's deferred guest
email. Nothing else in this batch needs the web.

## 6. Tests

`lib/linked/linked-calendar-view.test.ts` (the rule, the id unwrap, the copy),
`lib/linked/linked-detail-policy.test.ts`, `lib/calendar/column-move-groups.test.ts`,
`lib/queries/useCalendarQuickActions.patch.test.ts` (the linked feed patched, reverted and
kept through a cancelled read), `components/calendar/AllCalendarsDayGrid.test.tsx` (an
editable linked column draws the interactive bar, a plain one does not),
`components/linked/LinkedVenueCalendarGrid.test.tsx` (edit grants join the grid, view only
stays static, the edit-existing slot note), `components/bookings/BookingDetailSheet.test.tsx`
(the venue caption; the pinned action withheld on a view-only link).

## 7. Device pass findings (2026-09-06, first pass on the live pair)

1. **The compliance card opened expanded on a partner's booking, closed on our own.**
   `LinkedComplianceSection` (R24-4) was a plain card with everything listed, built for the
   small linked sheet; on the full panel it sat beside the own-venue `ComplianceCard`, which
   is a collapsed `CollapsibleCard`. It is now the same collapsed card: the own card's
   header wording ("All current", the record count, "None required", "Not available" for a
   refusal) and the danger "N to action" marker on the closed header. Test:
   `components/linked/LinkedComplianceSection.test.tsx`.
2. **The contact screen listed every visit; the web keeps them behind a closed "Guest
   bookings" accordion** (`GuestBookingsForGuestAccordion`, summary "N upcoming · M
   previous", the body split into Upcoming and Previous). Not linked-specific, fixed in the
   same pass: the screen's "Booking history" header and open list became a closed
   `CollapsibleCard` titled "Guest bookings" with the counts on its header (and the live
   dot as its marker); opening it renders Upcoming and Previous groups as the list's
   sections, so the rows stay virtualised. `lib/guests/guest-history-sections.ts` ports the
   web's split (`isBookingUpcomingBeforeScheduledEnd`: the scheduled end, else the start, in
   the venue's timezone; cancelled never upcoming) and its ordering (upcoming soonest first,
   previous latest first); `CollapsibleCard` gained a controlled mode (`expanded` /
   `onToggle`) and draws no body for `null` children. The guest route already returned
   `estimated_end_time` and `booking_end_time` on history rows; the type now says so.
   Tests: `lib/guests/guest-history-sections.test.ts`.

## 8. Device pass owed

On the live pair (`plus1@reserveni.com` viewing `light2`'s "Jenny"), with the link at
full details + edit: the tray buttons on Jenny's bars (Confirm, Arrived, Start, Complete) and
the bar answering on press; hold-drag move and the bottom-edge resize on a bar, then Undo;
a drag onto an own column (refused with the toast) and, with a second shared calendar, onto
it (allowed); a tap opening the full panel with the "Linked · light2" caption, Modify listing
light2's services and staff, Reschedule, notes, a message; the same on the phone's Jenny chip
view; a view-only link showing the banner with everything disabled; a time-only link still
opening the small sheet; an empty slot on an edit-only column showing the note.
