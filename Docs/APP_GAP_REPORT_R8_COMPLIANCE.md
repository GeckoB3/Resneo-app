# Resneo — Mobile App vs Web: Compliance Feature Parity Audit (R8)

**Date:** 2026-07-01 · **Scope:** the compliance / intake-forms feature only, end-to-end (data model, type authoring, requirements, form builder, records, library, form-links, public/in-booking collection, booking enforcement, dashboard, contacts/GDPR, settings, access/audit/comms). **Method:** code-level comparison of the app (`C:\Resneo-app`) against the read-only web mirror (`_reference/Resneo`, refreshed to `origin/main` @ `1a237cd4` on 2026-07-01), split into 13 domains each audited web→app with an adversarial coverage pass. The authed web dashboard can't be driven live (CORS + light-only preview + no Android emulator), so this is a static comparison. **North star:** a staff user can do on mobile everything the web staff dashboard allows for compliance, against the same backend.

> **Why R8 and why compliance-only:** the web team heavily polished compliance since the app last tracked it — including the Dec-2026 migrations (`in_booking_collection`, `merge_guests` dedup, `form_link_reminders`, `comm_log_types`). This report supersedes the compliance sections of `Docs/parity/compliance-forms-records-expiries.md` (which is materially stale — see "Stale docs" below) and updates the R7 domain 13 view.

---

## Domain summary

Severity counts are **de-duplicated within each domain**; several gaps recur across domains (noted inline with ⇄) and are only actioned once in the priority plan.

| # | Domain | Parity | C | H | M | L | Headline gap |
|---|--------|--------|---|---|---|---|--------------|
| 1 | Data model & shared types/validation | partial | 0 | 2 | 3 | 1 | Retired `auto_send_on_booking` still written; no shared enum module |
| 2 | Type lifecycle (versioning/duplicate/archive) | partial | 0 | 1 | 4 | 0 | No version history + restore; no duplicate |
| 3 | Requirements mapping & resolution | partial | 0 | 2 | 1 | 1 | `lock_period_hours` + `online_collection` un-editable |
| 4 | Form schema, builder & renderer | partial | 1 | 1 | 2 | 2 | Missing M7 "result must be required" validation |
| 5 | Records — capture, files, decision, view | partial | 0 | 3 | 0 | 0 | No pass/fail decision PATCH; file upload disabled; no artefact viewing |
| 6 | Template library & cloning | strong (~90%) | 0 | 0 | 1 | 1 | No pre-clone form preview |
| 7 | Form links / send / auto-send | strong | 0 | 0 | 0 | 1 | Send-feedback fidelity only |
| 8 | Pre-check & in-booking collection | partial (strong) | 0 | 1 | 1 | 2 | `compliance_warnings` dropped from 201 |
| 9 | Booking enforcement, flags & surfacing | **at risk** | 1 | 2 | 0 | 0 | **Booking-flag `state` contract mismatch → dead signal** |
| 10 | Dashboard, reporting & expiry | full (minor) | 0 | 0 | 0 | 2 | Summary-counts strip; `today` field omitted |
| 11 | Contacts/guest history, merge & GDPR | partial (merge/GDPR full) | 0 | 1 | 1 | 3 | Contact panel drops pending form-links block |
| 12 | Settings & config toggles | partial | 0 | 2 | 1 | 2 | `both` channel option 400s save; retired toggle |
| 13 | Access, audit, rate-limit & comms | strong (partial) | 0 | 0 | 2 | 3 | `CommunicationMessageKey` missing compliance keys |

**At full parity, no work needed:** guest merge, GDPR erase, dashboard overview + expiry sweep, template-library sourcing (live from API), form-link send/resend/revoke, in-venue capture, record view/void, per-guest audit trail surfacing, plan/feature-flag gating, admin-action gating, blocking-409 enforcement + override retry.

---

## Executive summary

The app's compliance surface is **mature — nothing here is a stub**. It ships type authoring, a real mobile form-field builder, a per-service requirements editor, in-venue capture (staff + hand-to-client), record view/void, a per-guest audit trail, form-link send/resend/revoke, a four-section daily-sweep dashboard, booking enforcement with admin-override retry, guest merge and GDPR erase. The three parity docs that call much of this "missing" predate the R5–R7 build and are wrong.

The real problem is **correctness and data-contract drift, not breadth.** One defect is production-acute: the app's `ComplianceBookingFlag.state` type does not match what `/booking-flags` returns, so every outstanding-compliance indicator on calendars, list rows, swipe rows and the booking header renders as a grey/blank dot — the entire at-a-glance red/amber signal is dead (Domain 9). A second cluster is data-contract drift the app cannot express or actively writes wrong: the retired venue-wide `auto_send_on_booking` toggle is still authored (web `.strip()`s it), the compliance settings screen offers a form-link channel value (`both`) the backend enum rejects (can 400 the save or reset config to defaults), per-requirement `lock_period_hours` and `online_collection` are un-editable, and mobile captures are mislabelled `staff_web`. A third cluster genuinely blocks reception workflows: staff can't record a pass/fail decision on a client-submitted record (it stays "awaiting decision" forever and never satisfies a booking), can't upload a file despite a live route, and can't open captured signature/file artefacts.

The remaining work is depth and polish: type version-history/restore and duplicate, `FieldExtras` authoring, the contact-panel pending form-links block, compliance comms-policy surfacing, and the December-2026 additions (`online_unmet_message`, six comm-log message types, form-link reminder history).

The single highest-leverage structural fix is a **shared app-side compliance enum/config module** (porting web `constants.ts`/`config.ts`/`shared.ts`). Its absence — values scattered inline across hooks and screens — is the root cause that let all the drift above go uncaught.

---

## Priority plan (de-duplicated across domains)

**Wave 0 — docs.** Mark `Docs/parity/compliance-forms-records-expiries.md`, `Docs/audit-r7/13-compliance-forms.md`, and `Docs/APP_GAP_REPORT_R7.md` (domain 13) as superseded by this report; the "~35%" figure is materially wrong.

**Wave 1 — correctness bugs (small, high-severity, do first).**
1. Booking-flag `state` contract → `satisfied|unmet` + colour off `blocking`/`labels` (Domain 9, **CRITICAL**, S).
2. Remove `both` from the settings form-link channel; narrow type to `email|sms` (Domain 12, **HIGH**, S).
3. Add the M7 "pass/fail result field must be required" validator branch + test (Domain 4, **HIGH/critical-in-domain**, S).
4. Surface `compliance_warnings` from the booking-create 201 (Domain 8, **HIGH**, S).
5. Send capture channel `staff_mobile` not `staff_web` (Domain 1, **MEDIUM**, S).

**Wave 2 — foundation + per-requirement config.** Shared constants/config module (drop `auto_send_on_booking`, reminder default 0) → then `lock_period_hours` and `online_collection` editors on top of it (Domains 1/3/12).

