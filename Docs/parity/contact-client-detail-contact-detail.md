# Contact / Client detail (contact-detail) — parity ~30%

## App files
- C:\Resneo-app\app\(app)\client\[id].tsx
- C:\Resneo-app\components\clients\GuestEditSheet.tsx
- C:\Resneo-app\components\messaging\GuestMessageSheet.tsx
- C:\Resneo-app\types\guest-detail.ts
- C:\Resneo-app\types\guest-timeline.ts
- C:\Resneo-app\lib\queries\useGuestDetail.ts
- C:\Resneo-app\lib\queries\useGuestMutations.ts
- C:\Resneo-app\lib\queries\useContactsBulk.ts
- C:\Resneo-app\lib\queries\useGuestTags.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactDetailPanel.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactMarketingSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactHouseholdSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactDocumentsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactComplianceSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactGdprSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactTimelineSection.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\MergeContactsModal.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\EraseGuestDataModal.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\CreateContactModal.tsx
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactCustomFieldsSection.tsx

## Summary
The app's client detail screen (app/(app)/client/[id].tsx) loads the guest profile via GET /api/venue/guests/[guestId], displays a header with name/phone/email, a 4-tile stats row (bookings, no-shows, cancellations, deposits paid), a read-only notes card, a 'New booking for this client' button, a booking history list navigating to /booking/[id], and an activity timeline (from GET /api/venue/guests/[guestId]/timeline). An edit bottom-sheet (GuestEditSheet) handles PATCH on first/last name, phone, email, tags (comma-input), notes, and marketing consent toggle. A message bottom-sheet (GuestMessageSheet) sends POST /api/venue/guests/[guestId]/message. The web ContactDetailPanel is dramatically richer: inline editable contact fields, visit/next-booking stats, no-show pill badge, 'Call'/'Email' quick-action buttons, a proper tag editor (chip UI via GuestTagEditor), a rich customer profile notes editor, a 'New booking' button that opens a staff booking modal pre-filled with the guest, a 'Merge…' button (4-step MergeContactsModal with field-by-field resolution), an 'Erase data' admin action (EraseGuestDataModal), full booking history accordion with inline BookingDetailPanel drill-through, a 'Record & preferences' accordion containing marketing preferences (editable opt-in/opt-out with timestamp), household linking (GET/POST /api/venue/guests/[guestId]/household), document management (sign/upload/download/delete, 3 routes), a Compliance accordion (plan-gated), a 'Messages & privacy' accordion with send-message UI + full message log + GDPR data export (GET /api/venue/gdpr/export-guest), and a custom fields editor (PATCH /api/venue/guests/[guestId] custom_fields). The app has roughly 30% functional parity. Key missing features: household, documents, custom fields, compliance (contact-level), GDPR export, merge contacts modal, richer marketing preferences editing, inline booking detail drill-through (tapping a history row navigates away rather than opening inline), and tag chip-editor.

## Recommendation
Prioritise in this order. First, fix the critical booking-history tap bug: instead of router.push('/booking/[id]'), open the existing booking detail logic in a bottom-sheet or modal within the contact screen — this satisfies the top stated priority and requires a BookingDetailSheet component reusing the existing useBookingDetail hook. Second, fix the high-severity marketing_opt_out logic bug in GuestEditSheet which can incorrectly opt users out. Third, add the missing 'Erase data' admin action (POST /api/venue/gdpr/erase-guest) and GDPR data export (GET /api/venue/gdpr/export-guest) — these are compliance-critical features entirely absent from the app. Fourth, implement the 4-step Merge Contacts sheet using the existing useMergeGuests mutation (after extending it to send merged_profile and field_map). Fifth, build the Household section (GET/POST /api/venue/guests/[guestId]/household) and Document management section (5-route flow with expo-document-picker). Sixth, implement the Custom Fields editor by narrowing the custom_field_definitions type and adding typed inputs to GuestEditSheet. Seventh, improve the marketing preferences editing to expose opt-out and consent independently with the consent timestamp. Finally, add polish: call quick-action button, pull-to-refresh, no-show badge, next-visit tile, rich tag chip editor, and inline message log. All backend routes exist in the reference codebase and require only Bearer-JWT auth which the app already handles via apiFetch.

