# Compliance (forms, records, expiries) — parity ~35%

> ⚠️ **SUPERSEDED (2026-07-01) — do not trust for current state.** This brief predates the R5–R7 compliance build. The app now ships in-venue capture, record view/void, the today's check-in panel, guest audit trail, booking-flag badges, type authoring + mobile field builder, per-service requirements editor, general settings, and library clone. The "~35%" figure is materially wrong. See **`Docs/APP_GAP_REPORT_R8_COMPLIANCE.md`** for the current (2026-07-01, web `origin/main 1a237cd4`) end-to-end audit.

## App files
- C:\Resneo-app\app\(app)\manage\compliance.tsx
- C:\Resneo-app\components\bookings\ComplianceCard.tsx
- C:\Resneo-app\types\compliance.ts
- C:\Resneo-app\types\booking-compliance.ts
- C:\Resneo-app\lib\queries\useCompliance.ts
- C:\Resneo-app\lib\queries\useBookingCompliance.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance\ComplianceDashboardView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance-types\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance-types\new\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance-types\[id]\edit\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\compliance-types\_shared.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceDashboardView.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceCaptureDialog.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceRecordViewDialog.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceFormBuilder.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\ComplianceBookingIndicator.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\compliance\shared.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\dashboard\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\records\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\records\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\records\[id]\void\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\form-links\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\form-links\[id]\resend\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\form-links\[id]\revoke\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\booking-flags\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\compliance\types\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\guests\[guestId]\compliance\route.ts
- C:\Resneo-app\_reference\Resneo\src\lib\compliance\check-in.ts

## Summary
The app's compliance.tsx renders a three-section dashboard (Missing for upcoming bookings, Expiring soon, Awaiting submission) using GET /api/venue/compliance/dashboard and GET /api/venue/compliance/form-links. It supports resend (email or SMS) and revoke on pending form links. ComplianceCard.tsx is a per-booking widget (embedded in booking detail) that shows requirement states and a guest's records, with a Send form link action. The web adds significantly more: a dedicated today/check-in panel split from the upcoming list, in-venue record capture via a full form renderer (POST /api/venue/compliance/records), view and void of individual records (GET/POST /api/venue/compliance/records/[id]), an audit trail per guest, per-booking compliance flag badges on calendars/lists, and a complete admin form builder for compliance types (create/edit/archive/restore). The app is missing record capture, record viewing/voiding, the today's check-in panel, audit trail, guest-level compliance history, booking-flag badges, and all type-management flows.

## Recommendation
The app's compliance screen covers roughly 35% of web functionality. The three most impactful gaps to close in priority order are: (1) Today's check-in panel — split missing_for_bookings into today vs upcoming using a port of groupTodaysCheckIns(), add a 'Capture' button per row, and build a ComplianceCaptureSheet that loads the type schema (GET /api/venue/compliance/types/[id]) and posts a record (POST /api/venue/compliance/records); this is the core at-the-counter flow that the compliance screen exists for. (2) View and void individual records — add a ComplianceRecordSheet that fetches GET /api/venue/compliance/records/[id] and exposes a void action via POST /api/venue/compliance/records/[id]/void; wire it into ComplianceCard so every record row is tappable. (3) Send-link actions on dashboard rows — add 'Send link'/'Renew' buttons to the missing_for_bookings and expiring_soon rows in compliance.tsx reusing the existing useSendComplianceFormLink mutation. Alongside these, fix the medium-severity bugs: eliminate the redundant form-links fetch by reading awaiting_submission from the dashboard payload, fix the shared loading-spinner problem with per-link pending state, and guard the Send form link button in ComplianceCard to only show when a requirement is not already satisfied. Per-booking compliance flag badges on the calendar and bookings list (POST /api/venue/compliance/booking-flags) are a high-value cross-cutting addition that should be planned as a separate pass once the capture flow is stable. Type management (form builder, library templates) is correctly deferred to the web dashboard; convert the existing footnote to a tappable link-out button.

## Gaps (12)

### [CRITICAL] Today's check-in panel (split from upcoming missing) — missing
- Backend: GET /api/venue/compliance/dashboard (shared with app) — no new route needed. In-venue capture also needs POST /api/venue/compliance/records.
- Web behaviour: Web's ComplianceDashboardView calls GET /api/venue/compliance/dashboard, then uses groupTodaysCheckIns() to split today's outstanding forms into a dedicated top panel grouped by booking/time. Each row shows compliance state pill, a 'Complete now' button (opens ComplianceCaptureDialog with channel=client_walkin) and a 'Send link' button. Upcoming (>today) bookings appear in a separate lower panel.
- Mobile plan: In compliance.tsx, split missing_for_bookings into todayMissing (booking_date === today) and upcomingMissing before rendering. Add a 'Check-in today' Card above the existing 'Missing for upcoming bookings' card, grouping rows by booking using a port of groupTodaysCheckIns(). Include a 'Capture' action per row (see record capture gap below). Requires adding useCapture modal/sheet state to the screen.