**Wave 3 — record lifecycle + enforcement gating.** Pass/fail decision PATCH (+ "awaiting decision" pill), staff file upload, artefact signed-URL viewing (Domain 5 ⇄ 11); admin-gate + hide the override button on group/multi flows and verify edit/reschedule enforcement (Domain 8/9 + coverage).

**Wave 4 — lifecycle + read-surface + comms polish.** Type version-history/restore + changelog, duplicate, archive via dedicated routes, `online_unmet_message` (Domain 2/4); contact pending form-links block + `RESULT_LABELS` + audit label + awaiting-decision pill (Domain 11); `CommunicationMessageKey` union + compliance comms-policy surface + reminder history (Domain 13); template preview (Domain 6); dashboard counts strip + `today` field (Domain 10); send-feedback fidelity (Domain 7).

**Wave 5 — builder depth.** `FieldExtras` (help_text/max_length/default_value), pass_fail auto-wire, live preview, option-slug dedupe, enforcement descriptions (Domain 3/4). Largest effort, lowest urgency.

---

## Domain 1 — Data model & shared types/validation

**Parity: partial.** The data-contract layer is a substantial, largely-faithful port: `form-schema.ts` zod + cross-field validation, result derivation, requirement/record/template/dashboard/guest-history types, and label maps all match web constants. Gaps concentrate in the Dec-2026 additions and a few stale config shapes. Root cause: **there is no app-side enum/config module** — values live as inline literals across hooks/screens, so drift goes uncaught.

App files: `types/compliance.ts`, `types/booking-compliance.ts`, `types/venue.ts`, `lib/compliance/form-schema.ts`, `lib/queries/useCompliance.ts`, `lib/queries/useComplianceRequirements.ts`, `lib/queries/useComplianceTypeManage.ts`, `components/compliance/complianceTypeLabels.ts`.
Web refs: `src/lib/compliance/constants.ts`, `config.ts`, `zod-schemas.ts`, `supabase/migrations/2026122*_*.sql`.

### [HIGH · M] Retired `auto_send_on_booking` still modelled & written — divergent ⇄ Domain 12
- **Web:** `complianceConfigSchema` has **no** `auto_send_on_booking` and ends `.strip()` (`src/lib/compliance/config.ts:25-45`); the behaviour moved to per-requirement `online_collection`. The Dec-2026 migration backfilled the old flag (on→`confirmation_link`, off→`none`) then retired it.
- **App:** `ComplianceConfig.auto_send_on_booking: boolean` with a default in `types/venue.ts:59-60,75`; the settings screen renders a Switch and writes the key. The backend silently strips it, so the toggle does nothing.
- **Work:** remove the key from `ComplianceConfig` + `DEFAULT_COMPLIANCE_CONFIG`; remove the Switch + payload field (see Domain 12); replace with per-requirement `online_collection` (Domain 3).

### [HIGH · M] `service_compliance_requirements.online_collection` not modelled/editable — missing ⇄ Domain 3
- **Web:** `online_collection` NOT NULL default `confirmation_link`, CHECK `inline|confirmation_link|none` (`migrations/20261229120000_compliance_in_booking_collection.sql`); exposed on GET/POST/PATCH `/requirements` and in `COMPLIANCE_ONLINE_COLLECTION_MODES`.
- **App:** absent from `ComplianceRequirementRow` and both mutation inputs; the row always lands on the DB default with no visibility.
- **Work:** see Domain 3 (single implementation).

### [MEDIUM · S] `compliance_types.online_unmet_message` not modelled/editable — missing ⇄ Domain 2
- **Web:** nullable text (max 500) added Dec-2026; the guidance shown when an online booking is blocked by a self-uncompletable requirement; validated in `complianceTypeCreate/PatchSchema` and surfaced via public pre-check.
- **App:** not on `ComplianceTemplateRow`/`Patch`/`CreateInput`; un-authorable on mobile.
- **Work:** see Domain 2.

### [MEDIUM · S] `capture_channel` hard-coded `staff_web|client_walkin` — mobile captures mislabelled — divergent
- **Web:** `COMPLIANCE_CAPTURE_CHANNELS` = `staff_web, staff_mobile, client_email, client_sms, client_walkin, client_booking, import`. `staff_mobile` exists specifically to attribute mobile captures; `client_booking` (Dec-2026) tags inline in-booking captures.
- **App:** `ComplianceCaptureSheet` sends `staff_web` for staff entry; `useCaptureComplianceRecord` union omits `staff_mobile`/`client_booking`. Every in-app capture is attributed as if entered on the web dashboard.
- **Work:** send `staff_mobile`; widen the union to the full set; reference the shared const (below); ensure label maps cover the new channels. (**Wave 1 quick fix.**)

### [MEDIUM · M] No shared app-side compliance enum/config module — partial (root cause)
- **Web:** every CHECK/enum/label centralised in `constants.ts` + `config.ts` + `zod-schemas.ts` + `shared.ts`.
- **App:** only `form-schema.ts` (field/result-type enums). `capture_channel`, `enforcement`, `online_collection`, `categories`, config shape, bounds, and UI labels are scattered across `useComplianceRequirements.ts`, `useComplianceTypeManage.ts`, `useCompliance.ts`, `ComplianceCaptureSheet.tsx`, `compliance-settings.tsx`, `types/venue.ts`.
- **Work:** create `lib/compliance/constants.ts` (categories, capture methods/channels, online-collection modes, record statuses, enforcement levels + descriptions, form-link statuses, sent-via, requirement states, `EXPIRING_SOON_DAYS=30`); create `lib/compliance/config.ts` (`complianceConfigSchema` without `auto_send`, reminder default 0, `DEFAULT_COMPLIANCE_CONFIG`, `resolveFormLinkExpiryDays`); port a UI module mirroring web `shared.ts` (`RESULT_LABELS`, `ENFORCEMENT_DESCRIPTIONS`, requirement-state→pill, record-status pills, `AUDIT_EVENT_LABELS` incl. `guest.compliance_erased`). Refactor inline literals to import these. **This is the structural fix that stops the drift above recurring.**

### [LOW · S] Six compliance `communication_logs.message_type` values unmodelled — missing ⇄ Domain 13
- **Web:** `compliance_form_request_{email,sms}`, `compliance_form_reminder_{email,sms}`, `compliance_record_expiring_{email,sms}` (`migrations/20261204120000_compliance_comm_log_types.sql`).
- **App:** not enumerated/labelled; such rows render with a raw/underscored label. **Work:** see Domain 13.

---

## Domain 2 — Type lifecycle (versioning / duplicate / archive)

**Parity: partial.** Create, edit + publish-new-version, archive/restore, and library clone all work. **Version history + restore-a-prior-version and Duplicate are entirely missing**, and archive/restore takes a weaker path than web. All missing backends are already Bearer-capable.

App files: `lib/queries/useComplianceTypeManage.ts`, `components/compliance/ComplianceTypeEditorSheet.tsx`, `app/(app)/manage/compliance-types.tsx`.
Web refs: `src/lib/compliance/types-service.ts`, `src/app/api/venue/compliance/types/**`, `src/app/dashboard/compliance-types/*`, `src/components/dashboard/compliance/ComplianceFormBuilder.tsx`, `ComplianceSettingsSection.tsx`.

