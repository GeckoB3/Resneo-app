# booking-detail — parity ~78%

## App files
- app/(app)/booking/[id].tsx
- components/bookings/BookingDetailContent.tsx
- components/bookings/ModifyBookingSheet.tsx
- components/bookings/EditBookingSheet.tsx
- components/bookings/DepositSheet.tsx
- components/bookings/GroupVisitCards.tsx
- components/bookings/ComplianceCard.tsx
- lib/booking/booking-status-actions.ts
- lib/booking/booking-timeline.ts
- lib/booking/booking-status-visual.ts
- lib/booking/infer-booking-row-model.ts
- lib/booking/terminology.ts
- lib/queries/useBookingDetail.ts
- lib/queries/useBookingMutations.ts
- lib/queries/useGroupVisit.ts
- lib/queries/useGuestMutations.ts
- types/booking-detail.ts

## Web reference files (read-only)
- _reference/Resneo/src/components/booking/BookingDetailContent.tsx
- _reference/Resneo/src/components/booking/BookingDetailExpandedContent.tsx
- _reference/Resneo/src/app/dashboard/bookings/ExpandedBookingContent.tsx
- _reference/Resneo/src/app/dashboard/bookings/booking-detail-panel-model.ts
- _reference/Resneo/src/app/dashboard/bookings/BookingDetailPanel.tsx
- _reference/Resneo/src/components/booking/CustomerProfileNotesCard.tsx
- _reference/Resneo/src/app/api/venue/bookings/[id]/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/check-in/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/deposit/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/message/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/resend-confirmation/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/compliance/route.ts
- _reference/Resneo/src/app/api/venue/bookings/[id]/validate-appointment-modification/route.ts

## Summary
The app's booking detail screen (app/(app)/booking/[id].tsx + BookingDetailContent.tsx) is one of the most complete pages in the codebase. It covers: guest header with call/email links, full booking metadata row, add-ons with price breakdown, attendance pills and toggles (staff confirm + arrived), notes card with Edit sheet, guest history accordion (lazy), compliance card (feature-flagged), activity timeline, communications log, status action buttons (primary/revert/destructive), reschedule sheet, full appointment modify sheet (ModifyBookingSheet with live availability validation), deposit sheet (send link/cash/waive/refund), message sheet, and rebook-guest flow. The web reference (ExpandedBookingContent.tsx, 2070 lines) adds several capabilities the app lacks: (1) inline-editable customer profile notes direct on the guest PATCH route; (2) a hard no-show time guard (canMarkNoShowForSlot); (3) a check-in toggle via POST /api/venue/bookings/[id]/check-in; (4) optimistic row overlays so actions feel instant; (5) a 'Contacts' deep-link from the guest header; (6) a CDE context card for non-appointment booking models; (7) a deposit 'Not Required' display path; (8) group-visit optimistic multi-segment status propagation; (9) the deposit sheet always shows Refund (web guards it by deposit_status=Paid, not just isAdmin); (10) the message composer on web keeps a draft textarea open persistently rather than as a modal sheet. Parity is estimated at 78%.

## Recommendation
The booking detail page is at approximately 78% parity and is one of the strongest pages in the app. The highest-priority work is: (1) Add the no-show time guard (canMarkNoShowForSlot) in handleActionPress — a 15-line port from the web that prevents a common staff error; (2) Make customer_profile_notes editable — the data already flows through the page read-only and useUpdateGuest already supports the field; the simplest path is adding it to EditBookingSheet.tsx alongside the existing notes fields; (3) Fix the DepositSheet to only show Refund when deposit_status is 'Paid' and suppress Send/Waive/Cash when already Paid/Refunded — a purely UI-logic fix. Medium priority: add a check-in toggle (new POST mutation + Button in Manage card) and add the direct 'View contact' link in the guest header (single router.push call). The two setState-during-render anti-patterns in ModifyBookingSheet and EditBookingSheet should be refactored to useEffect to avoid subtle concurrency issues in React Native 0.85's bridgeless mode. The visual improvements — collapsible timeline/communications accordions, deposit-pending amber pill in the header, and larger attendance button tap targets — would meaningfully improve at-the-counter usability.

