# App gap report R31: the web delta `d8a9f6a8..d2038097` (2026-09-10)

The read-only reference clone (`_reference/Resneo`) was refreshed from web `main`, which had
moved two squashes on from web #187: **#189** (the calendar's visit chip reads "1/2" instead of
"Visit 1/2") and **#190** (the booking panel's visit summary, an optional phone on every staff
booking, each service of a visit coloured by its own status, the cross-account move dialog, the
collective's About section and the service-linking rework of the combined-page manager).
38 files, +1,913 / -588. `origin/staging` was force-updated to the same commit and is
tree-identical to `main`. `Docs/MOBILE_API.md` is untouched.

This report is the audit of that delta from the app's side. Every finding that needed code was
built the same day (§13 onward); each finding says what the web changed, what the app did before,
and what the port was. Per
[[plan-docs-vs-shipped-code]] every claim was checked against the implementation in the clone
(the create route, `booking-row-overlay.ts`, `visit-siblings.ts`, the catalogue route and its
`sync-all` test, `service-duplication.ts`, `service-sync.ts`, `collectives.ts`, the guests route,
`ExpandedBookingContent.tsx`, `PractitionerCalendarView.tsx`, `CombinedPageManager.tsx`) rather
than against the two plan documents, and every app claim was read in the app's own files.

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R31-1 | Staff bookings no longer need a phone on the web (every model, every source; a typed number must still be valid). The app's shared guest step still refuses to continue without one for every non-walk-in booking, so a desk or phone booking for a client whose number staff do not have cannot be taken in the app while the web takes it | **Wrong behaviour** (blocks a booking the server accepts) | **Built** 2026-09-10 (§3, §13) |
| R31-2 | Each bar of a visit is coloured by its own status on the web now. The app shipped the same rule this morning (`ff7bc42`) and recorded it as "a deliberate divergence from the web's tint"; it is parity. The R30 note needs correcting | Docs only | **Built** 2026-09-10 (§4, §14) |
| R31-3 | Web fixed three client paths that copied one service's PATCH result (status included) onto its visit siblings, via a new `visitSiblingOverlay`. The app has no such path: its calendar patch writes the pressed row only (one booking per cluster since R29-4), its list/detail optimistic patch matches one id, and its visit card PATCHes one row. No gap; one optional guard | No gap | §5, nothing built |
| R31-4 | The visit chip reads "1/2" on the web; the app still says "Visit 1/2" | Parity (minor) | **Built** 2026-09-10 (§6, §14) |
| R31-5 | Guest history rows now carry `source`, shown as a per-row label ("Online", "Phone", "Walk-in", "Staff", "Recurring"). The app's history type has no `source` and neither history surface shows one; the booking detail shows the raw value (`booking_page`) in a "Source" row | Parity (small) | **Built** 2026-09-10 (§7, §15) |
| R31-6 | The web's booking panel now opens with a visit summary: time, duration · date · last visit, a deposit badge only when money is owed/held/charged, one row per service with its price, a "Visit total" and deposit/paid/outstanding footer. The app keeps its prices under the collapsed Payments card, shows no per-service price on the visit card, and badges "Deposit pending" | Parity (moderate), a layout decision | **Built** 2026-09-10 (§8, §16) |
| R31-7 | Dropping a booking on a column of another ResNeo account: the web opens a dialog that explains the booking cannot be transferred, books the client afresh on the target calendar (prefilled) and then offers to cancel the original. The app refuses with the old toast | Parity, a feature | **Built** 2026-09-10 (§9, §17) |
| R31-8 | Collective service sync grew: `sync_all_providers` / `unlink_all_providers`, `ops[].sync` on `add` (ask at tick time), drift (`inStep`) reported for independent copies, add-on groups matched on link/update, and a read-only About section (`hostContact`). The app has none of the sync UI (R29-12 was never built) | Parity, a feature (with R29-12) | **Built** 2026-09-10 (§10, §18) |
| R31-9 | The visit schedule/services routes' cross-account 409 copy was rewritten. The app surfaces the server string verbatim, so it inherits the new sentence | No gap | §11, nothing to build |