## Gaps (15)

### [CRITICAL] Inline booking detail drill-through from history — missing
- Backend: GET /api/venue/bookings/[id] (already used elsewhere in app)
- Web behaviour: Web opens BookingDetailPanel as an in-panel modal when any history row is tapped; full booking detail including services, status actions, deposit, notes, rebook appears inline without leaving the contact page.
- Mobile plan: Add a BookingDetailSheet bottom-sheet (or reuse the existing BookingDetailScreen logic in a modal/sheet presentation). In the HistoryRow onPress, open the sheet with bookingId rather than router.push('/booking/[id]'). This keeps the user in the contact context and satisfies the top-priority requirement that booking taps show full expanded detail.

### [HIGH] Marketing preferences editing (separate opt-in / opt-out controls with consent timestamp) — partial
- Backend: PATCH /api/venue/guests/[guestId]
- Web behaviour: Web's ContactMarketingSection renders two independent checkboxes (marketing_opt_out, marketing_consent) with a displayed consent timestamp and a dedicated Save button, calling PATCH /api/venue/guests/[guestId].
- Mobile plan: In GuestEditSheet, replace the single Switch (marketing_consent) with two separate Switch rows for marketing_consent and marketing_opt_out, plus display marketing_consent_at when available. The UpdateGuestInput type already supports both fields. Add the consent timestamp read-only row. This is a minor GuestEditSheet change.

### [HIGH] Household / linked contacts (view & link) — missing
- Backend: GET /api/venue/guests/[guestId]/household, POST /api/venue/guests/[guestId]/household
- Web behaviour: Web's ContactHouseholdSection fetches GET /api/venue/guests/[guestId]/household to list households the guest belongs to, and POSTs to the same route to link another guest by UUID.
- Mobile plan: Add a useGuestHousehold(guestId) query (GET) and useAddToHousehold mutation (POST) in lib/queries/useGuestHousehold.ts. Render a new 'Household' section card in the detail screen below notes. Show linked household members as a list and provide a text input + 'Link' button to add by guest UUID or, ideally, a searchable guest picker using the existing useGuests hook.

### [HIGH] Document management (upload, list, download, delete) — missing
- Backend: GET /api/venue/guests/[guestId]/documents, POST /api/venue/guests/[guestId]/documents/sign, POST /api/venue/guests/[guestId]/documents/[docId]/complete, GET /api/venue/guests/[guestId]/documents/[docId]/download, DELETE /api/venue/guests/[guestId]/documents/[docId]
- Web behaviour: Web's ContactDocumentsSection lists GET /api/venue/guests/[guestId]/documents; uploads via POST /api/venue/guests/[guestId]/documents/sign (get signed URL) then PUT to signed URL then POST /api/venue/guests/[guestId]/documents/[docId]/complete; downloads via GET /api/venue/guests/[guestId]/documents/[docId]/download (returns a pre-signed URL); deletes via DELETE /api/venue/guests/[guestId]/documents/[docId].
- Mobile plan: Add useGuestDocuments(guestId) query and useUploadGuestDocument / useDeleteGuestDocument mutations. For file picking use expo-document-picker; for upload use the three-step sign/PUT/complete flow. Render a 'Documents' section in the detail screen with a flat list and 'Open' (linking to the pre-signed download URL via Linking.openURL) and 'Delete' actions per row.

### [HIGH] Custom fields editor — missing
- Backend: PATCH /api/venue/guests/[guestId] (already wired); custom_field_definitions returned by GET /api/venue/guests/[guestId] (already in GuestDetailResponse type)
- Web behaviour: Web's ContactCustomFieldsSection reads active field definitions from detail.custom_field_definitions, renders typed inputs (text, number, boolean select, date), and PATCHes /api/venue/guests/[guestId] with { custom_fields: {...} }. Hidden when no definitions exist.
- Mobile plan: The GuestDetailResponse type already declares custom_field_definitions: unknown[]. Narrow that type to CustomClientFieldDefinition[] mirroring the web type. In GuestEditSheet (or a dedicated CustomFieldsSheet), iterate active definitions and render platform-appropriate controls (TextInput, Switch, DateTimePicker). Patch via existing useUpdateGuest mutation with { custom_fields }.