## Gaps (9)

### [HIGH] No-show time guard — prevent marking no-show before booking start time — missing
- Backend: PATCH /api/venue/bookings/[id] (backend enforces, but UI should pre-validate)
- Web behaviour: In BookingDetailExpandedContent.tsx the onStatusAction handler calls canMarkNoShowForSlot(bookingDate, bookingTime, 0) from /lib/table-management/booking-status.ts. If the booking has not started yet, it sets an error 'No-show can only be marked after the booking start time' and aborts the transition. The PATCH /api/venue/bookings/[id] also enforces a grace period server-side via validateNoShowGracePeriod.
- Mobile plan: Port canMarkNoShowForSlot logic into lib/booking/booking-status-actions.ts (using venue timezone from useVenueContext). In handleActionPress inside BookingDetailContent.tsx, if target === 'No-Show' check the guard and show Alert.alert('Too early', ...) instead of proceeding. Venue timezone is already in VenueProvider.

### [HIGH] Customer profile notes — inline editable guest-level free-text note — partial
- Backend: PATCH /api/venue/guests/[guestId] — already called by useUpdateGuest in lib/queries/useGuestMutations.ts
- Web behaviour: Web renders CustomerProfileNotesCard (components/booking/CustomerProfileNotesCard.tsx) inside the Notes accordion. It shows the guest's customer_profile_notes field in a click-to-edit textarea that PATCHes /api/venue/guests/[guestId] with { customer_profile_notes }. The app displays this field read-only inside NoteBlock inside the Notes card, labelled 'Guest profile'.
- Mobile plan: Add a 'Customer info' editable sub-block inside the Notes card in BookingDetailContent.tsx. Reuse useUpdateGuest(booking.guest.id) — it already accepts customer_profile_notes. Show an Edit button that opens an inline Input or the existing EditBookingSheet. The simplest mobile approach: add customer_profile_notes as an optional field to EditBookingSheet and pass it from the Notes card's Edit button.

### [MEDIUM] Check-in toggle — mark a guest as checked in for event/class/resource bookings — missing
- Backend: POST /api/venue/bookings/[id]/check-in — route exists in reference codebase
- Web behaviour: Web calls POST /api/venue/bookings/[id]/check-in with optional body { checked_in: boolean }. The endpoint sets bookings.checked_in_at to now or null. The web shows checked_in_at in the meta-segment row. The app already displays checked_in_at as a read-only DetailRow but provides no toggle button.
- Mobile plan: Add useCheckInBooking(bookingId) mutation in lib/queries/useBookingMutations.ts calling POST /api/venue/bookings/[id]/check-in. In BookingDetailContent.tsx, add a 'Check in' / 'Undo check-in' Button in the Manage card (alongside attendance buttons) when the booking has checked_in_at or status is Booked/Confirmed/Seated.

### [MEDIUM] Contacts deep-link from guest header — missing
- Backend: none
- Web behaviour: In ExpandedBookingContent.tsx, next to the guest name there is a Link to /dashboard/contacts?guest=<guestId> labelled 'Open in Contacts'. The app shows a 'View contact' button only inside the collapsed GuestHistoryCard accordion, not in the primary header.
- Mobile plan: In BookingDetailContent.tsx inside the guest header Card, add a small icon Button (or text-link) next to the guest name that calls router.push('/client/' + booking.guest_id). This route already exists in the app.

### [MEDIUM] Optimistic UI overlays for status/attendance/deposit actions — missing
- Backend: none
- Web behaviour: ExpandedBookingContent.tsx maintains a rowOverlay state (BookingRowOverlay) that immediately patches the displayed booking values before the server confirms (overlayFromStatusTransition, overlayFromPatchBody). Buttons update visually within one render. The app waits for the server round-trip and then relies on react-query cache invalidation — visible lag on slow connections.
- Mobile plan: Add an optimistic update option to useUpdateBookingStatus and useSetBookingAttendance using react-query onMutate/onError rollback. In BookingDetailContent.tsx, accept an optional localBooking override prop or use local state mirroring the booking with pending patches applied. This is a quality-of-life improvement, not blocking.

