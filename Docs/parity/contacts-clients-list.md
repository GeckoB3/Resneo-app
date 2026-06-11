# Contacts / Clients list — parity ~32%

## App files
- C:\Resneo-app\app\(app)\(tabs)\clients.tsx
- C:\Resneo-app\components\clients\BulkActionSheets.tsx
- C:\Resneo-app\components\clients\GuestEditSheet.tsx
- C:\Resneo-app\app\(app)\client\[id].tsx
- C:\Resneo-app\lib\queries\useGuests.ts
- C:\Resneo-app\lib\queries\useGuestDetail.ts
- C:\Resneo-app\lib\queries\useGuestMutations.ts
- C:\Resneo-app\lib\queries\useGuestTags.ts
- C:\Resneo-app\lib\queries\useContactsBulk.ts
- C:\Resneo-app\types\guest-list.ts
- C:\Resneo-app\types\guest-detail.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\contacts\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\contacts\ContactsDashboard.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactDetailPanel.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\CreateContactModal.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\MergeContactsModal.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactMarketingSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactGdprSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactCustomFieldsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactDocumentsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactHouseholdSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactComplianceSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\EraseGuestDataModal.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\guests\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\guests\[guestId]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\contacts\bulk\route.ts
- C:\Resneo-app\_reference\Resneo\src\lib\guests\contacts-constants.ts
- C:\Resneo-app\_reference\Resneo\src\types\contacts.ts

## Summary
The mobile app renders a FlatList of contacts with search, 4 sort options, tag-filter chips, long-press bulk selection (tag/message/merge sheets), and CSV export via the native share sheet. Tapping a row navigates to a separate full-screen client detail page (app/(app)/client/[id].tsx) that shows stats, booking history, a timeline feed, and an edit sheet for profile + marketing consent. The web ContactsDashboard is substantially richer: it uses an inline expanding accordion pattern (no separate screen), has 6 sort options instead of 4, adds a full "Filters" popover with 8 distinct Smart-list segments (new contacts, upcoming, by last visit, marketing consent, last staff member, last service, tag, all), configurable page sizes (25/50/100/250), a total-count/page indicator, real-time Supabase Postgres subscriptions for live updates, a "Create contact" button (POST /api/venue/guests), a field-level inline-edit form with cancel/save without opening a separate screen, per-contact inline tag editor, customer profile notes card, booking history accordion with re-book from context, a multi-step merge modal with field-level conflict resolution, custom client fields section, document upload/download section, household/group section, marketing consent toggle, GDPR data-export (JSON) + erase with confirmation, compliance records section (feature-flagged), and a bulk-select-all-on-page control. The app also lacks real-time refresh, the identifiability_tier / anonymous-contact concept, the filter=identified/all/anonymous scope, and several fields (cancelled_count, paid_deposit_pence, marketing_opt_out, identifiability_tier) are absent from GuestListItem in types/guest-list.ts.

## Recommendation
The mobile Contacts screen covers approximately 32% of web parity. The most impactful work, in priority order: (1) Fix the GuestListItem and GuestDetailResponse types to include all backend-returned fields (identifiability_tier, marketing_opt_out, marketing_consent, cancelled_count, paid_deposit_pence, custom_field_definitions as CustomClientFieldDefinition[]); (2) Add the "Create contact" flow (FAB + CreateContactSheet POSTing to POST /api/venue/guests) — this is the single biggest user-facing missing action; (3) Expand the client detail screen to include a custom fields section (ContactCustomFieldsSection equivalent using PATCH /api/venue/guests/[guestId] {custom_fields}), a dedicated marketing preferences toggle, and a GDPR erase button (POST /api/venue/gdpr/erase-guest); (4) Add pagination with total-count display and a page-size control, fixing the silent 50-contact cap; (5) Implement advanced Smart-list segments in a filter bottom-sheet (especially 'marketing consent' and 'by last visit' date-range filters, which are the most-used segments for appointment venues); (6) Add real-time Supabase guest-table subscription so new bookings automatically refresh the list; (7) Fix the useGuests hook to pass all segment parameters, not just the tag segment; (8) Add document upload/download and household-linking sections to the client detail screen; (9) Upgrade the MergeContactsSheet to a multi-step wizard with field-level conflict resolution. The anonymous-contact filter and compliance/loyalty sections are lower priority but should be tracked.

