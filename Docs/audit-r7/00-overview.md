# Resneo — Mobile App vs Web Staff Dashboard: Comprehensive Parity & Polish Audit (R7)

**Date:** 2026-06-17 · **Scope:** staff/venue-operator parity with the web dashboard (/dashboard/*, /email-templates, settings). Out of scope: customer booking flow, marketing/SEO pages, super-admin. **Method:** code-level comparison of the app against the web mirror at _reference/Resneo (the authed web dashboard cannot be driven live: CORS + light-only preview + no Android emulator), with an adversarial verification pass on every claimed gap. **North Star:** a staff user can do almost everything in the app that the web allows, with a beautiful, intuitive UI.

## Executive summary

The Resneo mobile app is a mature, broadly feature-complete staff client. Across 18 audited domains, 12 are at **strong** parity and 6 are **partial**; none are weak or stub-level. The day-to-day operational core — Calendar/Diary, Bookings list & detail, Clients, Classes & Events, Resources, Waitlist, Settings/Account/Team, Communications, and Linked Venues — all rate strong, with most remaining gaps being polish (UI density, stats strips, tooltips) rather than missing capability. The app is not a thin companion: it owns full in-app CRUD for the booking page, services with inline variants/add-ons, resource scheduling with a date-exceptions calendar, business-hours closures, push-notification preferences, and a complete linked-venues/collectives surface. The headline finding is the same as prior rounds — the app's risk is concentrated in a handful of correctness/coverage gaps, not in breadth.

The dominant **strengths** are consistent: a single shared design system (Sheet/Screen/Card/Badge primitives, Toast host, keyboard-avoidance plumbing), model-driven feature gating that mostly mirrors the web, and read paths that already carry the data needed to close many UI gaps (e.g. KPI forecasts, deposit amounts, per-model report rows arrive in payloads the app simply doesn't render yet). Many medium/low items are therefore "wire up data already on the client" rather than new backend work — a sign the architecture is sound.

The dominant **systematic weaknesses** are three. First, **role gating is too coarse**: several surfaces are hard-gated to admins where the web allows self-service for ordinary staff — model links in nav (Classes/Events/Resources), service management and per-calendar overrides, and staff-leave targeting. Second, the **booking-creation envelope is narrower than the web's**: the wizard cannot create group bookings or multi-service back-to-back visits, and there is no in-app Stripe/card capture during booking — a real operational ceiling for multi-service venues. Third, **compliance/intake authoring is read-only**: staff can capture against existing forms but cannot create a compliance type, build/reorder form fields, set per-service requirements, or configure compliance defaults — the single least-complete domain in the audit.

The most acute **production-readiness threats** cluster in two domains. **Compliance & Intake Forms** is the weakest area: 3 critical + 4 high gaps, because the entire builder/requirements/settings authoring stack is missing (much of it blocked on web routes not yet being Bearer-capable). **Availability & Bookable Calendars** carries a critical gap — there is no way to create, edit, activate, reorder, assign, or get booking links for bookable calendars in the app — plus a data-loss-class issue where narrowing hours past existing bookings fails outright instead of offering the web's "Save anyway?" acknowledgement. The **New booking wizard** adds two more criticals (group + multi-service). Rounding out the criticals: there is no self-serve "Delete this venue" danger zone in Settings.

Net: the app is close to production-ready for single-service, single-attendee, appointments-first venues, and already exceeds a typical "mobile companion." To claim full staff parity, the critical path is narrow and well-defined — unblock and build compliance authoring, ship bookable-calendar management plus the hours-acknowledgement flow, extend the wizard to group/multi-service (and ideally in-app payment), relax the over-tight admin gates, and add the missing money-adjacent surfaces (referrals, venue deletion). Everything else is graceful polish that raises the UI from good to best-in-class.

## Parity scoreboard

| # | Domain | Parity | Critical | High | Medium | Low |
|---|--------|--------|---------|------|--------|-----|
| 01 | Navigation & Information Architecture | strong | 0 | 1 | 3 | 2 |
| 02 | Calendar / Diary | strong | 0 | 0 | 5 | 2 |
| 03 | Bookings — list, filters & detail | strong | 0 | 0 | 2 | 6 |
| 04 | New booking / booking wizard | partial | 2 | 1 | 4 | 2 |
| 05 | Clients / Contacts / Guests & Import | strong | 0 | 1 | 1 | 5 |
| 06 | Classes & Events | strong | 0 | 2 | 1 | 5 |
| 07 | Resources, Floor-plan & Tables | strong | 0 | 0 | 0 | 4 |
| 08 | Availability, Business Hours & Closures | partial | 1 | 1 | 2 | 3 |
| 09 | Waitlist | strong | 0 | 2 | 2 | 2 |
| 10 | Dashboard Home, Reports & Referrals | partial | 0 | 1 | 2 | 7 |
| 11 | Services / Appointment Services & Add-ons | strong | 0 | 2 | 3 | 3 |
| 12 | Booking Page / Widget editor | partial | 0 | 1 | 3 | 3 |
| 13 | Compliance & Intake Forms | partial | 3 | 4 | 3 | 2 |
| 14 | Settings, Account, Venue Profile, Plan/Billing & Team | strong | 1 | 1 | 3 | 2 |
| 15 | Communications, Email Templates & Notifications | strong | 0 | 1 | 1 | 1 |
| 16 | Linked Venues & Collectives | strong | 0 | 0 | 1 | 4 |
| 17 | Auth, Onboarding & Support | partial | 0 | 2 | 2 | 2 |
| 18 | Design Language & UX Consistency | strong | 0 | 0 | 0 | 5 |
| | **TOTAL** | | **7** | **20** | **38** | **61** |

## Top priorities — the critical path to production-ready

1. **Build compliance authoring (type create + field builder)** — _Compliance (13), Critical._ Staff can capture but cannot create a compliance type or add/edit/reorder/delete form fields, so any new intake requirement needs the web. _Fix:_ make `POST /types` and `/types/[id]/versions` Bearer-capable, add a create mode + a mobile field editor to `ComplianceTypeEditorSheet`, porting `validateFormSchemaForType`.

2. **Per-service compliance requirements editor** — _Compliance (13), Critical._ Without it, captured records can't be tied to the services that require them, breaking the compliance gate end-to-end. _Fix:_ add `useComplianceRequirements` (GET + POST/PATCH/DELETE) and a `ComplianceRequirementsEditor` in the service editor; confirm `/requirements` is Bearer-capable.

3. **Bookable-calendar management** — _Availability (8), Critical._ No way to create/edit/activate/reorder/assign or get booking links for calendars; a multi-practitioner venue cannot be set up from the app. _Fix:_ admin-gated `BookableCalendarsManager` reusing `usePractitioners`/`useCreateHostCalendar`, extend `PatchPractitionerInput` with sort_order+slug, add DELETE, mirror `BookableCalendarsPanel`.

4. **Group bookings in the wizard** — _New booking (4), Critical._ Cannot book multiple distinct attendees; a real ceiling for parties/group classes booked at the desk. _Fix:_ add group_* StepKeys reusing per-step components per attendee + a `useCreateGroupBooking` mutation; ship same-service party-of-N first.

5. **Multi-service back-to-back visits** — _New booking (4), Critical._ One client cannot book chained services in a single visit. _Fix:_ add a multi_service review step after slot selection (segments + Add another service), recompute chained starts, add `useCreateMultiServiceBooking`.

6. **"Save anyway?" when narrowing hours past existing bookings** — _Availability (8), High (data-loss-class)._ The app errors instead of the web's acknowledgement flow, blocking a legitimate edit. _Fix:_ thread `{ acknowledge }` → `?acknowledge_affected_bookings=true` through hours/practitioner mutations and add an armed-confirm; requires `ApiError` to expose status + body.

7. **Self-serve "Delete this venue" danger zone** — _Settings (14), Critical._ No way to request venue deletion in-app; an account-lifecycle gap. _Fix:_ `DeleteVenueSheet` (type-to-confirm) under `plan.tsx`, `useVenueDeletion` against `/api/venue/delete-request` GET/POST/cancel.

8. **In-app card/Stripe capture during booking** — _New booking (4), High._ Staff can't take payment at create time; deposits/prepay fall back to links. _Fix:_ integrate `@stripe/stripe-react-native` PaymentSheet in `ConfirmStep` when create returns client_secret + stripe_account_id.

9. **Relax over-tight admin gates (services + model nav)** — _Services (11) High & Navigation (1) High._ The web lets ordinary staff manage their own services and see Classes/Events/Resources; the app hides both. _Fix:_ move `SECONDARY_MODEL_ROWS` out of the isAdmin block; relax services gating to the linkedPractitionerIds model (surface staff→calendar linkage via `useStaffMe`).

10. **Set-password screen for invited staff / reset recipients** — _Auth (17), High._ Invited staff and password-reset users have no in-app screen to set a password. _Fix:_ `set-password.tsx` keyed on recovery/invite otpType → `POST /api/venue/staff/change-password`; repoint reset redirectTo.

11. **Class Products / class-commerce surface** — _Classes & Events (6), High._ Credit packs, courses, memberships and enrollment refunds are entirely absent. _Fix:_ gated `class-products.tsx` behind `useClassCommerceEnabled()` + `useClassProducts` wrapping the Bearer route groups; phase credit packs → courses → memberships.

12. **Compliance general-settings + signature capture** — _Compliance (13), High ×2._ Defaults (capture method/channel/reminders/expiry/lock/auto-send) can't be set, and signatures are typed-only. _Fix:_ nested compliance config on feature flags + a settings screen; add a drawn-signature control (or at minimum emit `{ method:'typed' }`).

13. **Referrals / Refer & Earn** — _Reports (10) High, also Settings (14) & Navigation (1)._ The whole programme is missing across nav, home and reports. _Fix:_ `refer-earn.tsx` (code + shareable link, 3 KPI cards, list) + a Bearer `GET /api/venue/referrals` and `useReferrals`; admin-gated tile.

14. **Cross-dashboard waitlist alert + in-app enablement** — _Waitlist (9), High ×2._ Open-slot offers only appear on the Waitlist screen, and there's no in-app way to enable the waitlist or pick its mode. _Fix:_ a global `WaitlistAvailabilityBanner` mounted in `_layout.tsx`, plus a Waitlist section in booking-settings using `useUpdateFeatureFlags`.

15. **CSV/Excel contact import (or explicit link-out)** — _Clients (5), High._ No import path in-app. _Fix:_ accept as a v1 exclusion but surface the link-out from the Contacts tab; if pursued, scope a single-file clients CSV upload reusing `/api/import/sessions`.

## Master backlog (all gaps)

| Severity | Domain | Gap | Category | Fix |
|----------|--------|-----|----------|-----|
| Critical | 04 New booking | Cannot create group bookings (multiple distinct attendees) | function | Add group_* StepKeys reusing per-step components per attendee + `useCreateGroupBooking`; ship party-of-N first. |
| Critical | 04 New booking | Cannot create multi-service back-to-back visits for one client | function | Add a multi_service review step after slot selection, recompute chained starts, add `useCreateMultiServiceBooking`. |
| Critical | 08 Availability | No bookable-calendar management (create/edit/delete/activate/reorder/assign/booking-link) | function | Admin-gated `BookableCalendarsManager`; reuse `usePractitioners`/`useCreateHostCalendar`, extend `PatchPractitionerInput` (sort_order+slug), add DELETE, mirror `BookableCalendarsPanel`. |
| Critical | 13 Compliance | Cannot create a compliance type in the app | function | Make `POST /types` Bearer-capable, add create mode to `ComplianceTypeEditorSheet` + `useCreateComplianceTemplate` + admin "Create custom type" button. |
| Critical | 13 Compliance | Form-field builder is entirely read-only (no add/edit/reorder/delete) | function | Build a mobile field editor, port `validateFormSchemaForType`, add `useCreateComplianceVersion` (POST `/types/[id]/versions`). |
| Critical | 13 Compliance | No per-service compliance requirements editor | function | Add `useComplianceRequirements` (GET + POST/PATCH/DELETE) + a `ComplianceRequirementsEditor` in the service editor; confirm `/requirements` Bearer-capable. |
| Critical | 14 Settings | No self-serve "Delete this venue" danger zone | function | `DeleteVenueSheet` (type-to-confirm) under `plan.tsx` + `useVenueDeletion` against `/api/venue/delete-request` GET/POST/cancel. |
| High | 01 Navigation | Model links (Events/Classes/Resources) hidden from non-admin staff | function | Move `SECONDARY_MODEL_ROWS` out of the `if (isAdmin)` block so model links render for staff when the model is enabled. |
| High | 05 Clients | CSV/Excel contact import entirely absent | function | Keep link-out for v1; surface it from the Contacts tab overflow; if built, scope a single clients CSV → `/api/import/sessions`. |
| High | 06 Classes & Events | Class Products / class-commerce surface missing (credit packs, courses, memberships) | function | Gated `class-products.tsx` behind `useClassCommerceEnabled()` + `useClassProducts` over the three Bearer groups; phase credit packs → courses → memberships. |
| High | 06 Classes & Events | Course enrollment management + refunds unavailable | function | Port `CourseEnrollmentsPanel` into `CourseEnrollmentsSheet` calling enrollments + cancel; surface refunded amount in a Toast. |
| High | 08 Availability | Narrowing hours past bookings fails instead of "Save anyway?" | function | Thread `{ acknowledge }` → `?acknowledge_affected_bookings=true` through hours/practitioner mutations + armed-confirm; expose status+body on `ApiError`. |
| High | 09 Waitlist | No cross-dashboard open-slot alert banner | function | `WaitlistAvailabilityBanner` reusing `useWaitlistAlerts`/`useActOnWaitlistAlert`, mounted once in `_layout.tsx` with Offer/Dismiss/View. |
| High | 09 Waitlist | No in-app screen to enable waitlist or choose slot-opens mode | function | Waitlist section in `booking-settings.tsx`: Switch for `waitlist_v2` + 3-option mode selector via `useUpdateFeatureFlags`. |
| High | 10 Reports | Referrals / Refer & Earn programme entirely absent | function | `refer-earn.tsx` (code + link, 3 KPI cards, list) + Bearer `GET /api/venue/referrals` + `useReferrals`; admin-gated tile. |
| High | 11 Services | Non-admin staff cannot manage services at all | function | Relax isAdmin gating to the linkedPractitionerIds model (create on controlled calendars, created_by_staff_id-scoped edit/delete, per-calendar toggle); surface staff→calendar linkage first. |
| High | 11 Services | No per-calendar staff field overrides (StaffServiceOverrideModal) | function | `useUpdateServiceOverride` (PATCH overrides) + a `StaffServiceOverrideSheet` rendering only `staff_may_customize_*`-permitted fields with null-when-equals-base diffing. |
| High | 12 Booking Page | No website embed / iframe snippet generator | function | Embed Card on `booking-page.tsx`; port `buildVenueEmbedSnippet` into `lib/embed/embedSnippet.ts`; build from `getWebUrl()`+slug, Copy via expo-clipboard. |
| High | 13 Compliance | No compliance general-settings panel (defaults) | function | Nested compliance config on `VenueFeatureFlagsRaw` + a settings screen reading `raw.compliance`, saving via `useUpdateFeatureFlags`. |
| High | 13 Compliance | No "Add from library" template cloning | function | Make `/library` + clone Bearer-capable; add `useComplianceLibrary` + `useCloneComplianceTemplate` + an "Add from library" Sheet; invalidate compliance keys. |
| High | 13 Compliance | Template list omits never-used types and service/record counts | function | Make `GET /types` Bearer-capable; replace the discovery hack with `useComplianceTemplatesList` rendering service_requirement_count + record_count. |
| High | 13 Compliance | Signature capture is typed-only (no drawn signature) | function | Add a drawn-signature control for `signature` fields emitting `{ method:'drawn', data, signed_at }`; at minimum emit `{ method:'typed' }` not a bare string. |
| High | 14 Settings | Staff invite ignores the plan seat cap | function | Add `planStaffLimit()`; compute `staffPlanLimitReached`, hide the invite FAB when reached, show an upgrade nudge to `/manage/plan`. |
| High | 15 Communications | Web "New booking alert" owner email + recipient missing | function | "New booking alert" card on `communications.tsx` (Switch + Input) bound to `owner_booking_notification_*`; add fields to `VenueBootstrap`, validate, PATCH `/api/venue`. |
| High | 17 Auth | No in-app onboarding / first-run setup wizard | function | Phase 1: make `SetupChecklistCard` a real model-aware onboarding surface pinned when `onboarding_completed===false`. Phase 2: `onboarding.tsx` sequencing existing editors. |
| High | 17 Auth | No set-password screen for invited staff / reset recipients | function | `set-password.tsx` keyed on recovery/invite otpType → `POST /api/venue/staff/change-password`; repoint reset redirectTo; reuse account.tsx validation. |
| Medium | 01 Navigation | No Refer & Earn surface in the app | function | `manage/referrals.tsx` + isAdmin destination row mirroring web `ReferralsDashboardContent`; minimum: an isAdmin row opening the web tab via `openWeb()`. |
| Medium | 01 Navigation | No contact / booking data import in the app | function | isAdmin "Import contacts" row opening `/dashboard/import` via `openWeb()`; native importer is a larger follow-up. |
| Medium | 01 Navigation | Today/Home is not the launch screen and is buried in More | ui | Add a "Today" IconButton to the Calendar-tab header routing to `/today`; evaluate a Home/Today tab. |
| Medium | 02 Calendar | No visible-window / time-range control on the grid | function | from/until hour control on `MonthPickerSheet`; extend `computeGridBounds` with an override window, thread through Day/Week/All grids, persist via AsyncStorage. |
| Medium | 02 Calendar | No persisted per-user calendar preferences | function | Persisted-prefs hook (AsyncStorage) storing `{ scope, selectedId, startHourOverride, endHourOverride }` keyed by venue id, hydrated into `CalendarScreen` with stale-id guard. |
| Medium | 02 Calendar | Month grid lacks type-colored dots, heatmap, open/closed labels, linked counts | ui | Enrich `MonthGrid.tsx`: per-type counts from grid+schedule queries, up to four dots, intensity tint, Open/Closed label, optional linked "+N" chip. |
| Medium | 02 Calendar | Empty-slot quick menu omits Walk-in and resource-booking entry | function | In the add-sheet, add a slot-aware Walk-in button and a resource section filtered by `display_on_calendar_id`, routing to the resource flow with prefill. |
| Medium | 02 Calendar | Week view cannot show the whole team at once | function | Make the "All" chip selectable in week scope; render a read-only `WeekMatrixGrid` (practitioner rows × 7 day columns) from `gridQuery.data`. |
| Medium | 03 Bookings | No summary stats bar on the bookings list | function | Compact stats strip below the toolbar computing total/confirmed/completed/no-shows from `searchedRows`; gate on viewport. |
| Medium | 03 Bookings | List does not collapse multi-service visits into one row | ui | Port `collapseMultiServiceVisits` into `lib/booking/` and apply in the listRows memo before date grouping; representative row still opens the detail sheet. |
| Medium | 04 New booking | No in-app card/Stripe payment capture during booking | function | Integrate `@stripe/stripe-react-native` PaymentSheet in `ConfirmStep` when create returns client_secret + stripe_account_id; else document the link divergence. |
| Medium | 04 New booking | No client-address collection for at-home services | function | Thread `location_type` through `useAppointmentCatalog`; render an address fieldset in `GuestDetailsStep` for client_address services + `client_address_*` in buildPayload. |
| Medium | 04 New booking | No ?tab= deep-link persistence or reset-on-re-entry | ui | Sync activeTab to a router param; key the flow subtree on a focus-cleared reset token (`useFocusEffect`). |
| Medium | 04 New booking | Rebook pre-fill only works for appointments | function | Add resource (and optionally class/event) shapes to `lib/rebook-bootstrap.ts`; consume in `ResourceBookingFlow` reusing the guarded-apply pattern. |
| Medium | 05 Clients | No import session history / status / undo surface | function | Read-only "Recent imports" + Undo under Data import in `venue-profile.tsx`, backed by `GET /api/import/sessions` + undo POST. |
| Medium | 06 Classes & Events | No month-grid calendar view of class sessions | ui | Segmented "Agenda \| Month" toggle on `classes.tsx` reusing `MonthDatePicker` + the `useClassSessions` feed to render session chips by day. |
| Medium | 08 Availability | Reduced-capacity closures missing yield overrides and service scope | function | Extend draft state to populate `yield_overrides` + `service_id` with numeric Inputs + a service picker, gated to the restaurant-table tier. |
| Medium | 08 Availability | Non-admin staff can target other calendars' leave | function | When `!isAdmin` hide the practitioner chip row, lock practitionerId to `staff.linked_calendar_ids[0]`, disable Edit on leave/blocks not owned. |
| Medium | 09 Waitlist | Staff add-to-waitlist supports all-day only (no window, no notes) | function | Extend `WaitlistJoinSheet` with a preferred-time toggle + Notes; widen `useJoinWaitlist` input to send `preferred_window:'time_range'` + notes. |
| Medium | 09 Waitlist | Add-to-waitlist only reachable from the wizard empty-slot state | function | Lift/export `WaitlistJoinSheet`; add a header "Add" action on `waitlist.tsx` with service/date/practitioner pickers. |
| Medium | 10 Reports | 7-day capacity heatmap / outlook not rendered | function | `HeatmapWeek.tsx` rendering `payload.heatmap` with fill-percent colour; render in `today.tsx` when `!isAppointment`. Data already in payload. |
| Medium | 10 Reports | Dashboard home is not the app's landing screen | design | Intentional IA divergence; if closer parity wanted, surface home KPIs atop the Calendar tab or promote Today to a tab. |
| Medium | 11 Services | Service form lacks embedded per-service compliance requirements editor | function | Admin-only, edit-mode "Compliance requirements" card gated by the compliance flag; reuse `useCompliance` types + the per-service requirement endpoint. |
| Medium | 11 Services | Custom-availability editor only authors weekly rules | function | Extend `ServiceCustomAvailabilityEditor` to author `specific_dates` + `date_range_pattern` rules; round-trip plumbing already preserves them. |
| Medium | 11 Services | No live service availability preview in the form | ui | Optional read-only week/day preview fed by venue hours + practitioner working_hours + form.customSchedule; else document as a simplification. |
| Medium | 12 Booking Page | No embed accent colour field (embed_accent_colour) | function | Reuse the `ColourField` helper; persist `{ embed_accent_colour }` via `useUpdateVenue`; add to the venue type; feed `?accent=` in the snippet. |
| Medium | 12 Booking Page | No QR code generation or download | function | QR Card generating from `publicUrl` via `react-native-qrcode-svg` (verify v56); share via expo-sharing, add view-shot only if a PNG is needed. |
| Medium | 12 Booking Page | Live preview is a static mock, not the real page | ui | Load preset Google fonts via expo-font; optionally add a native-gated WebView of `/embed/<slug>` + mobile/desktop toggle. |
| Medium | 13 Compliance | File-upload fields cannot be captured in-app | function | Add a `file` case to the capture sheet via expo-document-picker/image-picker mirroring the web upload flow; else render disabled with a "capture via client link" hint. |
| Medium | 13 Compliance | Capture sheet ignores intro markdown, help text and defaults | ui | Add `help_text` + `default_value` to the field type; render `description`/`intro_markdown` + per-field help; seed from `default_value` (resolve 'today'). |
| Medium | 13 Compliance | No pass/fail result_mapping support in capture | function | Covered by the builder gap: add a `ResultMappingEditor` and carry `result_mapping` in the form_schema so pass_fail types can be authored/captured. |
| Medium | 14 Settings | Refer & Earn (referrals) surface entirely missing | function | `referrals.tsx` + `useReferralsDashboard` + admin-gated destination in settings, or document referrals as an intentional exclusion. |
| Medium | 14 Settings | No in-app booking-widget / QR-code embed | function | "Share & embed" card on `booking-page.tsx`: clipboard iframe snippet, `embed_accent_colour` via `useUpdateVenue`, a QR generator with share/save. |
| Medium | 14 Settings | Phone fields not normalized to E.164 (no country picker) | function | Wire `normalizePhone()` into account/MyAccountSheet/venue-profile saves, ideally behind a shared `PhoneInput` with inline validation. |
| Medium | 15 Communications | Notification feed has no realtime/polling refresh | performance | Add `refetchInterval: 60_000` (+ `refetchIntervalInBackground:false`) to `useNotifications`; optionally a Supabase realtime subscription invalidating the list. |
| Medium | 16 Linked Venues | No live booking-page preview in the combined-page editor | function | Render `BookingPagePreview` above the form in `CombinedPageConfigEditor`, fed from current state + `assembleConfig()`. Wiring task only. |
| Medium | 17 Auth | Dashboard not gated on onboarding_completed | function | Read `useSetupStatus` in `_layout.tsx`; when `false` and admin route to onboarding or pin the checklist; don't hard-block non-admins; keep `keepPreviousData`. |
| Medium | 17 Auth | Setup checklist uses fixed steps, omits per-model catalog steps + progress bar | function | Refactor `SetupChecklistCard` to mirror web `getSteps`/`getSecondaryCatalogSteps`, append catalog rows when models include event/class/resource, add a progress bar. |
| Low | 01 Navigation | Web's single Settings page fragmented into ~15 routes with no hub | design | Keep the grouped index; extend the settings search filter with a keywords field indexing web tab synonyms. |
| Low | 01 Navigation | Waitlist/Compliance nav visibility diverges from web eligibility gating | function | Gate Compliance on `compliance_records_enabled` and show to staff; gate Waitlist/Calendar-availability with the model-eligibility helpers. |
| Low | 02 Calendar | No arbitrary multi-column subset filter (single-select only) | function | "Filter calendars" Sheet with a checkbox list feeding `visibleCalendarIds`, consumed by the All-day grid (default null = all). Lower priority. |
| Low | 02 Calendar | No on-grid resize for manual time blocks | function | Optionally wrap the editable-block overlay in the resize gesture committing via the block PATCH path; else document the sheet edit as the mobile equivalent. |
| Low | 03 Bookings | No blank "New booking for this guest" from the detail toolbar | function | "New for guest" QuickAction writing a rebook bootstrap with only the guest prefill (omit appointment) and pushing `/booking/new`. |
| Low | 03 Bookings | Guest-history visits offer no per-row rebook and navigate away | function | Per-visit Rebook via `writeRebookBootstrap` (extend the history payload with ids first); optionally open in a stacked detail sheet. |
| Low | 03 Bookings | Deposit actions require opening a sheet instead of one-tap inline | ui | Optional: surface Send link/Waive/Record cash/Refund inline in the Payments card, keeping `DepositSheet` for amount entry. Low priority. |
| Low | 03 Bookings | List row omits the deposit amount on the deposit pill | ui | Render `formatPence(deposit_amount_pence)` with the status when an amount exists. |
| Low | 03 Bookings | No Walk-in (seat immediately) entry point | function | Mostly restaurant scope; if wanted, a lightweight "Walk-in" opening `/booking/new` defaulted to now() with a walk-in intent; else document. |
| Low | 04 New booking | Resource date step shows no per-day availability indicator | ui | Add `useResourceMonthAvailability` and pass its date set to `MonthDatePicker` (replace `availableDates={null}`). |
| Low | 04 New booking | No waitlist join when a day is fully booked | function | Public-only on web; mirror only if staff-initiated waitlist adds are wanted. Documented as public-only. |
| Low | 05 Clients | Filter sheet omits the web's per-option helper hints | content | Render optional hint lines under the selected identity/segment option in `ContactFilterSheet`, mirroring web copy. |
| Low | 05 Clients | Bulk message semantics differ (broadcast vs per-guest) | function | Confirm intended semantics; if aligning, loop `/guests/[id]/message` per selected id; else document the divergence in-sheet. |
| Low | 05 Clients | No page-size control / explicit page-total indicator | function | Intentional infinite-scroll pattern; keep the "X of N" count + "All loaded" footer. Flagged for completeness. |
| Low | 05 Clients | Contact compliance view-only on mobile (no capture / send-link) | function | At parity with web (also read-only). No action; documented as intentional. |
| Low | 06 Classes & Events | No per-class-type filter on the timetable | function | Class-type chip/Segmented row above the SectionList, options from `useManagedClasses()`, filtering the sessions feed. |
| Low | 06 Classes & Events | Timetable stats bar absent | ui | Compute active types / sessions next 7 days / upcoming / booked spots and render a stats strip atop the classes screen. |
| Low | 06 Classes & Events | Event public booking link not surfaced on the Events screen | function | Copy/Open booking link actions on `EventManagerSheet` header, lifting publicUrl + copy/open logic from `booking-page.tsx`. |
| Low | 06 Classes & Events | Classes & Events buried in Settings | design | Surface Classes/Events from the Calendar-tab header or a quick-action when those models are enabled. |
| Low | 06 Classes & Events | Per-session admin cancel-and-notify only in the manager list | ui | Add "Cancel session & notify" to `ClassRosterView` header reusing `useCancelClassInstance`; fix the misleading footer note. |
| Low | 07 Resources | Entire restaurant table-management suite absent | function | Intentional scope exclusion; keep the Settings → Tables link-out. If pursued, build a read-mostly live floor status first; defer until restaurants enter scope. |
| Low | 07 Resources | No resource reordering (sort_order) in app | function | Confirm PATCH accepts sort_order, then add up/down IconButtons to `ResourceManagerSheet` cards via `useUpdateResource`. |
| Low | 07 Resources | Per-field help tooltips missing in resource editor | ui | Port web resource-booking-tooltip strings into a tappable InfoTooltip on the slot-interval + shortest-booking fields. |
| Low | 07 Resources | Resource detail StatTiles condensed to a caption | design | Optional expandable read-only detail surfacing weekly-hours rows + an exceptions summary, reusing data already on the record. |
| Low | 08 Availability | App can create "Special Event" closures the web doesn't offer | function | Trim `BLOCK_TYPES` to `['closed','amended_hours']` (+reduced_capacity on restaurant tier); keep label/colour maps so existing blocks display. |
| Low | 08 Availability | No legacy per-calendar "days off" migration banner | content | Add `days_off` to the practitioner type; render an amber notice when any practitioner has date-shaped days_off entries. |
| Low | 08 Availability | Restaurant capacity & booking-window config not in app | function | Intentional exclusion; if appointment-level min/max-advance windows are wanted, mirror `ServiceBookingRulesSection` into the service editor. |
| Low | 09 Waitlist | Confirmed entries have no tap-through to the resulting booking | ui | When an entry has `booking_id` and status `confirmed`, make the card push `/booking/${booking_id}`. |
| Low | 09 Waitlist | Offer-expiry shown as relative countdown only | design | Optionally append the absolute time in `offerExpiryLabel`, e.g. "expires in 2h 10m (14:35)". |
| Low | 10 Reports | Secondary booking-activity section missing for hybrid table venues | function | When `table_focus_secondaries_enabled`, render a section reusing `KpiGrid` + `ForecastChart`. Hybrid restaurant venues only. |
| Low | 10 Reports | KPI tiles lack the inline 7-day sparkline | ui | Add a `MiniSparkline` (reuse `SvgLineChart`) inside the primary KPI tile, passing the forecast already loaded. |
| Low | 10 Reports | Booking-log email per-day send time not editable | function | Add a time picker bound to each enabled day's `entry.time` + a `setDayTime` updater; include edited times in the existing PATCH. |
| Low | 10 Reports | Reports → Clients sub-tab shows tags read-only with no tag filter | function | Drop in `GuestTagEditor` + a tag-filter chip row backed by `useGuestTags` (segment='tag'). No new hook/backend. |
| Low | 10 Reports | Per-booking-model breakdown report not surfaced | function | Render a compact per-model summary from the already-typed `report_by_booking_model` for multi-model venues, with CSV. |
| Low | 10 Reports | Table utilisation report omitted | function | Intentional restaurant exclusion; mirror behind a `table_management_enabled` check only if a table venue uses the app. |
| Low | 10 Reports | Referee trial-credit banner missing on home | content | Ties to the referrals gap; if implemented, add `refereeBanner` to the payload and render a dismissible Card above the checklist. |
| Low | 11 Services | No inline "Add calendar" from the service form | function | Admin-only "New calendar" row beneath the Offered-by chips opening a minimal Sheet → POST practitioners, auto-selecting the new id. |
| Low | 11 Services | Add-on "Used by" chips don't deep-link to a specific service | function | Scroll the list to the expanded service after press via `scrollToIndex`, and/or accept a route param to pre-expand for `?service=` parity. |
| Low | 11 Services | Linked add-on groups in the form don't preview their options | ui | In `AddonLinksEditor`, render each linked group's active add-ons as a compact sub-list; data is already passed in. |
| Low | 12 Booking Page | Team-tab-off does not hide each member profile | function | When `showTeam` is off, batch-set `hidden:true` on existing `team_profiles` via `useUpdateBookingPageConfig`, or document the master-switch semantics. |
| Low | 12 Booking Page | Slug editor not co-located with the booking-page editor | design | Add an inline `/book/` slug field with the `useSlugAvailable` hint directly to `booking-page.tsx`; link or dedupe the venue-profile copy. |
| Low | 12 Booking Page | Font presets shown as plain chips, not in their actual typeface | design | Load preset Google fonts via expo-font and apply each family to its chip label (and the preview heading). |
| Low | 13 Compliance | Date fields use free-text entry instead of a date picker | ui | Use the existing date-picker primitive for `date` fields and submit `YYYY-MM-DD`. |
| Low | 13 Compliance | Result type label set differs slightly from the web builder | content | Acceptable as-is; if the builder is added, align dropdown wording with the web's parenthetical labels. |
| Low | 14 Settings | Trial-breakdown detail + complimentary-access messaging absent on Plan | content | Extend `BillingStatus` with `billing_access_source` + trial-breakdown fields; add a breakdown line + complimentary-access branch on `plan.tsx`. |
| Low | 14 Settings | Two parallel personal-account surfaces risk drift | design | Extract a shared `useStaffAccountForm` hook so account.tsx and `MyAccountSheet` share validation, the email-change refresh, and copy. |
| Low | 15 Communications | No communication-lane switcher; restaurant "table" lane unreachable | function | Intentional for appointments-first; if a restaurant tier is supported, add a Segmented lane switcher and key set/PUT off the active lane. |
| Low | 16 Linked Venues | Audit date filtering is preset-only (no custom from/to range) | function | Add a custom from/to row to `LinkAuditView` using `DatePickerField`; the hook already forwards from+to. |
| Low | 16 Linked Venues | Audit log cannot be exported to CSV | function | Optional Share audit (CSV) button: fetch `?format=csv`, write via expo-file-system, share via expo-sharing; or document as a mobile exclusion. |
| Low | 16 Linked Venues | Logo/cover crop framing not editable for the combined page | function | Reuse `CoverCropperSheet` + `LogoFramingSheet` in `CombinedPageConfigEditor`, include crop boxes in the payload, fix the stale comment. |
| Low | 16 Linked Venues | No dismissible first-run onboarding explainer for linked accounts | ui | Enhance the empty-state branch with the web card's three explainer bullets; dismiss-persistence optional. |
| Low | 17 Auth | Coarser auth-callback error messaging vs web | content | Make `mapExchangeError` return a discriminated reason and render reason-specific copy + a "Back to sign in" action, mirroring the web banner. |
| Low | 17 Auth | claim_user_account RPC never run on app sign-in/callback | function | Call `rpc('claim_user_account')` best-effort in `callback.tsx` (and after password sign-in) before redirect, logging but not blocking. |
| Low | 18 Design | Loading skeletons pulse opacity instead of gradient shimmer | design | Rebuild `Skeleton.tsx` as an expo-linear-gradient with a looping translateX, preserving the reduceMotion early-return. |
| Low | 18 Design | App Badge lacks reusable compliance-state tone variants | ui | Add a compliance tone map (or `CompliancePill`) to `Badge.tsx` mirroring the web's 6 states; refactor the ad-hoc compliance pills to use it. |
| Low | 18 Design | Analytics stat tiles lack inline sparkline + trend chip | design | Add a reusable `StatTile` composing a `MiniSparkline` + optional trend Badge; adopt for the reports overview cards. |
| Low | 18 Design | Cards/headers composed ad hoc rather than via one SectionCard primitive | design | Introduce a `SectionCard` compound (Root/Header/Body/Footer) and migrate high-density settings screens to it. Preventive hardening. |
| Low | 18 Design | No in-context help-tooltip pattern | ui | Add a lightweight `HelpTooltip` (IconButton 'info' → small Sheet/popover), scoped to the few settings where the explanation is load-bearing. |

## How to use this report & section index

This report is organized as one overview (this file) plus 18 per-domain sections. Each section file follows the same structure: a parity verdict, the screen-by-screen comparison against the web mirror, and a numbered gap list with severity, category, the exact app screen/component, and a concrete fix recommendation (file paths, hooks, and endpoints named). Severities are **Critical** (blocks a core staff task or risks data loss), **High** (a real capability gap a venue will hit in normal use), **Medium** (notable friction or partial coverage), and **Low** (polish, or an intentional/​documented divergence flagged for completeness). Start with the Top priorities list above for the critical path; use the Master backlog as the single sortable index of every gap; drill into the section files below for the full reasoning and exact fix per item.

- `01-navigation-ia.md` — Navigation & Information Architecture (strong)
- `02-calendar-diary.md` — Calendar / Diary (strong)
- `03-bookings-list-detail.md` — Bookings — list, filters & detail (strong)
- `04-new-booking-wizard.md` — New booking / booking wizard (partial)
- `05-clients-contacts-import.md` — Clients / Contacts / Guests & Import (strong)
- `06-classes-events.md` — Classes & Events (strong)
- `07-resources-floorplan-tables.md` — Resources, Floor-plan & Tables (strong)
- `08-availability-hours-closures.md` — Availability, Business Hours & Closures (partial)
- `09-waitlist.md` — Waitlist (strong)
- `10-reports-home-referrals.md` — Dashboard Home, Reports & Referrals (partial)
- `11-services-addons.md` — Services / Appointment Services & Add-ons (strong)
- `12-booking-page-widget.md` — Booking Page / Widget editor (partial)
- `13-compliance-forms.md` — Compliance & Intake Forms (partial)
- `14-settings-account-plan-team.md` — Settings, Account, Venue Profile, Plan/Billing & Team (strong)
- `15-communications-templates-notifications.md` — Communications, Email Templates & Notifications (strong)
- `16-linked-venues-collectives.md` — Linked Venues & Collectives (strong)
- `17-auth-onboarding-support.md` — Auth, Onboarding & Support (partial)
- `18-design-ux-system.md` — Design Language & UX Consistency (cross-cutting) (strong)