### [MEDIUM] Deposit sheet — context-aware refund availability (show Refund only when status is Paid) — partial
- Backend: POST /api/venue/bookings/[id]/deposit
- Web behaviour: In ExpandedBookingContent.tsx the 'Refund deposit' button is only rendered when effectiveBooking.deposit_status === 'Paid'. Also 'Send payment link', 'Waive', and 'Record cash' are suppressed when status is 'Paid' or 'Refunded'. The web does not gate refund on isAdmin — all staff can trigger it.
- Mobile plan: In DepositSheet.tsx: (1) Move the context-aware show/hide logic inside the sheet rather than relying only on canRefund prop. Show 'Refund' only when target.status === 'Paid'; suppress 'Send payment link', 'Waive', 'Record cash' when status is already 'Paid' or 'Refunded'. (2) Remove the isAdmin gate on refund — the web does not restrict this to admin role.

### [LOW] CDE context card — additional booking model context (resource, event, class) — missing
- Backend: GET /api/venue/bookings/[id] (cde_context field in response)
- Web behaviour: Web renders a green 'SectionCard' with cde_context.title and optional subtitle from the booking detail's cde_context field (loaded by resolveCdeBookingContext in the GET route). This surfaces context for resource_booking, event_ticket, class_session models. The app is appointments-only so this is a low-priority out-of-scope model feature.
- Mobile plan: Flag as out-of-scope for appointments-only mode. If non-appointment models are later enabled, add a CdeContextCard component in BookingDetailContent.tsx that renders a Card with cde_context.title and subtitle when booking.cde_context is present and inferred_booking_model is not practitioner_appointment or unified_scheduling.

### [LOW] Persistent guest message composer (inline draft, not modal) — partial
- Backend: POST /api/venue/bookings/[id]/message
- Web behaviour: Web keeps the message textarea inline in an accordion panel (details/summary). It persists the draft text, shows channel select (email/SMS/both), and displays send feedback inline without closing the panel. App uses GuestMessageSheet (a bottom-sheet modal) which opens/closes, losing draft on dismiss.
- Mobile plan: Low priority — bottom-sheet is a valid mobile pattern. If desired, persist the draft in component state so it survives sheet open/close. The GuestMessageSheet component already receives the draft from sendMessage state. Wire setMessageTarget to keep a persistent draft or lift draftMessage to BookingDetailContent state.

### [LOW] Group visit segment status propagation on status change (optimistic multi-segment update) — partial
- Backend: GET /api/venue/bookings/list?group_booking_id=... and PATCH /api/venue/bookings/[id] (which triggers group sync server-side)
- Web behaviour: In ExpandedBookingContent.tsx, when a status change fires on a multi-service visit, applyStatusToAllGroupVisitRows propagates the new status to all segments in the groupVisitBookings state immediately. The app's GroupVisitCards component uses a react-query query that only refreshes after invalidation, so sibling cards briefly show stale statuses.
- Mobile plan: After a successful status mutation in useUpdateBookingStatus.onSuccess, also invalidate queryKeys.bookings.groupVisit so GroupVisitCards refetches. This is already partially covered by invalidateBookingCaches calling queryKeys.bookings.all(), but adding the specific groupVisit key would be cleaner.