## Gaps (21)

### [CRITICAL] Create new contact from the directory — missing
- Backend: POST /api/venue/guests
- Web behaviour: Toolbar 'New client' button opens CreateContactModal which POSTs to /api/venue/guests with first_name/last_name/email/phone. Server deduplicates by email then phone. On success the new contact is opened immediately.
- Mobile plan: Add a FAB or header icon button to clients.tsx that opens a new CreateContactSheet (bottom-sheet with 4 inputs). On save POST /api/venue/guests via a new useCreateGuest mutation; on success invalidate queryKeys.guests.all() and navigate to /client/{id}.

### [HIGH] Advanced filter popover — identity scope (identified / all / anonymous) — missing
- Backend: GET /api/venue/guests?filter=identified|all|anonymous
- Web behaviour: ContactsDashboard passes filter=identified|all|anonymous to GET /api/venue/guests. Default is 'identified' (only contacts with name + email/phone). 'all' includes anonymous walk-ins. 'anonymous' shows only walk-ins.
- Mobile plan: Add a filter bottom-sheet (or extend the existing filter chip row) with the three 'Who to include' radio options. Extend GuestListParams and buildGuestListPath in useGuests.ts to pass the filter param. Store state in clients.tsx.

### [HIGH] Advanced Smart-list segments — new, upcoming, by last visit, marketing consent, last staff member, last service — partial
- Backend: GET /api/venue/guests?segment=...&date_from=...&date_to=...&marketing=...&last_staff_id=...&last_service_id=...&last_service_kind=...
- Web behaviour: ContactsDashboard passes segment=new|upcoming|visit|marketing|last_staff|last_service|tag to GET /api/venue/guests, plus date_from, date_to, marketing, last_staff_id, last_service_kind, last_service_id, segment_tag as needed. The app only supports the 'tag' segment.
- Mobile plan: Extend the filter sheet to include all CONTACTS_SEGMENT_OPTIONS. For segments that require sub-inputs (tag text, date pickers, staff/service pickers) render conditional sub-sections inside the sheet. Add date range pickers using a DateRangePicker component. Fetch staff via /api/venue/practitioners?roster=1&active_only=1 and services via /api/venue/appointment-services for the picker dropdowns.

### [HIGH] Real-time live refresh via Supabase Postgres subscriptions — missing
- Backend: Supabase Realtime (no HTTP route needed — existing Supabase client subscription)
- Web behaviour: ContactsDashboard uses useVenuePostgresLiveSync subscribing to the 'guests' and 'bookings' tables for the venue. On change the list silently refreshes. This means another staff member adding a contact appears instantly.
- Mobile plan: The app already has lib/realtime infrastructure (useBookingsList uses it for bookings). Add a similar subscription in clients.tsx: subscribe to venue 'guests' table inserts/updates/deletes and call guestsQuery.refetch() on events. A debounced refresh (300 ms) is sufficient.

### [HIGH] Pagination with total count display and configurable page size — missing
- Backend: GET /api/venue/guests?page=N&limit=N (returns total_count)
- Web behaviour: Web shows 'Page X of Y · Z total' bar with Previous/Next buttons and a page-size picker (25/50/100/250, persisted to localStorage). App loads a fixed 50 contacts with no pagination UI or total count shown.
- Mobile plan: Add page state to clients.tsx. Render a sticky footer bar showing total count and Prev/Next page controls. Extend useGuests to consume the returned total_count from GuestListResponse. The app type GuestListResponse already has total_count field.