### [CRITICAL] In-venue compliance record capture (staff or client self-complete) — missing
- Backend: GET /api/venue/compliance/types/[id] (fetch schema), POST /api/venue/compliance/records (capture).
- Web behaviour: Web's ComplianceCaptureDialog loads the type's current form schema via GET /api/venue/compliance/types/[id], renders ComplianceFormRenderer, then POSTs to POST /api/venue/compliance/records with { guest_id, compliance_type_id, booking_id, capture_channel: 'client_walkin'|'staff_web', responses }. Staff can toggle between 'Staff entering' (staff_web) and 'Client completing on this device' (client_walkin) modes; staff-only fields are hidden in client mode.
- Mobile plan: Add a native ComplianceCaptureSheet (BottomSheet or Modal) component. It should: (1) fetch the type's form schema via a new useComplianceType(typeId) hook calling GET /api/venue/compliance/types/[id]; (2) render a dynamic form using the schema's fields array (text, textarea, select, multiselect, date field types; signature can defer to a link for v1); (3) include a channel toggle (Staff / Client); (4) on submit, POST /api/venue/compliance/records. Add a 'Capture' button to the today check-in panel in compliance.tsx and a 'Capture now' button in ComplianceCard.tsx per requirement row. Add useCaptureMutation hook to useBookingCompliance.ts.

### [HIGH] View individual compliance record detail (with form responses) — missing
- Backend: GET /api/venue/compliance/records/[id]
- Web behaviour: Web's ComplianceRecordViewDialog fetches GET /api/venue/compliance/records/[id] (returns record + version snapshot with form_schema). Renders captured_at, expires_at, all field responses mapped through the schema labels, and a 'Void this record' flow. This is accessible from both the per-booking ComplianceSection and the ComplianceDashboardView.
- Mobile plan: Add a ComplianceRecordSheet component. Open it when a record row in ComplianceCard's 'All compliance records' list is tapped. Fetch record + schema via a new useComplianceRecord(recordId) hook. Display captured_at/expires_at metadata, status badge, and a flat list of field label → answer pairs. Add a 'Void' button (see void gap below). Wire into ComplianceCard.tsx by making each record row tappable.

### [HIGH] Void a compliance record (with reason) — missing
- Backend: POST /api/venue/compliance/records/[id]/void
- Web behaviour: Web's ComplianceRecordViewDialog shows a 'Void this record' section when the record is not already voided. Staff enter a reason (required, max 500 chars), then POST /api/venue/compliance/records/[id]/void with { reason }. The record remains in the audit trail but no longer satisfies compliance.
- Mobile plan: Within ComplianceRecordSheet, add a 'Void record' destructive button that opens a confirmation Alert.prompt (or inline TextInput) for reason entry, then calls a new useVoidComplianceRecord mutation (POST /api/venue/compliance/records/[id]/void). Invalidate compliance queries on success and show hapticWarning.

### [HIGH] Guest-level compliance history (records + form links + audit trail) — missing
- Backend: GET /api/venue/guests/[guestId]/compliance
- Web behaviour: Web's ComplianceSection fetches GET /api/venue/guests/[guestId]/compliance which returns { records, form_links, audit_events }. Rendered in the contact/booking detail panel. The audit trail shows event_type labels (record.captured, record.voided, link.issued, link.consumed, etc.) with actor_type and date, inside a collapsible <details> element.
- Mobile plan: Add useGuestCompliance(guestId) hook calling GET /api/venue/guests/[guestId]/compliance. Extend ComplianceCard (or add a sister GuestComplianceCard) to show the full records list from this endpoint (richer than the booking-scoped endpoint — includes all records regardless of type, plus form_links list and audit events). Add a collapsible 'Audit trail' section to ComplianceCard using an Accordion/Pressable toggle. This enhances the per-booking view and should also appear in the contact detail screen.

### [HIGH] Per-booking compliance flag badges on calendar and bookings list — missing
- Backend: POST /api/venue/compliance/booking-flags
- Web behaviour: Web uses useComplianceBookingFlags() which POSTs to POST /api/venue/compliance/booking-flags with a list of booking IDs. Returns { flags: { [bookingId]: { state, blocking, labels } } }. Flags are displayed as coloured icon chips on calendar bars (ComplianceBarIcon) and pill badges on list rows (ComplianceRowPill). Flags refresh on a COMPLIANCE_CHANGED_EVENT custom event after any capture/void.
- Mobile plan: Add useComplianceBookingFlags(bookingIds) hook in lib/queries/useCompliance.ts calling POST /api/venue/compliance/booking-flags. Render a small shield/warning icon next to the guest name in booking list rows and calendar event bars. Use react-query's invalidation or a React context event to refresh after capture/void. Add a ComplianceFlagBadge UI component. This is a cross-cutting change touching calendar and bookings list screens.