### [HIGH · L] No version-history list / restore; changelog never sent — missing ⇄ Domain 4
- **Web:** the edit builder renders a version-history panel (`ComplianceFormBuilder.tsx:498-509,544-637`) from `GET /types/[id]/versions` (newest-first, current flagged), each non-current row Restore→`POST /types/[id]/versions/restore {version_id}` re-publishing as a new version (`types-service.ts:334-354`), plus a per-save changelog input (`ComplianceFormBuilder.tsx:485-496`).
- **App:** no versions query, no restore mutation, no UI. `useCreateComplianceVersion` accepts a `changelog` but `ComplianceTypeEditorSheet.handleSave` never passes it (`ComplianceTypeEditorSheet.tsx:~320`), so every mobile-authored version has a null changelog.
- **Work:** add `useComplianceTypeVersions(typeId)` (`GET /types/${id}/versions`) + `useRestoreComplianceVersion` (`POST /types/${id}/versions/restore`) to `useComplianceTypeManage.ts`; render a version-history section in the editor (edit-mode, admin) with a confirm-gated Restore that re-hydrates the builder; add a "What changed" input and thread `changelog` into the create-version call.

### [MEDIUM · S] Duplicate a type — missing
- **Web:** every type has a Duplicate action (`ComplianceSettingsSection.tsx:87-101,170-177`) → `POST /types/[id]/duplicate` creating `"{name} (copy)"` with the same settings + current schema and its own first version (`types-service.ts:361-384`).
- **App:** no `/duplicate` mutation; list rows are tap-to-edit only.
- **Work:** add `useDuplicateComplianceType` (`POST /types/${id}/duplicate`); add a per-row admin Duplicate action in `compliance-types.tsx`; refetch + toast.

### [MEDIUM · S] Archive/restore uses `PATCH is_active` instead of the dedicated routes — divergent
- **Web:** `POST /types/[id]/archive` sets `is_active:false` **and** `archived_at:now` + writes a `type.archived` audit event; `/restore` clears `archived_at` + writes `type.restored` (`ComplianceSettingsSection.tsx:70-85`).
- **App:** `handleArchiveToggle` PATCHes only `{ is_active }` (`ComplianceTypeEditorSheet.tsx:~353`). App-archived types get a stale/non-null `archived_at` and no audit event.
- **Work:** add `useArchiveComplianceType`/`useRestoreComplianceType` hitting the dedicated routes; switch the editor (and any list-row action from the Duplicate gap) to them; update the stale rationalising comment in `useComplianceTypeManage.ts:~342-348`.

### [MEDIUM · S] Editor omits `online_unmet_message` — missing ⇄ Domain 1
- **Web:** multiline textarea (max 500) in the builder (`ComplianceFormBuilder.tsx:385-401`), sent on create + PATCH.
- **App:** no field; `CreateComplianceTemplateInput`/`ComplianceTemplatePatch`/`ComplianceTemplateRow` omit it.
- **Work:** add `online_unmet_message?: string|null` to those types; add a multiline Input (max 500) to `ComplianceTypeEditorSheet` hydrated from detail, included in create + patch; show it in the read-only summary.

### [MEDIUM · M] Field builder omits per-field help/limit/defaults — missing ⇄ Domain 4 (`FieldExtras`)
- Cross-referenced; single implementation lives in Domain 4.

---

## Domain 3 — Requirements mapping & resolution

**Parity: partial.** The app has a per-service requirements editor wired into the service editor (`app/(app)/manage/services.tsx:~2049`, behind `isAdmin && complianceEnabled && edit-mode`); bind/list/edit-enforcement/remove all match web and correctly do **not** reimplement server-side resolution/enforcement. The divergence: the editor omits two of the three configurable requirement fields.

App files: `lib/queries/useComplianceRequirements.ts`, `components/compliance/ComplianceRequirementsEditor.tsx`.
Web refs: `src/lib/compliance/requirements-service.ts`, `resolve-requirements.ts`, `zod-schemas.ts`, `src/components/dashboard/compliance/ComplianceRequirementsEditor.tsx`, `shared.ts`.

### [HIGH · M] `lock_period_hours` (lead time) not settable or visible — missing
- **Web:** exposed in the Add dialog and each row (int 0–8760, "hours before the appointment", 48h patch-test example). A real gate: the resolver rejects a record captured after `(bookingDatetime − lock_period_hours)` and drives `lockBlocked`. `zod` `lockPeriodHoursSchema` = int 0–8760 nullable, accepted by POST + PATCH.
- **App:** absent from `ComplianceRequirementRow` (`useComplianceRequirements.ts:~39-49`) and both mutation inputs (`~89-94`, `~115-119`); requirements always land with `lock_period_hours=null`.
- **Work:** add `lock_period_hours: number|null` to the row type and `lock_period_hours?: number|null` to both inputs (payloads pass through `apiFetch` unchanged — types + UI only); add a numeric input to `AddRequirementSheet` (clamp `Math.max(0, Math.min(8760, Math.round(n)))`, blank→null); add an editable per-row control PATCHing on blur (mirror web `commitLeadTime`); port the helper copy.

### [HIGH · M] `online_collection` (`inline|confirmation_link|none`) entirely absent — missing ⇄ Domain 1
- **Web:** admins choose per-requirement where a client-online form appears — `confirmation_link` (link in confirmation email, the only auto-sending value), `inline` (booking-flow step), `none` (staff collect in venue). The Add dialog shows it only when the type supports `client_online` (else forces `none`); each row shows a select + description and warns when enforcement blocks online but collection is `none`. POST/PATCH accept it.
- **App:** absent entirely; requirements silently default to `confirmation_link`.
- **Work:** add `COMPLIANCE_ONLINE_COLLECTION_MODES` + labels/descriptions to the shared const (Domain 1); add `online_collection` to the row type + both inputs; add a segmented/chip control per row and in the Add sheet, gated on the type's `capture_methods` including `client_online` (force `none` + staff-only copy otherwise); port the amber warning.

### [MEDIUM · S] Requirements created on mobile silently use DB defaults — divergent
- Consequence of the two gaps above (no separate code path). Interim: surface a row note that lead time / online collection are "managed on web" until the fields land.

### [LOW · S] Enforcement selector lacks per-option descriptions — partial
- **Web:** renders the enforcement select plus an `ENFORCEMENT_DESCRIPTIONS` paragraph in both row + Add dialog (e.g. `block_all`: "No one can book… An admin can override when booking from the dashboard").
- **App:** enforcement chips only (values match `COMPLIANCE_ENFORCEMENT_LEVELS`), no descriptions.
- **Work:** port `ENFORCEMENT_DESCRIPTIONS` (from the shared const); render the selected level's description as caption text under the chip row in both places.

---

## Domain 4 — Form schema, field types, builder & renderer