### [HIGH] Contact detail — custom client fields read and edit — missing
- Backend: GET /api/venue/guests/[guestId] (returns custom_field_definitions + guest.custom_fields), PATCH /api/venue/guests/[guestId]
- Web behaviour: ContactCustomFieldsSection fetches the definitions from GuestDetailResponse.custom_field_definitions and the values from guest.custom_fields. It renders input/select/checkbox per field_type and saves via PATCH /api/venue/guests/[guestId] {custom_fields:{...}}.
- Mobile plan: Add a CustomFieldsSection component to app/(app)/client/[id].tsx. Read detail.custom_field_definitions (already typed as unknown[] in GuestDetailResponse — update to CustomClientFieldDefinition[]). Render each active field as a labelled input. Save via useUpdateGuest mutation with {custom_fields:{...}}.

### [HIGH] Contact detail — marketing consent toggle (opt-in / opt-out) — partial
- Backend: PATCH /api/venue/guests/[guestId]
- Web behaviour: ContactMarketingSection in the detail panel shows checkboxes for marketing_opt_out and marketing_consent separately. Saves via PATCH /api/venue/guests/[guestId] {marketing_opt_out, marketing_consent}. The app's GuestEditSheet only has a single 'Marketing consent' Switch that sets both marketing_consent and marketing_opt_out together, and only shows on the edit sheet (not as a dedicated section on the detail screen).
- Mobile plan: Add a MarketingPreferencesCard to the client detail screen showing the current state (opted in/out/no consent) with a button to toggle. Alternatively expand GuestEditSheet to use two separate toggles — one for opt-out and one for explicit consent — to match the PATCH schema.

### [HIGH] Contact detail — document upload and download — missing
- Backend: GET /api/venue/guests/[guestId]/documents, POST /api/venue/guests/[guestId]/documents/sign, POST /api/venue/guests/[guestId]/documents/[documentId]/complete, GET /api/venue/guests/[guestId]/documents/[documentId]/download, DELETE /api/venue/guests/[guestId]/documents/[documentId]
- Web behaviour: ContactDocumentsSection loads docs via GET /api/venue/guests/[guestId]/documents. Upload uses a signed-URL flow: POST /api/venue/guests/[guestId]/documents/sign then PUT to the signed URL, then POST /api/venue/guests/[guestId]/documents/[documentId]/complete. Download uses GET /api/venue/guests/[guestId]/documents/[documentId]/download. Delete via DELETE /api/venue/guests/[guestId]/documents/[documentId].
- Mobile plan: Add a DocumentsSection component to the client detail screen. Use expo-document-picker for selecting files to upload. Use the same signed-URL flow. For downloads, fetch the download URL and open with expo-sharing or Linking.openURL. List existing docs with delete swipe action.

### [HIGH] Contact detail — GDPR erase / anonymise single contact — missing
- Backend: POST /api/venue/gdpr/erase-guest {guest_id}
- Web behaviour: EraseGuestDataModal (admin only) POSTs to /api/venue/gdpr/erase-guest {guest_id} after a two-step confirmation. On success the contact is anonymised and the panel closes.
- Mobile plan: Add an 'Erase data' destructive button to the client detail screen (admin only, visible in a GdprSection or at the bottom of the screen). Show an Alert.alert confirmation with two taps (first tap opens warning, second tap confirms). POST to /api/venue/gdpr/erase-guest. On success navigate back to contacts list.

### [MEDIUM] Sort option — name Z-to-A and recently added — partial
- Backend: GET /api/venue/guests?sort=name_desc|created_desc
- Web behaviour: Web offers 6 sort options: last_visit_desc, last_visit_asc, name_asc, name_desc, visit_count_desc, created_desc. App only has 4 (missing name_desc and created_desc).
- Mobile plan: Add 'Name Z-A' ({value:'name_desc', label:'Name Z–A'}) and 'Recently added' ({value:'created_desc', label:'Recently added'}) to the SORT_OPTIONS array in clients.tsx.

