## 13. Compliance & Intake Forms

**Parity:** Partial — the app fully OPERATES compliance day-to-day (dashboard, per-booking/per-client records, capture/send/void, booking-time 409 enforcement) but cannot AUTHOR or CONFIGURE any of it: no type creation, no field builder, no per-service requirements, no general-settings panel.

The runtime side of compliance is at strong parity and in places exceeds the web (in-app enable/disable toggle, SMS send channel, copy-link channel). The entire authoring/config side is missing and routed out to the web via WebBrowser: staff cannot create a compliance type, cannot add/edit/reorder/delete form fields (`ComplianceTypeEditorSheet` renders fields strictly read-only), cannot clone from the template library, cannot set general defaults, and cannot attach compliance requirements to services (`services.tsx` has only `payment_requirement`, zero compliance). Capture fidelity is also reduced: signature is typed-only (no drawn-signature control, no canvas dependency), file fields fall back to a plain text box, and `intro_markdown`/`help_text`/`default_value`/date-pickers are not rendered. The template list is discovery-based because `GET /types` is cookie-only, so never-used types are invisible and service/record counts are absent. Net: staff can run compliance but cannot set it up.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Compliance dashboard | `ComplianceDashboardView.tsx` | `app/(app)/manage/compliance.tsx` | Strong | All four sections + actions; app ADDS Enable/Disable + SMS channel |
| Compliance templates list | `ComplianceSettingsSection.tsx` TypesPanel (L48) | `app/(app)/manage/compliance-types.tsx` | Partial | Discovery-based list; omits never-used types and counts |
| Compliance type / form builder | `ComplianceFormBuilder.tsx` | `components/compliance/ComplianceTypeEditorSheet.tsx` | Minimal | Edits non-schema settings only; fields strictly read-only |
| Template library (clone) | `ComplianceSettingsSection.tsx` LibraryDialog (L173) | absent | Missing | No library hook or UI anywhere |
| Compliance general settings | `ComplianceSettingsSection.tsx` GeneralPanel (L286) | absent | Missing | App toggles only the boolean, not the nested config |
| Service compliance requirements | `ComplianceRequirementsEditor.tsx` | absent | Missing | `services.tsx` has zero compliance UI |
| Capture record sheet | `ComplianceCaptureDialog.tsx` + `ComplianceFormRenderer.tsx` | `components/compliance/ComplianceCaptureSheet.tsx` | Partial | Same channels/validation; lower fidelity (signature/file/date) |
| Record view / void sheet | `ComplianceRecordViewDialog.tsx` | `components/compliance/ComplianceRecordSheet.tsx` | Strong | Close port; app ADDS a "Captured by" channel row |
| Booking-detail compliance | `ComplianceSection.tsx` | `components/bookings/ComplianceCard.tsx` | Strong | Full port; app ADDS a copy-link channel |
| Client-detail compliance | `ContactComplianceSection.tsx` | `components/clients/ComplianceSection.tsx` | Strong | Records + audit subset; capture deferred to booking card |
| Calendar/list flag indicator | `ComplianceBookingIndicator.tsx` | `components/compliance/ComplianceFlagBadge.tsx` | Strong | Same state/colour model + 403 degradation |
| Booking-time enforcement | `CompliancePreCheckNotice.tsx` (public) + server 409 | `components/booking-wizard/ConfirmStep.tsx` | Strong | Catches 409, offers `override_compliance` retry |
| Public form completion page | `p/forms/[code]/PublicComplianceForm.tsx` | absent | Missing | Client-facing; out of scope for a staff app |
| In-app enable/disable | (web: Settings → Compliance → General checkbox) | `app/(app)/manage/compliance.tsx` | App-only | Dedicated Enable/Disable buttons; boolean only |