Everything else in the delta is server-side or web-only and inherited: the `GET guests/[guestId]`
select adds `source` (additive); `visit_payment.lines` was already on the detail route (the app
reads it, §8); `CollectiveView.hostContact` is an additive optional key; the collectives list's
`catalogue.ts` remap of a venue's own service at the origin from `independent` to `none` (the app
ignores `sync` entirely); the web-only `ConfirmDialog` replacing `window.confirm` in the manager
(the app's ConfirmSheet already exists); the help-article rewrites (the app's Ask ResNeo reads them
server-side); the two plan-document addenda; and the web's removal of the Source / Ref / Visits /
Previous-visit chips and the "Deposit pending" pill from its panel header, which is the web's own
layout decision (the app's Details card keeps them as rows, §8).

## 2. Corrections to the web summary

Two details matter for the port:

- **`source` rides one route.** Only `GET /api/venue/guests/[guestId]` gained it
  (`route.ts:175, 276, 330`); the web's booking panel shows it because its accordion is fed from
  the contacts cache through `mapContactGuestHistoryToAccordionRows` (`:14`). The app's two history
  surfaces both read that guests route (`lib/queries/useGuestDetail.ts:36`; used by
  `app/(app)/client/[id].tsx:181` and `components/bookings/BookingDetailContent.tsx:266-283`), so
  both can show it.
- **The per-service colour was not new to the app.** The app had switched to per-row colour in
  `ff7bc42` earlier the same day, before the refresh (§4).

## 3. R31-1: an optional phone on every staff booking

**Web.** `POST /api/venue/bookings` (`route.ts:108-114`): `phone` is optional for every staff
source, "a booking without a phone or an email simply gets no confirmation"; the four model
branches lost their `Phone number is required for … bookings` 400s (`:329-339, 372, 576, 774`).
A phone that IS given must normalise to E.164 or the route answers 400 `Invalid phone number`. The
web forms follow: `DetailsStep.tsx:75-88` (staff schema, phone empty or valid), `:481`
(`phoneRequired={false}`), `UnifiedBookingForm.tsx:914-923, 1086, 1622`. The help article says it
plainly: "Nothing on the form is compulsory … without an email the client gets no confirmation,
and without a phone number they get no text reminder."

**App.** `lib/validation/walk-in-guest.ts:20-29` is the one shared guest schema:

```ts
phone: isWalkIn
  ? z.string().trim().max(24, 'Phone is too long').optional()
  : z.string().trim().min(1, 'Phone is required').max(24, 'Phone is too long'),
```

It gates Continue in `components/booking-wizard/GuestDetailsStep.tsx:142-171` and marks the
field `required={!isWalkIn}` (`:313-325`). All five staff flows pass `isWalkIn = source === 'walk-in'`:
`ServiceBookingFlow.tsx:1416`, `ClassBookingFlow.tsx:279`, `EventBookingFlow.tsx:320`,
`ResourceBookingFlow.tsx:408`, `GroupBookingFlow.tsx:781`. So a phone booking (the default
source) cannot be finished without a number in any model. On the wire the app already sends
`phone: ''` for a blank field (`ConfirmStep.tsx:368, 400`; `ClassBookingFlow.tsx:337`;
`EventBookingFlow.tsx:384`; `ResourceBookingFlow.tsx:461`; `GroupBookingFlow.tsx:326`, all via
`normalizePhone`, which returns `''` for blank), which the server now treats as "no phone", so
nothing changes on the wire. The app's normaliser (`lib/phone/normalize.ts:26-54`) is best-effort
and never rejects a malformed number; the server's `Invalid phone number` 400 surfaces through
the existing 400-detail path ([[api-400-detail-surfacing]]), as it always has.

**Port.**
- `buildGuestSchema`: make `phone` optional for every source (drop the `min(1)` branch; keep
  `max(24)`); `GuestDetailsStep` marks it optional for all, with the web's hint in the helper text:
  "Optional. Without a phone number the client gets no text reminder; without an email, no
  confirmation."
- Keep sending `''` (or omit the key, as `RestaurantWalkInForm.tsx:60` does); both are accepted.
- Optional: a light client-side check that a typed number has 7+ digits so the common typo is
  caught before the round trip; the server stays the authority.
- Tests: `walk-in-guest` schema test for a blank phone on a phone booking; the GuestDetailsStep
  test that pinned "Phone is required".

## 4. R31-2: per-service colour is parity, not divergence

**Web.** `PractitionerCalendarView.tsx:8252-8259`: `palette = calendarBlockPaletteForBooking(b)`;
the earlier shared-anchor palette is gone. `visit-siblings.ts:3-11, 31` rewritten to match
("the bars no longer share the earliest service's colour"); `VisitPosition.anchorId` stays for
the spine/hover.

**App.** `ff7bc42` (2026-09-10, before the refresh): both grids stopped passing `paletteStatus`,
each bar wears its own status colour. Its note in
`Docs/APP_GAP_REPORT_R30_AVAILABILITY_SCREEN.md` ("Per-service Start / Complete on the calendar")
ends "A deliberate divergence from the web's tint."

**Port.** Docs only: amend that sentence to say the web adopted the same rule in #190 the same
day, so the two diaries agree again. No code.

## 5. R31-3: sibling overlays

**Web.** `booking-row-overlay.ts:26-46` adds `visitSiblingOverlay(overlay, transition?)`: siblings
take `client_arrived_at` and the two attendance timestamps; the status only when
`statusChangeCascadesAcrossVisit(previous, next)`; deposit fields never. Applied in the calendar
popover's `onUpdated` (`PractitionerCalendarView.tsx:9097-9105`) and both list dashboards'
post-response updates (`AppointmentBookingsDashboard.tsx:1013-1025`,
`BookingsDashboard.tsx:1050-1062`); `applyOptimisticStatusToBookingRows` (`:213-216`) now fans
out only for cascading transitions. Tests in `booking-row-overlay.visit-sibling.test.ts`.

**App.** No path copies a status onto siblings:
- Calendar quick actions patch only the ids in `statusChangeTargets`
  (`lib/calendar/bar-actions.ts:18-23`), and a cluster is one booking since R29-4
  (`lib/calendar/cluster-bookings.ts:81-94`: `bookings: [booking]`).
- The list/detail optimistic patch matches `row.id === bookingId` only
  (`lib/queries/useBookingMutations.ts:82`).
- The visit card's Start/Complete PATCHes that row (`components/bookings/GroupVisitCards.tsx:105-139`).
- The detail header derives the visit status (`BookingDetailContent.tsx:673-678`) instead of
  copying it; arrival/attendance patch only this booking's detail and let the invalidation bring
  the siblings (`useBookingMutations.ts:693-711`).
- `lib/booking/visit-status.ts:40-44` already ports `statusChangeCascadesAcrossVisit` (tested),
  though nothing in production calls it.

**Port.** None required. Optional hardening: `statusChangeTargets` could assert the one-booking
invariant (or consult `statusChangeCascadesAcrossVisit` when a multi-booking cluster ever returns),
and a test pinning that a Start on one service of a two-service visit patches exactly one grid row.

## 6. R31-4: the visit chip

**Web.** `visit-siblings.ts:71-73` returns `${index + 1}/${count}`; `VisitChip` comment,
the linked-calendar route comment (`linked-calendar/route.ts:463`) and the help article
("each service is its own card, marked **1/2**, **2/2**") follow. The reason is width: the bar
already shows the service name; "Visit" said nothing the spine and hover did not.

**App.** `lib/calendar/visit-siblings.ts:71-73` returns `Visit ${…}/${…}`; pinned by
`visit-siblings.test.ts:24`; rendered by `VisitChip` in `components/calendar/AppointmentBlock.tsx:189-190`
(used at `:619, :658`), comments at `AppointmentBlock.tsx:189, :891` and `cluster-bookings.ts:9`.

**Port.** Change the template and the test; update the three comments. Check the chip's minimum
width in `AppointmentBlock` so "1/2" does not look lost in the compact layout
([[calendar-compact-mode]]).

## 7. R31-5: the booking's source on the guest history

**Web.** `GET /api/venue/guests/[guestId]` history rows gain `source` (`route.ts:175, 276, 330`;
`types/contacts.ts:77-78`). `GuestBookingsForGuestAccordion.tsx:117-134` maps it with
`guestBookingSourceLabel`: `booking_page | online | widget | public | web` → "Online";
`walk-in | walk_in | walkin` → "Walk-in"; `phone` → "Phone"; `staff` → "Staff";
`recurring` → "Recurring"; anything else capitalised with `_`/`-` as spaces; and draws it as a
small bordered label on every row (`:200-207`). The panel's own "Source" chip was removed at the
same time (the raw value had been sitting in the header).

**App.** `types/guest-detail.ts:42-74` has no `source`. Neither renderer shows one:
`app/(app)/client/[id].tsx:104-161` (`HistoryRow`) and `BookingDetailContent.tsx:266-350`
(`GuestHistoryBody`). The booking detail's Details card shows the raw value:
`BookingDetailContent.tsx:1537` (`<DetailRow label="Source" value={booking.source} />`, so a
customer sees "booking_page"). A label map exists only for reports
(`lib/reports/csv-export.ts:103-114`: `booking_page` → "Booking page", `widget` → "Website
widget", no "recurring").

**Port.**
- `GuestBookingHistoryRow.source?: string | null`.
- One `bookingSourceLabel()` in `lib/booking/` with the web's staff-facing words above; use it in
  both history rows (a small `Pill`/text label beside the status) and in the Details card's
  Source row. Leave the CSV export's map alone: it mirrors the web's report export, not the panel.

## 8. R31-6: the visit summary and money at the top of the panel

**Web.** `ExpandedBookingContent.tsx:1273-1404, 1527-1700`: the chip row, the "Services in this
visit" card and the "Price" list are folded into one block under the guest header:
- header line: `HH:MM–HH:MM`, then "`{duration}` · `{date}` · Last visit `{date}` | First visit";
  right side a **deposit badge only when money is owed, held or charged** ("Deposit due £x" /
  "Payment due £x" for `Pending`, "Fee charged", "Card held", "Paid in full", "Deposit refunded")
  and the visit status pill. The old "Deposit pending" header pill is gone (`:1493`).
- one row per service: offering line, time (hidden when it equals the visit's), duration, its
  status pill (multi-service only), **its price** (`visit_payment.lines[].total_pence` when the
  visit has 2+ lines; for a single service the variant price, else stored total minus add-ons;
  "Price not set" otherwise; a skeleton while the detail hydrates), and the per-service Start /
  Complete / Undo buttons.
- footer: loose add-ons (single service), "Visit total" / "Total", then the `deposit`, `paid`
  and `balance` rows from `buildPriceSummary`, balance amber when owed and green when settled.
- Source, Ref (copy), Visits and Previous-visit chips removed (`:870, 1115-1124, 1273-1295`).

**App.** `components/bookings/BookingDetailContent.tsx` (hero card + collapsible cards):
- hero (`:1099-1201`): name, visit count, derived visit status pill, date, time range
  (multi-service: "`{start} – {end}` over N services", or a date range across days), service
  line, duration/party chips, then badges: card-hold pill, **"Deposit pending"** when `Pending`,
  "Deposit failed" (R13), occasion, confirmed, arrived.
- visit card (`GroupVisitCards.tsx:89-153`, mounted `:1474-1481`): time, duration, calendar,
  status pill, Start/Complete per row; **no price**.
- money: `buildPriceSummary` (`lib/payments/payment-display.ts:61-181`) already produces the
  per-line rows from `visit_payment.lines`, "Visit total (N services)", "Deposit paid",
  "Paid so far" and "Outstanding", but it is rendered only inside the collapsed "Payments &
  confirmation" card (`:1655-1680`). Add-ons repeat in the Details card (`:1563-1592`).
- Source / Reference / Visits / Previous visit are rows in the collapsed Details card
  (`:1528-1559`).

**Port** (a layout decision; the app's panel is its own design, [[booking-detail-redesign]]):
1. Per-service price on each `GroupVisitCards` row, with the web's resolution order and the
   "Price not set" fallback; a skeleton while the detail hydrates.
2. Money out of the collapsed card: a compact "Visit total · Outstanding" line in the hero (or
   directly under the visit card), amber when owed, green when settled; the full breakdown can
   stay in Payments.
3. Deposit badge rule: show a badge only for `Pending` ("Deposit due £x" / "Payment due £x"),
   `Charged` ("Fee charged"), `Card Held`, `Paid` + full payment ("Paid in full"), `Refunded`;
   keep the app's "Deposit failed" pill. Retire "Deposit pending".
4. Keep the Details card's Source (with the R31-5 label), Reference, Visits and Previous visit
   rows; they are the app's own IA and the web dropped them for space, not correctness.

## 9. R31-7: the cross-account move dialog

**Web.** `PractitionerCalendarView.tsx:6122-6146`: when the dragged booking's owner venue differs
from the drop column's, the old toast is replaced by `crossVenueMove` state. The dialog
(`:9226-9260`) says "`{Guest}`'s booking can't move to `{Target}`'s calendar … `{Target}`
(`{venue}`) and `{Source}` (`{venue}`) are on different ResNeo accounts, and a booking cannot be
transferred between accounts. To move it, make a new booking on `{Target}`'s calendar and cancel
this one." Buttons: "Not now" / "Book on `{Target}`'s calendar". `startCrossVenueRebook`
(`:4952-4991`) opens the staff booking form on the target column (own column via
`openNewAtSlot`; partner column via `linkedCreating` with the owner venue) at the dropped date and
the time **rounded to 5 minutes**, with a `staffRebookBootstrap` carrying the guest's first/last
name, email and phone (the service is chosen afresh: the target venue has its own catalogue).
On `onCreated` a second dialog "Cancel the original booking?" (`:9263-9293`) offers "Keep both" /
"Cancel the original", the latter through the ordinary status PATCH so the client is told and
deposit rules apply (`cancelOriginalAfterCrossVenueRebook`, `:4994-4998`). Closing the form
clears the pending rebook.

**App.** The refusal is a toast: `LINKED_MOVE_SAME_VENUE_ERROR` (`lib/linked/linked-calendar-view.ts:220-221`),
raised by `handleDragColumnReject` (`app/(app)/(tabs)/index.tsx:1798-1802`) when
`DraggableAppointmentBlock.tsx:656-691` finds the drop outside the column's move range
(`lib/calendar/column-move-groups.ts:35-56`). The ingredients for the rest exist: the wizard
route takes `date`, `practitionerId`, `time`, `ownerVenueId`/`ownerVenueName`
(`app/(app)/booking/new.tsx:66, 109-116`) and seeds a guest from `?guestId=` (`:157-172`), and
`GuestDetailsStep` has a read-only prefill mode (`:36`). It has no way to seed a guest by name /
email / phone, which the cross-account case needs: the guest row belongs to the source venue, so a
`guestId` means nothing on a partner's catalogue.

**Port.**
1. On column reject, keep the snap-back but replace the toast with a ConfirmSheet carrying the
   web's copy and the two buttons (source/target calendar names and venue names come from the
   column model; "(your venue)" for own columns).
2. "Book on X's calendar": push `/booking/new` with `date`, `time` (rounded to 5 minutes),
   `practitionerId`, the target owner venue (`ownerVenueId`/`ownerVenueName` for a partner
   column, as the linked create path already does) and new `guestFirstName` / `guestLastName` /
   `guestEmail` / `guestPhone` params that `GuestDetailsStep` pre-fills (editable, not
   read-only). Carry the original booking id and a label ("10:30 on Tue 8 Sep with Kate") in a
   small store or param.
3. On the wizard's created callback, when a rebook is pending, show "Cancel the original
   booking?" with "Keep both" / "Cancel the original" → `useUpdateBookingStatus(originalId)`
   `Cancelled`, then a toast "Cancelled the original booking with {guest}." Because the wizard is
   a route, this prompt runs after it pops, so no stacked modal ([[ios-no-stacked-modals]]).
4. Clear the pending rebook when the wizard exits without creating.

## 10. R31-8: collective service sync, the manager and About

**Web.** Building on #187's sync (R29-12, never built in the app):
- `validation.ts:270-277, 342-349`: actions `sync_all_providers` and `unlink_all_providers`
  (optional `itemId`); `set_providers` ops gain `sync?: boolean` on `add`.
- `catalogue/route.ts:298-336` (`bringCopyIntoStep`): an independent copy is linked and updated,
  a customised or drifted linked copy is re-synced with force, the origin never touched, add-on
  groups matched afterwards; `:648-722` the two batch actions (unlink skips the origin; sync
  answers 409 only when every copy failed); `:769-781` the ask-at-tick link after `add` when the
  service already existed. `sync_provider` and `link_provider` now call `matchAddonGroupsToOrigin`
  (`service-duplication.ts:625-668`: the copy ends linked to exactly the origin's groups, each
  resolved to the venue's own group with the same name, selection type and options incl. extra
  length and price, created when missing, extras unlinked never deleted).
- `service-sync.ts:441-585`: `loadServiceSyncViews(admin, ids, originOverrides)` computes
  `inStep` for independent copies too; `catalogue.ts:456-521` feeds the offering's origin as the
  override, so every copy at a non-origin venue carries drift information. The row's `sync.state`
  is remapped to `none` for the venue's own service at the origin.
- `collectives.ts:153-166, 345-361, 423`: `CollectiveView.hostContact?: { phone, websiteUrl,
  address, openingHours }` from the host's `venues` row (served by `GET /api/venue/collectives`).
- `CombinedPageManager.tsx`: `CopySyncStatus` badges ("Linked to X, in step" / "Linked, behind X:
  45 min here, 30 min at X" / "Not linked. Differs from X: …" / "Not linked. Same as X today" /
  "Edited at Y, no longer following") with one button each ("Link to X" / "Update from X" /
  "Relink to X" / "Unlink"); "Link all n copies" / "Unlink all n copies" per offering and across
  the page; the tick-time question ("{Venue} already has a service called "{name}". Link it to
  X's? …"); a read-only `CombinedPageAboutSection` (host's phone, website, address, opening hours;
  where to change them; and the note that the hours shown are information only, each linked
  account's own hours decide availability).

**App.** `types/collectives.ts:202-253`: `CatalogueAction` has `create_item(s)`, `update_item`,
`archive_item`, `add_provider`, `remove_provider`, `set_providers`; `CatalogueProviderOp` has no
`sync`; `CatalogueProviderView` (`:114-129`) has no `sync` view; `CollectiveView` has no
`hostContact`. `components/linked/CollectiveCatalogueBuilder.tsx` sends the six actions
(`:90, 127, 367, 394, 476`) and draws no sync state. `CombinedPageConfigEditor.tsx:590-597, 682`
has the public page's About-tab toggle and a one-line note about where the header details come
from. Nothing breaks: every new key is optional and the app's ticks still yield linked copies
server-side.

**Port** (one piece of work with R29-12, `Docs/APP_GAP_REPORT_R29_WEB_DELTA.md` §13):
1. Types: `sync` on the provider view, `originVenueId`/`originVenueName` on the item, the five
   actions (`sync_provider`, `detach_provider`, `link_provider`, `sync_all_providers`,
   `unlink_all_providers`, with `forceSync` / `itemId`), `sync` on the add op, `hostContact`.
2. `CalendarRow` in the builder: the badge + one button per copy, the app's duration difference
   note from the two providers' `effectiveDurationMinutes`; ConfirmSheet before each action
   (fold into the builder's existing sheet as a mode step, [[ios-no-stacked-modals]]).
3. Ask at tick time when the venue already has the service (`hasService` is already known to the
   row), staging `sync: true` on the op.
4. "Link all n copies" / "Unlink all n copies" on each offering and at the top, shown only while
   there is something to do (`copiesOutOfStep` / `linkedCopies` ported as pure helpers).
5. An About section on the collective screen: host contact + hours (read-only, `BookOpeningHours`
   equivalent) with the "information only" note; link to Settings for the host.
6. The R29-12 remainder: the combined page URL + Copy in `CombinedPageNotice`.

## 11. R31-9: the cross-account visit 409

**Web.** `visits/[groupBookingId]/schedule/route.ts:226` and `services/route.ts:230`: the 409 for
a visit whose rows sit on different venues now reads "The services of this visit are on different
ResNeo accounts, so it cannot be moved as one. Move each service on its own, or make a new booking
on the other calendar and cancel this one." (edited as one: "Change each service on its own.").

**App.** `lib/queries/useVisitMutations.ts:128-131` surfaces the server sentence verbatim by
design; `ModifyBookingSheet.tsx:1262-1266, 1485, 1524` and `RescheduleSheet.tsx:68` show
`ApiError.message`. Inherited; nothing to do.

## 12. Build order

1. **R31-1** (blocks a booking; one schema, one step, two tests).
2. **R31-4** and **R31-2** (a template, a test, three comments, one docs sentence).
3. **R31-5** (a type, a helper, three call sites).
4. **R31-6** items 1–3 (per-service price, money line, badge rule).
5. **R31-7** (the dialog, the guest params, the cancel prompt).
6. **R31-8 + R29-12** (the sync manager and About).

R31-3 and R31-9 need no code. None of the six needs a native rebuild; all ship in the next OTA.

## 13. Built: R31-1 (2026-09-10, `896b362`)

`lib/validation/walk-in-guest.ts` `buildGuestSchema`: `phone` is `optional()` for every source
(the `isWalkIn` parameter stays for callers and no longer changes the rule). `GuestDetailsStep`
marks Phone optional and gives both contact fields the web's helper line ("Without a phone
number the client gets no text reminder." / "Without an email the client gets no confirmation.").
Nothing changed on the wire: the flows already sent `phone: ''`, which the server now reads as
no phone. `walk-in-guest.test.ts` pins a phone booking with nothing filled in. The optional
client-side digit check was not added: the server's `Invalid phone number` 400 already reaches
the field through the 400-detail path.

## 14. Built: R31-2 and R31-4 (2026-09-10, `fcdb6ea`)

`visitChipLabel` returns `1/2`; `VisitChip` keeps a full sentence for the screen reader ("Service
1 of 2 in this visit") so the shorter chip loses nothing for VoiceOver/TalkBack. The
`CalendarDayGrid.multi-service` test asserts the sentence. The four comments that still described
the shared earliest-service tint (`visit-siblings.ts`, `cluster-bookings.ts`, `AppointmentBlock`,
`DraggableAppointmentBlock`) now describe per-service colour, and the R30 report's "deliberate
divergence" sentence records that web #190 adopted the same rule.

## 15. Built: R31-5 (2026-09-10, `84ad99c`)

`lib/booking/booking-source-label.ts` `bookingSourceLabel` mirrors the web's map (tested).
`GuestBookingHistoryRow.source?` added. The client screen's history rows and the panel's Guest
history rows end their caption with the label; the Details card's Source row uses it too (no more
`booking_page`). The reports CSV keeps its own map on purpose.

## 16. Built: R31-6 (2026-09-10, `cfa7d6b`)

Two pure helpers in `lib/payments/payment-display.ts`, both tested:
- `buildMoneyAtAGlance(booking)`: "Visit total" / "Total", the total (visit picture for a
  multi-service visit, else stored total, else variant + add-ons), what is outstanding, `settled`.
- `depositBadge(booking)`: the web's rule. `Pending` → "Deposit due £x" / "Payment due £x" (live
  statuses only); `Charged` → "Fee charged"; `Card Held` → "Card held"; `Paid` + full payment →
  "Paid in full"; `Refunded` → "Deposit refunded" / "Payment refunded"; a paid deposit → nothing.

`GroupVisitCards` takes `priceLines` (`visit_payment.lines`) and shows each row's price under its
status pill, "Price not set" for an unpriced line; `BookingDetailContent` passes the lines for a
real multi-line visit. The hero gains a "Visit total £x · £y outstanding" (amber) / "· Paid"
(green) line under the meta chips, and its deposit badge follows `depositBadge` (card-hold entities
keep `resolveCardHoldUiState`'s richer pill; "Deposit failed" stays). The Details card's Source,
Reference, Visits and Previous-visit rows stay (§8 item 4).

**Revised later the same day (owner's ask):** the app now carries the web's visit summary block
itself, at the top of the hero (`components/bookings/VisitSummary.tsx`): time span; duration ·
date · last visit; status pill + deposit/card-hold/failed badges; one row per service with time,
length, status, price and per-service Start/Complete; add-ons under a single service; a money
footer (total / visit total, deposit paid, paid so far, outstanding). The separate "Services in
this visit" card, the Details card's add-on list + Total, and the hero money line were removed
as duplicates; `GroupVisitCards` is the party card only. The contact row and the status action
buttons were left exactly as they were, by request.

## 17. Built: R31-7 (2026-09-10, `c05550c`)

- `DraggableAppointmentBlock` (and the two grids' prop types) report
  `(bookingId, newTime, targetColumnId)` on a column reject instead of nothing.
- `lib/calendar/cross-venue-rebook.ts` (tested): the two sheets' copy (the web's words), the
  5-minute slot rounding, the "10:30 on Tue 8 Sep with Kate" label, and the one-shot pending
  record (`setPendingCrossVenueRebook` → `markCrossVenueRebookCreated` →
  `takeCrossVenueRebookIfCreated`).
- The calendar tab: the reject handler names both calendars and their accounts (own practitioner
  names, or the partner's calendar + venue from the linked feed) and opens a ConfirmSheet ("Not
  now" / "Book on X's calendar"). Confirming seeds the wizard through the existing rebook
  bootstrap (first/last name, email, phone from the booking summary, or from the partner feed when
  the link shares PII; the name alone if the read fails), records the pending rebook, and pushes
  `/booking/new` with `date`, `time`, `practitionerId` and, for a partner column, the venue or
  collective as `ownerVenueId`/`ownerVenueName` (as the slot menu does).
- `/booking/new` marks the record on its created callback. On the calendar tab's next focus a
  second ConfirmSheet offers "Keep both" / "Cancel the original"; own bookings cancel through the
  status PATCH, a partner's through `useUpdateLinkedBooking`. An abandoned wizard drops the
  record on that focus. The old toast remains as the fallback when the drop cannot be described.

One difference from the web, on purpose: the web offers the cancel the moment its modal closes;
the app's wizard is a route that lands on the new booking's detail, so the offer appears when the
Calendar tab is next opened.

## 18. Built: R31-8 with R29-12 (2026-09-10, `a0af72e`)

- Types: `CatalogueProviderView.sync?`, `CatalogueItemView.originVenueId/Name?`, the five actions
  on `CatalogueAction`, `CatalogueProviderOp.sync?`, `CatalogueActionPayload.forceSync?`,
  `CollectiveView.hostContact?`.
- `lib/linked/service-sync-view.ts` (tested): `copiesOutOfStep`, `linkedCopies`,
  `copySyncStatus` (badge + one action, with the duration difference note), the per-offering and
  page-wide "Link all n copies" / "Unlink all n copies" words, `askToSyncOnAdd`.
- `CollectiveCatalogueBuilder`: one `ConfirmSheet` at the builder root serves every question
  (never a second sheet over another, [[ios-no-stacked-modals]]); the page-wide and per-offering
  buttons; each ticked row at another venue draws its badge and next-step button; ticking a
  calendar whose venue already has the service asks "Link it?" and stages `sync: true` on the add;
  the staged state is `{ desired, sync }` per calendar; the helper copy is the web's.
- `CombinedPageAboutSection`: the host's phone (tel: link), website, address and opening hours
  (`OpeningHoursEditor` read-only), where to change them (buttons to Venue profile and Business
  hours for the host, "ask {host}" for a member), and the "information only" note. An About tab
  on the host's screen and a section under the member's explainer.
- R29-12 remainder: `SettingsCollectiveNote.publicPath` and the Booking page notice shows the
  combined address with "Copy link" and "View page".

## 19. Verification and what is owed

`tsc --noEmit`, `expo lint` on every touched file (the two `react-hooks/exhaustive-deps` warnings
in the calendar tab pre-date this work) and the full jest suite pass. The web preview cannot reach
the authed API ([[world-class-plan-2026-06]]), so the new screens were not exercised against
staging; a device pass is owed for: the phone-less booking (R31-1), the "1/2" chip width in
compact mode (R31-4), the hero money line and visit-card prices (R31-6), the cross-account
drop → rebook → cancel round trip on an own column and on a partner column (R31-7), and the sync
badges / Link all / tick-time question against a collective with a drifted copy (R31-8). None of
it needs a native rebuild; it ships in the next OTA with the R29/R30 device pass.
