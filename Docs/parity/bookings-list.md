# bookings-list — parity ~52%

## App files
- C:\Resneo-app\app\(app)\(tabs)\bookings.tsx
- C:\Resneo-app\components\bookings\BookingRow.tsx
- C:\Resneo-app\components\bookings\BookingPeekSheet.tsx
- C:\Resneo-app\components\bookings\BookingDetailContent.tsx
- C:\Resneo-app\app\(app)\booking\[id].tsx
- C:\Resneo-app\types\booking-list.ts
- C:\Resneo-app\types\booking-detail.ts
- C:\Resneo-app\lib\queries\useBookingsList.ts
- C:\Resneo-app\lib\queries\useBookingsRange.ts
- C:\Resneo-app\lib\queries\useBookingMutations.ts
- C:\Resneo-app\lib\queries\useBookingDetail.ts
- C:\Resneo-app\lib\realtime\useVenueLiveSync.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\AppointmentBookingsDashboard.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\BookingsDashboard.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\ExpandedBookingContent.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\list\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\message\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\deposit\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\compliance\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\contacts\bulk\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\linked-calendar\route.ts

## Summary
The mobile Bookings tab renders a SectionList of BookingRow cards for a selected day/week/month, with status-chip filters, a practitioner (staff) filter, a guest-name search field, date navigation, and a FAB to create a new booking. Tapping a row navigates full-screen to /booking/[id] which renders BookingDetailContent — a rich card layout with guest header, appointment detail, add-ons, notes/tags, guest history accordion, compliance card, activity timeline, communications log, and all status/attendance/message/deposit actions. The web AppointmentBookingsDashboard does all of this inline via an expand-accordion on each row, but also adds: a fourth 'custom date range' view mode, a service-name filter, a column sort control (8 sort keys), Supabase realtime push sync with a live/reconnecting indicator, summary stats tiles (Total / Confirmed / Completed / No-shows), a guest contact toolbar search (searches by phone/email/ID, not just name), a URL-driven ?guest= filter for showing one contact's bookings across a date range, a URL-driven ?openBooking= param to auto-open a row, a bulk-select tray with 'Add tag' and 'Message' actions posted to /api/venue/contacts/bulk and /api/venue/bookings/[id]/message, a compliance 'Needs compliance / outstanding' filter, a walk-in quick-create modal alongside the standard new-booking modal, a linked-calendar source toggle (All / My venue / Linked) that overlays bookings from connected partner venues via /api/venue/linked-calendar, and an operations toolbar 'Search contacts' panel that searches contacts and creates bookings from the results. The mobile app is appointments-only (correct scope), so linked-calendar and compliance are the only significant out-of-scope items; the rest are genuine gaps.

## Recommendation
The most impactful work, in priority order: (1) Implement inline expanded booking detail — when a row is tapped, open a tall BottomSheet rendering BookingDetailContent rather than navigating away; this directly addresses the user's explicit priority (a) and keeps the list context for at-counter workflows. (2) Wire useVenueLiveSync into bookings.tsx so the list updates automatically when a booking changes on any device; this is a ~10-line change using an already-built hook and prevents stale data at the counter. (3) Add the summary stats bar (Total / Confirmed / Completed / No-shows) above the list — the data is already loaded and this adds immediate operational value. (4) Extend the search filter to match phone, email, and booking ID (not just name), which requires adding those fields to BookingListRow and a one-line filter change. (5) Add a service-name filter chip row (alongside the staff-filter row) using the appointment catalog already loaded by the booking wizard. (6) Add bulk select + 'Message' and 'Add tag' actions via the already-wired backend routes. Items (7) sort control, (8) custom date range, (9) guest deep-link params, and (10) walk-in shortcut are lower priority but can be built incrementally. Linked-calendar and compliance filter are low priority (minority feature, appointments-only scope). Fix the Pending chip order bug (should be second, not last) as a trivial one-line change to STATUS_FILTERS.

## Gaps (13)

### [CRITICAL] In-list inline expanded booking detail (tap row expands it in place; full booking content rendered without leaving the list) — missing
- Backend: GET /api/venue/bookings/[id] — already called by useBookingDetail
- Web behaviour: Web renders ExpandedBookingContent inline inside each booking row on tap. This includes status actions, notes/edit, guest tags, guest history accordion, compliance section, comms log, timeline, message compose, deposit actions — all without navigation. The mobile app navigates to a separate /booking/[id] screen via router.push, which provides all the same data but requires a full-screen context switch and loses the list context.
- Mobile plan: Priority (a) per user requirements. Replace the navigation push in openBooking with a BookingExpandSheet (a tall Sheet/BottomSheet) that renders BookingDetailContent inline. The sheet should be tall enough (snapPoints: ['80%', '100%']) to show the full content. This avoids breaking the list context and mirrors the web expand-accordion pattern in a mobile-appropriate way. bookings.tsx needs expandedId state; BookingRow gets an onExpand callback; a new component (e.g. BookingExpandSheet) wraps the existing BookingDetailContent. The useBookingDetail hook is already available.