### [MEDIUM] Inline contact detail expansion (no screen navigation required) — partial
- Backend: GET /api/venue/guests/[guestId]?booking_history_limit=80
- Web behaviour: Web expands contact detail inline in the list row (accordion pattern) with full edit form, tag editor, notes, booking history accordion with re-book action, marketing toggles, documents, household, GDPR, and compliance — all without leaving the contacts page.
- Mobile plan: The app uses a separate /client/[id] screen which is acceptable on mobile, but the detail screen is missing many sections (see below gaps). No structural change needed here — the separate screen pattern is fine, but the screen content must be expanded to match web parity.

### [MEDIUM] Bulk remove-tag action — missing
- Backend: POST /api/venue/contacts/bulk {action:'remove_tag'}
- Web behaviour: POST /api/venue/contacts/bulk with action:'remove_tag' is supported by the backend bulk route. Web exposes 'Add tag' in the bulk bar; the API also supports remove_tag for tag management workflows.
- Mobile plan: Add a useRemoveTag mutation in useContactsBulk.ts calling POST /api/venue/contacts/bulk {action:'remove_tag', guest_ids, tag}. Add a 'Remove tag' option to the bulk action bar in clients.tsx (admin only, appears after selecting contacts).

### [MEDIUM] Contact detail — inline editable fields with cancel/save (no separate sheet required) — partial
- Backend: PATCH /api/venue/guests/[guestId]
- Web behaviour: ContactDetailPanel renders first_name, last_name, email, phone as read-only tiles with an 'Edit' button that converts them to inputs inline. PATCH /api/venue/guests/[guestId]. Cancel reverts without API call. The app uses a separate GuestEditSheet bottom-sheet which is functionally equivalent but requires an extra tap.
- Mobile plan: The existing GuestEditSheet is acceptable mobile UX. No change required as long as all fields (including custom_fields) are exposed. The sheet currently lacks custom_fields editing (see below).

### [MEDIUM] Contact detail — household / group linking — missing
- Backend: GET /api/venue/guests/[guestId]/household, POST /api/venue/guests/[guestId]/household
- Web behaviour: ContactHouseholdSection fetches GET /api/venue/guests/[guestId]/household and allows linking another guest via POST /api/venue/guests/[guestId]/household {other_guest_id}. Shows member names and primary indicator.
- Mobile plan: Add a HouseholdSection card to the client detail screen. Display current household members with navigation to their profiles. Add a 'Link member' bottom-sheet with a guest search input (uses existing /api/venue/guests search endpoint). POST to link.

### [MEDIUM] Contact detail — GDPR data export (JSON download) — missing
- Backend: GET /api/venue/gdpr/export-guest?guest_id={id}
- Web behaviour: ContactGdprSection (admin only) calls GET /api/venue/gdpr/export-guest?guest_id={id} and downloads the JSON blob as a file. Admin can export a structured dump of all personal data for a contact.
- Mobile plan: Add a GdprSection card to the client detail screen (admin only). On press, fetch the export JSON and share it via React Native Share.share() or expo-sharing. Show a loading state.

### [MEDIUM] Contact detail — advanced merge with field-level conflict resolution — partial
- Backend: POST /api/venue/guests/merge, GET /api/venue/guests/[guestId] (to fetch both sides for preview)
- Web behaviour: Web MergeContactsModal is a 4-step wizard: (1) search for the source contact, (2) preview field conflicts side-by-side, (3) pick which value to keep per field (first name, surname, email, phone, notes, tags union/target/source, marketing, custom_fields), (4) confirm and POST /api/venue/guests/merge. The app MergeContactsSheet only works with already-selected contacts from the list (max 5) and has no field-level conflict UI — it posts directly.
- Mobile plan: Upgrade MergeContactsSheet to a multi-step flow: Step 1 let admin pick target vs sources (current), Step 2 fetch detail for both contacts and show a conflict resolution card for each field with toggle buttons. Step 3 show summary. Step 4 POST with resolved field values. Also add a 'Find & merge' button on the client detail screen that opens a contact search to find the duplicate.

