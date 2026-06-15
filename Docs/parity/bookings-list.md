# bookings-list — parity ~92%

> Re-audited 2026-06-15 against current source. The previous estimate (~52%) predated the
> bookings parity push and is obsolete — almost every gap it listed has since shipped. The
> sections below describe what is actually in the code today; remaining gaps are now small.

## App files
- C:\Resneo-app\app\(app)\(tabs)\bookings.tsx
- C:\Resneo-app\components\bookings\BookingRow.tsx
- C:\Resneo-app\components\bookings\BookingSwipeRow.tsx
- C:\Resneo-app\components\bookings\BookingDetailSheet.tsx
- C:\Resneo-app\components\bookings\BookingDetailContent.tsx
- C:\Resneo-app\components\bookings\BookingBulkBar.tsx
- C:\Resneo-app\components\bookings\BookingSortSheet.tsx
- C:\Resneo-app\components\bookings\BookingFilterSheet.tsx
- C:\Resneo-app\components\bookings\BookingDateRangeSheet.tsx
- C:\Resneo-app\components\ui\LiveDot.tsx
- C:\Resneo-app\types\booking-list.ts
- C:\Resneo-app\lib\queries\useBookingsList.ts
- C:\Resneo-app\lib\queries\useBookingsRange.ts
- C:\Resneo-app\lib\queries\useContactsBulk.ts
- C:\Resneo-app\lib\queries\useCompliance.ts
- C:\Resneo-app\lib\queries\useAppointmentCatalog.ts
- C:\Resneo-app\lib\realtime\useVenueLiveSync.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\AppointmentBookingsDashboard.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\BookingsDashboard.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\ExpandedBookingContent.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\list\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\message\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\contacts\bulk\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\linked-calendar\route.ts

## Summary
The mobile Bookings tab renders a flat virtualized list (plain header rows, not a SectionList —
deliberately, to dodge a Fabric/Android crash; see bookings.tsx:148-156) of BookingRow cards for a
Day / Week / Month / **Custom** range. Tapping a row opens **BookingDetailSheet** — a tall
(`maxHeight 94%`) bottom sheet rendering the shared **BookingDetailContent** inline, with an expand
icon as the only path to the full-screen /booking/[id] route. This is the in-list expanded-detail
behaviour the old brief flagged as the CRITICAL gap; it is now built.

Everything the prior audit listed as missing has shipped: **realtime push sync** via
`useVenueLiveSync` (Supabase `postgres_changes` on `bookings`, filtered by `venue_id`, with a 30s
polling fallback) and a green/amber **LiveDot** indicator beside the date; **bulk select** (long-press)
with floating **BookingBulkBar** offering **Tag** (`useBulkAddTag` → POST contacts/bulk) and
**Message** (per-booking POST bookings/[id]/message with email/SMS/both channel); an **8-key sort
sheet** (time, client, status, service, staff, deposit, type, party size, asc/desc); a **service
filter** (matches `appointment_service_id` / `service_item_id`, options from `useAppointmentCatalog`);
**extended search** matching name, phone, email, item name and booking ID (with/without hyphens); a
**custom From/To date-range sheet**; and a **feature-flagged compliance "needs compliance" filter**
(per-row dot + count chip via `useComplianceBookingFlags`). The status-filter chip order now matches
web (All, Pending, Booked, Confirmed, Started, Completed, Cancelled, No show), and a removable
active-filter chip row + "Clear all" sits below the toolbar. Filter controls (status / staff / type /
time-of-day / service / compliance) are consolidated into **BookingFilterSheet**, each section
self-hiding when not relevant.

What remains is minor: there is still no always-visible **summary stats bar**, no **deep-link
params** (`?openBooking=` / `?guest=`), no dedicated **walk-in entry point** from the toolbar, and no
**operations contacts-search panel** (largely covered by the dedicated Clients tab). Linked-calendar
overlay is out of scope (appointments-only).

## Recommendation
The page is at parity for day-to-day at-counter use. Two small items are worth doing and one is
worth a decision:
1. **Deep-link params (`?openBooking=` / `?guest=`)** — bookings.tsx does not read
   `useLocalSearchParams`; notification emails / the Clients tab can't deep-link into a specific
   booking or pre-filter to one contact's bookings. Add a `useLocalSearchParams` read on mount:
   `openBooking` → set `openBookingId`; `guest` → thread a `guestId` through `useBookingsList` /
   `useBookingsRange` (both currently send no `guest` param) plus a dismissable "Showing one
   contact" banner. This is the single most useful remaining gap.
2. **Guest-history 5-row cap** — shared with the detail page (the inline sheet renders the same
   BookingDetailContent). See booking-detail.md; fix once, benefits both surfaces.
3. **Summary stats bar (decision)** — the four counts (Total / Confirmed / Completed / No-shows)
   are already computed (`counts`, bookings.tsx:450-457) and surfaced as per-chip tallies inside
   BookingFilterSheet, but there is no always-visible period-health bar above the list like web's.
   Either add a render-only StatsBar or consciously declare the in-sheet counts sufficient for
   mobile and drop the gap.

Walk-in toolbar entry and the contacts-search panel are low priority (the wizard already supports a
walk-in path internally, and a full Clients tab exists). Linked-calendar stays out of scope.

## Gaps (5)