**Parity: partial.** A mature port: identical 7-field-type discriminated-union zod schema (`lib/compliance/form-schema.ts`), a reducer-driven field builder (add/edit/reorder/delete, options editor, intro markdown, pass/fail `ResultMappingEditor`), a capture sheet rendering help_text/description/intro_markdown and seeding `default_value`, version-POST on save, and an Add-from-library sheet. Core authoring + capture work. One **critical** data-contract divergence plus missing authoring surfaces.

App files: `lib/compliance/form-schema.ts`, `lib/compliance/field-builder.ts`, `components/compliance/ComplianceFieldEditor.tsx`, `ComplianceTypeEditorSheet.tsx`, `ComplianceCaptureSheet.tsx`.
Web refs: `src/lib/compliance/form-schema.ts`, `src/components/dashboard/compliance/ComplianceFormBuilder.tsx`, `ComplianceFormRenderer.tsx`.

### [CRITICAL · S] Missing M7 "pass/fail result field must be required" validation — divergent
- **Web:** `validateFormSchemaForType` rejects a `pass_fail` schema whose result select is not `required`, with "The pass/fail result field must be marked required so a decision is always recorded." (`form-schema.ts:180-184`, backs audit H4 — an optional result field could satisfy a booking with no decision).
- **App:** the branch is absent between the `!mapped.staff_only` check (`~L188`) and the options `else` (`~L190`); the app accepts a schema the web blocks.
- **Work:** insert `else if (!mapped.required) errors.push('The pass/fail result field must be marked required so a decision is always recorded.')`; add a `form-schema.test.ts` case; optionally auto-flip the chosen result field's `required` in `ResultMappingEditor`. (**Wave 1.**)

### [HIGH · L] No `FieldExtras` UI — help_text / max_length / default_value un-authorable — missing ⇄ Domain 2
- **Web:** `FieldExtras` (`ComplianceFormBuilder.tsx:750-874`) exposes per-field character limit (text/textarea 1–10000), default value (text/textarea free text; select single; multiselect multi; date none/today/specific), and help_text; these seed renderer defaults and enforce `max_length`.
- **App:** `ComplianceFieldEditor` edits only label, Required, Staff-only, options. The schema + capture already support these (help_text renders; `seedDefaultResponses` consumes `default_value`), so this is purely missing author controls + capture-time `max_length` enforcement.
- **Work:** add a help_text input to `FieldCard` (dispatch `updateField {help_text}`); add a `max_length` numeric input for text/textarea + a `maxLength` prop on the capture TextInput; add a type-specific `default_value` editor; extend `FieldBuilderAction` to keep patches type-safe. No new endpoints.

### [MEDIUM · M] No `pass_fail` auto-create/auto-wire of a staff-only Result select — missing
- **Web:** switching result type to `pass_fail` reuses an existing staff-only select or auto-creates a required, staff_only "Result (staff decision)" select with Pass/Fail options and pre-fills `result_mapping` (`ComplianceFormBuilder.tsx:202-225`).
- **App:** picking `pass_fail` shows an empty `ResultMappingEditor` prompting the user to add a staff-only dropdown manually.
- **Work:** add an `ensureResultField` field-builder action mirroring `handleResultTypeChange`; dispatch it from the `setResultType='pass_fail'` chip. (Also satisfies the M7 rule for the common path.)

### [MEDIUM · L] No version-history list / restore + changelog — missing ⇄ Domain 2 (single implementation).

### [LOW · M] No live "Preview as client" in the builder — missing
- **Web:** toggles editor↔live preview rendering the exact `ComplianceFormRenderer` with the in-progress schema (`ComplianceFormBuilder.tsx:417,517`).
- **Work:** add a preview toggle rendering the builder schema through a read-only extract of the capture-sheet field renderers; consider extracting `FieldInput`/`FieldHeader` into a shared read-only renderer so preview + capture stay WYSIWYG.

### [LOW · S] Options editor doesn't dedupe colliding slugs on edit (audit U8) — partial
- **Web:** dedupes colliding option slugs on edit / picks next-free `option_N` on add.
- **Work:** in `field-builder.ts` `updateOption`, pass a taken-set into `optionValueFromLabel` and disambiguate (`_2`,`_3`); in `addOption` scan for the next free `option_N`.

---

## Domain 5 — Records: capture, files, decision, view/void

**Parity: partial.** In-person capture, record view, and void are at parity (`ComplianceCaptureSheet`, `ComplianceRecordSheet`, `useCompliance` capture/void; `record.viewed` audit is written server-side on the shared GET). Three record-lifecycle gaps break real reception workflows.

App files: `components/compliance/ComplianceCaptureSheet.tsx`, `ComplianceRecordSheet.tsx`, `lib/queries/useCompliance.ts`, `types/compliance.ts`.
Web refs: `src/lib/compliance/records-service.ts`, `files.ts`, `src/app/api/venue/compliance/records/**`, `src/components/dashboard/compliance/ComplianceRecordViewDialog.tsx`, `ComplianceCaptureDialog.tsx`.

### [HIGH · M] No pass/fail decision PATCH — client-submitted records stay "awaiting decision" forever — missing ⇄ Domain 11
- **Web:** `PATCH /records/[id]` edits notes (max 2000) and/or records a staff pass/fail decision (`pass|fail|inconclusive`) on a `pass_fail`-type record (400 otherwise), writing `record.updated`; the view dialog shows a "Needs a pass or fail decision" panel; undecided records don't satisfy bookings.
- **App:** no `useUpdateComplianceRecord`, no decision UI. Client-submitted pass_fail records can never be decided on mobile and never count towards a booking.
- **Work:** add `useUpdateComplianceRecord` (`PATCH /records/${id}` `{ result?, notes? }`, invalidate `queryKeys.compliance.all()`); extend `ComplianceRecordDetail` with `result_type`; in `ComplianceRecordSheet` add an editable notes field and, for `result_type==='pass_fail' && result==null`, a decision panel (Pass/Fail/Inconclusive) surfacing the server 400 via toast; add an "Awaiting decision" pill on list rows.

### [HIGH · M] Staff file/photo upload disabled despite a live route — divergent
- **Web:** `FileField` uploads multipart to `POST /records/upload` (staff-authed, plan-gated), validating MIME (PDF/JPEG/PNG/HEIC/WebP) + size (≤10MB), returning a `FileResponse`; staff can attach files in both capture modes.
- **App:** the file field is rendered disabled (with a now-false "public form only" comment); file-type requirements are unsatisfiable in person on mobile.
- **Work:** add `useUploadComplianceRecordFile` (`POST /records/upload` with FormData; `apiFetch` supports it — mirror `useVenueImageUpload`); replace the disabled input with `expo-image-picker` + `expo-document-picker` (enforce MIME + 10MB, Uploading/Remove states, emit `FileResponse`); remove the required-file short-circuit + stale comment; confirm the pickers are installed.