### [MEDIUM] Select-all on current page for bulk actions — missing
- Backend: none
- Web behaviour: Web shows a 'Select all on page' checkbox above the list that selects/deselects all visible contacts. The app requires long-pressing each row individually.
- Mobile plan: Add a 'Select all / Clear all' toggle button to the bulk action bar in clients.tsx. When selectionMode is active, show it as a leading control in the bar. Wire it to set/clear all current page guest IDs.

### [MEDIUM] Anonymous / walk-in contact scope — missing
- Backend: GET /api/venue/guests?filter=identified|all|anonymous
- Web behaviour: The web passes filter=identified (default), filter=all, or filter=anonymous to GET /api/venue/guests and handles the identifiability_tier field on rows to display 'Anonymous' as the display name. The app type GuestListItem is missing identifiability_tier, marketing_opt_out, marketing_consent, cancelled_count, and paid_deposit_pence fields.
- Mobile plan: Update GuestListItem in types/guest-list.ts to add identifiability_tier, marketing_opt_out, marketing_consent, cancelled_count, paid_deposit_pence. Update formatGuestName in clients.tsx to return 'Anonymous' when identifiability_tier === 'anonymous'. Add the filter parameter to useGuests and GuestListParams.

### [LOW] Bulk anonymise action — missing
- Backend: POST /api/venue/contacts/bulk {action:'anonymise'}
- Web behaviour: POST /api/venue/contacts/bulk with action:'anonymise' allows bulk GDPR anonymisation of up to 100 contacts. Web does not currently expose this through the main bulk bar, but the backend supports it.
- Mobile plan: Add a useBulkAnonymise mutation. Expose as an admin-only 'Anonymise' option in the bulk action bar, behind an Alert.alert confirmation. Low priority as web does not yet surface it in the UI.

### [LOW] Contact detail — compliance records section — missing
- Backend: GET /api/venue/guests/[guestId]/compliance
- Web behaviour: ContactComplianceSection renders a ComplianceSection when the appointments feature flag 'compliance_records_enabled' is true. Shows compliance records and audit trail for the contact without a booking context. Uses GET /api/venue/guests/[guestId]/compliance.
- Mobile plan: Low priority — add a ComplianceSection component to the client detail screen, gated by a venue feature flag check (mirror the existing useBookingCompliance hook pattern). Show a simple list of compliance record summaries.

### [LOW] Contact detail — loyalty ledger view and manual adjustment — missing
- Backend: GET /api/venue/guests/[guestId]/loyalty, POST /api/venue/guests/[guestId]/loyalty
- Web behaviour: GET /api/venue/guests/[guestId]/loyalty returns the loyalty ledger + balance. POST to the same route allows a manual adjustment entry. The web ContactDetailPanel does not yet surface this in the UI, but the backend route exists.
- Mobile plan: Low priority. Add a LoyaltySection card to the client detail screen showing current balance and ledger entries. Admin can add an adjustment. Scope to a future iteration.