**Compliance dashboard** — Faithful port. All four sections present (Check-in today grouped by booking via `groupTodaysCheckIns` at L79-112, Missing for upcoming, Expiring soon, Awaiting submission) with Capture/Send-link/Renew/Resend/Revoke actions and `ENFORCEMENT_LABELS`. The app ADDS an admin Enable button on the plan-gated empty state (`handleEnableCompliance`, L183-202) and a Disable-with-confirm (`runDisable`, L358-377), both flipping only the boolean `compliance_records_enabled`, plus SMS as a send channel via a Sheet picker (`runSend`/`runResend` offer email|sms). Minor: "Check-in today" badge counts items while other counts count rows (cosmetic).

**Compliance templates list** — The app DISCOVERS type ids from Bearer-accessible payloads (dashboard expiring/missing/awaiting rows, form links, records) because `GET /types` is cookie-only (`useDiscoveredComplianceTemplates`, `useComplianceTypeManage.ts` L161-235). Never-used types never appear and a `discoveryIncomplete` warning is shown (`compliance-types.tsx` L125-129). Rows show category/result/validity/version (L166-180) but NO `service_requirement_count` or `record_count`. Web TypesPanel fetches `/types?include_archived=true` with both counts and exposes Create / Add-from-library / Edit / Archive / Restore; the app exposes only tap-to-open the editor sheet plus a "manage on the web" card (L192-209).

**Compliance type / form builder** — The app editor edits only NON-schema settings (name, category, validity mode, capture methods, form-link expiry, description) and archive/restore via PATCH `is_active` (`handleArchiveToggle`, L203-225). Result type is shown read-only. Form FIELDS render strictly read-only (`ComplianceTypeEditorSheet.tsx` L401-449) with an explicit note that they "can't be edited in the app." The web builder is a full dnd-kit drag-and-drop designer with a `COMPLIANCE_FIELD_TYPES` palette, per-field label/required/staff_only, options editor, intro markdown, `ResultMappingEditor`, live preview, `validateFormSchemaForType`, and create (`POST /types`) vs new-version (`POST /types/[id]/versions`). The app can neither create a type nor change any field.

**Capture record sheet** — Same two channels (`staff_web` / `client_walkin`) with staff-only fields hidden in client mode (`FieldInput` L56), required-field validation, `POST /records`. Fidelity is lower: signature renders as a single TextInput "Type full name as signature" (L125-150, with the comment "Signature is deferred to a link-based flow on v1"); file fields have no `'file'` case and fall through to the default TextInput branch (L152-176); `intro_markdown`/`description`/`help_text`/`default_value` are not rendered; date is a `numbers-and-punctuation` TextInput with a "DD/MM/YYYY" placeholder (L164/168). The web FormRenderer has a drawn SignaturePad, a file upload input, native `type="date"`, and renders intro/help/defaults.

**Record view / void sheet** — Close port: status pill, result badge, captured/expires/captured-by metadata, voided reason, per-field response table with `renderAnswer` mapping (the signature case at L50-52 already understands the `{method:'typed'}` object form), inline void-with-reason flow. The app ADDS a "Captured by" channel row. Essentially full parity.

**Booking-detail compliance** — Full port: requirements list with state pills and Capture/Send-link/View-record, `lock_blocked` note, all-records list, collapsible audit trail. The app ADDS a `manual_copy` (copy-link) channel (L217) alongside Email/SMS (L428-437) and uses both `/bookings/[id]/compliance` and `/guests/[id]/compliance` like the web.

**Client-detail compliance** — Read-only records list + collapsible audit trail per guest via `/guests/[id]/compliance` with tap-to-view (`ComplianceRecordSheet`). Intentionally omits capture/send-link (deferred to the booking card), matching the web contact-panel records subset. Solid parity for what it covers.

**Calendar/list flag indicator** — `ComplianceFlagDot` + `ComplianceFlagBadge` fed by `useComplianceBookingFlags` (POST `/booking-flags`), used in `BookingRow` and `AppointmentBlock`, with the same missing/expired/expiring_soon/satisfied colour states and graceful 403 degradation.

