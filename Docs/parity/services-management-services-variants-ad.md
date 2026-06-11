# Services management (services, variants, add-ons) — parity ~52%

## App files
- C:\Resneo-app\app\(app)\manage\services.tsx
- C:\Resneo-app\components\manage\VariantsEditorSheet.tsx
- C:\Resneo-app\components\manage\AddonLinksSheet.tsx
- C:\Resneo-app\types\services-manage.ts
- C:\Resneo-app\types\addon-groups.ts
- C:\Resneo-app\lib\queries\useServicesManage.ts
- C:\Resneo-app\lib\queries\useAddonGroups.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\appointment-services\AppointmentServicesView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\appointment-services\StaffServiceOverrideModal.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\addons\AddonsLibraryView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\appointment-services\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\addon-groups\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\addon-groups\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\practitioner-service-overrides\route.ts
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\appointment-services\appointment-service-form-values.ts
- C:\Resneo-app\_reference\Resneo\src\components\dashboard\appointment-services\AppointmentServiceFormFields.tsx

## Summary
The app page lists appointment services with an expand-to-view detail pattern, provides a full-featured create/edit sheet (name, description, duration, buffer, payment requirement, price, deposit, colour picker, booking rules, practitioner assignment, active toggle), a separate VariantsEditorSheet for service options (name, duration, price, deposit only), and an AddonLinksSheet for linking existing add-on groups to a service. It calls GET/POST/PATCH /api/venue/appointment-services and GET /api/venue/addon-groups. The web does all of the above plus: service deletion (DELETE /api/venue/appointment-services); a full Add-ons library tab with CRUD for add-on groups and their individual add-ons (POST/PATCH /api/venue/addon-groups and PATCH/DELETE /api/venue/addon-groups/[id]); per-service custom availability schedule (custom_working_hours / custom_availability_enabled); per-service processing-time blocks; per-staff-member field-level service overrides via StaffServiceOverrideModal (PATCH /api/venue/practitioner-service-overrides); staff_may_customize_* permission toggles (admin only); per-variant is_active, description, buffer_minutes, and processing_time_blocks; inline calendar-link toggle from the service list (PUT /api/venue/practitioner-services); creating a new calendar from within the service form; and non-admin staff seeing which of their managed calendars offer each service and toggling that in-line. The app has no delete capability, no add-on group management, no custom availability, no processing-time blocks, no staff overrides, and missing variant fields.

## Recommendation
The app has a solid foundation for the services-only portion of this page — create, edit, variants linking, and add-on group linking all work via the correct API routes. The six highest-priority gaps to close are: (1) Service deletion — straightforward one-mutation addition that admins will quickly miss; add a useDeleteService mutation, a destructive confirmation Alert, and a 'Delete service' button in the ServiceRow expanded view (admin-only). (2) Add-on group library CRUD — the largest missing feature; build a new 'Add-ons' tab using a TabBar and an AddonGroupEditorSheet that fully manages groups and their individual add-ons, calling POST /api/venue/addon-groups and PATCH/DELETE /api/venue/addon-groups/[id]; the response shapes are already typed in types/addon-groups.ts. (3) Variant additional fields — extend VariantsEditorSheet to include description, buffer_minutes, and is_active per variant row; these are already accepted by the API. (4) Staff_may_customize flags — add the seven admin-only Switch rows to the edit/create sheet and include them in the PATCH payload so admins can delegate per-field overrides to staff. (5) Staff service overrides — once the flags are stored, build a StaffServiceOverrideSheet for non-admin users to edit their permitted custom_* fields via PATCH /api/venue/practitioner-service-overrides. (6) Custom availability per service — reuse the existing OpeningHoursEditor for the admin-only custom schedule section, replacing the current web-link-out notice. Processing-time blocks, the inline calendar toggle for non-admins, and calendar-creation-from-form can follow as lower-priority polish once the above are done.

## Gaps (11)