### [MEDIUM] Awaiting submission panel — uses form-links endpoint instead of dashboard awaiting_submission field — partial
- Backend: GET /api/venue/compliance/dashboard (already called)
- Web behaviour: Web's 'Awaiting client submission' section in ComplianceDashboardView renders data.awaiting_submission directly from the dashboard response (from GET /api/venue/compliance/dashboard). The web shows guest_name, compliance_type_name, sent_at, expires_at, and a Pending pill. The web does NOT show resend/revoke buttons in the dashboard panel — those are accessed per-booking.
- Mobile plan: The app currently ignores dashboard.data.awaiting_submission and instead makes a separate GET /api/venue/compliance/form-links call, filtering for status==='pending'. This is redundant and wastes a request. Refactor compliance.tsx to read awaiting_submission from dashboard.data directly. Remove the useComplianceFormLinks() call from compliance.tsx (it can remain available for potential future use). This simplifies the screen and eliminates the extra network request. The resend/revoke actions on awaiting rows are mobile-specific enhancements not present on web's dashboard view — they are worth keeping.

### [MEDIUM] Send form link — enforcement pill on upcoming missing rows — partial
- Backend: none — enforcement string already present in ComplianceMissingRow type
- Web behaviour: Web's 'Missing for upcoming bookings' rows display the requirement enforcement label (e.g. 'Block all bookings', 'Warn staff') alongside the state pill. The app's compliance.tsx shows only guest_name, compliance_type_name, and booking_date/time — enforcement label is missing entirely.
- Mobile plan: In compliance.tsx, add the enforcement label to the caption Text in the missing_for_bookings rows. Import ENFORCEMENT_LABELS from shared constants or define inline. Display as e.g. 'PPD Test · 15 Jun 2025 · Warn staff'. No API change needed.

### [MEDIUM] Send link from dashboard missing/expiring rows (direct from compliance screen) — missing
- Backend: POST /api/venue/compliance/form-links (already used in ComplianceCard)
- Web behaviour: Web dashboard 'Missing for upcoming bookings' and 'Expiring soon' rows each have a 'Send link' / 'Send renewal' button that POSTs to POST /api/venue/compliance/form-links with { guest_id, compliance_type_id, booking_id, send_via: 'email' }. The app shows only a 'Booking' or 'Contact' navigation button on those rows.
- Mobile plan: In compliance.tsx import useSendComplianceFormLink from useBookingCompliance. Add a 'Send link' ghost button on each missing_for_bookings row (which already has guest_id, compliance_type_id, booking_id). For expiring_soon rows add a 'Renew' button using guest_id and compliance_type_id. Show email/SMS/copy choice via Alert.alert (same pattern as ComplianceCard.promptSend). Beware: missing rows where guest_id is null must disable the button.

### [LOW] Compliance type management (create / edit / archive / restore) — missing
- Backend: POST /api/venue/compliance/types, PATCH /api/venue/compliance/types/[id], POST /api/venue/compliance/types/[id]/versions, POST /api/venue/compliance/types/[id]/archive, POST /api/venue/compliance/types/[id]/restore
- Web behaviour: Web has full ComplianceFormBuilder at /dashboard/compliance-types/new and /[id]/edit. Builder calls POST /api/venue/compliance/types (create), PATCH /api/venue/compliance/types/[id] + POST /api/venue/compliance/types/[id]/versions (edit/new version), POST /api/venue/compliance/types/[id]/archive, POST /api/venue/compliance/types/[id]/restore. The builder includes drag-and-drop field ordering, 7 field types, validity/expiry config, capture method selection, pass-fail result mapping.
- Mobile plan: This is intentionally deferred per the footnote already in the app: 'Form templates, requirements & full record history are managed on the web dashboard.' The type builder (DnD, schema versioning, result mapping) is deep admin config. Acceptable as a web link-out. Mark as out-of-scope for mobile. However, consider adding a Settings → Compliance web link-out deep-link button in the compliance screen footer.

### [LOW] Compliance library templates (clone from template) — missing
- Backend: GET /api/venue/compliance/library, POST /api/venue/compliance/library/[slug]/clone
- Web behaviour: Web has GET /api/venue/compliance/library (list templates) and POST /api/venue/compliance/library/[slug]/clone (clone a library template as a new compliance type). Used in the Settings > Compliance tab.
- Mobile plan: Web-only admin feature. No mobile implementation needed — acceptable as a web link-out.