### [HIGH · M] Captured signature & file artefacts can't be viewed/downloaded — missing
- **Web:** opens signatures ("View signature") and files ("Download <name>") via `GET /records/[id]/file?field=<fieldId>`, minting a 120s signed URL after confirming the path belongs to the record + venue; access audited (`record.viewed` `artifact:true`).
- **App:** the record view is text-only; no signed-URL retrieval.
- **Work:** add an imperative `useComplianceRecordFile` (`GET /records/${id}/file?field=${fieldId}` → `{ url, expires_in, file_name }`); in `ComplianceRecordSheet` add "View signature" (drawn + storage_path only) and "Download <file_name>" buttons that fetch on tap (120s TTL) and open via `Linking`/`expo-web-browser`.

---

## Domain 6 — Template library & cloning

**Parity: strong (~90%).** Templates are fetched **live** from `GET /api/venue/compliance/library` (`useComplianceLibrary`, `useComplianceTypeManage.ts:470-489`); none are hardcoded (repo-wide grep for the template slugs/`defineTemplate` returns nothing in app code), so all 10 templates and any future additions/renames flow through automatically. Clone is a slug-only `POST /library/[slug]/clone` (`:496-514`) — the backend materialises the full payload, so the app inherits a full-fidelity clone. Admin-gated + refetch on success. Covered by `useComplianceTypeManage.test.tsx`.