### [HIGH] Realtime push sync (Supabase postgres_changes) with live/reconnecting indicator on the bookings list — missing
- Backend: none — Supabase realtime is already configured; useVenueLiveSync already exists at lib/realtime/useVenueLiveSync.ts
- Web behaviour: Web subscribes to Supabase postgres_changes on the bookings table filtered by venue_id; on every change it debounces a silent re-fetch of GET /api/venue/bookings/list. A 'live' / 'reconnecting' dot is shown in the OperationsWorkspaceToolbar. The app has useVenueLiveSync but it is NOT wired into bookings.tsx — the list only refreshes on pull-to-refresh.
- Mobile plan: Import useVenueLiveSync in bookings.tsx. Pass venueId, subscriptions=[{table:'bookings', filter:`venue_id=eq.${venueId}`}], and onRefresh that calls activeQuery.refetch(). Show a small LiveDot indicator next to the date label (matching what the Calendar tab does). This is a 1-file change.

### [HIGH] Summary stats bar (Total / Confirmed / Completed / No-shows counts for the selected period) — missing
- Backend: none — data already loaded by useBookingsList / useBookingsRange
- Web behaviour: Web computes stats from allStatusBookings (all-status superset) and renders four coloured pill badges above the list: 'Appointments N', 'Confirmed N', 'Completed N', 'No-shows N'. These are independent of the current status filter so the user always sees period-level health at a glance.
- Mobile plan: Add a StatsBar component below the toolbar border in bookings.tsx that computes the four counts from rawRows (before status-filter). Render as a horizontal ScrollView of small Chip/Badge components. Only show when there are bookings loaded.

### [HIGH] Bulk selection with 'Add tag' and 'Message' bulk actions on selected bookings — missing
- Backend: POST /api/venue/contacts/bulk and POST /api/venue/bookings/[id]/message — both routes exist and the app already calls the message route from BookingDetailContent
- Web behaviour: Web renders a checkbox per booking row; selecting any shows a floating tray with 'Add tag' (POST /api/venue/contacts/bulk with {action:'add_tag', guest_ids, tag}) and 'Message' (POST /api/venue/bookings/[id]/message per booking). Tags are applied to the guest contact, messages go per-booking.
- Mobile plan: Add selectedIds state and a long-press gesture on BookingRow to enter selection mode (matches iOS/Android conventions). Render a floating BulkActionBar (similar to web's fixed tray) with 'Tag' and 'Message' buttons. Reuse useContactsBulk (lib/queries/useContactsBulk.ts) for tagging and useSendBookingMessage for messaging. Show count in tray.

### [MEDIUM] Service filter (narrow by appointment service name) — missing
- Backend: GET /api/venue/appointment-services — already consumed by the booking wizard (useAppointmentCatalog); a direct fetch or new hook would work
- Web behaviour: Web fetches GET /api/venue/appointment-services and renders a 'Service' dropdown in the filter panel. Filtering by service ID excludes CDE-model rows (event/class/resource) only if those models are not enabled for the venue.
- Mobile plan: Add a services chip row or a filter sheet option in bookings.tsx. Reuse useAppointmentCatalog (or add useServicesFilter hook) to load services. Add serviceFilter state (string | null) and filter searchedRows by appointment_service_id / service_item_id. Chips row should sit below the staff-filter row.

### [MEDIUM] Sort control (sort bookings by date/time/client/status/service/staff/deposit/type, asc/desc) — missing
- Backend: none — client-side sort over loaded data
- Web behaviour: Web renders a 'Sort' select + Asc/Desc toggle in the list header. Supports 8 sort keys. Sections (week/month) are sorted by day then within day by the chosen key.
- Mobile plan: Add sortKey and sortDir state to bookings.tsx. Apply sort inside the sections useMemo after filtering. Expose a sort button (e.g. SymbolView 'arrow.up.arrow.down') in the toolbar area that opens an ActionSheet or small sheet with sort options.

### [MEDIUM] Guest full-text search by phone, email, or booking ID (in addition to name) — partial
- Backend: none — expand app-side filtering once phone/email fields are added to BookingListRow type
- Web behaviour: Web's filterRegistryAppointments checks b.guest_name, b.guest_phone, b.guest_email, b.booking_item_name, b.id, and b.id without hyphens. App only searches by guest_name. The list API returns guest_phone and guest_email as fields on RegistryAppointment but BookingListRow in the app types does not include them.
- Mobile plan: 1) Add guest_phone and guest_email fields to BookingListRow in types/booking-list.ts. 2) In the searchedRows useMemo in bookings.tsx, extend the filter to also match b.guest_phone and b.guest_email and b.id (partial). Low risk, no backend change.