### [HIGH] Delete service — missing
- Backend: DELETE /api/venue/appointment-services
- Web behaviour: Admin or creator-staff can delete a service. Calls DELETE /api/venue/appointment-services with JSON body {id}. Guarded by upcoming-booking check (409 if blocked). Confirmation dialog shown with service name before delete executes.
- Mobile plan: Add a useDeleteService mutation in lib/queries/useServicesManage.ts sending DELETE to /api/venue/appointment-services. In the ServiceRow expanded view, add a 'Delete' button (admin-only, or creator-staff). Present a native Alert.alert confirmation with the service name. On confirm call mutate; on 409 surface the 'upcoming bookings' error message. Invalidate queryKeys.services.all() and queryKeys.appointments.all() on success.

### [HIGH] Add-on groups CRUD (create, edit, delete/archive individual add-on groups and their add-ons) — missing
- Backend: POST /api/venue/addon-groups, PATCH /api/venue/addon-groups/[id], DELETE /api/venue/addon-groups/[id]
- Web behaviour: Separate 'Add-ons' tab on the web page. Calls GET /api/venue/addon-groups?include_inactive=true to load library. POST /api/venue/addon-groups to create a group with its addons array inline. PATCH /api/venue/addon-groups/[id] to update. DELETE /api/venue/addon-groups/[id] to delete (auto-archives if bookings exist). AddonGroupEditor component handles name, prompt_to_client, description, selection_type (single/multi), min_select, max_select, hidden_from_online, is_active, and an inline list of add-ons (each with name, description, additional_price_pence, additional_duration_minutes, is_active).
- Mobile plan: Add a second tab ('Add-ons') to the services screen using a top TabBar component. Build an AddonGroupEditorSheet component (similar pattern to VariantsEditorSheet) that handles the full group + addons form. Add useCreateAddonGroup, useUpdateAddonGroup, useDeleteAddonGroup mutations in a new lib/queries/useAddonGroups.ts or extend the existing file. The sheet needs: name, prompt text, selection type radio, min/max select numeric inputs, hidden_from_online toggle, is_active toggle, and an inline list of add-ons with expand/collapse (each: name, description, price, duration, is_active). Delete should call DELETE /api/venue/addon-groups/[id]; on 409 treat as archive success.

### [MEDIUM] Custom per-service availability schedule (custom_availability_enabled + custom_working_hours) — missing
- Backend: PATCH /api/venue/appointment-services (fields: custom_availability_enabled, custom_working_hours)
- Web behaviour: Admin-only section in the service edit form. Toggle enables custom_availability_enabled; when on, a weekly schedule editor (ServiceCustomScheduleV2 with version:2 rules) is presented. Sent as part of PATCH /api/venue/appointment-services. The API validates that at least one rule exists when enabled. The app currently shows a static notice: 'Custom availability windows … are managed on the web dashboard.'
- Mobile plan: Reuse the OpeningHoursEditor component (already exists at components/manage/OpeningHoursEditor.tsx) as the inner schedule editor. Add a Switch for custom_availability_enabled in the edit sheet (admin only). When toggled on, reveal an OpeningHoursEditor seeded from the existing custom_working_hours value. Serialize as { version: 2, rules: [...] }. Add custom_availability_enabled and custom_working_hours to UpdateServiceInput in types/services-manage.ts and pass through useUpdateService. Remove the static web-dashboard notice when the admin is using the edit form.

### [MEDIUM] Per-service processing-time blocks — missing
- Backend: POST/PATCH /api/venue/appointment-services (field: processing_time_blocks)
- Web behaviour: Admin-only section via ProcessingTimeTimelineEditor. Sends processing_time_blocks array on POST/PATCH /api/venue/appointment-services. Each block has a type and duration. Validated against service duration. Not displayed or editable anywhere in the app.
- Mobile plan: Low-complexity feature to defer until after custom availability is done. Add processing_time_blocks to UpdateServiceInput/CreateServiceInput, add a 'Processing time' section in the edit sheet (admin only) with add/remove block rows (block type select + duration). Can be deferred to a follow-up.

### [MEDIUM] Staff service overrides (per-calendar custom name/description/duration/buffer/price/deposit/colour) — missing
- Backend: PATCH /api/venue/practitioner-service-overrides
- Web behaviour: Non-admin staff who offer a service and where the admin has set staff_may_customize_* flags see an 'Edit your settings' button on each service row. Opens StaffServiceOverrideModal which lets them enter per-calendar overrides. Calls PATCH /api/venue/practitioner-service-overrides with {service_id, calendar_id?, custom_*} fields. Only fields allowed by the admin flags are editable.
- Mobile plan: Add a useUpdateServiceOverride mutation. In ServiceRow, when isAdmin is false and staffMayCustomizeAny(service) and the service is offered by the logged-in practitioner, show an 'Edit your settings' button. Build a StaffServiceOverrideSheet that renders only the permitted custom_* fields (gated by staff_may_customize_* flags from the service row). The app already loads practitioner_services links so override detection can be done client-side.