### [MEDIUM] Deep-link params `?openBooking=` and `?guest=` — missing
- Backend: GET /api/venue/bookings/list accepts `?guest=` on web; the mobile list hooks do not thread it yet
- Web behaviour: Web reads `searchParams.get('openBooking')` on mount to auto-expand a booking, and `searchParams.get('guest')` to filter the list to one contact's bookings (passed to GET /api/venue/bookings/list?guest=UUID). Used by notification emails and the Contacts page.
- App state: bookings.tsx does **not** import or call `useLocalSearchParams`; the only `openBooking` reference is the local `openBookingId` state, and `guest` is not read anywhere. `useBookingsList` / `useBookingsRange` send no `guest` query param.
- Mobile plan: Read `useLocalSearchParams()` in bookings.tsx. For `openBooking`: set `openBookingId` (opens the existing BookingDetailSheet) on mount. For `guest`: add a `guestId` arg to `useBookingsList` / `useBookingsRange`, pass as a query param, and show a dismissable "Showing bookings for one contact" banner with a clear button.

### [LOW] Guest-history list capped at 5 rows — present (shared with booking-detail)
- Backend: GET /api/venue/guests/[guestId] (booking history) — already fetched with limit 10
- Behaviour: The inline detail sheet renders BookingDetailContent, whose GuestHistoryBody fetches `bookingHistoryLimit: 10` (BookingDetailContent.tsx:214) but renders `.slice(0, 5)` (BookingDetailContent.tsx:218) with no "View all" affordance. The 6th–10th visits are silently dropped.
- Mobile plan: Tracked in booking-detail.md (single fix). Either render all fetched rows or add a "View all" that routes to `/client/<id>`.

### [LOW] Summary stats bar (Total / Confirmed / Completed / No-shows) — partial
- Backend: none — data already loaded
- Web behaviour: Web renders four coloured pill badges above the list, independent of the active status filter, so staff always see period-level health.
- App state: The four counts are computed (`counts`, bookings.tsx:450-457) and shown as tallies on the status chips inside **BookingFilterSheet**, but there is no always-visible bar above the list.
- Mobile plan: Optional. Add a render-only StatsBar (horizontal Chips) below the toolbar from `counts` + `searchedRows.length`, or treat the in-sheet counts as sufficient and close this gap.

### [LOW] Walk-in quick-create entry point from the list toolbar — missing
- Backend: POST /api/venue/bookings/walk-in — already wired by `useCreateWalkIn`
- Web behaviour: Web has both "New booking" and a separate "Walk-in" button in the toolbar.
- App state: The FAB and toolbar only route to `/booking/new` (bookings.tsx:829,846); there is no `?intent=walk-in` and no secondary walk-in button. The wizard supports a walk-in path internally, but it has no dedicated list entry point.
- Mobile plan: Add a secondary "Walk-in" affordance (FAB long-press or a small button) that routes to `/booking/new?intent=walk-in`, and have new.tsx default `source` to walk-in when the param is present.

### [LOW] Operations toolbar "Search contacts" panel — missing
- Backend: GET /api/venue/guests?search= — already consumed by the Clients tab (`useGuests`)
- Web behaviour: Web's OperationsWorkspaceToolbar has a contacts-search panel: type to find a contact, see their bookings, create a booking from the result.
- App state: No contacts-search sheet in the bookings toolbar. The functionality is largely covered by the dedicated **Clients** tab.
- Mobile plan: Low priority. If desired, add a contacts-search icon → sheet over `useGuests({search})` with a "New booking" action per result. Most value already lives in the Clients tab.

## Out of scope
- **Linked-calendar source toggle / partner-venue overlay** (GET /api/venue/linked-calendar). Appointments-only, minority use case on mobile; no mobile hook exists and none is planned.
- **Compliance as a booking *model*** (CDE event/class/resource rows). The compliance *filter* is implemented (feature-flagged); the alternative booking models are not in scope for the appointments-only app.

## Bugs spotted
All bugs the previous brief listed are resolved:
- BookingListRow now includes `group_booking_id`, `deposit_amount_pence`, `guest_id`, `guest_phone`, `guest_email` (types/booking-list.ts:14-23) — fixed.
- Search now matches name, phone, email, item name and booking ID with/without hyphens (bookings.tsx:419-428) — fixed.
- List auto-refreshes via `useVenueLiveSync` (bookings.tsx:351-356) with a 30s polling fallback (useVenueLiveSync.ts:13) — fixed.
- Status-filter chip order corrected; Pending is now second (bookings.tsx:133-146) — fixed.

One residual, tracked as a gap above rather than a bug: the guest-history `.slice(0, 5)` cap inside the inline detail sheet (BookingDetailContent.tsx:218).

## Design notes
- Filter rows are consolidated into BookingFilterSheet with a removable active-filter chip row + "Clear all" below the toolbar (bookings.tsx:728-781), so the list no longer pushes below the fold — the old "4+ stacked toolbar rows" concern is resolved.
- Tapping a row opens an inline sheet (94% height) rather than navigating away; list scroll position is preserved. The expand icon escapes to the full-screen route when needed.
- The list is intentionally flat (plain header rows, not SectionList) to avoid a Fabric/Android crash (bookings.tsx:148-156); virtualization is tuned (initialNumToRender 12 / maxToRenderPerBatch 12 / windowSize 11) since rows are variable-height (no getItemLayout).
- LiveDot beside the date communicates realtime status (green live / amber reconnecting / hidden idle).
- Consider dimming zero-count status chips inside the filter sheet to reduce scanning noise (web mutes zero-count filters).
- BookingRow shows a compliance dot when a requirement is outstanding (BookingRow.tsx:146); the FAB is hidden during bulk-selection mode (bookings.tsx:843).