**Booking-time enforcement** — Staff new-booking confirm catches the 409 with `errorCode` `COMPLIANCE_REQUIREMENT_UNMET` (`ConfirmStep.tsx` L268), shows the message, and offers an `override_compliance:true` retry (L242). The web `CompliancePreCheckNotice` is the PUBLIC client booking-page pre-check (out of scope for a staff app); noted only for completeness.

**In-app enable/disable** — The app gives admins a dedicated Enable button on the plan-gated empty state (L231-245) and a Disable-with-confirm at the bottom (L668-678 → `runDisable`), both flipping `compliance_records_enabled`. Convenient surfacing the web buries in a settings tab — but it toggles only the boolean, not the rest of the General config.

### Gaps & deficiencies

#### Critical

- **Cannot create a compliance type in the app** — _function · critical_
  - **Web:** Settings → Compliance → Templates & types has "Create custom type" which opens the full `ComplianceFormBuilder` in `mode='new'` and POSTs to `/api/venue/compliance/types` with name/category/result_type/validity/capture_methods/form_link_expiry_days/form_schema.
  - **App:** Absent. `compliance-types.tsx` only lists discovered templates and opens them for limited (non-schema) editing; the "On the web dashboard" card (L192-209) explicitly says creating new templates is web-only. There is no create mutation in `useComplianceTypeManage.ts` (only `useUpdateComplianceTemplate` / PATCH).
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormBuilder.tsx` (mode `'new'`, POST `/types`); `app/(app)/manage/compliance-types.tsx` L192-209; `lib/queries/useComplianceTypeManage.ts` L18-24 (documents POST `/types` as cookie-only — bare `createClient`).
  - **Fix:** Make backend `POST /api/venue/compliance/types` Bearer-capable, then add a "create" mode to `ComplianceTypeEditorSheet` (or a new builder sheet) plus a `useCreateComplianceTemplate` mutation in `useComplianceTypeManage.ts` mirroring `useUpdateComplianceTemplate`. Depends on the field builder below. Add a "Create custom type" Button to `compliance-types.tsx` gated on `isAdmin`.

- **Form-field builder is entirely read-only (no add/edit/reorder/delete fields)** — _function · critical_
  - **Web:** `ComplianceFormBuilder` gives a field-type palette (text, textarea, select, multiselect, date, signature, file via `COMPLIANCE_FIELD_TYPES`), drag-to-reorder via dnd-kit, per-field label/Required/Staff-only toggles, options editor, intro markdown, pass/fail `ResultMappingEditor`, live client preview, and save-time `validateFormSchemaForType`. Saving creates a new immutable version (POST `/types/[id]/versions`).
  - **App:** Absent. `ComplianceTypeEditorSheet` renders fields as a static read-only list (label + `FIELD_TYPE_LABELS` + required/staff_only, L401-449) with a note that fields are managed on the web form builder. No add/edit/reorder/delete and no version-create mutation.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormBuilder.tsx`; `_reference/Resneo/src/lib/compliance/form-schema.ts` (field schema + `validateFormSchemaForType`); `components/compliance/ComplianceTypeEditorSheet.tsx` L401-449; `useComplianceTypeManage.ts` L22 (versions route documented cookie-only).
  - **Fix:** Build a mobile field editor — a vertical list of field cards with up/down reorder (`draggable-flatlist` as a richer v1), an "Add field" chip row keyed off the field types, per-field label Input + Required/Staff-only switches, and an options editor for select/multiselect. Port `validateFormSchemaForType` from `_reference/Resneo/src/lib/compliance/form-schema.ts`. Add a `useCreateComplianceVersion` mutation (POST `/types/[id]/versions`, confirm Bearer support first) and wire "Save new version" into the editor sheet.