### [MEDIUM] Staff_may_customize_* permission flags (admin sets which fields non-admin staff can override) — missing
- Backend: POST/PATCH /api/venue/appointment-services (fields: staff_may_customize_*)
- Web behaviour: Admin-only section in the service create/edit form. Seven boolean checkboxes (name, description, duration, buffer, price, deposit, colour). Sent as staff_may_customize_* fields on POST/PATCH /api/venue/appointment-services. Not present anywhere in the app form.
- Mobile plan: Add StaffMayCustomize state (7 booleans) to the edit/create sheet, gated to isAdmin. Add a 'Staff overrides' section with 7 Switch rows. Add staff_may_customize_* fields to UpdateServiceInput/CreateServiceInput and include them in handleSave payload when isAdmin is true.

### [MEDIUM] Variant additional fields: description, buffer_minutes, is_active, processing_time_blocks — partial
- Backend: PATCH /api/venue/appointment-services (variants array: description, buffer_minutes, is_active, processing_time_blocks)
- Web behaviour: The web variant form includes description (textarea), buffer_minutes (numeric), is_active (toggle), and processing_time_blocks (timeline editor). All these are sent in the variants array on POST/PATCH /api/venue/appointment-services. The app VariantsEditorSheet only handles name, duration_minutes, price_pence, deposit_pence — the other four fields are absent.
- Mobile plan: Extend the DraftVariant type in VariantsEditorSheet.tsx to include description (string), buffer (string), and isActive (boolean). Add Input fields for description and buffer in the expanded variant card, and a Switch for is_active. Pass these through VariantWriteInput in useServicesManage.ts. processing_time_blocks can be deferred.

### [MEDIUM] Non-admin inline calendar-service toggle (toggle which calendars offer a service without opening edit form) — missing
- Backend: PUT /api/venue/practitioner-services
- Web behaviour: Non-admin staff see per-service rows with a checkbox per calendar they manage. Toggling calls PUT /api/venue/practitioner-services with {practitioner_id, service_ids: [...]} replacing the full set for that calendar. This lets non-admin staff enable/disable a service on their calendar without editing the full service.
- Mobile plan: For non-admin users in the ServiceRow expanded view, render a list of the practitioner's own calendar(s) with a Switch per calendar showing whether it currently offers the service. On toggle, call a useToggleCalendarService mutation (PUT /api/venue/practitioner-services). Already have the practitioner_services link data from useManagedServices query.

### [LOW] Add-on library: show which services use each add-on group (usedBy list) — missing
- Backend: GET /api/venue/addon-groups (field: service_links already returned)
- Web behaviour: The Add-ons library tab shows a 'Used by (N)' section per group with clickable service name pills, derived from the service_links array in GET /api/venue/addon-groups response. Helps admins see which services would be affected before editing.
- Mobile plan: The service_links data is already present in AddonGroupsResponse (types/addon-groups.ts). In the future add-on library tab/sheet, render a 'Used by' line below each group's metadata using the service_links array cross-referenced with the service list.

### [LOW] Show archived / inactive add-on groups toggle (include_inactive query param) — missing
- Backend: GET /api/venue/addon-groups (query param: include_inactive)
- Web behaviour: A 'Show archived groups' checkbox controls ?include_inactive=true/false sent to GET /api/venue/addon-groups.
- Mobile plan: When add-on group library tab is built, pass include_inactive param to useAddonGroups hook (already accepts enabled flag but not the param). Add an includeInactive param to useAddonGroups and toggle it via a Switch in the add-ons tab header.