### [MEDIUM] URL / deep-link to open a specific booking (?openBooking=UUID auto-expands it) and to pre-filter by guest UUID (?guest=UUID) — missing
- Backend: GET /api/venue/bookings/list already accepts ?guest= (see web route); the mobile useBookingsList would need the param threaded through
- Web behaviour: Web reads searchParams.get('openBooking') on mount and auto-expands that booking row. Also reads searchParams.get('guest') to filter the list to one contact's bookings and passes it as a query param to GET /api/venue/bookings/list?guest=UUID. These are used by notification emails and the Contacts page.
- Mobile plan: In bookings.tsx read useLocalSearchParams for openBooking and guest. For openBooking: navigate to /booking/[id] on mount. For guest: add a guestId param to useBookingsList/useBookingsRange hooks and pass it as a query param. Add a dismissable banner ('Showing bookings for one contact') with a clear button.

### [MEDIUM] Walk-in quick-create from the bookings list (separate 'Walk-in' button beside 'New booking') — partial
- Backend: POST /api/venue/bookings/walk-in — already called by useCreateWalkIn in the app
- Web behaviour: Web has both a 'New booking' and a 'Walk-in' button in the toolbar. Walk-in opens DashboardStaffBookingModal with bookingIntent='walk-in', which calls POST /api/venue/bookings/walk-in. Mobile new.tsx has a walk-in wizard path but it is only reachable via /booking/new and the source is set to 'walk-in' inside the flow — there is no dedicated walk-in entry point from the bookings list toolbar.
- Mobile plan: Add a secondary 'Walk-in' Pressable/Button next to the FAB (or as a FAB long-press option) that navigates to /booking/new?intent=walk-in. In new.tsx, read the intent param and default source to 'walk-in'. Alternatively, open the walk-in step of the wizard directly.

### [MEDIUM] Operations toolbar guest search panel (search contacts by name/phone/email, see their upcoming bookings, create a booking from the result) — missing
- Backend: GET /api/venue/guests?search= — already consumed by the Contacts tab (useGuests hook)
- Web behaviour: Web's OperationsWorkspaceToolbar has a 'Search contacts' panel (OperationsToolbarGuestSearchPanel). Typing in it queries GET /api/venue/guests with a search term and shows contact cards; tapping a contact sets ?guest= URL filter or opens new-booking pre-populated with that guest. This is a power-user at-counter workflow.
- Mobile plan: Add a contacts search icon button in the bookings toolbar. On tap, open a sheet with a search Input and results from useGuests({search}). Each result row shows guest name/contact and has a 'New booking' button that navigates to /booking/new?guestId=X. This mirrors the web panel without the URL-filter path (which is handled separately above).

### [LOW] Custom date range view mode (arbitrary From/To picker) — missing
- Backend: GET /api/venue/bookings/list?from=&to= — already used by useBookingsRange
- Web behaviour: Web offers day/week/month/custom ViewMode. In custom mode, two date inputs let the staff enter an arbitrary range; useBookingsList is called with from+to params against GET /api/venue/bookings/list.
- Mobile plan: Extend the SCOPE_OPTIONS array in bookings.tsx with a 'custom' entry. When selected, show a compact DateRangePicker bottom sheet (DateTimePicker pair). Pass the custom from/to to useBookingsRange.

### [LOW] Compliance 'Needs compliance / outstanding' filter badge on the list — missing
- Backend: GET /api/venue/bookings/[id]/compliance — exists; useBookingCompliance hook exists in app
- Web behaviour: Web checks the compliance_records_enabled feature flag, fetches per-booking compliance states, and shows a 'Needs compliance N' filter chip above the list. ComplianceRowPill renders an indicator on each row. Tapping filters to only outstanding rows.
- Mobile plan: Low priority (appointments-only scope; compliance is a feature-flagged add-on). Add a useComplianceBulkFlags hook that batches compliance state per visible booking ID. Conditionally show a 'Needs compliance N' Chip above the list when the flag is enabled and there are outstanding items. Mark as low priority.

### [LOW] Linked-calendar source toggle (All / My venue / Linked) and overlay of partner-venue bookings — missing
- Backend: GET /api/venue/linked-calendar — route exists in reference; no mobile hook exists yet
- Web behaviour: Web fetches GET /api/venue/linked-calendar?from=&to= and merges the returned LinkedVenueCalendar[] rows into the list. A source-scope pill group filters between own/linked/all. Linked rows show a 'Linked' Pill and open a LinkedBookingDetailModal instead of the expand panel.
- Mobile plan: Low priority, appointments-only and likely a minority use case on mobile. Create useLinkedCalendar(from, to) hook. Merge linked rows into sections. Show a 'Linked' badge on BookingRow when the row has a _linked meta. Tap opens BookingPeekSheet in read-only mode. Mark low priority.