### [HIGH] Merge duplicate contacts (4-step modal with field-by-field conflict resolution) — missing
- Backend: POST /api/venue/guests/merge (useMergeGuests mutation already exists in lib/queries/useContactsBulk.ts but only passes target_guest_id + source_guest_ids, lacking the merged_profile and field_map body the web sends)
- Web behaviour: Web's MergeContactsModal is a 4-step admin-only flow: (1) search for duplicate, (2) explain consequences, (3) choose per-field winner (first/last name, email, phone, notes, tags union/target/source, marketing, custom fields), (4) confirm merged profile preview. Calls POST /api/venue/guests/merge.
- Mobile plan: Build a MergeContactSheet (multi-step bottom-sheet or navigation stack). Step 1: use existing useGuests hook with debounced search to pick the source guest. Steps 2–4: replicate field-picker UI using RadioButton groups for each conflicting field. Submit via useContactsBulk.useMergeGuests extended to accept merged_profile + field_map. Admin-only: gate behind isAdmin check.

### [HIGH] GDPR data export (download guest JSON) — missing
- Backend: GET /api/venue/gdpr/export-guest?guest_id=[id]
- Web behaviour: Web's ContactGdprSection calls GET /api/venue/gdpr/export-guest?guest_id=[id] (admin only), receives a JSON blob, and triggers a browser download.
- Mobile plan: Add an admin-only 'Export data' button in the detail screen. Call the route via apiFetch, then share the JSON blob using expo-sharing or expo-file-system (write to a temp file, then Sharing.shareAsync). Gate visibility behind an isAdmin/isStaffAdmin check from useStaffMe.

### [HIGH] Erase personal data (anonymise guest, admin-only with confirm dialog) — missing
- Backend: POST /api/venue/gdpr/erase-guest
- Web behaviour: Web shows an 'Erase data' button (admin only) that opens EraseGuestDataModal, a detailed confirm dialog explaining what is anonymised. On confirm calls POST /api/venue/gdpr/erase-guest with { guest_id }.
- Mobile plan: Add an 'Erase data' destructive button (admin-only). On press show a native Alert.alert with a two-step confirmation pattern, or a dedicated confirmation Sheet matching the web's bullet-point explanation. Add useEraseGuest mutation to lib/queries/useContactsBulk.ts posting to /api/venue/gdpr/erase-guest. On success navigate back to the client list and invalidate guest queries.

### [MEDIUM] Compliance records (contact-level, plan-gated) — missing
- Backend: GET /api/venue/guests/[guestId]/compliance
- Web behaviour: Web's ContactComplianceSection (gated by compliance_records_enabled feature flag) renders a ComplianceSection for the guest without booking context, calling GET /api/venue/guests/[guestId]/compliance to list all forms, tests, and consent records.
- Mobile plan: Reuse the existing booking-level compliance logic (useBookingCompliance, ComplianceCard components). Add a useGuestCompliance(guestId) query hitting /api/venue/guests/[guestId]/compliance. Render a 'Compliance' section in the detail screen, gated by the compliance feature flag from useVenue(). Mark as lower priority behind household/documents/merge.

### [MEDIUM] Rich tag editor (chip UI, tag creation, tag removal per chip) — partial
- Backend: GET /api/venue/guests/tags (useGuestTags already exists), PATCH /api/venue/guests/[guestId]
- Web behaviour: Web uses GuestTagEditor which renders existing tags as removable chips and provides a typeahead input (backed by GET /api/venue/guests/tags) to add new ones, patching PATCH /api/venue/guests/[guestId] { tags: [...] } on each change.
- Mobile plan: Replace the comma-separated tags TextInput in GuestEditSheet with a chip-based tag editor. Render existing tags as dismissible Chip components. Add a text input with autocomplete from useGuestTags(). On adding or removing, update the tags array in the local form state. The diff-only PATCH in buildPayload already handles this.