- **No per-service compliance requirements editor** — _function · critical_
  - **Web:** `ComplianceRequirementsEditor` (Settings → Compliance → per-service accordion AND inline in the service editor) lists a service's required compliance types, adds a requirement (POST `/requirements` with service_id/compliance_type_id/enforcement), changes enforcement (PATCH `/requirements/[id]`) and removes it (DELETE `/requirements/[id]`); enforcement options `warn_staff`/`warn_client`/`block_online`/`block_all`.
  - **App:** Absent. There is no requirements editor anywhere. `app/(app)/manage/services.tsx` has only `payment_requirement` and ZERO compliance UI; no `useComplianceRequirements` hook exists in `lib`. The booking card READS resolved requirements but nothing lets staff create/edit/delete a service's requirements.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceRequirementsEditor.tsx`; `_reference/Resneo/src/app/dashboard/settings/sections/ComplianceSettingsSection.tsx` RequirementsPanel (L248); `app/(app)/manage/services.tsx` (only `payment_requirement` at L75/171/445/1041); no compliance-requirements hook in `lib`.
  - **Fix:** Add a `ComplianceRequirementsEditor` sheet/section: a new `lib/queries/useComplianceRequirements.ts` with GET (`?appointment_service_id=…`) + POST/PATCH/DELETE mutations. Surface it inside the app's service editor or as a dedicated "Service requirements" screen reachable from `compliance-types.tsx`, mirroring the web RequirementsPanel. Confirm the `/requirements` routes are Bearer-capable first.

#### High

- **No compliance general-settings panel (defaults: capture method, channel, reminder cadence, link expiry, lock period, auto-send)** — _function · high_
  - **Web:** GeneralPanel sets `default_capture_method`, `default_form_link_channel`, `reminder_cadence_days`, `form_link_expiry_days` (venue default), `lock_period_hours` (default for new requirements) and `auto_send_on_booking`, persisted via PATCH `/api/venue/feature-flags` with body `{ compliance_records_enabled, compliance: config }` where `compliance` is a nested object on `venues.feature_flags.compliance`.
  - **App:** Absent. The app only toggles the boolean `compliance_records_enabled` (`compliance.tsx` `handleEnableCompliance`/`runDisable`) and never reads/writes the nested config. NOTE: the app's `VenueFeatureFlagsRaw` (`types/venue.ts` L31-33) is `Partial<Record<AppointmentsFeatureFlagKey, boolean>>` — booleans only, NO `compliance` config field — so `useUpdateFeatureFlags` CANNOT send the config object until the type is widened. (This corrects the prior agent's note that the hook "already accepts" the config.)
  - **Evidence:** `_reference/Resneo/src/app/dashboard/settings/sections/ComplianceSettingsSection.tsx` GeneralPanel (L286; PATCH body L315); `_reference/Resneo/src/lib/compliance/config.ts` (`complianceConfigSchema` + `DEFAULT_COMPLIANCE_CONFIG` L25-52); `app/(app)/manage/compliance.tsx` (boolean only); `types/venue.ts` L23-33; `lib/queries/useVenueSettings.ts` `useUpdateFeatureFlags` (L113, patch typed `VenueFeatureFlagsRaw`).
  - **Fix:** First widen `VenueFeatureFlagsRaw` (`types/venue.ts`) to carry an optional nested `compliance` config (port `ComplianceConfig` from `_reference/Resneo/src/lib/compliance/config.ts`). Then add a "Compliance settings" sheet/screen that reads `useFeatureFlags()` `raw.compliance`, renders the six controls (chips/segmented for capture method + channel, numeric Inputs for cadence/expiry/lock, a Switch for auto-send) defaulting from `DEFAULT_COMPLIANCE_CONFIG`, and saves via `useUpdateFeatureFlags()` passing `{ compliance_records_enabled, compliance }`. Link it from `compliance.tsx` (admin only).