## Bugs spotted
- [high] GuestListItem in types/guest-list.ts is missing fields that the backend already returns: identifiability_tier, marketing_opt_out, marketing_consent, cancelled_count, paid_deposit_pence, created_at. These are all present in the web GuestListRow type (types/contacts.ts) and are returned by GET /api/venue/guests. The app silently discards them, preventing anonymous-contact display, marketing filtering, and richer export. (C:\Resneo-app\types\guest-list.ts)
- [medium] GuestDetailResponse in types/guest-detail.ts types custom_field_definitions as 'unknown[]' and communications as 'unknown[]'. The web types these as CustomClientFieldDefinition[] and CommunicationRow[] respectively (types/contacts.ts). This prevents the app from safely reading or rendering custom field definitions or communication history in the client detail screen. (C:\Resneo-app\types\guest-detail.ts)
- [medium] The BulkMessageSheet component (BulkActionSheets.tsx) calls useBulkMarketingMessage which POSTs action:'marketing_message' to /api/venue/contacts/bulk. However, the web's equivalent bulk-message flow on the directory page calls /api/venue/guests/{guestId}/message individually for each recipient (per-guest transactional message), NOT the marketing bulk route. The marketing_message action on /api/venue/contacts/bulk expects marketing consent and respects opt-out — this is correct for a true broadcast but may silently skip consented-only recipients. The UX label 'Message' in the bulk bar does not make this distinction clear; using it for transactional messages could fail for opted-out contacts. (C:\Resneo-app\components\clients\BulkActionSheets.tsx)
- [medium] In clients.tsx the MergeContactsSheet is opened via setBulkSheet('merge') and receives selectedGuests which is filtered from the current page's 50 results. If a selected guest was loaded from a previous page (which cannot happen in the current non-paginated 50-item load but will when pagination is added), selectedGuests could be empty or incomplete because guests array only contains the current page. Additionally, the merge condition 'selectedIds.length >= 2 && selectedIds.length <= 5' is hard-coded; the web's MergeContactsModal works with exactly 2 contacts (target + one source), so the merge sheet could fail silently for >2 selections if the backend restricts to 2-way merges. (C:\Resneo-app\app\(app)\(tabs)\clients.tsx)
- [high] The useGuests hook only passes the 'tag' segment to the API (via segmentTag / segment=tag). All other segment values (new, upcoming, visit, marketing, last_staff, last_service) are silently ignored because they are not in GuestListParams. If a caller passes these values nothing is sent to the backend and the full unfiltered list is returned instead. (C:\Resneo-app\lib\queries\useGuests.ts)
- [medium] The CSV export in clients.tsx fetches a maximum of 250 contacts in a single request (limit=250). The web's exportFilteredCsv paginates through all contacts in batches of 50 up to 120 pages (6,000 contacts max). For venues with more than 250 contacts the mobile export silently truncates the data with no warning to the user. (C:\Resneo-app\app\(app)\(tabs)\clients.tsx)

## Design notes
- The app uses a separate full-screen client detail page (/client/[id]). This is a valid mobile pattern but means context is lost — the user cannot see their place in the list while viewing a contact. Consider adding a back-navigation breadcrumb ('Back to Contacts') with the search/filter state preserved (pass filter state as route params or store in a context so the list does not reset on back).
- The bulk action bar appears as a floating element over the list (position:absolute, bottom: spacing.base). On devices with a home indicator (bottom safe area > 0) the bar may overlap system UI. It should use bottom: Math.max(spacing.base, insets.bottom) from useSafeAreaInsets to stay above the home indicator.
- Sort and tag-filter chips both live in horizontal ScrollViews above the list. With many tags this creates two rows of small scrollable chips which is cramped. A better mobile pattern would be to consolidate into a single 'Filters' button that opens a modal sheet — matching the web toolbar pattern — to give filters more room to breathe and save vertical space.
- The long-press to enter selection mode is not discoverable. A brief hint (e.g., 'Long-press to select') in the empty state or a selection-mode button in the header would help first-time users.
- The GuestRow displays name, phone, email, visit count and next booking all as small caption text. On small screens this is dense. Consider a two-line primary layout: name + phone on line 1, visit count chip + next booking on line 2 (similar to the web's badge row). The current layout also does not show the no_show_count even though it is in GuestListItem.
- The BulkMessageSheet allows composing a Subject + Body with Email/SMS/Both channel. The web's bulk message from the directory (BulkGuestMessageModal) does not have a Subject field — it passes a single 'message' field with 'channel'. The app's BulkMessageSheet calls useBulkMarketingMessage (action:'marketing_message') which does require subject. This works but the subject field is exposed at the list level, not at the individual contact level — it could confuse users expecting a conversational message.
- The client detail screen header shows a plain Avatar + name without a visible back button when navigated from within the contacts list. expo-router provides automatic back navigation but there is no explicit 'Back to Contacts' label. Adding a custom header title with the contact name and a labeled back chevron would improve orientation.
- The app's client detail screen (app/(app)/client/[id].tsx) renders a long ScrollView with no section headers or visual grouping between stats, booking history, and activity. Adding Card section headings (Notes, History, Activity) and visual separator cards — as used elsewhere in the app — would improve scannability.