### [MEDIUM] Inline message log (communications history in contact detail) — missing
- Backend: Returned in GET /api/venue/guests/[guestId] as detail.communications (already in GuestDetailResponse type as communications: unknown[])
- Web behaviour: Web's 'Messages & privacy' accordion shows a scrollable list of all past communications (message_type, channel, status, timestamp) pulled from detail.communications (included in GET /api/venue/guests/[guestId] response).
- Mobile plan: Narrow communications: unknown[] in GuestDetailResponse to a typed CommunicationRow interface. Add a 'Messages' section in the detail screen below the message send action, showing a flat list of past communications with message_type, channel, status, and formatted date.

### [MEDIUM] Customer profile notes (inline editor with save, visible before edit sheet) — partial
- Backend: PATCH /api/venue/guests/[guestId]
- Web behaviour: Web's CustomerProfileNotesCard renders notes inline, always visible, with an in-place edit button that opens a textarea and saves via PATCH /api/venue/guests/[guestId] { customer_profile_notes }.
- Mobile plan: The app already shows notes read-only (when non-empty) and allows editing via GuestEditSheet. Improve to show a visible 'No notes — tap Edit to add' placeholder when notes are empty, making the feature discoverable. Consider an inline 'Edit notes' shortcut button beneath the notes card that opens GuestEditSheet pre-scrolled to the notes field.

### [MEDIUM] Quick-dial phone and quick-email address actions — missing
- Backend: none
- Web behaviour: Web renders 'Call' (tel: link) and 'Email' (mailto: link) buttons prominently in the contact header when the corresponding values are present.
- Mobile plan: Add 'Call' and 'Message' shortcut buttons in the header action row (alongside existing Edit/Message buttons). For 'Call', use Linking.openURL('tel:'+phone). On mobile these are higher-value actions than on web, so they deserve prominent placement with a phone icon.

### [LOW] No-show count badge / warning pill on header — missing
- Backend: none (data in GuestDetailProfile.no_show_count already fetched)
- Web behaviour: Web shows a yellow 'N no-show(s)' Pill badge alongside the visit count in the header when no_show_count > 0.
- Mobile plan: Add a conditional 'no-shows' Badge/StatusPill in the header view below the name when guest.no_show_count > 0. The no_show_count field is already present in GuestDetailProfile and available in detailQuery.data.guest.

### [LOW] Next visit / upcoming booking display — missing
- Backend: Returned in GET /api/venue/guests (list) as next_booking_date/next_booking_time; the detail route can also be checked for this field
- Web behaviour: Web shows 'Next visit' as a highlighted tile (sky-blue when scheduled) in the contact card stats grid, derived from listRow.next_booking_date / next_booking_time.
- Mobile plan: Add a 'Next booking' tile to the stats row, or show a dedicated 'Upcoming' banner card. The data may need to be passed from the calling list screen or included in the detail response.