## Bugs spotted
- [medium] DepositSheet.tsx shows the Refund button whenever canRefund !== false (i.e. whenever isAdmin is true or unset), regardless of the deposit_status. If deposit_status is not 'Paid' (e.g. 'Pending', 'Waived'), pressing Refund will call the POST /deposit endpoint with action='refund', which will fail server-side but only reports a generic error after the round-trip. The button should be hidden unless status is 'Paid', matching the web's explicit guard: effectiveBooking.deposit_status === 'Paid'. (components/bookings/DepositSheet.tsx)
- [low] In BookingDetailContent.tsx, the attendance buttons (Confirm attendance / Unconfirm attendance, Mark arrived / Undo arrived) are rendered inside the Manage card under the condition 'attendanceRelevant && booking.status !== Completed'. However, attendanceRelevant is true when status is 'Completed' (see: attendanceRelevant = !TERMINAL_STATUSES.has(booking.status) || booking.status === 'Completed'). This means for a Completed booking, both the attendance pills above AND the buttons below are suppressed — yet the pills section shows them (lines 622–629). The Manage card correctly suppresses the buttons for Completed, but the logic is inconsistent: for terminal statuses like Cancelled/No-Show, attendanceRelevant is false, so the buttons are hidden correctly. The pills section (lines 622–629) will still show historical attendance badges for any terminal status including Cancelled — which is correct — but the Manage attendance buttons could mistakenly show for an edge case where status is Completed (since the condition is booking.status !== 'Completed', Completed is excluded from buttons; the bug is that the Manage card renders at all for Completed because showManage || attendanceRelevant evaluates true for Completed, showing the empty attendance row if there are no message/deposit options). (components/bookings/BookingDetailContent.tsx)
- [low] In GuestTagsEditor (BookingDetailContent.tsx line 211), useUpdateGuest is imported from '@/lib/queries/useGuestMutations' but the import at the top of the file (line 43) shows it coming from that path. However, the useUpdateGuest function actually lives in C:/Resneo-app/lib/queries/useGuestMutations.ts — this is correct. But the tags save only invalidates queryKeys.guests.all() and queryKeys.bookings.all(). Since the booking detail is served under queryKeys.bookings.detail(accessToken, bookingId), the wildcard queryKeys.bookings.all() should cover it. This is correct — not a bug but worth noting that guest.tags shown in BookingDetailContent comes from the booking.guest embedded object (fetched at load time), so after a tag update the detail re-fetches and the tag list re-renders correctly. (components/bookings/BookingDetailContent.tsx)
- [medium] The ModifyBookingSheet uses 'adjust-state-during-render' anti-pattern (calling setState during render) at lines 93-103. Setting state during render triggers React to immediately re-render the component, which can produce difficult-to-debug infinite loops if the dependency comparison (target.id !== seededId) ever misfires. The correct pattern is to seed state in a useEffect with [target?.id] dependency and reset fields when it changes. (components/bookings/ModifyBookingSheet.tsx)
- [medium] EditBookingSheet.tsx has the same 'adjust-state-during-render' anti-pattern (lines 48-61) as ModifyBookingSheet — calling multiple setState calls during render based on target.id !== seededId. This pattern is not recommended by React and can cause double-renders or stale closures in concurrent mode. (components/bookings/EditBookingSheet.tsx)

## Design notes
- The booking detail screen stacks all content in a flat ScrollView with cards. On taller phones this is fine, but on iPhone SE (375pt) the actions section (primary + reschedule + modify + rebook + revert + 2x destructive) can produce 7 buttons in a vertical stack, making the page very long. Consider grouping secondary actions (Reschedule, Modify, Rebook) into a single 'More actions' expandable section or a 3-button horizontal row to reduce scroll distance.
- The 'Manage' card appears below the full action stack. On at-the-counter workflows, staff want attendance and deposit actions fast. Consider moving 'Confirm attendance' and 'Mark arrived' buttons up to just below the primary action button, or integrating them into the action bar with distinct visual weight (amber for arrived, matching the web's amber attn style).
- The status badge (StatusPill) and guest name are in the header card but the guest avatar uses first-letter initials. Web uses a gradient circle (brand-400 to brand-700) with white bold text. The app's Avatar component should match this for visual delight.
- Timeline and Communications sections are always-visible cards. On the web they are collapsible accordions (details/summary) which keeps the page compact. Converting these to collapsible Card components with an expand toggle would significantly shorten the default scroll height on bookings with many events.
- The Notes card header has an 'Edit' ghost button on the right. On mobile, 'Edit' is too small a tap target in that row. Consider using a full-width 'Edit booking details' Button (ghost, sm) below the notes content instead.
- The GuestHistoryCard uses plain text arrows (▾ / ›) as expand indicators. These could be replaced with a proper chevron icon matching the rest of the UI for visual consistency.
- Deposit status is currently surfaced only as a DetailRow inside the booking info card and a 'Deposit' button in Manage. The web prominently shows a 'Deposit pending' amber pill in the guest contact header area whenever deposit is pending. Adding this pill next to the StatusPill in the app header card would surface urgency at a glance.