### [LOW] Create new calendar from within the service form — missing
- Backend: POST /api/venue/practitioners
- Web behaviour: Admin-only 'Add calendar' button inside the calendar-assignment section of the service create/edit form. Calls POST /api/venue/practitioners with {name, is_active, working_hours, break_times, days_off}. The new calendar id is immediately added to practitioner_ids so the service can be saved linked to it.
- Mobile plan: Low-priority convenience feature — staff can go to team settings to add a calendar first. Could add a small 'New calendar' link row at the bottom of the 'Offered by' chip list that opens a minimal bottom sheet (just a name input) and calls POST /api/venue/practitioners, then refreshes the practitioners list and pre-selects the new id.

## Bugs spotted
- [medium] In VariantsEditorSheet, state is seeded via a render-phase side effect (direct setState calls inside the render body guarded by `target.serviceId !== seededId`). In React 18 strict mode and concurrent rendering this pattern is discouraged and can cause extra renders or infinite update loops. The same pattern is repeated in AddonLinksSheet. Both sheets should seed state in a useEffect or use a key-based reset instead. (C:\Resneo-app\components\manage\VariantsEditorSheet.tsx)
- [low] AddonLinksSheet shows the empty-state message 'Create add-on groups on the web dashboard' when there are zero active groups, but the add-on groups endpoint (GET /api/venue/addon-groups) is only fetched when isAdmin is true (useAddonGroups(isAdmin) in services.tsx). If isAdmin is false, addonGroupsQuery.data is undefined and the AddonLinksSheet will always show the empty message even if groups exist, making it impossible for non-admin staff to link add-ons (which is also blocked server-side, but the misleading empty state is the UI bug). (C:\Resneo-app\app\(app)\manage\services.tsx)
- [low] The 'Edit', 'Options', and 'Add-ons' action buttons in the ServiceRow expanded view use flex:1 in a row with no maxWidth, but on narrow phones with three buttons the labels can truncate. The 'Options (N)' label especially with a two-digit count can be as long as 'Options (10)' and all three buttons will compete for the same width without any wrapping fallback. (C:\Resneo-app\app\(app)\manage\services.tsx)
- [low] useReplaceServiceVariants sends variants with `sort_order: variant.sort_order ?? index`, but the VariantsEditorTarget.variants type only has {id, name, duration_minutes, price_pence, deposit_pence} — sort_order is never present on drafts coming from a freshly-opened target, so all variants always get index-based sort_order on save. This is functionally correct but means any pre-existing server-side sort_order on the original variants is discarded rather than preserved when the user saves without reordering. (C:\Resneo-app\lib\queries\useServicesManage.ts)

## Design notes
- The three action buttons ('Edit', 'Options (N)', 'Add-ons (N)') in the expanded service row sit in a single flex row with flex:1 each. On a 375 px screen with two-digit variant/addon counts the text truncates. Wrapping them to two rows (Edit full-width on first row, Options + Add-ons side-by-side on second) would be more thumb-friendly and resistant to label length.
- The services list uses a single-accordion pattern (only one service can be expanded at a time). For venues with 10+ services this means constant tapping to compare services. Consider a flat list where each card always shows the key metadata (colour dot, duration, price) and the expand only reveals the edit/options/addons actions — reducing the tap count for the most common admin task.
- The Sheet for create/edit is set to maxHeight 88% with an internal ScrollView. On shorter phones (SE-class, ~667px) the form is long enough that 'Save' can be pushed off screen before the user scrolls to the bottom. The sticky footer pattern (fixed-bottom action bar outside the scroll area) that the sheet already partially uses should be verified with a tall keyboard up — the sheet height may not correctly contract when the keyboard is shown.
- The calendar colour swatch picker uses 36x36 circles with a 2.5 border when selected. The tap target meets the 44pt minimum individually, but the gap between swatches (spacing.sm ~8pt) makes fat-finger misselects likely. Increasing the swatch to 44x44 or adding a visible selected ring outside the circle boundary would improve accuracy.
- The variant editor has no reorder UI — variants are always saved in the order they were added or last displayed. The web has a drag-handle sort. On mobile a simple 'Move up / Move down' pair of icon buttons per expanded variant would preserve sort_order without requiring a drag library.
- The Add-ons tab is entirely absent from the mobile screen; there is no navigation entry point at all. The app currently has a single 'Services' screen. When the add-on group CRUD is implemented, add a persistent TabBar at the top of the screen (Services | Add-ons) matching the web's own tab pattern, synced to URL so deep-links work.