- **No "Add from library" template cloning** — _function · high_
  - **Web:** LibraryDialog (GET `/api/venue/compliance/library`) lists starter templates with category/validity/field-count and clones one in a click (POST `/library/[slug]/clone`), instantly creating a ready-to-use type.
  - **App:** Absent. No library UI; the web-note card (`compliance-types.tsx` L192-209) tells the user to do it on the web. No `useComplianceLibrary`/`useCloneComplianceTemplate` hook exists.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/settings/sections/ComplianceSettingsSection.tsx` LibraryDialog (L173); `app/(app)/manage/compliance-types.tsx` L192-209; `useComplianceTypeManage.ts` L23 (documents `/library` + `/library/[slug]/clone` as cookie-only).
  - **Fix:** After making `/library` + `/library/[slug]/clone` Bearer-capable, add `useComplianceLibrary` (GET) + `useCloneComplianceTemplate` (POST) to `useComplianceTypeManage.ts` and an "Add from library" Sheet listing templates with an Add button. Invalidate `queryKeys.compliance.all()` on clone so the discovered-templates list refreshes.

- **Template list omits never-used types and service/record counts** — _function · high_
  - **Web:** TypesPanel calls `/types?include_archived=true` and shows the COMPLETE list including archived and never-used types, each with `service_requirement_count` and `record_count`.
  - **App:** Lists only templates DISCOVERED from compliance activity (dashboard expiring/missing/awaiting rows, form links, captured records); a type with no activity is invisible. Rows show category/result/validity/version but NO service or record counts. A "this list may be missing templates" warning shows when discovery is incomplete.
  - **Evidence:** `lib/queries/useComplianceTypeManage.ts` `useDiscoveredComplianceTemplates` (L161-235, with the comment that never-used templates "will not appear"); `app/(app)/manage/compliance-types.tsx` L125-190; `_reference/Resneo/src/app/dashboard/settings/sections/ComplianceSettingsSection.tsx` TypesPanel (L48).
  - **Fix:** Make GET `/api/venue/compliance/types` Bearer-capable and replace the discovery hack with a direct list query (new `useComplianceTemplatesList` → GET `/types?include_archived=true`). Render `service_requirement_count` and `record_count` per row. Drop the `discoveryIncomplete` warning once the real list endpoint is used.

- **Signature capture is typed-only (no drawn signature)** — _function · high_
  - **Web:** `ComplianceFormRenderer` renders a SignatureField with a Draw/Type toggle; "Draw" uses a real SignaturePad canvas producing a data URL stored as `{method:'drawn', data, signed_at}`; "Type" stores `{method:'typed', data, signed_at}`. Result type `'signed'` requires a signature field.
  - **App:** `ComplianceCaptureSheet.FieldInput` renders signature as a single TextInput ("Type full name as signature", L125-150); a drawn signature is impossible and the value submitted is a bare string, NOT the `{method,...}` object the web/record-view expect. No drawn-signature control and no signature-canvas dependency exist.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormRenderer.tsx` SignaturePad (L273-292, method `'drawn'`/`'typed'`); `components/compliance/ComplianceCaptureSheet.tsx` L125-150; `components/compliance/ComplianceRecordSheet.tsx` L50-52 (already reads the `{method:'typed'}` object shape); no signature-canvas in `package.json`.
  - **Fix:** Add a drawn-signature control (`react-native-signature-canvas` or a Skia canvas) for `field.type==='signature'`, emitting `{ method:'drawn', data, signed_at }`. At minimum, change the typed fallback to submit `{ method:'typed', data, signed_at }` (matching the web payload and `ComplianceRecordSheet`'s renderer) rather than a bare string.

#### Medium

- **File-upload fields cannot be captured in-app** — _function · medium_
  - **Web:** `ComplianceFormRenderer` renders a file input (FileField) that uploads to the compliance-files bucket and stores `{ storage_path, file_name, mime_type, file_size_bytes }`; result type `'file_uploaded'` requires a file field.
  - **App:** `ComplianceCaptureSheet` renders a `'file'` field as a plain TextInput — there is no `'file'` case in `FieldInput`, so it falls through to the default branch (L152-176) and no document can be attached when staff capture a record.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormRenderer.tsx` FileField (L209-215, 316-355); `components/compliance/ComplianceCaptureSheet.tsx` `FieldInput` has no `'file'` case (defaults to TextInput at L152-176).
  - **Fix:** Add a `'file'` case to `ComplianceCaptureSheet.FieldInput` using `expo-document-picker`/`expo-image-picker`, upload to a staff capture file endpoint (mirror the web `fileUploadUrl` flow), and store the FileResponse shape. If no staff upload endpoint exists yet, at minimum render file fields as disabled with a "capture via client link" hint instead of a misleading text box.

- **Capture sheet ignores intro markdown, help text and default values** — _ui · medium_
  - **Web:** `ComplianceFormRenderer` shows `schema.description`, sanitized `intro_markdown`, per-field `help_text`, and seeds `default_value` (including date "today").
  - **App:** `ComplianceCaptureSheet` renders only labels + inputs; it never shows `intro_markdown`/`description`/`help_text` and does not seed `default_value`, so author guidance is lost and pre-fills don't apply. `ComplianceFormField` in `types/compliance.ts` omits `help_text` and `default_value` entirely.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormRenderer.tsx` L70-117 (default_value/introHtml/help_text); `components/compliance/ComplianceCaptureSheet.tsx` (FieldInput renders label+control only); `types/compliance.ts` `ComplianceFormField` (L65-73, no help_text/default_value).
  - **Fix:** Extend `ComplianceFormField` in `types/compliance.ts` with `help_text` and `default_value`, render `schema.description` + `intro_markdown` (a lightweight markdown-to-Text renderer) at the top of `ComplianceCaptureSheet`'s body, show `help_text` under each field label, and initialize responses from `default_value` (resolve "today" for date fields, as the web does at FormRenderer L71).

- **No pass/fail result_mapping support in capture** — _function · medium_
  - **Web:** For `pass_fail` types the builder defines a staff-only result select with pass/fail value buckets (`ResultMappingEditor`), and the server derives result (`'pass'`/`'fail'`/`'inconclusive'`) from responses via `computeResult`. Staff capturing in `staff_web` mode pick the result.
  - **App:** The app cannot author `pass_fail` mappings (builder is read-only) and the capture sheet has no special handling; it can still render a staff-only select if a web-built form contains one, so in-app capture of a web-authored `pass_fail` type works only when the result field is a plain select. The whole `pass_fail` authoring loop is web-only. `types/compliance.ts` carries no `result_mapping`.
  - **Evidence:** `_reference/Resneo/src/lib/compliance/form-schema.ts` (`computeResult` + `result_mapping`); `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormBuilder.tsx` `ResultMappingEditor` (resultMapping state L116, `result_mapping` L155); no `result_mapping` in `types/compliance.ts` or any app builder.
  - **Fix:** Lower priority — covered by the builder gap. When the field builder is added, include the `ResultMappingEditor` (staff-only select + pass/fail buckets) and carry `result_mapping` in the `form_schema` payload so `pass_fail` types can be authored and captured in-app.

#### Low

- **Date fields use free-text entry instead of a date picker** — _ui · low_
  - **Web:** `ComplianceFormRenderer` renders date fields with a native `<input type="date">` producing `YYYY-MM-DD` (FormRenderer L193).
  - **App:** `ComplianceCaptureSheet` renders date fields as a `numbers-and-punctuation` TextInput with a "DD/MM/YYYY" placeholder (L164/168); no calendar and no enforced format, so a free-typed value may not match the server's `YYYY-MM-DD` validation.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormRenderer.tsx` case `'date'` (L193); `components/compliance/ComplianceCaptureSheet.tsx` L152-176 (date → TextInput, `keyboardType` numbers-and-punctuation).
  - **Fix:** Use the app's existing date-picker primitive (e.g. `MonthDatePicker` used in booking-wizard) for `field.type==='date'` in `ComplianceCaptureSheet` and submit `YYYY-MM-DD` to satisfy the server's `/^\d{4}-\d{2}-\d{2}$/` rule.

- **Result type label set differs slightly from the web builder** — _content · low_
  - **Web:** Builder `RESULT_TYPE_LABELS` read "Pass / fail (staff decide a result)", "Signed (requires a signature)", "Completed (no result)", "File upload (requires a file)".
  - **App:** `complianceTypeLabels.ts` splits these into `RESULT_TYPE_LABELS` ("Pass / fail", "Signed", "Completed", "File upload") + separate `RESULT_TYPE_DESCRIPTIONS`; equivalent meaning, but the read-only result-type box pairs label+description instead of the web's single parenthetical dropdown label.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/compliance/ComplianceFormBuilder.tsx` `RESULT_TYPE_LABELS`; `components/compliance/complianceTypeLabels.ts` L15-28 (`RESULT_TYPE_LABELS` + `RESULT_TYPE_DESCRIPTIONS`).
  - **Fix:** Minor — acceptable. If/when the builder is added to the app, keep dropdown wording aligned with the web's parenthetical labels. No change needed for the current read-only view (the label+description split is arguably clearer).

### Investigated — not a gap

- **Public form completion page** (`p/forms/[code]/PublicComplianceForm.tsx`) — Client-facing form a guest completes from an emailed/SMS link, not a staff surface. The staff app only ISSUES the link (which it does). Intentional exclusion, listed for completeness.

### Recommended work (ordered)

1. **Make the authoring routes Bearer-capable (backend prerequisite).** Confirm/add Bearer support in `C:\Resneo` for `POST /types`, `GET /types` (list), `POST /types/[id]/versions`, `GET /library` + `POST /library/[slug]/clone`, and the `/requirements` CRUD routes — all currently bare `createClient()` (cookie-only) per `useComplianceTypeManage.ts` L18-23. Everything below depends on this.
2. **Replace the template discovery hack with a real list.** Add `useComplianceTemplatesList` (GET `/types?include_archived=true`) and render `service_requirement_count` + `record_count` per row in `compliance-types.tsx`; drop the `discoveryIncomplete` warning. (High)
3. **Build the mobile field editor.** Field cards with reorder, "Add field" palette, per-field label/Required/Staff-only, options editor; port `validateFormSchemaForType` from `_reference/Resneo/src/lib/compliance/form-schema.ts`; add `useCreateComplianceVersion` (POST `/types/[id]/versions`). Wire into `ComplianceTypeEditorSheet`. (Critical)
4. **Add type creation.** A "create" mode + `useCreateComplianceTemplate` (POST `/types`) in `useComplianceTypeManage.ts`, plus a "Create custom type" admin button in `compliance-types.tsx`. Reuses the field editor from step 3. (Critical)
5. **Add the per-service requirements editor.** New `lib/queries/useComplianceRequirements.ts` (GET + POST/PATCH/DELETE `/requirements`) and a `ComplianceRequirementsEditor` surfaced in the service editor and/or from `compliance-types.tsx`. (Critical)
6. **Widen feature-flags typing + add the general-settings panel.** Extend `VenueFeatureFlagsRaw` (`types/venue.ts` L31-33) with an optional nested `compliance` config (port `ComplianceConfig`); add a "Compliance settings" screen reading `useFeatureFlags().raw.compliance` and saving via `useUpdateFeatureFlags()` with `{ compliance_records_enabled, compliance }`; link from `compliance.tsx` (admin only). (High)
7. **Add "Add from library" cloning.** `useComplianceLibrary` (GET) + `useCloneComplianceTemplate` (POST `/library/[slug]/clone`) in `useComplianceTypeManage.ts` and an "Add from library" Sheet; invalidate `queryKeys.compliance.all()` on clone. (High)
8. **Raise capture fidelity in `ComplianceCaptureSheet`:** (a) drawn-signature control emitting `{method:'drawn',...}`, and fix the typed fallback to emit `{method:'typed',...}` not a bare string (High); (b) a `'file'` case with `expo-document-picker` upload (Medium); (c) render `description`/`intro_markdown`/`help_text` and seed `default_value` after extending `ComplianceFormField` in `types/compliance.ts` (Medium); (d) swap the date free-text TextInput for `MonthDatePicker` emitting `YYYY-MM-DD` (Low).
9. **Carry `result_mapping` through the builder + capture** for `pass_fail` types once step 3 lands (port `ResultMappingEditor`). (Medium)