## Bugs spotted
- [medium] BookingListRow type (types/booking-list.ts) is missing group_booking_id and deposit_amount_pence fields that the web RegistryAppointment includes. The BookingRow component checks booking.deposit_status but cannot compute a pence-formatted deposit amount for the list row, causing the deposit display to show only the raw status string (e.g. 'Pending') without a currency figure, whereas the web shows '£50.00 · Pending'. (C:\Resneo-app\types\booking-list.ts)
- [medium] The bookings.tsx search filter only matches on b.guest_name.toLowerCase().includes(term) but the web also matches b.guest_phone, b.guest_email, b.booking_item_name, and b.id (with and without hyphens). A receptionist searching by phone number at the counter will see no results even though the booking is loaded. (C:\Resneo-app\app\(app)\(tabs)\bookings.tsx)
- [high] useBookingsList (lib/queries/useBookingsList.ts) uses a staleTime of undefined (React Query default: 0) but does not set refetchInterval or any realtime trigger. Combined with the missing useVenueLiveSync wiring, the list will not auto-refresh when a booking status changes from another device or the web dashboard, creating stale data at the counter. (C:\Resneo-app\lib\queries\useBookingsList.ts)
- [low] The BookingPeekSheet (used from the Calendar / Today tab) calls useBookingDetail with the bookingId from the sheet prop, which means it always fetches the full detail even for a lightweight 'peek'. The web calendar popover uses a fast bookingDetailLiteFromListRow seed from the list row before fetching full detail, preventing a blank loading state. BookingPeekSheet shows 'Loading booking...' until the full GET /api/venue/bookings/[id] completes. (C:\Resneo-app\components\bookings\BookingPeekSheet.tsx)
- [low] In BookingDetailContent, the GuestHistoryCard component fetches up to 10 history rows from useGuestDetail but only displays the first 5 (.slice(0, 5)). The 6th–10th rows are silently dropped without a 'View all' affordance, so the user cannot see a guest's full recent history from this screen. The web always shows all history rows in the GuestBookingsForGuestAccordion. (C:\Resneo-app\components\bookings\BookingDetailContent.tsx)
- [low] The STATUS_FILTERS order in bookings.tsx differs from the web: mobile has [All, Booked, Confirmed, Started, Completed, Cancelled, NoShow, Pending] while web has [All, Pending, Booked, Confirmed, Started, Completed, Cancelled, No show]. 'Pending' is last on mobile but second on web. At-counter staff looking for Pending bookings (e.g. awaiting deposit) will not see the chip in the prominent position. (C:\Resneo-app\app\(app)\(tabs)\bookings.tsx)

## Design notes
- The toolbar grows to 4+ horizontal rows on appointment venues (Scope segmented, date nav, search input, status chips, staff chips) with no way to collapse or hide rows. On a 390px screen this can push the list start point below the fold. Consider collapsing the filter rows behind a single 'Filter (N)' button / sheet, matching the web's OperationsWorkspaceToolbar collapsible filter panel pattern.
- Tapping a BookingRow navigates to a full-screen detail page (router.push), breaking list context. The user must use the back button to return to the same scroll position. The user's explicit priority (a) states the bookings list must show 'full expanded booking detail content when a booking is tapped'. A bottom sheet expansion (80–100% snap) would satisfy this without losing list context.
- The status Chip row does not show count=0 chips in a visually distinct way — all chips display the same style regardless of zero count. Web dims zero-count filters. Hiding or visually muting zero-count chips (e.g. opacity 0.4) would reduce scanning noise.
- There is no visual indicator of realtime sync status (live / reconnecting). The web shows a green dot or 'Reconnecting' label. On mobile this would prevent confusion when the list is stale after a poor connection.
- The empty state message hard-codes 'No appointments' regardless of venue terminology. The venue-aware newBookingActionLabel utility is already used for the FAB label; apply the same terminology lookup to the empty state title.
- The week/month SectionList renders section headers with formatDayHeading (e.g. 'Monday 10 June'). In month view with 30 sections, sticky headers create a stacking effect that is slow to scroll past. Consider collapsing day sections with an accordion or lazy-rendering only visible days.
- BookingRow does not show any visual indicator when a booking has an outstanding compliance requirement, whereas the web list shows a ComplianceRowPill. Even before full compliance filtering is built, a small warning dot on the row would help at-counter staff.
- The FAB for new booking is always visible, even over the bottom sheet or when a sheet is open. This can cause accidental taps. The FAB should be hidden when any sheet/modal is open.