### [LOW] Edit record notes (PATCH notes field) — missing
- Backend: PATCH /api/venue/compliance/records/[id]
- Web behaviour: Web supports PATCH /api/venue/compliance/records/[id] to edit the notes field of a record. Exposed in the record detail view.
- Mobile plan: Add an editable notes TextInput in the ComplianceRecordSheet (see view-record gap). On blur/save, PATCH the record. Low priority; can be deferred to v2.

## Bugs spotted
- [medium] awaiting_submission field from dashboard response is ignored. The app type ComplianceDashboardData (types/compliance.ts line 38-42) declares awaiting_submission: ComplianceAwaitingRow[], but compliance.tsx never reads it. Instead it makes a second GET /api/venue/compliance/form-links call and filters locally for status==='pending'. This means the dashboard panel counts and the form-links panel can diverge, and the app wastes an extra network request on every load. (C:\Resneo-app\app\(app)\manage\compliance.tsx)
- [medium] resend mutation loading spinner is shared across all link rows. In compliance.tsx lines 229 and 236, both Resend and Revoke buttons use resend.isPending and revoke.isPending respectively — but these are module-level mutation objects, so if any resend is in flight, ALL resend buttons show loading. Multiple rapid taps on different links can lead to all links being processed. Should track a per-link pendingId in local state. (C:\Resneo-app\app\(app)\manage\compliance.tsx)
- [medium] ComplianceCard renders 'Send form link' buttons for ALL requirements regardless of their state. The web's ComplianceSection only shows the send/capture actions prominently when state === 'missing' || state === 'expired' (the needsAction guard). The app shows the button even when state is 'satisfied' or 'expiring_soon', cluttering the UI for compliant bookings. (C:\Resneo-app\components\bookings\ComplianceCard.tsx)
- [low] formatDate in compliance.tsx (line 23-29) uses date-fns parseISO with 'd MMM yyyy' format (e.g. '5 Jun 2025'), while formatComplianceDate in ComplianceCard.tsx uses toLocaleDateString('en-GB') producing 'DD/MM/YYYY'. These two formats are inconsistent across the same screen and its sub-components. The web uses a single shared formatComplianceDate that produces DD/MM/YYYY throughout. (C:\Resneo-app\app\(app)\manage\compliance.tsx)
- [low] Missing null-guard for guest_id in the missing_for_bookings rows in compliance.tsx. The type ComplianceMissingRow declares guest_id as string | null (types/compliance.ts line 18), but compliance.tsx passes row.booking_id and row.guest_id (implicitly) without null check when navigating to /client/[guest_id] — in practice the Contact button is absent but if the 'Booking' push is hit for a walk-in with null guest_id, the router push to /booking/[row.booking_id] is safe, but any future Send-link action added to these rows must guard guest_id !== null before dispatching. (C:\Resneo-app\app\(app)\manage\compliance.tsx)

## Design notes
- The compliance screen has no visual separation between the three panels beyond Card boundaries. Adding section header icons (a clock for expiring, a shield-x for missing, a paper-plane for awaiting) would help staff parse the page at a glance at the counter.
- The 'Awaiting submission' rows show only Resend and Revoke buttons; there is no way to copy the link URL to clipboard from this screen (only from ComplianceCard inside a booking). Adding a 'Copy link' third option to the handleResend alert would give receptionists a quick share option.
- Missing pull-to-refresh feedback: when both dashboard and formLinks are refetching simultaneously, the RefreshControl spinner shows, but there is no per-section stale indicator to signal which data has just refreshed.
- The 'All clear' empty state and the three data panels can coexist on the same scroll (if data is empty on all three but formLinks has resolved no items). The allClear flag should also check formLinks.isLoading to avoid flashing the empty state before form-link data arrives.
- The bottom footnote ('Form templates, requirements & full record history are managed on the web dashboard.') is valuable but would benefit from being a tappable link-out button that opens the web dashboard Settings > Compliance tab in the in-app browser (Linking.openURL), rather than dead plain text.
- On the ComplianceCard in booking detail, requirement rows lack visual dividers between them, making it hard to distinguish items at a glance when multiple requirements exist. A subtle separator (borderBottom on each requirementRow style) would improve scannability.
- The today check-in panel (once added) should be prominently placed at the top and given a distinct background tone (e.g. brand-50) to distinguish it as the 'act now' section from the forward-looking panels.
- Record capture (once added) is a perfect use-case for a full-screen modal sheet that hands the device to the client — consider adding a large-type mode / accessibility size bump when channel === 'client_walkin' to make form fields legible from arm's length.