## Bugs spotted
- [medium] BookingDetailPanel is rendered twice in ContactDetailPanel.tsx (lines 758–775 and 777–794). Both conditionals check the same relatedGuestHistoryBooking state and render identical JSX. The first one already has the correct key; the duplicate is dead code that will never render (React renders siblings in order, and the first one closes the panel when its onClose fires both unmounts simultaneously). This is clearly a copy-paste bug — the second block should be removed. (C:\Resneo-app\_reference\Resneo\src\components\dashboard\contacts\ContactDetailPanel.tsx)
- [medium] In app/(app)/client/[id].tsx, useSendGuestMessage is called with (guestId ?? '') — when guestId is undefined the hook receives an empty string, and the hook forms the URL /api/venue/guests//message which is an invalid route. If guestId resolves to undefined the mutation will send to a broken endpoint. Should guard with enabled: !!guestId or skip creating the mutation when guestId is undefined. (C:\Resneo-app\app\(app)\client\[id].tsx)
- [medium] GuestEditSheet.tsx uses a render-time side-effect pattern (calling setState directly during render body when target.id !== seededId). This is a React anti-pattern that can cause double-renders and in Strict Mode will fire twice, potentially resetting form state unexpectedly. Should be replaced with a useEffect seeding pattern or controlled via key= reset. (C:\Resneo-app\components\clients\GuestEditSheet.tsx)
- [high] GuestEditSheet.tsx sends marketing_opt_out as the logical inverse of marketing_consent (!marketing) rather than as an independently tracked preference. If a guest has both marketing_consent=false and marketing_opt_out=false (i.e., no record either way), saving a no-change Edit will set marketing_opt_out=true incorrectly. (C:\Resneo-app\components\clients\GuestEditSheet.tsx)
- [critical] In app/(app)/client/[id].tsx, tapping a booking history row calls router.push('/booking/'+bookingId), navigating away from the contact detail screen entirely. The user loses context and cannot return to the contact without pressing Back. Per the stated priority, booking history taps should open full expanded booking detail while keeping the contact screen visible (bottom-sheet or stack layer). (C:\Resneo-app\app\(app)\client\[id].tsx)
- [medium] GuestDetailResponse.communications is typed as unknown[] in types/guest-detail.ts. This prevents rendering any communication fields in the UI (message_type, channel, status, created_at are all unreachable without a cast). The web's GuestDetailResponse in _reference has a typed CommunicationLog interface for these rows. (C:\Resneo-app\types\guest-detail.ts)
- [medium] GuestDetailResponse.custom_field_definitions is typed as unknown[] in types/guest-detail.ts, so the custom fields returned by the API are entirely unusable. The type should be narrowed to CustomClientFieldDefinition[] to support a custom-fields editor. (C:\Resneo-app\types\guest-detail.ts)
- [medium] useMergeGuests in lib/queries/useContactsBulk.ts only sends target_guest_id and source_guest_ids to POST /api/venue/guests/merge, omitting the merged_profile and field_map body that the backend likely requires (the web always sends these). This means the mutation, if ever called from the app, will likely receive a validation error from the server. (C:\Resneo-app\lib\queries\useContactsBulk.ts)

## Design notes
- The header action row has 'Edit' and 'Message' as equal-weight secondary buttons. On mobile, 'Call' is typically the highest-frequency action for a client with a phone number and should get a prominent icon button (phone icon, teal/brand color) separate from Edit.
- The 4-tile stats grid (Bookings, No-shows, Cancellations, Deposits paid) uses flexBasis 47% which can cause uneven column widths at some screen sizes. Consider a fixed 2-column grid with exact widths or use a FlatList numColumns=2 for reliable layout.
- Booking history rows show booking_date as a plain string (the raw YYYY-MM-DD from the API). A formatted date (e.g. 'Mon 3 Feb') would be more scannable on mobile. The web uses formatCalendarDayShort() for this.
- The activity timeline section (timelineEvents) renders below booking history with no loading indicator of its own — when the timeline query is still loading, the section simply does not appear, which could make users think there is no activity. Add a skeleton row or spinner.
- Tags are shown as Badge chips (read-only) above the stats row with no affordance to add/remove them without tapping Edit. Consider adding a small '+' chip at the end of the tag row that opens the edit sheet focused on the tags field, matching the discoverability of the web's inline tag editor.
- The notes card is conditionally rendered (only when non-empty), meaning contacts with no notes give no signal that notes exist as a feature. Show a faint 'Add a note…' placeholder card always, matching the web's CustomerProfileNotesCard which is always present.
- The scroll view has paddingBottom: spacing['3xl'] which is adequate, but there is no pull-to-refresh (RefreshControl) wired up. Users expect pull-to-refresh on contact detail screens to reload the guest profile.
- The 'New booking for this client' Button is placed below the stats row, before the booking history. On the web it appears as a context-aware action bar button near the top of the contact card. On mobile, moving it into a fixed bottom action bar (or a FAB) would make it more accessible without requiring scroll.
- When the guest has no email or phone the 'Message' button is hidden but there is no visual explanation. A disabled 'Message' button with a tooltip or subtitle 'No contact details on file' would be more informative.