### [MEDIUM · M] No template form preview before cloning — partial/divergent
- **Web:** `LibraryDialog` (`ComplianceSettingsSection.tsx:262-284`) has a per-row Preview/Hide toggle rendering the full form read-only via `<ComplianceFormRenderer schema={t.form_schema} mode="public" preview />`; the endpoint supplies `form_schema` for this (`library/index.ts:39-63`).
- **App:** `ComplianceLibraryTemplate` (`useComplianceTypeManage.ts:157-166`) omits `form_schema` (the backend already returns it — it's discarded); `ComplianceLibrarySheet` shows only a metadata line + Add. Admins clone somewhat blind (mitigated: the type can be inspected read-only after cloning).
- **Work:** add `form_schema` (reuse `ComplianceTemplateFormSchema` at `:75-81`) to the interface; add a per-card Preview/Hide toggle reusing the editor sheet's read-only field list.

### [LOW · S] `capture_methods` fetched but never rendered in the picker — present-verify
- Not a web divergence (web also doesn't show it in the picker); the app's interface declares `capture_methods: string[]` but never uses it. Optional: drop the dead field or show a Staff/Client chip.

---

## Domain 7 — Form links / send / auto-send / distribution

**Parity: strong.** The app already sends compliance form links (email/SMS/copy) with resend + revoke, used on the booking card and the compliance dashboard (`useSendComplianceFormLink`, `useResendFormLink`, `useRevokeFormLink`). Only send-feedback fidelity lags.

### [LOW · M] Send-feedback fidelity: manage-screen Copy-link channel, dropped `sent_via`/`no_destination`, GET filters — partial
- **Web:** send returns `{ public_url, sent_via, no_destination, dispatched, reused }` and offers Copy-link per pending link plus a per-guest/booking link list (`GET /form-links?guest_id=&status=`) with status pills; it branches copy on `no_destination` and reports the true `sent_via` (SMS→email fallback).
- **App:** `SendComplianceFormLinkResult` drops `sent_via`/`no_destination`, so send toasts are optimistic; the manage-screen send Sheet lacks a Copy-link channel; no per-guest/booking pending-link list.
- **Work:** add a "Copy link" action to the send Sheet (`runSend('manual_copy')` → `Clipboard.setStringAsync(result.public_url)`); add `sent_via?: 'email'|'sms'|null` and `no_destination?: boolean` to the result type and branch toasts; extend `useComplianceFormLinks` to accept `{ guestId?, status? }`. Files: `app/(app)/manage/compliance.tsx`, `lib/queries/useBookingCompliance.ts`, `useCompliance.ts`, `components/bookings/ComplianceCard.tsx`.

---

## Domain 8 — Pre-check & in-booking collection

**Parity: partial (leaning strong).** Blocking-409 enforcement + admin-override retry + booking-detail collection are at full parity across all five booking flows. The public guest form fill, inline booking-page forms, and pre-check UI are **client-facing web only** and correctly absent (see not-a-gap). Staff-relevant gaps are narrow.

App files: `components/booking-wizard/ConfirmStep.tsx`, `BookingFlowPrimitives.tsx`, `GroupBookingFlow.tsx`, `ClassBookingFlow.tsx`, `EventBookingFlow.tsx`, `ResourceBookingFlow.tsx`, `lib/queries/useCreateBooking.ts`, `components/bookings/ComplianceCard.tsx`.
Web refs: `src/app/api/venue/bookings/route.ts`, `src/lib/compliance/enforce-booking.ts`, `src/components/booking/AppointmentBookingFlow.tsx`.

### [HIGH · S] Post-create `compliance_warnings` silently dropped — missing
- **Web:** `POST /api/venue/bookings` (the exact endpoint the app calls) returns `compliance_warnings` in the 201 (`route.ts:~1383`); the web staff flow renders an amber "Outstanding compliance forms" card ("The booking is made, but X is not on file yet…", `AppointmentBookingFlow.tsx:4177-4187`). These are unmet non-blocking (`warn_staff`/`warn_client`) requirements.
- **App:** `CreateBookingResponse` (`useCreateBooking.ts:60-67`) omits `compliance_warnings`; success screens never read/render them. Staff booking with an unmet warn requirement get no signal.
- **Work:** add `compliance_warnings?: Array<{ compliance_type_name: string }>` to `CreateBookingResponse`; on success in `BookingFlowPrimitives.tsx` + `ConfirmStep.tsx` render an amber notice (reuse `complianceBlock` style); consider deep-linking to the new booking's `ComplianceCard` actions. (**Wave 1.**)

### [MEDIUM · S] "Book anyway (admin override)" shown to every role — divergent ⇄ Domain 9
- **Web:** the server honours the override only for `role==='admin'` (`route.ts:~1199`); the UI conditions the affordance on admin.
- **App:** `ConfirmStep.tsx:530-536` + `BookingFlowPrimitives.tsx:384-390` render it unconditionally on any 409. A non-admin taps it, the server rejects again, the same error re-appears — a confusing dead-end.
- **Work:** gate the button on `useStaffMe` role `admin`; for non-admins show guidance. Apply in `ConfirmStep`, `BookingFlowPrimitives`, `GroupBookingFlow` (see next). (Actioned once with Domain 9.)

### [LOW · M] No proactive pre-check before submit (staff heads-up) — missing (low value)
- The app is a staff tool: staff see requirement state on the booking/guest detail and the 409 is caught cleanly. A pre-submit warning would be a nicety. **Do not** call the anonymous `/api/public/compliance/pre-check`; use the authenticated `useBookingCompliance`/`useGuestCompliance` resolver if built. Defer unless product asks.

### [LOW · S] Group bookings send `override_compliance` but the server has no compliance gate — divergent (dead code)
- **Web:** `create-group/route.ts` has no compliance enforcement (only single/multi-service + the staff `venue/bookings` route gate).
- **App:** `GroupBookingFlow.tsx:264,300-308` sends `override_compliance` + handles a 409 the group route never returns. Harmless but misleading (existing comment at `~L260-261` already flags it).
- **Work:** remove the field + 409 branch (match web) or leave a forward-compat comment.

### Not a gap (client-facing web only, correctly absent from the app)
`src/app/p/forms/[code]/page.tsx` + `PublicComplianceForm.tsx` (guest form page); `/api/public/compliance/forms/[code]` + `/submit` + `/file`; `CompliancePreCheckNotice.tsx`; `BookingComplianceForms.tsx` + `BookingComplianceBlock.tsx` (guest inline self-booking forms); `/api/public/compliance/inline-forms` + `/booking-upload` + `/pre-check` (anon endpoints; the staff app must not call them). `online_unmet_message` is surfaced to **guests** via the public pre-check, not to staff at booking time. The staff app collects the same data via `ComplianceCaptureSheet` / send-a-link.

---

## Domain 9 — Booking enforcement, flags & surfacing

**Parity: at risk (1 critical).** Blocking enforcement + override retry are wired, but the at-a-glance flag signal is broken by a data-contract mismatch, and the override affordance is mis-gated. Coverage also flagged un-mirrored edit-time enforcement.

App files: `lib/queries/useCompliance.ts`, `components/compliance/ComplianceFlagBadge.tsx`, `app/(app)/(tabs)/bookings.tsx`, `components/bookings/BookingRow.tsx`, `BookingSwipeRow.tsx`, `components/calendar/AppointmentBlock.tsx`, `DraggableAppointmentBlock.tsx`, `CalendarDayGrid.tsx`, `AllCalendarsDayGrid.tsx`, `components/booking-wizard/ConfirmStep.tsx`, `GroupBookingFlow.tsx`.
Web refs: `src/lib/compliance/booking-flags.ts`, `enforce-booking.ts`, `src/app/api/venue/compliance/booking-flags/route.ts`, `src/app/api/venue/bookings/[id]/route.ts`, `src/components/dashboard/compliance/ComplianceBookingIndicator.tsx`.

### [CRITICAL · S] Booking-flag `state` type diverges from the endpoint contract — dead signal — divergent
- **Web:** `POST /api/venue/compliance/booking-flags` returns `{ state: 'satisfied'|'unmet', blocking: boolean, labels: string[] }` (`booking-flags.ts:22-29`). Web colours by `blocking` (rose when blocking, amber otherwise, green when satisfied) and labels "Compliant" / "<type> due" / "N forms due".
- **App:** `ComplianceBookingFlag.state` is typed `missing|expired|expiring_soon|satisfied` (never returned). Every outstanding flag falls through to a grey dot with a blank label; blocking-vs-outstanding colour + the "<type> due" labels are lost across calendar bars, list rows, swipe rows and the booking header. Purely client-side.
- **Work:** change `ComplianceBookingFlag.state` → `'satisfied'|'unmet'` (`useCompliance.ts`); rewrite `flagColor()` in `ComplianceFlagBadge.tsx` (satisfied→success; `flag.blocking`→danger; else→warning — port web `tone()`); render label + a11y from `flag.labels` and a ported `complianceFlagTooltip()`; re-confirm `needsCompliance()` in `bookings.tsx` keys off `state!=='satisfied'`; add a unit test (unmet-blocking→red, unmet-non-blocking→amber, satisfied→green). (**Wave 1 — highest leverage.**)

### [HIGH · M] Override button un-gated and dead-ended on group/multi flows — divergent ⇄ Domain 8
- **Web:** override honoured only for `role==='admin'` on single-create + walk-in; `create-multi-service` and `create-group` don't accept `override_compliance`. `PATCH bookings/[id]` also re-runs `checkBookingCompliance` + enforces `block_all` with an admin-only override on edit/reschedule.
- **App:** the override button shows to all roles and appears on multi-service (`ConfirmStep isMultiService`) + group flows whose routes drop `override_compliance` → tapping re-fires the same 409 in a dead-end.
- **Work:** thread `isAdmin` (`useStaffMe`) into `ConfirmStep`/`GroupBookingFlow`/`BookingFlowPrimitives`; render the override only when admin; hide it on multi-service/group (offer a capture/send-link path instead); once web adds override to those routes, wire it through the payload builders.

### [HIGH · verify] Edit/reschedule compliance enforcement + admin override may be un-mirrored — coverage finding
- **Web:** `PATCH /api/venue/bookings/[id]` re-runs `checkBookingCompliance`/`complianceUnmetMessage` on edits and enforces `block_all`, allowing an admin-only bypass via `override_compliance:true` (`COMPLIANCE_REQUIREMENT_UNMET`).
- **App:** if the app supports editing/rescheduling a booking, it must replicate the edit-time 409 handling + admin override, else it can silently push a booking past a block the create flow would stop.
- **Work:** locate the app's booking edit/reschedule path; confirm it handles the 409 + admin override like create; if not, mirror it.

---

## Domain 10 — Dashboard, reporting & expiry

**Parity: full (minor divergences).** The manage screen (`app/(app)/manage/compliance.tsx`) is a section-for-section port of `ComplianceDashboardView` over the same `GET /api/venue/compliance/dashboard`: today's check-ins, missing-for-upcoming (14d), expiring-soon (30d), awaiting-submission, plus Capture/Send-link/Renew/Resend/Revoke. `groupTodaysCheckIns` is ported exactly; today/upcoming split is venue-timezone-correct; expiry-cron outputs surface via the same payload + per-guest records. The app **adds** an SMS channel picker and admin enable/disable. **Neither platform has per-client/per-type/per-status filters** — do not build them "for parity."

### [LOW · S] Summary-counts strip missing — partial
- **Web:** a top counts row ("N for today · N upcoming · N expiring · N awaiting" / "You're all caught up", `ComplianceDashboardView.tsx:139-163`).
- **App:** only per-section badges + an "All clear" empty state (`compliance.tsx:442-447`).
- **Work:** add a summary Card above the sections reusing the existing counts + `allClear` (`:280-284`).

### [LOW · S] App `ComplianceDashboardData` omits the server's `today` field — divergent
- **Web:** `loadComplianceDashboard` returns a venue-local `today` used as the day-boundary source of truth (`dashboard-service.ts:61-68,158`; `ComplianceDashboardView.tsx:125`).
- **App:** `ComplianceDashboardData` (`types/compliance.ts:38-42`) omits `today`; the app recomputes `todayStr` client-side (`compliance.tsx:273`) — usually equivalent, latent drift if `venue.timezone` is stale.
- **Work:** add `today: string` to the type; prefer `dashboard.data.today` with the client computation as fallback.

---

## Domain 11 — Contact/guest compliance history, merge & GDPR

**Parity: partial (merge + GDPR erase at full parity).** Merge (`MergeContactDetailSheet` → `POST /guests/merge`) and GDPR erase (`GdprSection` → `POST /gdpr/erase-guest`) are entirely server-driven and identical to web — merged guests keep their compliance history; erase does storage cleanup + hard-delete + append-only audit + `guest.compliance_erased`. `record.viewed` audit is preserved server-side. Divergence is confined to the guest-compliance read surface and the decision workflow.

App files: `components/clients/ComplianceSection.tsx`, `components/bookings/ComplianceCard.tsx`, `components/compliance/ComplianceRecordSheet.tsx`, `lib/queries/useCompliance.ts`.
Web refs: `src/components/dashboard/compliance/ComplianceSection.tsx`, `shared.ts`, `src/app/api/venue/compliance/records/[id]/route.ts`.

### [HIGH · M] Cannot record a pass/fail decision on an undecided record — missing ⇄ Domain 5 (single implementation).

### [MEDIUM · M] Contact panel drops the pending form-links block — missing
- **Web:** the guest-scope `ComplianceSection` shows a pending-only Form-links block per link: type name, "Sent by … · Expires DD/MM/YYYY", "Awaiting completion" pill, and Copy link (`/p/forms/[code]`), Resend email, Resend SMS, Revoke.
- **App:** `components/clients/ComplianceSection.tsx` drops `form_links` entirely (though the app **has** all those mutations, used elsewhere).
- **Work:** read `guestQuery.data.form_links` (already on the response), render a pending-only block; wire Resend to `useResendFormLink`, Revoke to `useRevokeFormLink`, Copy to `expo-clipboard` (`${webOrigin}/p/forms/${code}`); add an "Awaiting completion" badge; refetch on any action.

### [LOW · S] Result rendered as a raw token instead of `RESULT_LABELS` — divergent
- **Web:** friendly `RESULT_LABELS` (pass→Pass, fail→Fail, inconclusive→Inconclusive, completed→Completed, signed→Signed) in the list row + dialog (`shared.ts`).
- **App:** raw `rec.result` in `ComplianceSection`, `ComplianceCard`, `ComplianceRecordSheet`.
- **Work:** add a shared `RESULT_LABELS` map (Domain 1 shared module); replace the raw renders.

### [LOW · S] Contact audit trail omits the `guest.compliance_erased` label — divergent ⇄ Domain 13
- **Web:** `AUDIT_EVENT_LABELS` maps it → "Compliance data erased" (`shared.ts`).
- **App:** the inline map in `components/clients/ComplianceSection.tsx` (and the duplicate in `ComplianceCard.tsx`) omits it → raw token.
- **Work:** add the entry; dedupe the two maps into the shared const.

### [LOW · S] No "Awaiting decision" pill for a completed record with null result — missing
- **Web:** an extra "Awaiting decision" pill next to the status pill for `status==='completed' && result==null`.
- **Work:** render a warning-tone badge in the record rows of `ComplianceSection` + `ComplianceCard` (pairs with the decision PATCH).

---

## Domain 12 — Settings & config toggles

**Parity: partial.** Core three controls (form-link channel, reminder cadence, form-link expiry) persist through the same `PATCH /api/venue/feature-flags` with matching keys. But there is a confirmed config-shape drift and one enum bug that can lose the venue's config.

App files: `app/(app)/manage/compliance-settings.tsx`, `types/venue.ts`, `app/(app)/manage/compliance.tsx` (enable/disable).
Web refs: `src/lib/compliance/config.ts`, `src/app/dashboard/settings/sections/ComplianceSettingsSection.tsx`, `src/lib/feature-flags/types.ts`, `src/app/api/venue/feature-flags/route.ts`.

### [HIGH · S] `default_form_link_channel` offers a `both` option the web enum rejects — divergent (data-loss risk)
- **Web:** `COMPLIANCE_FORM_LINK_CHANNELS = ['email','sms']`; `default_form_link_channel: z.enum(['email','sms']).default('email')` (`config.ts:15,30`); the web select renders only Email/SMS.
- **App:** `LINK_CHANNEL_OPTIONS` includes `{ value:'both' }` (`compliance-settings.tsx:31-35`) and `types/venue.ts:52` types it `'email'|'sms'|'both'`. Selecting "Both" writes `default_form_link_channel:'both'`, which fails `complianceConfigSchema` — the PATCH can 400 the whole save, or a persisted invalid value makes `parseComplianceConfig` `safeParse`-fallback to `DEFAULT_COMPLIANCE_CONFIG`, silently discarding the venue's other compliance settings.
- **Work:** remove the `both` option; narrow the type to `'email'|'sms'`. (**Wave 1.**)

### [HIGH · M] Retired `auto_send_on_booking` toggle still written; web `.strip()`s it — divergent ⇄ Domain 1
- **Web:** the schema has no such key (grep across `_reference/Resneo/src` = 0 hits); auto-send moved to per-requirement `online_collection`.
- **App:** `types/venue.ts:59-60,75` models it; `compliance-settings.tsx:69,80,128,215-223` renders a Switch + writes it; the backend strips it, so the toggle does nothing.
- **Work:** remove the key + Switch + payload field; add the per-requirement `online_collection` control (Domain 3) as the real replacement.

### [MEDIUM · S] `reminder_cadence_days` default mismatch (app 7 vs web 0) — divergent
- **Web:** `.default(0)` (`config.ts:32`; `config.test.ts:17-19`).
- **App:** `types/venue.ts:72` sets 7 — a never-saved venue pre-fills 7 and, if saved untouched, turns on reminders the web would leave off.
- **Work:** change the default to 0.

### [LOW–MEDIUM · S] "Enable compliance records" toggle absent from the settings screen — divergent (present elsewhere)
- **Web:** the enable checkbox lives inside the General settings panel (`ComplianceSettingsSection.tsx:417-431`), saved in the same PATCH.
- **App:** `compliance-settings.tsx` only passes the existing `recordsEnabled` through; enable/disable is on a **different** screen (`app/(app)/manage/compliance.tsx:186-205,360-377`). Web = one panel; mobile = two screens.
- **Work:** optionally mirror an enable Switch at the top of the settings screen (confirm it doesn't conflict with the enable/disable flows in `manage/compliance.tsx`).

### [LOW · S] App surfaces `default_capture_method` + `lock_period_hours` controls the web General panel retired — divergent
- **Web:** both keys still exist in the schema (defaults `'both'` / `0`) but the web panel renders only channel, reminder cadence, expiry; `lock_period_hours` is now per-requirement.
- **App:** renders a `default_capture_method` segmented + a `lock_period_hours` input (`compliance-settings.tsx:162-167,208-214`). Defaults match web so they round-trip cleanly (no shape break) — just controls web retired.
- **Work:** decide keep-for-compat vs drop to match web's leaner panel; if dropping the venue-level `lock_period_hours` input, keep the key (default 0) to avoid stripping an accepted value.

---

## Domain 13 — Access control, audit, rate-limiting & comms

**Parity: strong (partial).** The app gates compliance on the same rule the server enforces (`isAppointmentPlanTier(pricing_tier) && compliance_records_enabled`), gates admin-only mutations behind the same `requireAdmin` the routes enforce, handles 402/403 gracefully, and already surfaces the per-guest audit trail. Rate-limiting is correctly server-only. Gaps are comms-labelling and reminder-history surfacing.

App files: `lib/navigation/more-destinations.ts`, `app/(app)/client/[id].tsx`, `components/clients/ComplianceSection.tsx`, `types/communications.ts`, `lib/communications/display-labels.ts`, `types/compliance.ts`.
Web refs: `src/lib/compliance/page-access.ts`, `auth.ts`, `audit.ts`, `rate-limit.ts`, `src/lib/feature-flags/resolve.ts`, `src/lib/communications/policy-resolver.ts`, `policies.ts`, `renderer.ts`, `migrations/20261204120000_*` + `20261206120000_*`.

### [MEDIUM · M] `CommunicationMessageKey` union missing the compliance + class-commerce keys — divergent/stale
- **Web:** `policies.ts` `CommunicationMessageKey` includes the 3 compliance keys (+ `COMPLIANCE_MESSAGE_KEYS`) and 9 class-commerce keys.
- **App:** `types/communications.ts:66-79` stops at `appointment_waitlist_offer`. This feeds the comms preview + communications settings, so compliance/class comms policies can't be previewed or toggled in-app despite backend support.
- **Work:** extend the union to match web; surface compliance policy rows (enable + channels) in `app/(app)/manage/communications.tsx` (web allows email+sms per `ALLOWED_CHANNELS_BY_MESSAGE`); verify `CommunicationPreviewRequest/Response` accept the new keys.

### [MEDIUM · M] No compliance reminder / send-history surface — partial
- **Web:** the Dec-2026 reminder migration added `reminder_count` + `last_reminded_at` to `compliance_form_links`; sends land in `communication_logs` with the new types.
- **App:** form links show only as actionable rows; `reminder_count`/`last_reminded_at` are never surfaced and `ComplianceFormLink` (`types/compliance.ts:44-55`) has no reminder fields. Staff can't see "reminded 2/3, last chased 3 days ago".
- **Work:** add `reminder_count?`/`last_reminded_at?` to `ComplianceFormLink`; render a "reminders: N, last chased …" line on awaiting/link rows; optionally show the guest's compliance comm-log entries.

### [LOW · S] Client audit trail omits `guest.compliance_erased` — divergent ⇄ Domain 11 (single implementation).

### [LOW · S] Comm-log labels don't name the compliance message types — partial (shared with web)
- **Web:** the same `display-labels.ts` is byte-identical and also omits friendly titles for the three compliance keys (and `appointment_waitlist_offer`) — a shared limitation, not a divergence, but it affects how compliance sends read in the app's per-booking comms log.
- **Work:** add friendly titles to the `titles` map in `lib/communications/display-labels.ts` (+ test); ideally mirror upstream, but the app can lead safely (pure formatting).

### [LOW · S] `apiFetch` has no 429 branch — present-verify (mostly not-a-gap)
- Rate-limiting guards only the **public** form endpoints (per IP/code); the staff app calls only authenticated venue routes, so it shouldn't hit the limiter. Optional: a friendly 429 message in `getApiErrorMessage` (`lib/api/client.ts`).

### Not a gap (server-only, correctly not the app's responsibility)
Rate-limiting (`rate-limit.ts`); audit **writes** (`writeComplianceAuditEvent` — the app correctly only reads audit events); reminder/expiring **cron** (runs off config the app already edits); comms **rendering/delivery** (`send-templated.ts`, `outbound.ts`, `policy-resolver.ts`, `renderer.ts` — the app triggers sends and does not render templates).

---

## Cross-cutting / coverage findings

1. **Shared compliance UI helpers/constants (`src/components/dashboard/compliance/shared.ts`).** The single source of truth for the compliance UI vocabulary (enforcement options/labels/descriptions, online-collection options, category/result labels, requirement-state→pill, record-status pills, audit-event labels, date formatting, the shared row interfaces). Porting it into the app's shared module (Domain 1) underpins Domains 3, 5, 11.
2. **Compliance comm-template rendering (`src/lib/communications/renderer.ts`).** The actual body generation for `compliance_form_request` / `_reminder` / `record_expiring`, plus the "Forms to complete before your visit" block injected into confirmation emails. Server-side; relevant only if the app ever previews compliance comms (Domain 13).
3. **Booking edit/reschedule enforcement (`src/app/api/venue/bookings/[id]/route.ts`).** The PATCH handler re-runs compliance + enforces `block_all` with admin override — captured as the Domain 9 "verify" item.

---

## Stale docs (Wave 0 — refresh or supersede)

- **`Docs/parity/compliance-forms-records-expiries.md`** — **materially stale.** "~35% parity"; describes the app as a "three-section dashboard" and lists in-venue capture, record view/void, today's check-in panel, guest audit trail, booking-flag badges, and **all** type-management/form-builder flows as "missing." All of these now ship. Rewrite or banner as superseded by this report.
- **`Docs/audit-r7/13-compliance-forms.md`** — R7-era; says "no general-settings panel," "no type creation," "template list is discovery-based," builder "read-only" — all now contradicted by `compliance-settings.tsx`, `compliance-types.tsx` (Create/Library/Archive), `useComplianceTemplatesList`, and the real field builder. It also predates the Dec-2026 migrations, so it doesn't flag the `online_collection`/`online_unmet_message`/`client_booking`/comm-log gaps.
- **`Docs/APP_GAP_REPORT_R7.md`** — a pre-implementation planning artifact whose domain-13 body was implemented on `feat/r7-parity-implementation`; treat its compliance section as historical, not current-state.

---

## Appendix — web compliance surface (reference inventory)

`src/lib/compliance/` (28 modules): audit, auth, auto-send, booking-capture, booking-flags, check-in, config, constants, dashboard-service, dispatch, enforce-booking, expiry-cron, files, form-draft, form-links-service, form-schema, gdpr, library/*, page-access, public-forms-service, rate-limit, records-service, requirements-service, resolve-requirements, short-code, slug, types-service, zod-schemas.
API: `src/app/api/venue/compliance/**` (types + versions/duplicate/archive/restore, requirements, records + upload/file/void, form-links + resend/revoke, library + clone, dashboard, booking-flags) · `src/app/api/public/compliance/**` (forms/[code] + submit/file, pre-check, booking-upload, inline-forms) · `venue/bookings/[id]/compliance`, `venue/guests/[guestId]/compliance`, `cron/compliance-expiry`.
UI: `src/app/dashboard/compliance/*`, `compliance-types/*`, `settings/sections/ComplianceSettingsSection.tsx`, `src/components/dashboard/compliance/*`, `src/components/booking/*Compliance*`, `src/app/p/forms/[code]/*`.
Migrations: `2026120{3,4,5,6,7}_*` + `2026122{9},1230,1231_*` (records, comm_log_types, merge_guests, form_link_reminders/dedup, in_booking_collection, merge_guests dedup).

_Audit method: 13 domains, each web-inventory → app-comparison, with an adversarial coverage pass. Web mirror @ `origin/main 1a237cd4` (2026-07-01)._
