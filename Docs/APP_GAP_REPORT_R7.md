# Resneo — Mobile App vs Web Staff Dashboard: Comprehensive Parity & Polish Audit (R7)

**Date:** 2026-06-17 · **Scope:** staff/venue-operator parity with the web dashboard (/dashboard/*, /email-templates, settings). Out of scope: customer booking flow, marketing/SEO pages, super-admin. **Method:** code-level comparison of the app against the web mirror at _reference/Resneo (the authed web dashboard cannot be driven live: CORS + light-only preview + no Android emulator), with an adversarial verification pass on every claimed gap. **North Star:** a staff user can do almost everything in the app that the web allows, with a beautiful, intuitive UI.

---

## 🛠 Implementation status (live tracker)

> Branch: `feat/r7-parity-implementation`. Verification gate per wave: `npm run typecheck` + `npm run lint` + `npm test` (230+ tests). Full-stack authorized (web repo `C:\Resneo` may be edited to unblock routes). Native-module items (Stripe capture, drawn signature, QR) are implemented and flagged **⚙️ needs device smoke-test**. Documented intentional exclusions (restaurant tables/floor-plan, public/customer surfaces) are **out of scope** by design.
>
> Legend: ⬜ not started · 🔧 in progress · ✅ done & verified · ⚙️ done, needs device test · ⏭️ intentionally skipped

| # | Domain | Parity (start) | Gaps C/H/M/L | Status | Notes |
|---|--------|----------------|--------------|--------|-------|
| F | Foundations (shared types + primitives) | — | — | ✅ | venue.ts + practitioner/availability types widened; `ApiError` 409 `acknowledge` threading; SecureStore `usePersistedCalendarPrefs`; new `SectionCard`/`HelpTooltip`/`StatTile`+`MiniSparkline`/`CompliancePill`/shimmer `Skeleton`/`PhoneInput`; +35 tests. No new deps. |
| B | Backend prerequisites (`C:\Resneo`) | — | — | ✅⚠️ | B1 overrides + B2 practitioner-services → Bearer; B3 `referrals` GET created; web typecheck clean. **Uncommitted in `C:\Resneo` — needs your commit + deploy.** Audit's other backend prereqs were already done (stale premise). |
| 01 | Navigation & IA | strong | 0/1/3/2 | ⬜ | |
| 02 | Calendar / Diary | strong | 0/0/5/2 | ⬜ | |
| 03 | Bookings — list & detail | strong | 0/0/2/6 | ⬜ | |
| 04 | New booking wizard | partial | 2/1/4/2 | ⬜ | group + multi-service + Stripe |
| 05 | Clients / Contacts / Import | strong | 0/1/1/5 | ⬜ | |
| 06 | Classes & Events | strong | 0/2/1/5 | ⬜ | class-commerce |
| 07 | Resources / Floor-plan / Tables | strong | 0/0/0/4 | ⬜ | tables suite ⏭️ |
| 08 | Availability / Hours / Closures | partial | 1/1/2/3 | ⬜ | bookable-calendar mgmt |
| 09 | Waitlist | strong | 0/2/2/2 | ⬜ | |
| 10 | Home / Reports / Referrals | partial | 0/1/2/7 | ⬜ | |
| 11 | Services & Add-ons | strong | 0/2/3/3 | ⬜ | |
| 12 | Booking Page / Widget | partial | 0/1/3/3 | ⬜ | |
| 13 | Compliance & Intake Forms | partial | 3/4/3/2 | ⬜ | weakest; authoring stack |
| 14 | Settings / Account / Plan / Team | strong | 1/1/3/2 | ⬜ | venue deletion |
| 15 | Communications / Templates | strong | 0/1/1/1 | ⬜ | |
| 16 | Linked Venues & Collectives | strong | 0/0/1/4 | ⬜ | |
| 17 | Auth / Onboarding / Support | partial | 0/2/2/2 | ⬜ | set-password, onboarding |
| 18 | Design Language & UX | strong | 0/0/0/5 | ⬜ | folded into Foundations |

_Execution plan & wave sequencing: `Docs/audit-r7/EXECUTION_PLAN.md`. Updated as each wave lands._

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


---

# Part II — Detailed per-domain sections


---

## 01. Navigation & Information Architecture

**Parity:** Strong — Nearly every web destination is reachable via native in-app routes; the genuine gaps are one role-gating regression (model links hidden from staff) and three narrow missing surfaces (Refer & Earn, Data Import, Home-as-launch-screen).

Navigation parity is strong for an appointments-first mobile app. The web's flat admin sidebar (Home, Bookings, New Booking, Contacts, model links, Waitlist, Calendar Availability, Compliance, Settings, Support) plus a 12-tab Settings page is re-expressed as a 4-tab bar — Calendar / Bookings / Clients / More — where "More" is a searchable, role-aware index that fans the web's single tabbed Settings page out into ~15 separate `/manage/*` routes grouped as an inset list. That fan-out is a legitimate mobile adaptation, not a deficiency. The one genuine functional regression is that the web shows the primary model links (Events / Classes / Resources) to **all** staff gated only by the venue's enabled booking model, whereas the app gates them behind `isAdmin`, leaving non-admin staff at class/event/resource venues with no in-app path to those screens (note: the Services row *is* shown to staff). Beyond that, Refer & Earn and Contact/Booking Import have no app entry point, the Today/Home dashboard is not the launch screen and is buried in More, and a handful of restaurant-only surfaces (Day Sheet, Table Grid, Floor Plan, Tables, Dining Availability) are intentionally excluded. All six candidate gaps were verified against the app source and confirmed real; none were false positives.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Primary navigation shell | `DashboardSidebar.tsx` (BASE_NAV_ITEMS) | `app/(app)/(tabs)/_layout.tsx` | Strong | Persistent left sidebar → 4-item bottom tab bar (Calendar / Bookings / Clients / More). |
| Home / Today dashboard | `DashboardSidebar.tsx` BASE_NAV_ITEMS[0] (Home, all roles) | `app/(app)/today.tsx` | Partial | Web Home is the landing surface; app `/today` reachable only via More grid tile. |
| Calendar / schedule | `dashboard/calendar/page.tsx` | `app/(app)/(tabs)/index.tsx` | Strong | App promotes the calendar to the default first tab. |
| Bookings list | `dashboard/bookings/page.tsx` | `app/(app)/(tabs)/bookings.tsx` | Strong | Direct tab-to-page map; venue selector moved into the filter sheet per convention. |
| New booking | `dashboard/bookings/new/page.tsx` | `app/(app)/booking/new.tsx` (modal) | Strong | Web has a persistent sidebar entry; app uses a FAB-launched modal. |
| Contacts / Clients | `dashboard/contacts/page.tsx` | `app/(app)/(tabs)/clients.tsx` | Strong | Tab-to-page map; `dashboard/guests` redirect correctly collapsed. |
| Services (appointment-services) | `dashboard/appointment-services/page.tsx` (all roles) | `app/(app)/manage/services.tsx` | Strong | App pushes Services unconditionally (line 212) so staff reach it too. |
| Events / Classes / Resources (model links) | `event-manager`, `class-timetable`, `resource-timeline` (MODEL_NAV_ITEMS, all roles) | `app/(app)/events.tsx`, `classes.tsx`, `resources.tsx` (admin-only) | Partial | Buried in More AND gated behind `isAdmin` — non-admin staff have no path. See gap. |
| Waitlist | `dashboard/waitlist/page.tsx` (capability-gated) | `app/(app)/waitlist.tsx` | Strong | App pushes it unconditionally (line 207); screen degrades to an empty state. |
| Calendar Availability | `dashboard/calendar-availability/page.tsx` (eligibility-gated) | `app/(app)/availability.tsx` | Strong | App pushes it unconditionally (line 208); content parity good. |
| Compliance dashboard | `dashboard/compliance/page.tsx` (tier + flag, staff + admin) | `app/(app)/manage/compliance.tsx` (admin-only) | Strong | App admin-gates it with no flag check; staff lose the web's direct access. See low gap. |
| Settings — Profile / Venue profile | `dashboard/settings` (tab=profile) | `manage/account.tsx` + `manage/venue-profile.tsx` | Strong | Web's combined Profile tab split into Account (all roles) + Venue profile (admin). |
| Settings — Business hours | `dashboard/settings` (tab=business-hours) | `app/(app)/manage/hours.tsx` | Strong | Weekly hours + closures; direct route map (line 216). |
| Settings — Booking Settings | `dashboard/settings` (tab=booking-settings) | `app/(app)/manage/booking-settings.tsx` | Strong | Admin-only on both (line 220). |
| Settings — Booking Page | `dashboard/settings` (tab=booking-page) | `app/(app)/manage/booking-page.tsx` | Strong | Admin-only (line 224); app built in-app CRUD per project memory. |
| Settings — Plan / Billing | `dashboard/settings` (tab=plan + tab=payments) | `app/(app)/manage/plan.tsx` | Strong | App consolidates Plan + Payments into one route (line 223); plan-warning banner mirrored. |
| Settings — Communications | `dashboard/settings` (tab=comms) | `app/(app)/manage/communications.tsx` | Strong | Admin-only (line 221). |
| Settings — Staff / Team | `dashboard/settings` (tab=staff) | `app/(app)/manage/team.tsx` | Strong | Admin-only on both (line 219). |
| Settings — Linked Accounts + collectives | `dashboard/settings` (tab=linked-accounts) + sidebar | `linked-venues/index.tsx` + `collectives/index.tsx` + `linked-venues/calendar.tsx` | Strong | App exceeds web: 3 nav surfaces + tab-level linked columns + incoming-request nudge. |
| Settings — Compliance types | `dashboard/compliance-types/page.tsx` | `app/(app)/manage/compliance-types.tsx` | Strong | Dedicated route, reached from compliance. |
| Push / notification preferences | (web: per-channel comms policy) | `app/(app)/manage/notification-preferences.tsx` | App-only | Device push prefs with no direct web equivalent (line 239). Appropriate. |
| Notifications feed | `NotificationBell.tsx` (footer, linked-venue gated) | `app/(app)/notifications.tsx` + More badge | Strong | App surfaces a feed with unread badge — broader than web. |
| Support | `dashboard/support/page.tsx` (footer) | `app/(app)/support.tsx` | Strong | Direct map (line 238). |
| Sign out | `DashboardSidebar.tsx` handleSignOut | `settings.tsx` sign-out Sheet | Full | App uses a confirm Sheet (Alert.alert is a web no-op). |
| Reports | `dashboard/reports` + settings tab=reports (admin) | `app/(app)/reports.tsx` (admin-only) | Strong | Dedicated screen in the Quick-actions grid (line 205). |
| Refer & Earn | `dashboard/referrals/` + settings tab=refer-earn | absent | Missing | No route, no nav row. See gap. |
| Data Import (contacts/bookings) | `dashboard/import/` (ImportHub) | absent | Missing | No import/CSV affordance. Clients can only be created one at a time. See gap. |
| Day Sheet | `dashboard/day-sheet/` (restaurant) | absent | Missing | Intentional — web itself redirects appointment venues to the calendar. |
| Table Grid / Floor Plan / Tables | `table-grid`, `floor-plan`, `tables` (restaurant) | absent | Missing | Intentional — restaurant-tier only; out of scope. |
| Dining Availability | `dashboard/availability/page.tsx` (restaurant) | absent | Missing | Intentional — restaurant covers config, distinct from appointment Calendar Availability. |
| Onboarding | `dashboard/onboarding/` (redirect when incomplete) | absent (setup checklist on `today.tsx`) | Partial | App has no gated onboarding flow; lighter first-run guidance via SetupChecklistCard. |
| Web dashboard escape hatch | (n/a) | `settings.tsx` "Web dashboard" row (line 240) | App-only | `WebBrowser.openBrowserAsync` bridge for web-only features. Sensible. |

**Primary navigation shell.** The web renders a persistent left sidebar (`DashboardSidebar.tsx` BASE_NAV_ITEMS, lines 46-54) listing every top-level destination flatly, role- and tier-filtered. The app collapses this into a 4-item bottom tab bar (`_layout.tsx` lines 175-180): Calendar (`name="index"`), Bookings, Clients, More (`settings`). Bookings/Contacts/New-Booking(FAB) map cleanly; everything else folds into the More tab. Tab labels are terminology-driven (`bookingsScreenTitle`/`clientsScreenTitle`, lines 147-157). Sound mobile IA, but flattening ~10 sidebar items plus 12 settings tabs into one More tab increases depth.

**Home / Today dashboard.** Web "Home" is the first sidebar item, shown to all roles and the post-login landing route. The app's `/today` is a rich screen but is reached **only** via the More tab's Quick-actions grid (`settings.tsx` line 203, `featured:true`) — confirmed there is no `/today` link from the Calendar tab (`index.tsx` has `router.push` calls but none target `/today`). The app's default landing tab is Calendar (`_layout.tsx` line 176). Comparable content, lower discoverability, not the launch screen.

**Model links (Events / Classes / Resources).** Web merges these via `mergeModelNavEntries(MODEL_NAV_ITEMS, …)` (`DashboardSidebar.tsx` line 309) with **no** `isAdmin` gate — they are primary sidebar links for staff and admin alike, gated only by the enabled booking model. The app defines them in `SECONDARY_MODEL_ROWS` (`settings.tsx` lines 98-111) and renders the loop only inside `if (isAdmin)` (line 230). Grep confirms `/classes`, `/events`, `/resources` are referenced **only** inside that admin-gated loop — there is no tab, FAB, or component-level `router.push` fallback. See the high-severity gap.

**Settings — Linked Accounts + collectives.** The app actively exceeds the web here: separate Linked venues (line 225), Venue collectives (line 226), and a Linked calendar route (line 217), plus tab-level linked-venue calendar columns and the `LinkedVenueBanner` incoming-requests nudge. The web keeps it as one settings tab plus combined-page sidebar links.

**Notifications feed.** The app surfaces an in-app feed with an unread badge on the More tab (`_layout.tsx` lines 159-169) and a hero bell — broader than the web, where the bell appears only for venues with accepted links.

### Gaps & deficiencies

#### High

- **Model links (Events/Classes/Resources) hidden from non-admin staff** — _function · high_
  - **Web:** `DashboardSidebar.tsx` merges `MODEL_NAV_ITEMS` (Services/Events/Classes/Resources) via `mergeModelNavEntries(MODEL_NAV_ITEMS, navPrimaryBookingModel, enabledModels)` at line 309 with **no** `isAdmin` gate — the only gate is the venue's enabled booking model. A non-admin staff member at a class/event/resource venue sees Classes/Events/Resources directly in the sidebar.
  - **App:** `app/(app)/(tabs)/settings.tsx` wraps the entire `SECONDARY_MODEL_ROWS` loop in `if (isAdmin)` (line 230), so the Classes/Events/Resources rows are never rendered for staff. Grep confirms `/classes`, `/events`, `/resources` are referenced **only** inside that admin-gated loop — there is no tab, FAB, or component-level `router.push` fallback, so a non-admin staff member has **no** route to those screens. (For contrast, the Services row *is* shown to staff — it is pushed unconditionally at line 212 — so this gap is specifically Events/Classes/Resources.)
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lines 57-69 (MODEL_NAV_ITEMS), 309-327 (mergeModelNavEntries, no role check); APP `app/(app)/(tabs)/settings.tsx` line 230 (`if (isAdmin) { for (const row of SECONDARY_MODEL_ROWS) … }`), line 212 (Services pushed unconditionally), lines 98-111 (SECONDARY_MODEL_ROWS definition).
  - **Fix:** In `app/(app)/(tabs)/settings.tsx`, move the `SECONDARY_MODEL_ROWS` loop **out** of the `if (isAdmin)` block so Classes/Events/Resources render for staff whenever the model is in `enabledModels` (mirror the web's model-driven, role-agnostic gating). Keep the web-only "Tables" row as-is (line 110 — it points to web setup with no `appRoute`). Optionally set `featured:true` for the venue's primary model so the daily-driver screen sits in the Quick-actions grid rather than two taps deep.

#### Medium

- **No Refer & Earn surface in the app** — _function · medium_
  - **Web:** Admins with the referral programme enabled get a "Refer & Earn" settings tab and a `/dashboard/referrals` route to view their code, share it, and track earned subscription credit.
  - **App:** Absent — no referrals route under `app/`, no nav row in `settings.tsx`. Grep for `refer|referral` across `app/` yields only substring noise (preferences, prefers-color-scheme, self-referential).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/referrals/` directory confirmed present, settings refer-earn tab; APP no referrals file (Grep `refer|referral` over `app/` returns `settings.tsx`/`notifications.tsx`/`clients.tsx` only as unrelated substring matches).
  - **Fix:** Add `app/(app)/manage/referrals.tsx` and a Destination row in `settings.tsx` (`group:'manage'`, `isAdmin`-gated) mirroring the web `ReferralsDashboardContent`, reusing the existing `apiFetch` client against the same referrals dashboard endpoint. If a full screen is out of scope, at minimum add an `isAdmin`-gated row that opens `/dashboard/settings?tab=refer-earn` via the existing `openWeb()` helper (`settings.tsx` lines 158-166, 240) so admins can reach it without hunting for the generic "Web dashboard" link.

- **No contact / booking data import in the app** — _function · medium_
  - **Web:** Admins can run a guided CSV import (upload → map → validate → references → review → importing) for contacts and bookings via `/dashboard/import` (ImportHub), linked from a Settings section.
  - **App:** Absent — `components/clients/*` (CreateContactSheet, BulkActionSheets, etc.) contain no import/CSV/upload entry; the Clients tab can only create contacts one at a time.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/import/` directory confirmed present (ImportHub + step routes); APP Grep for `import|csv|upload` over `components/clients` returns only top-of-file ES `import` statements — no import affordance.
  - **Fix:** A full multi-step importer is heavy for mobile; as a pragmatic blueprint add an `isAdmin`-gated "Import contacts" row in the Clients header overflow or the More "Manage" group that opens `/dashboard/import` through the existing `settings.tsx` `openWeb()` helper, so the capability is at least discoverable from the app. A native importer keyed off the same import-session API would be a larger follow-up.

- **Today/Home is not the launch screen and is buried in More** — _ui · medium_
  - **Web:** "Home" (`/dashboard`) is the first sidebar item (BASE_NAV_ITEMS[0], line 47), shown to all roles, and the default post-login landing surface — KPIs/overview are one persistent click away at all times.
  - **App:** The rich `/today` screen is reached **only** via the More tab's Quick-actions grid (`settings.tsx` line 203, `featured:true`); the app's default landing tab is Calendar (`name="index"`). There is no persistent one-tap path to the Today dashboard from the tab bar or the Calendar header.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` BASE_NAV_ITEMS[0] (Home, line 47); APP `app/(app)/today.tsx` reached via `settings.tsx` destination id `today` (line 203); `app/(app)/(tabs)/_layout.tsx` default tab is index/Calendar (line 176); `index.tsx` has `router.push` calls but none to `/today` (all "today" references are the current date).
  - **Fix:** Either (a) add a quick path to `/today` from the Calendar tab header (an `IconButton` in the `app/(app)/(tabs)/index.tsx` toolbar), or (b) reconsider the 4-tab set to include a Home/Today tab. Lowest-effort: keep the grid entry but also add a "Today" header action on the Calendar tab so the KPI overview is reachable without opening More.

#### Low

- **Web's single Settings page is fragmented into ~15 separate routes with no unified Settings hub** — _design · low_
  - **Web:** All venue configuration lives in **one** `/dashboard/settings` page with a horizontal TabBar (Profile, Business hours, Booking Settings, Booking Page, Plan, Payments, Communications, Compliance, Staff, Reports, Refer & Earn, Linked Accounts), so users build a mental model of "everything is under Settings".
  - **App:** `settings.tsx` (the More tab) scatters the same concerns across "Manage", "Booking types", and "App" inset groups plus standalone `/manage/*` routes and Quick-actions tiles; there is no single destination literally named "Settings", and the tab is named "More". The grouped index is searchable (SearchBar) but the filter matches only label/hint text (lines 254-259), not web tab synonyms.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx` TABS array; APP `app/(app)/(tabs)/settings.tsx` LIST_GROUPS (lines 88-92) + destinations array (lines 190-243), search filter lines 254-259.
  - **Fix:** This is a legitimate mobile adaptation (a 12-tab horizontal bar is poor on phones) — keep the grouped index. To tighten the mental model, extend the search to index web tab synonyms — e.g. add hidden keywords like `settings`, `payments`, `stripe`, `SMS`, `templates` to the relevant `Destination.hint` strings (or a separate `keywords` field) so a user searching "settings" or "payments" lands on the right row. No structural change required.

- **Waitlist/Compliance nav visibility rules diverge from web eligibility gating** — _function · low_
  - **Web:** The sidebar applies precise eligibility — Waitlist via `shouldShowWaitlistNav(resolveWaitlistVenueCapabilities, appointmentWaitlistEnabled)` (lines 264-272); Compliance only when `isAppointmentPlanTier && complianceRecordsEnabled`, shown to staff **and** admin (line 330, not in ADMIN_ONLY_HREFS); Calendar Availability via `shouldShowAppointmentAvailabilitySettings` (lines 261-281).
  - **App:** `settings.tsx` pushes Waitlist (line 207) and Calendar availability (line 208) to everyone **unconditionally** in Quick actions with no model/flag gate, and Compliance (line 222) to any admin with **no** `complianceRecordsEnabled` feature-flag check — so the app surfaces destinations the web would hide for that venue's tier/flags, and conversely hides Compliance from non-admin staff the web would show it to. (Services is correctly shown to all in the app, matching the web's all-roles intent, so it is not part of this divergence.)
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lines 261-281 (waitlist/availability gates), 330 (compliance gate); APP `app/(app)/(tabs)/settings.tsx` lines 207-208 (waitlist/availability pushed unconditionally), line 222 (compliance pushed for any admin, no flag). The venue `feature_flags` incl. `compliance_records_enabled` IS available (`types/venue.ts` lines 27/77, VenueProvider exposes `featureFlags` at line 63), so the gate could be applied.
  - **Fix:** Mirror the web gates in the `settings.tsx` destinations builder: gate the Compliance row on `venue.feature_flags.compliance_records_enabled` (already surfaced by VenueProvider) and consider showing it to staff (not just admin) to match the web; gate Waitlist/Calendar-availability using the same model-eligibility helpers the calendar uses. Low severity because each target screen degrades gracefully to an empty state, but matching the web avoids showing irrelevant tools and avoids hiding Compliance from staff.

### Investigated — not a gap

- **Day Sheet** — Restaurant/table-reservation operational view; for appointment/unified venues the web itself redirects to `/dashboard/calendar`, which the app's Calendar tab covers. No action needed for an appointments-first app.
- **Table Grid / Floor Plan / Tables** — Appear only for restaurant tier + `table_reservation` + `table_management_enabled`. Out of scope; the `SECONDARY_MODEL_ROWS` "Tables" row already points to web-only setup (`settings.tsx` line 110).
- **Dining Availability** — Restaurant-SKU covers/availability config, distinct from the appointment Calendar Availability the app *does* have. Web gates it on `isTableReservation && isRestaurantPlanTier && isAdmin`. Not relevant to appointments-first scope.

### Recommended work (ordered)

1. **[High] Un-gate model links for staff.** In `app/(app)/(tabs)/settings.tsx`, lift the `SECONDARY_MODEL_ROWS` loop out of the `if (isAdmin)` block (line 230) so Classes/Events/Resources render whenever `enabledModels.has(row.model)`, regardless of role — matching the web's `mergeModelNavEntries` (no role gate). Leave the "Tables" row (no `appRoute`) web-only. Verify a non-admin staff session at a class/event/resource venue can now reach those screens.
2. **[Medium] Surface Today from the Calendar tab.** Add a "Today" `IconButton` to the `app/(app)/(tabs)/index.tsx` header toolbar routing to `/today` (and/or evaluate a Home tab), so the KPI overview is one tap away instead of buried in the More grid.
3. **[Medium] Add a Refer & Earn entry point.** Minimum: an `isAdmin`-gated Destination row in `settings.tsx` ("manage" group) that calls `openWeb('/dashboard/settings?tab=refer-earn')`. Better: a native `app/(app)/manage/referrals.tsx` mirroring `ReferralsDashboardContent` via the existing `apiFetch` client.
4. **[Medium] Add a contact-import entry point.** An `isAdmin`-gated "Import contacts" row (Clients header overflow or More "Manage") that opens `/dashboard/import` via `openWeb()`. Native importer against the import-session API is a larger follow-up.
5. **[Low] Apply web eligibility gates to nav rows.** In the `settings.tsx` destinations builder, gate Compliance on `venue.feature_flags.compliance_records_enabled` (surfaced by VenueProvider, `types/venue.ts` lines 27/77) and show it to staff as the web does; gate Waitlist/Calendar-availability with the calendar's model-eligibility helpers.
6. **[Low] Improve Settings search coverage.** Extend the `settings.tsx` search filter (lines 254-259) to index web tab synonyms — add a `keywords` field (or augment `hint`) with terms like `settings`, `payments`, `stripe`, `SMS`, `templates` so users searching web vocabulary land on the right `/manage/*` row.


---

## 02. Calendar / Diary

**Parity:** Strong — the core single-practitioner day workflow reaches near-parity with the web `PractitionerCalendarView` (drag-to-reschedule + resize with live conflict detection, deferred guest-notify-with-undo, quick-status tray, now-line, closed/break/leave shading, overlays, realtime sync, linked calendars), with only secondary controls and information-density gaps remaining.

The mobile calendar diary is one of the most mature surfaces in the app. For a staff member running their day it matches the web on every core capability and even adds touch-native wins the web lacks: auto multi-column day layout on tablets/landscape, long-press cross-practitioner reassignment, and swipe-to-page dates. The real shortfalls are all in *secondary* surfaces — a missing visible-window/time-range control, no persisted per-user preferences, no guest search on the calendar, a thinner empty-slot quick menu (no walk-in or resource-booking from the tapped slot), a count-only month grid versus the web's dot/heatmap/open-closed picture, and a single-practitioner week view instead of the web's whole-team week matrix. All eight candidate gaps were verified against the app source and confirmed real (zero false positives); none block a staff member from running their day.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Day view (single practitioner) | `PractitionerCalendarView.tsx` DndContext day grid (~5909–6994) | `app/(app)/(tabs)/index.tsx` dayGrid (~1165–1194) + `CalendarDayGrid.tsx` + `DraggableAppointmentBlock.tsx` | Strong | Minute→pixel grid, closed/break shading, capacity blocks, now-line, scroll-to-now, compliance dots, hold-to-arm drag + resize, conflict refusal, deferred notify+Undo. |
| Multi-calendar day view (all practitioners) | `DayGridColumn` columns, `filteredPractitioners` (~3233–3297) | `AllCalendarsDayGrid.tsx` + `index.tsx` `showAllCalendars` (~494–497) | Strong | One column per practitioner, shared gutter + now-line, auto-enabled on wide viewports or via "All"; long-press → "Move to practitioner". Drag intentionally omitted in dense view. |
| Week view | `viewMode==='week'` table (~5556–5900) + `WeekScheduleCdeStrip` | `WeekGrid.tsx` + `index.tsx` `weekColumns` (~1092–1117) | Partial | Web = whole-team matrix (all practitioners × 7 days). App = time-axis grid of 7 days for ONE practitioner. More legible per-person, but no all-team week. |
| Month view | `MonthScheduleGrid.tsx` | `MonthGrid.tsx` + `index.tsx` counts (~585–594) | Partial | Both 6×7 drill-in grids. Web has type dots + heatmap + open/closed labels + linked counts; app shows only a single count pill. |
| Toolbar / date nav & view switcher | `PractitionerCalendarToolbar.tsx` + `OperationsWorkspaceToolbar.tsx` | `index.tsx` toolbar (~1249–1387) | Strong | Day/Week/Month switch, prev/next, tappable date → month picker, Today pill, refresh, LiveDot, New + Walk-in entry. App lacks guest-search panel + explicit Undo button (undo is inline via moveNotice). |
| Empty-slot quick-create | `slotMenu` (~6998–7056) | `index.tsx` add-sheet (~1559–1613) | Partial | Web slot menu: New appt / Walk-in / Book `<resource>` / Block time. App slot sheet: only New booking + Block time. |
| Calendar columns filter | `CalendarColumnsFilter.tsx` (`CalendarColumnsChecklist`) | `index.tsx` chips row (~1324–1382) | Partial | Web = checkbox list (All or any subset, persisted). App = single-select chips + an "All" view (day-scope only), not persisted. |
| Block create/edit/delete | `blockModal` (~6063–6160) + `patchBlockResize`/`deleteBlockFromModal` | `BlockEditSheet.tsx` + `index.tsx` `handleBlockTimeBlockPress` (~913–930) | Strong | Both create/edit/delete manual blocks, breaks/closures read-only. Web adds hold-to-resize on the grid; app edits duration via sheet only. |
| On-block quick-status actions | `CalendarBookingRightColumn` quick actions | `AppointmentBlock.tsx` `pickTrayActions` + `index.tsx` (~936–978) | Full | Tray mapping matches exactly (Pending→Arrived/Confirm, Booked→Arrived/Start, Seated→Undo/Complete, Completed→Reopen). Optimistic pending + error toast on both. |
| Linked / cross-venue calendars | `LinkedCalendarView` + `linkedVenues`/`linkedViewing`/`linkedCreating` | `LinkedVenueCalendarGrid.tsx` + `LinkedVenueWeekGrid.tsx` + `lib/linked/linked-calendar-view.ts` + `index.tsx` (~389–1088) | Strong | Amber chips switch grid to linked venue (grant-gated), extra columns in "All", rich read-only/editable detail sheet, scoped create. Month is own-venue only on both. |
| Realtime live sync | supabase channel (bookings/calendar_blocks) + `realtimeConnected` | `lib/realtime/useVenueLiveSync.ts` (`index.tsx` ~468–479) + 60s poll | Strong | Both subscribe to bookings + calendar-block tables and refetch promptly with a live/reconnecting indicator + polling fallback. App also subscribes `practitioner_calendar_blocks`. |
| Guest search on calendar | `OperationsToolbarGuestSearchPanel` (`searchPanel` ~5500–5512) | absent | Missing | No guest-search affordance anywhere on the calendar; finding a guest's booking requires the Bookings tab. |
| Day-sheet (covers/capacity board) | `DaySheetView.tsx` | `app/(app)/today.tsx` (KPI home, not a diary) | Missing | Web day-sheet is a `table_reservation`-gated covers board — intentionally out of scope for the appointments-first mobile app. |
| Cross-practitioner reassignment | drag a booking across practitioner columns | `index.tsx` `handleBlockLongPress` (~831) + `commitReassign` (~850–896) | App-only | Long-press → "Move to `<practitioner>`" chooser, same time, optimistic pending + Undo + 409 handling. Mobile-appropriate equivalent of cross-column drag. |

**Day view.** Both render a minute→pixel time grid with hour/half-hour lines, alternating banding, closed-time shading, break overlays, class/event capacity blocks (indigo), schedule-feed class/event/resource blocks, a now-line, scroll-to-now (the grid remounts on calendar/day change, `index.tsx:1169`), compliance dots, and on-block quick-status actions. Both support hold-to-arm drag-to-move + bottom-edge resize with a live time/duration badge, off-hours/conflict colouring, conflict refusal, and a deferred guest-notify prompt with Undo (moveNotice sheet ~1651–1667). The only intentional behavioural divergence is snap granularity: web snaps moves to 1 min, the app to 5 min (`DRAG_SNAP_MINUTES`, `grid-layout.ts:26`) — a deliberate touch choice.

**Multi-calendar day view.** Auto-enabled on wide viewports (≥700dp or landscape ≥600dp, `isWideDayViewport` `index.tsx:151`) or via the "All" chip. Tapping a block opens detail, tapping a slot creates, and a long-press opens the reassignment chooser (`handleBlockLongPress` ~831). Linked venues append as amber columns when "All" is picked (`linkedColumnsForDay` ~1016–1036). Drag/resize is intentionally not offered in this dense view.

**Week view.** Structurally different from the web. The web week is a matrix of ALL practitioners (rows) × 7 days (columns) with read-only booking chips plus a shared events/resources strip (`WeekScheduleCdeStrip`). The app week is a time-axis grid of 7 day-columns for ONE selected practitioner (built from `effectiveId`, switched via chips). Both are read-only (tap a day header to drill into Day); the app adds horizontal swipe to page weeks.

**Month view.** The web `MonthScheduleGrid` is far richer (confirmed at `MonthScheduleGrid.tsx:70–143`): per-type colored dots, a background intensity heatmap, an Open/Closed label on empty days, a total badge, and a linked-venue "+N" badge. The app `MonthGrid` (verified `MonthGrid.tsx:44`, `:63–71`) renders only a single brand count pill per day (No-Show excluded) plus a today highlight — no type breakdown, heatmap, open/closed status, or linked counts.

### Gaps & deficiencies

#### Medium

- **No visible-window / time-range control on the calendar grid** — _function · medium_
  - **Web:** The toolbar date panel embeds `CalendarDateTimePicker` (`TimeRangeCompact` From/Until selects), letting staff clamp the grid to e.g. 09:00–14:00; the override persists per-venue in localStorage (`startHourOverride`/`endHourOverride`) and doubles as a booking-time filter.
  - **App:** The grid auto-computes `startHour`/`endHour` purely from working hours + bookings via `computeGridBounds` (`grid-layout.ts:57–70`) with no user control — a venue open 08:00–22:00 always renders the full 14h column.
  - **Evidence:** WEB `_reference/Resneo/src/components/calendar/CalendarDateTimePicker.tsx` (`TimeRangeCompact`); `PractitionerCalendarView.tsx:2704–2747`. APP `components/calendar/grid-layout.ts:57–70` (sole consumer of bounds); no `startHourOverride`/`endHourOverride`/`TimeRange` state anywhere in app code (grep, excluding `_reference`); `CalendarDayGrid.tsx` + `WeekGrid.tsx` call `computeGridBounds` with no override arg.
  - **Fix:** Add a from/until hour control to `MonthPickerSheet` (or a small new toolbar control) writing two state values on `CalendarScreen`, and thread them into `CalendarDayGrid`/`WeekGrid`/`AllCalendarsDayGrid` to clamp bounds (extend `computeGridBounds` to accept an override window). Persist via AsyncStorage keyed by venue id, mirroring the web's `practitionerCalendarPreferencesKey`. Note: AsyncStorage is not yet a dependency — add it, or reuse whatever storage `LinkedVenueProvider` uses for `ownerVenueId`.

- **No persisted per-user calendar preferences (view, columns, window)** — _function · medium_
  - **Web:** Remembers the user's last view mode, visible calendar columns, and time-range overrides per venue across reloads (`PractitionerCalendarPreferences`, `practitionerCalendarPreferencesKey`, `isPractitionerCalendarPreferences` ~521–572; restored ~2772).
  - **App:** `CalendarScreen` resets to Day scope + first/All calendar + auto bounds on every mount; only the linked `ownerVenueId` persists. Scope, selected practitioner, and any window choice are lost between launches.
  - **Evidence:** WEB `PractitionerCalendarView.tsx:521–572`, `2772–2773`. APP `app/(app)/(tabs)/index.tsx:275–297` (`scope = useState('day')`, `selectedId = useState(null)` — no hydration, confirmed); `providers/LinkedVenueProvider.tsx` (only `ownerVenueId` persisted); AsyncStorage used nowhere in app code (grep finds it only in `Docs`/`.cursorrules`).
  - **Fix:** Add a small persisted-prefs hook (introducing AsyncStorage) under `lib/queries` or `providers` storing `{ scope, selectedId, startHourOverride, endHourOverride }` keyed by venue id, hydrated into `CalendarScreen`'s initial state — guarding against a stale practitioner id, like `reconcileOwnerVenue` already does for linked venues.

- **Month grid lacks type-colored dots, heatmap, open/closed labels and linked counts** — _ui · medium_
  - **Web:** `MonthScheduleGrid` shows per-day colored dots split by type (appointments/events/classes/resources), a background intensity heatmap scaled to the busiest day (`rgba 0.08 + intensity*0.22`), an Open/Closed business-status label on empty days, a total badge, and a linked-venue "+N" badge.
  - **App:** `MonthGrid` renders only a single brand count pill per day (No-Show excluded) plus a today highlight — no type breakdown, heatmap, open/closed status, or linked counts.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/practitioner-calendar/MonthScheduleGrid.tsx:70` (intensity), `:86–99` (Open/Closed + heatmap rgba), `:111–116` (linked "+N"), `:126–143` (dots/total). APP `components/calendar/MonthGrid.tsx:44` (single `count`) + `:63–71` (single brand pill); counts derived flat in `index.tsx:585–594`.
  - **Fix:** Enrich `components/calendar/MonthGrid.tsx`: derive per-type counts per date from `gridQuery` (appointments) + `scheduleQuery` (event/class/resource) instead of a flat total, render up to four colored dots, tint the cell background by intensity, and add an Open/Closed label via `lib/calendar/venue-closures` `venueDayHours`. Optionally fold `linkedQuery` counts in as a "+N" chip. Pass the richer counts map down from `index.tsx` (it already has `scheduleByCalendarDate` + `linkedVenues`).

- **Empty-slot quick menu omits Walk-in and resource-booking entry** — _function · medium_
  - **Web:** Tapping a slot opens a menu with New appointment, Walk-in, Book `<each resource assigned to that calendar>`, and Block time, so a receptionist can start any booking type at the exact slot.
  - **App:** The empty-slot sheet offers only "New booking" and "Block time". Walk-in is FAB-only and uses the current time, not the tapped slot (`index.tsx:1588` passes `time: nowTime`), and there is no way to book a resource for the tapped slot from the calendar.
  - **Evidence:** WEB `PractitionerCalendarView.tsx:7015` (New appointment), `:7022–7024` (Walk-in), `:7026–7045` (`resourcesHere = venueResources.filter(r => r.display_on_calendar_id === slotMenu.pracId)` → "Book {r.name}"), `:7054` (Block time). APP `app/(app)/(tabs)/index.tsx:1559–1613` (slot branch shows only New booking + Block time; the Walk-in button is gated to `addSheetTarget?.kind === 'fab'`, `:1579`) and `createAt`/`createAtFor` (~670–690).
  - **Fix:** In the `index.tsx` add-sheet, when the target is a slot add a "Walk-in" button that routes to `/booking/new` with `{ date: anchor, practitionerId, time: slot.time, intent: 'walk-in' }` (reuse the FAB path's params but with the slot time), and add a resource section listing venue resources whose `display_on_calendar_id === slot.practitionerId` that routes to the resource booking flow with date/time prefill, mirroring the web `slotMenu` `resourcesHere` block.

- **Week view cannot show the whole team at once (single-practitioner only)** — _function · medium_
  - **Web:** Week is a matrix of all practitioners (rows) × 7 days (columns), giving a one-glance weekly overview of the entire team's load, plus a shared events/resources strip (`WeekScheduleCdeStrip`).
  - **App:** Week shows a time-axis grid for ONE selected practitioner's 7 days (`weekColumns` built from `effectiveId`); seeing another practitioner's week requires switching the chip. The "All" chip is gated to day scope.
  - **Evidence:** WEB `PractitionerCalendarView.tsx:5556` (`viewMode==='week'` branch) + `:3233` `filteredPractitioners` + `WeekScheduleCdeStrip` import `:149`. APP `components/calendar/WeekGrid.tsx` (header doc: "A 7-day week view for ONE calendar/practitioner") + `index.tsx` `weekColumns` ~1092–1117 (single `effectiveId`) and the "All" chip render guard at `index.tsx:1329` (day scope only).
  - **Fix:** Add an "All" option to week scope: when `selectedId==='all'` in week scope, render a compact practitioner-row × day-column matrix (new `components/calendar/WeekMatrixGrid.tsx`, mirroring the web table with read-only chips) built from `gridQuery.data` per practitioner+date. Keep the existing single-practitioner `WeekGrid` for individual chips. At minimum, allow the "All" chip to be selectable in week scope.

#### Low

- **No arbitrary multi-column subset filter (single-select chips only)** — _function · low_
  - **Web:** Lets staff show any non-empty subset of calendar columns via a checkbox list ("All calendars" or e.g. 3 of 6), with "Mine" labelling for managed calendars, persisted per venue.
  - **App:** Offers single-practitioner chips plus an all-columns "All" view (day scope only); you cannot view a chosen subset of practitioners together, and the selection isn't persisted.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/practitioner-calendar/CalendarColumnsFilter.tsx:27–68` (`CalendarColumnsChecklist`). APP `app/(app)/(tabs)/index.tsx` chips (~1324–1382 — single-select Chip per practitioner + one "All" chip; `selectedId` is a single id or the "all" sentinel, `:291–292`).
  - **Fix:** Add a "Filter calendars" sheet (reuse `Sheet`) with a checkbox list of practitioners feeding a `visibleCalendarIds: string[] | null` state, and have `allCalendarsForDay`/`AllCalendarsDayGrid` render only the selected columns (default `null` = all). Lower priority since single + All already covers the common phone cases.

- **No on-grid resize for manual time blocks** — _function · low_
  - **Web:** Supports hold-to-resize a manual calendar block directly on the grid (`beginBlockResize`/`patchBlockResize` ~3716–3766, `blockResizeVisual`), in addition to editing in the modal.
  - **App:** Can create/edit/delete a manual block and edit its times in `BlockEditSheet`, but cannot drag-resize a block on the grid (only appointment bars are draggable/resizable; blocks render as a tap-to-edit Pressable).
  - **Evidence:** WEB `PractitionerCalendarView.tsx:3716–3766` (`patchBlockResize`), `2359–2360` (`blockResizeVisual`). APP `components/calendar/CalendarDayGrid.tsx:463–489` (blocked overlays are a Pressable whose `onPress` calls `onBlockTimeBlockPress` when editable — no pan/resize gesture); `DraggableAppointmentBlock` is bookings-only.
  - **Fix:** Either accept the sheet-based edit as the mobile equivalent (recommended — low value on touch), or extend the editable-block overlay in `CalendarDayGrid.tsx` to a draggable wrapper reusing `DraggableAppointmentBlock`'s hold-to-resize gesture, committing via the existing block PATCH path used by `BlockEditSheet`.

### Investigated — not a gap

- **Guest search on the calendar** — surfaced as a "Missing" screen for completeness, not raised as a discrete gap by the prior agent; the workflow is covered by the Bookings tab and the Clients surface.
- **Day-sheet (covers/capacity board)** — the web `DaySheetView` is a `table_reservation`-gated restaurant covers board, an intentional exclusion from the appointments-first mobile app; the app's "Today" tab is a KPI/forecast home, not an equivalent diary.
- **Drag-snap granularity (1 min web vs 5 min app)** and **drag/resize omitted in the dense multi-column day view** — both deliberate touch-ergonomics choices, not deficiencies.

### Recommended work (ordered)

1. **Add a persisted-prefs hook** (introduce AsyncStorage) under `lib/queries`/`providers` storing `{ scope, selectedId, startHourOverride, endHourOverride }` keyed by venue id; hydrate into `CalendarScreen` initial state (`index.tsx:275–297`), guarding a stale practitioner id like `reconcileOwnerVenue`. This unblocks gaps 1 and 2.
2. **Add a visible-window/time-range control** to `MonthPickerSheet` (or a small toolbar control); extend `computeGridBounds` (`grid-layout.ts:57`) to accept an override window and thread `startHourOverride`/`endHourOverride` through `CalendarDayGrid`/`WeekGrid`/`AllCalendarsDayGrid`; persist via the hook from step 1.
3. **Enrich `MonthGrid.tsx`** — derive per-type counts from `gridQuery` + `scheduleQuery`, render up to four colored dots, intensity-tint the cell, add an Open/Closed label via `venueDayHours`, and optionally a linked "+N" chip; pass the richer counts map from `index.tsx` (it already holds `scheduleByCalendarDate` + `linkedVenues`).
4. **Extend the empty-slot add-sheet** (`index.tsx:1559–1613`) — add a slot-aware "Walk-in" button (slot time, not `nowTime`) and a resource section filtered by `display_on_calendar_id === slot.practitionerId`, routing to the resource booking flow with date/time prefill.
5. **Add an all-team week matrix** — make the "All" chip selectable in week scope (`index.tsx:1329`) and render a new `components/calendar/WeekMatrixGrid.tsx` (practitioner rows × 7 day columns, read-only chips) from `gridQuery.data`; keep single-practitioner `WeekGrid` for individual chips.
6. **(Low) Multi-column subset filter** — add a "Filter calendars" `Sheet` writing `visibleCalendarIds: string[] | null`, consumed by `allCalendarsForDay`/`AllCalendarsDayGrid` (default `null` = all).
7. **(Low) On-grid block resize** — optionally wrap the editable-block overlay in `CalendarDayGrid.tsx:463–489` in `DraggableAppointmentBlock`'s resize gesture, committing via the existing block PATCH path; otherwise document the sheet edit as the accepted mobile equivalent.


---

## 03. Bookings — list, filters & detail

**Parity:** Strong — Near-complete action parity on the booking detail and a feature-rich list; the only genuine gaps are secondary/cosmetic UX (summary tiles, multi-service-row collapse, deposit-amount on the row pill, one-tap deposit actions) plus the intentionally-scoped restaurant Walk-in entry.

This is one of the most mature domains in the app, and that maturity held up under verification. The booking **detail** surface (`components/bookings/BookingDetailContent.tsx`, shared by the sheet and the full-screen route) reproduces essentially the entire web `ExpandedBookingContent` action set: every status transition (instant reverts + arm-to-confirm destructive flows), arrived/staff-confirm attendance toggles, quick reschedule, full modify (service/variant/staff/date/time/duration/add-ons with live availability validation), guest+notes edit, guest tag editor, profile notes, deposit actions (send link/waive/record cash/refund), resend confirmation, send guest message (email/SMS/both) with comm log, compliance section, guest history, activity timeline, multi-service/group visit cards, rebook, copy reference, call/email, and permanent delete of cancelled bookings — all backed by a complete mutation layer. The **list** is also strong: day/week/month/custom scopes, rich search, status + staff + type + time-of-day + service + compliance filters, eight sort keys, swipe quick actions, linked-venue merging, realtime sync, and per-row compliance dots. Notably, the prior agent's "missing bulk Add tag" claim was a **false positive** — the bulk tray ships both Tag and Message. Remaining genuine gaps are secondary and mostly cosmetic/UX.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Bookings list (Appointments dashboard) | `dashboard/bookings/AppointmentBookingsDashboard.tsx` | `app/(app)/(tabs)/bookings.tsx` | Strong | Same scopes, search, 8-status taxonomy, staff/service/type/compliance filters, sort, bulk, linked rows, realtime. App folds filters into a single `BookingFilterSheet`. Web adds a summary-tiles bar + Walk-in + multi-service-row collapse the app omits. |
| Booking detail (expanded) | `dashboard/bookings/ExpandedBookingContent.tsx` | `components/bookings/BookingDetailContent.tsx` | Strong | Near-complete action parity, verified. Web extras the app lacks: inline "New booking for this guest", one-tap inline deposit buttons, guest-history per-row rebook + nested detail stacking. |
| Booking detail (full-screen route) | `dashboard/bookings/BookingDetailPanel.tsx` | `app/(app)/booking/[id].tsx` | Strong | App route renders the same shared `BookingDetailContent`, adds screen-capture protection for PII, passes `isAdmin`. Functional parity; app additionally hardens against screenshots. |
| Booking detail sheet (list/calendar entry) | `dashboard/bookings/ExpandedBookingContent.tsx` | `components/bookings/BookingDetailSheet.tsx` | Strong | App opens detail as a bottom sheet (web expands inline accordion). Same content; sheet host pins the primary status action in a bottom bar (`showPrimaryAction`). |
| Full appointment modify | `components/booking/StaffAppointmentModifyForm.tsx` | `components/bookings/ModifyBookingSheet.tsx` | Full | Service/variant/staff/date/start/duration AND add-ons (REPLACE semantics) with debounced dry-run validation, free-slot chips, duration presets, add-on selection-rule enforcement. `openModify` (BookingDetailContent ~L953) seeds it. |
| Edit guest + booking notes | `components/booking/BookingNotesEditablePanel.tsx` | `components/bookings/EditBookingSheet.tsx` | Full | App edits guest first/last/phone/email + special requests + internal notes (+ dietary/occasion for table reservations) via diff-only PATCH. Web splits contact from notes; app folds them into one sheet (same fields/endpoint). |
| Deposit / payment actions | `dashboard/bookings/ExpandedBookingContent.tsx` | `components/bookings/DepositSheet.tsx` | Strong | Both expose send_payment_link / waive / record_cash / refund (POST /deposit), arm-to-confirm refund, inline cancelled-refund banner. Web is one-tap inline (~L1844-1852); app routes through a sheet (one extra tap). |
| Send guest message + comm log | `components/booking/GuestMessageChannelSelect.tsx` | `components/bookings/BookingDetailContent.tsx` | Full | `MessageGuestCompose` mirrors the channel selector (email/SMS/both, gated by available contact), inline send feedback (auto-dismiss 8s), and a sent-communications log with channel/status/recipient/error and tone-coded badges. |
| Compliance section | `components/dashboard/compliance/ComplianceSection.tsx` | `components/bookings/ComplianceCard.tsx` | Strong | Feature-flagged card on both, gated identically on guest + service. Per-row compliance dots + a "Needs compliance" filter exist on both. (Card internals not deeply diffed; surface parity confirmed.) |
| Group / multi-service visit cards | `lib/booking/group-visit-bookings.ts` | `components/bookings/GroupVisitCards.tsx` | Strong | App renders both "Services in this visit" and "Group booking" cards in the detail, read-only (gated on `group_booking_id`). Web additionally collapses these to a single list row and propagates status across the group; app does neither in the list. |
| Bulk actions tray | `dashboard/bookings/AppointmentBookingsDashboard.tsx` | `components/bookings/BookingBulkBar.tsx` | Strong | Select-all (own rows), clear, Message-selected (per-booking sends with success/fail tally) AND Add tag (Tag button → tag sub-sheet → `useBulkAddTag`). Full parity with the web tray. |
| Swipe quick actions (app-only) | n/a | `components/bookings/BookingSwipeRow.tsx` | App-only | App adds swipe-to-Confirm and swipe-to-No-Show (grace-gated) on list rows — a mobile affordance with no web equivalent. Same transitions also live in the detail toolbar. |
| New booking / Walk-in entry | `dashboard/bookings/WalkInModal.tsx` | `app/(app)/booking/new.tsx` | Partial | App new-booking is a full multi-model form (FAB/empty-state). Web also offers a "Walk-in" (seat immediately) action. Walk-in is table/floor-plan-centric (largely restaurant scope); app has no walk-in entry — `new.tsx` only mentions a walk-in deep-link intent in a comment. |
| Guest self-service manage page | `app/manage/[bookingId]/page.tsx` | n/a | Missing | Web `/manage/[bookingId]` is an HMAC-signed GUEST-facing self-service page, not a staff surface. Out of scope for the staff app; listed for completeness. |

The **list** (`app/(app)/(tabs)/bookings.tsx`) and **detail** (`components/bookings/BookingDetailContent.tsx`) are the two keystones. The list builds `searchedRows → filteredRows → listRows` (date-grouped) memos and merges linked-venue rows via `linkedToListRow` (~L143), id-namespacing them with a `linked:` prefix so own/linked rows stay distinct. The detail is rendered by three hosts — the bottom sheet (`BookingDetailSheet.tsx`), the full-screen route (`app/(app)/booking/[id].tsx`, which adds screen-capture protection), and indirectly the list — so a single content component drives parity everywhere.

Two surfaces deserve a verification note. The **modify** sheet (`ModifyBookingSheet.tsx`) is genuinely at full parity: it changes service/variant/staff/date/start/duration AND add-ons with REPLACE semantics and debounced `validate-appointment-modification` dry-runs — not a reduced subset. The **deposit** flow is functionally complete but differs in shape: web shows the four actions as one-tap inline buttons inside the Payments accordion, while the app surfaces a single "Deposit actions" / "Take deposit / payment" button (BookingDetailContent L1277) that opens `DepositSheet`, adding one tap.

### Gaps & deficiencies

#### Medium

- **No summary stats bar on the bookings list** — _function · medium_
  - **Web:** `AppointmentBookingsDashboard` renders a summary tile row (Total, Confirmed, Completed, No-shows) computed from all in-range rows (`stats` useMemo ~L1040-1046) and surfaced via `OperationsWorkspaceToolbar.summaryContent` (~L1968), so reception sees the day's shape at a glance.
  - **App:** Absent — the list has no totals/stats tiles; staff must eyeball the rows. Per-status counts exist only inside the filter sheet's status options.
  - **Evidence:** `app/(app)/(tabs)/bookings.tsx` — no stats memo; `isAttendanceConfirmed` (L128) feeds only filter matching, and `counts` (L603) only powers filter-sheet chip tallies. Web: `_reference/Resneo/src/app/dashboard/bookings/AppointmentBookingsDashboard.tsx` (stats ~L1040, summary ~L1680-1970).
  - **Fix:** Add a compact stats strip below the toolbar in `bookings.tsx`. The data is in hand: `total = searchedRows.length`, `confirmed = searchedRows.filter(isAttendanceConfirmed).length` (helper already at L128), completed/no-shows by status — render as small `MetaChip`/`Badge` tiles (reuse `components/ui/MetaChip` or a `Card` row). Mirror web's labels; gate visibility so it doesn't crowd small screens.

- **List does not collapse multi-service visits into one row** — _ui · medium_
  - **Web:** `collapseMultiServiceVisits()` reduces a multi-service visit (bookings sharing `group_booking_id` with no per-person label) to a single representative bar; segments then appear inside the expanded "Services in this visit" card.
  - **App:** The list renders every booking independently, so a guest with 3 consecutive services shows as 3 near-identical rows, cluttering the day and inflating any counts. The detail correctly shows the grouped card (`GroupVisitCards`), but the list does not pre-collapse.
  - **Evidence:** App: `app/(app)/(tabs)/bookings.tsx` `listRows` memo (~L643) groups by `booking_date` only — no `group_booking_id` collapse; in the app `group_booking_id` is consumed only by `lib/queries/useGroupVisit.ts` + `components/bookings/GroupVisitCards.tsx` (detail-only). Web: `_reference/Resneo/src/lib/booking/booking-list-row-schedule.ts` (`collapseMultiServiceVisits`), called in `AppointmentBookingsDashboard` scopeBookings.
  - **Fix:** Port `collapseMultiServiceVisits` into a helper under `lib/booking/` and apply it in the `filteredRows`/`listRows` memo in `bookings.tsx` before date grouping (keep group bookings carrying a person label as separate rows). The `useGroupVisit` hook already fetches segment data, so the representative row can keep opening the same `BookingDetailSheet`.

#### Low

- **No blank "New booking for this guest" from the detail toolbar** — _function · low_
  - **Web:** The expanded detail toolbar has a "New" button that opens the staff booking modal pre-seeded with the guest's contact (name/phone/email), so staff can quickly book a different/unrelated service.
  - **App:** The detail offers Rebook (re-selects the SAME service/variant/practitioner + guest, falling back to a guest-only prefill when there's no appointment to repeat) but no dedicated blank "New for this guest" that prefills only the contact and lets staff pick a fresh service.
  - **Evidence:** App: `components/bookings/BookingDetailContent.tsx` — the only `writeRebookBootstrap` call site is the Rebook `QuickAction` (~L960-979). Web: `_reference/Resneo/src/app/dashboard/bookings/ExpandedBookingContent.tsx` ("New" button seeding `staffNewBookingGuestContacts`).
  - **Fix:** Add a "New for guest" `QuickAction` in `BookingDetailContent.tsx` that writes a rebook bootstrap containing ONLY the guest prefill (omit the `appointment` block) and pushes `/booking/new`. `lib/rebook-bootstrap.ts` already makes `appointment` optional (`guest` is the only required field, L25-36) and `new.tsx` consumes the guest prefill, so this is a thin addition.

- **Guest-history visits offer no per-row rebook and open by navigating away** — _function · low_
  - **Web:** `GuestBookingsForGuestAccordion` lists the guest's other bookings with a per-row Rebook button (`writeStaffRebookBootstrap`) and can open a related booking's detail nested in a stack (`canOpenNested`/`onOpenBookingDetail`, up to a max depth), preserving context.
  - **App:** The guest-history card lists other visits with a status pill and a "View contact" / "View all in Contacts" link, but tapping a visit calls `router.push('/booking/[id]')` (replacing context) and there is no rebook-from-history affordance.
  - **Evidence:** App: `components/bookings/BookingDetailContent.tsx` `GuestHistoryBody` (~L198-225) — each row is a `Pressable` that `router.push('/booking/' + row.id)` (L202); no rebook button. Web: `_reference/Resneo/src/app/dashboard/bookings/GuestBookingsForGuestAccordion.tsx` (`showRebook`/`onRebook` ~L189-199, `canOpenNested`/`onOpenBookingDetail` ~L204-208).
  - **Fix:** In `GuestHistoryBody` add a small Rebook button per visit row using `writeRebookBootstrap` with that row's service/practitioner/variant, and consider opening the tapped visit in a stacked `BookingDetailSheet` rather than a full route push. Note the history rows expose `detail_label`/`kind_label`/`booking_date`/`status` but may not carry full service/practitioner ids — a row rebook may need those fields added to the guest `booking_history` payload first.

- **Deposit actions require opening a sheet instead of one-tap inline** — _ui · low_
  - **Web:** In the Payments & confirmation accordion the web shows Send payment link / Waive / Record cash (when unpaid) and Refund deposit (when paid) as direct one-tap buttons, with Resend confirmation alongside.
  - **App:** The Payments card shows a single "Deposit actions" / "Take deposit / payment" button that opens `DepositSheet`, adding one tap to reach the same four actions. Refund-on-cancelled has its own inline banner button (good), and Resend confirmation is already inline.
  - **Evidence:** App: `components/bookings/BookingDetailContent.tsx` Payments card — single button at L1277 → `components/bookings/DepositSheet.tsx`. Web: `_reference/Resneo/src/app/dashboard/bookings/ExpandedBookingContent.tsx` (deposit buttons ~L1844-1852).
  - **Fix:** Optional UX tightening — surface the same buttons inline in the Payments `CollapsibleCard` in `BookingDetailContent.tsx` (the deposit hook already runs all four actions), keeping `DepositSheet` for the amount-entry / refund-confirm path. Low priority since functionality is fully present.

- **List row omits the deposit amount on the deposit pill** — _ui · low_
  - **Web:** Each list row shows a deposit pill rendering amount + status together (`{priceDisplay} · {deposit_status}`, e.g. "£20.00 · Paid"), tinted by deposit state, whenever a deposit amount exists (`priceDisplay = formatMoneyPence(deposit_amount_pence)`).
  - **App:** The list row shows only a "Deposit due" pill (when status Pending + positive amount) or the bare `deposit_status` text — never the deposit amount.
  - **Evidence:** App: `components/bookings/BookingRow.tsx` trailing block (~L177-189) — `showDepositPending` renders "Deposit due" (L182); otherwise renders `booking.deposit_status` text only (L186-188). Web: `_reference/Resneo/src/app/dashboard/bookings/AppointmentBookingsDashboard.tsx` (`priceDisplay` ~L1397-1399, deposit pill ~L1581-1587).
  - **Fix:** In `BookingRow.tsx`, when `deposit_amount_pence` is present render the amount with the status in the trailing pill (reuse `formatPence` from `lib/format.ts`, L14 — it exists). `BookingListRow` already carries `deposit_amount_pence` (see `linkedToListRow` mapping in `bookings.tsx` L157).

- **No Walk-in (seat immediately) entry point** — _function · low_
  - **Web:** The appointment dashboard toolbar exposes a Walk-in action (`WalkInModal`) to immediately seat/record a guest with date/time/party (and, for restaurants, table assignment + cover time).
  - **App:** Absent — only the standard New booking form; no dedicated walk-in shortcut. `new.tsx` only references a "walk-in intent" deep-link in a comment that defaults the tab to Appointments.
  - **Evidence:** App: `app/(app)/booking/new.tsx` (single new-booking form; walk-in intent only in a comment ~L139, no entry point). Web: `_reference/Resneo/src/app/dashboard/bookings/AppointmentBookingsDashboard.tsx` (`onWalkIn`) and `_reference/Resneo/src/app/dashboard/bookings/WalkInModal.tsx`.
  - **Fix:** Mostly restaurant scope (floor plan / cover time) so largely an intentional exclusion for an appointments-first app. If desired for appointment venues, add a lightweight "Walk-in" that opens `/booking/new` defaulted to `now()` with a walk-in intent (the create endpoint accepts a walk-in source on web). Flag as low/scoped.

### Investigated — not a gap

- **Bulk "Add tag" action missing from the selection tray** — FALSE POSITIVE. The app bulk tray already has Add tag. `components/bookings/BookingBulkBar.tsx` renders a "Tag" button (L97-109) that opens a tag sub-sheet (L126-163) and submits via `useBulkAddTag` (`lib/queries/useContactsBulk.ts` L13), which POSTs `/api/venue/contacts/bulk {action:'add_tag', guest_ids, tag}` after resolving unique guest ids from the selected rows (L58). It is wired in `app/(app)/(tabs)/bookings.tsx` via `<BookingBulkBar>`. The prior agent's claim that the bar "only offers Message-selected" is incorrect — both Tag and Message are present, matching the web tray.

### Recommended work (ordered)

1. **[Medium] Add a summary stats strip to the list.** In `app/(app)/(tabs)/bookings.tsx`, add a memo computing `total`/`confirmed`/`completed`/`no-shows` from `searchedRows` (reuse `isAttendanceConfirmed` at L128) and render a compact `MetaChip`/`Card` tile row below the toolbar; gate on viewport width to avoid crowding small screens. Mirror web labels.
2. **[Medium] Collapse multi-service visits in the list.** Port `collapseMultiServiceVisits` from `_reference/.../lib/booking/booking-list-row-schedule.ts` into `lib/booking/`, then apply it in the `filteredRows`/`listRows` memo in `bookings.tsx` (~L612-643) before date grouping; keep per-person-labelled group rows separate. The representative row keeps opening the same `BookingDetailSheet` (segments already render via `useGroupVisit`/`GroupVisitCards`).
3. **[Low] Show the deposit amount on the list-row pill.** In `components/bookings/BookingRow.tsx` (~L177-189), render `formatPence(deposit_amount_pence)` with the status when an amount exists (`formatPence` is in `lib/format.ts` L14; `deposit_amount_pence` already on `BookingListRow`).
4. **[Low] Add a guest-only "New for guest" action to the detail.** In `components/bookings/BookingDetailContent.tsx`, add a `QuickAction` that calls `writeRebookBootstrap` with only the `guest` prefill (omit `appointment`) and pushes `/booking/new`; `lib/rebook-bootstrap.ts` already supports this shape.
5. **[Low] Add per-row Rebook to guest history + stacked open.** In `GuestHistoryBody` (`BookingDetailContent.tsx` ~L198-225) add a per-visit Rebook button; first extend the guest `booking_history` payload to carry service/practitioner/variant ids so the rebook can pre-select. Optionally open the tapped visit in a stacked `BookingDetailSheet` instead of the full route push (L202).
6. **[Low] Inline the deposit action buttons.** Optionally render Send link / Waive / Record cash / Refund directly in the Payments `CollapsibleCard` in `BookingDetailContent.tsx` (deposit hook already covers all four), reserving `DepositSheet` for amount entry / refund confirmation. Pure tap-count win.
7. **[Low / scoped] Decide on a Walk-in shortcut.** If appointment venues want it, add a "Walk-in" entry that opens `/booking/new` defaulted to `now()` with a walk-in intent. Otherwise document the omission as intentional (restaurant-centric floor-plan flow).


---

## 04. New booking / booking wizard

**Parity:** Partial — the single-attendee, single-offering path reaches strong-to-full parity across all four surfaces, but the app cannot create the two booking shapes the web's appointment flow centres on (group bookings and multi-service visits), nor capture card payment in-flow.

The app ships a mature multi-model staff booking wizard (Appointment, Class, Event, Resource) under `app/(app)/booking/new.tsx` + `components/booking-wizard/*`. For the common case — one attendee booking one offering — it is strong-to-full: guest search/select-or-create, variants, add-ons, practitioner pick (incl. "Any available"), month-availability + slot picking, deposit toggle, returning-guest flag, compliance-409 admin override, linked-venue (`owner_venue_id`) bookings, and "Book another". The parity ceiling is set by *create capability*, not polish: the web's `AppointmentBookingFlow` is built around group bookings (up to 10 distinct attendees) and multi-service back-to-back visits, and the app's `ConfirmStep` always posts `party_size: 1` with a single anchor id. Secondary gaps are no in-app Stripe capture (app emails a payment link), no client-address fieldset for at-home services, no `?tab=` deep-link/reset-to-start, appointment-only rebook bootstrap, and no resource per-day availability dots. The Table/restaurant surface is an intentional scope exclusion (appointments-first redesign), though an orphaned `RestaurantWalkInForm.tsx` lingers. One candidate gap — the "Occasion" field — was refuted: the web does not collect it on appointment/class flows either.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| New-booking shell / surface tabs | `NewBookingPageClient.tsx`, `StaffSurfaceBookingStack.tsx` | `app/(app)/booking/new.tsx`, `BookingTypeTabs.tsx` | Strong | Both derive surfaces from `booking_model` + `enabled_models`; web adds a Table surface + `?tab=` URL sync + reset-on-reselect the app lacks. |
| Appointment booking (single service) | `AppointmentBookingFlow.tsx` | `ServiceBookingFlow.tsx` (+ Service/Practitioner/Variant/Addons/MonthDate/TimeSlot/GuestDetails/Confirm steps) | Strong | Full single-service create end-to-end; missing group, multi-service, in-flow payment, client-address. |
| Multi-service visit (one person, back-to-back) | `AppointmentBookingFlow.tsx` step `multi_service` | absent | Missing | App ends at a single service; `useGroupVisit` is read-only. |
| Group appointment (multiple attendees) | `AppointmentBookingFlow.tsx` `group_*` steps | absent | Missing | No group flow on any surface. |
| Class booking | `ClassBookingFlow.tsx` | `ClassBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Session calendar → spots stepper → guest → confirm; at parity for staff create. |
| Event ticket booking | `EventBookingFlow.tsx` | `EventBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Occurrence pick → per-ticket-type quantities → confirm; web differs only by public card capture. |
| Resource booking | `ResourceBookingFlow.tsx` | `ResourceBookingFlow.tsx`, `BookingFlowPrimitives.tsx` | Strong | Date → duration → start-time → guest → confirm; no per-day availability dots, no rebook bootstrap. |
| Guest details / select-or-create | `DetailsStep.tsx`, `StaffGuestContactFields.tsx` | `GuestDetailsStep.tsx`, `lib/queries/useGuests.ts` | Strong | Debounced guest search + manual entry + comments→`dietary_notes`; missing client-address fieldset. |
| Confirm + create + success | `AppointmentBookingFlow.tsx` `PaymentStep`, `StaffBookingConfirmationFooter.tsx` | `ConfirmStep.tsx`, `BookingFlowPrimitives.tsx`, `lib/queries/useCreateBooking.ts` | Strong | All four flows post one `POST /api/venue/bookings`; web captures card in-flow, app emails payment link. |
| Table / restaurant reservation + walk-in | `StaffSurfaceBookingStack.tsx` (`table_reservation`) | `RestaurantWalkInForm.tsx` (orphaned), `useCreateWalkIn.ts` | Missing | No table tab in `BookingTypeTabs`; walk-in form reachable from no route. Intentional exclusion. |

**New-booking shell.** Both render a tab bar only when more than one surface is enabled (`new.tsx` line 218), defaulting to the primary model and honouring deep-link prefills (`?type=`/`practitionerId`/`time`/`intent` on the app; `?tab=` on web). The app correctly scopes the whole form to a linked owner venue via a `LinkedVenueContext` override (`new.tsx` lines 79-88) and blocks with a 403 when the venue is unresolved. The web persists the active tab to the URL and resets the entire stack when "New Booking" is re-selected (`handleTabChange` → `router.replace ?tab=`, `resetToStart`, `onNavReselect`, `resetKey`); the app keeps tab choice in local state only (`activeTab` useState, `new.tsx` line 135).

**Appointment flow.** Covers the core staff create end-to-end: service pick with per-booking custom duration, optional practitioner step (incl. pooled "Any available" rows when the flag is on and 2+ staff), variant + add-on selection, month availability with auto-advance to the first bookable day, slot picking with min-notice/same-day filtering, walk-in vs phone source, guest search/manual entry, review with deposit toggle + "Require deposit", `returning_guest`, `owner_venue_id`, comments→`dietary_notes`, compliance-409 "Book anyway (admin override)", and "Book another". What it cannot do vs the web: multi-service chaining, group booking, in-flow Stripe `PaymentStep`, and the client-address fieldset.

**Class / Event / Resource flows.** All three are strong for staff create. Class: choose class → month calendar of session dates (green dots from `selectedClass.dates`) → session pick → spots stepper (capped at remaining/10) → guest → confirm, sending `class_instance_id` + `party_size` + `dietary_notes`. Event: choose event → date → occurrence/time → per-ticket-type quantity steppers with remaining caps and live total → guest → confirm, sending `experience_event_id` + `ticket_lines` + summed `party_size`. Resource: choose resource → date → duration chips → start-time chips → guest → confirm, sending `resource_id` + `booking_end_time` + `party_size: 1`, with a `?resourceId=` deep-link prefill. Note: class/event `party_size>1` is one guest buying multiple seats, **not** distinct attendees.

**Confirm + create.** All four flows post to a single `POST /api/venue/bookings` (model inferred from the anchor id in `useCreateBooking.ts`), invalidate the bookings/dashboard/calendar/schedule/event/resource caches, render an inline success card with a deposit/payment-link notice and "View booking"/"Book another", and surface compliance-409 inline with an admin-override retry. The web collects card payment in-flow via the Stripe `PaymentStep` for online deposits/full payment; the app never collects card and shows "A payment link has been sent to the guest" (`ConfirmStep.tsx` line 138), relying on the backend to email `payment_url`.

### Gaps & deficiencies

#### Critical

- **Cannot create group bookings (multiple distinct attendees)** — _function · critical_
  - **Web:** `AppointmentBookingFlow` `group_*` steps let staff add up to 10 people, each with their own service/variant/practitioner/slot/add-ons, a group review card, and a single grouped create (`bookingCreateGroupUrl`) with per-person deposit classification.
  - **App:** Absent — every flow books exactly one attendee; `ConfirmStep` hardcodes `party_size: 1` and a single anchor id. `useGroupVisit.ts` is read-only (GET only).
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (Step union `'group_person_label'`…`'group_confirmation'` lines 415-416; group flow lines 2319-2349, 4130-4676; `bookingCreateGroupUrl` import line 34); `components/booking-wizard/ConfirmStep.tsx` (`party_size: 1`, line 222); `lib/queries/useGroupVisit.ts` (GET `/api/venue/bookings/list?group_booking_id=…`)
  - **Fix:** Add a group-booking path to `ServiceBookingFlow.tsx` (new `group_*` `StepKey`s) mirroring the web group steps, reusing `ServicePickerStep`/`PractitionerStep`/`VariantStep`/`AddonsStep`/`TimeSlotStep` per attendee. Add a `useCreateGroupBooking` mutation in `lib/queries` posting the web's group create endpoint and render a group review card. If the full group flow is too large, ship as a first increment a same-service/same-time party of N (collect N names).

- **Cannot create multi-service (back-to-back) visits for one client** — _function · critical_
  - **Web:** After choosing the first slot, staff append additional consecutive services for the same client (`multi_service`/`append_variant`/`append_addons` steps); start times auto-recompute into a chain and one linked visit is created (`bookingCreateMultiServiceUrl`).
  - **App:** Absent — the appointment flow ends at a single service (`StepKey` union ends at `'confirm'`); there is no "add another service" affordance and the payload carries one `appointment_service_id`.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (step `'multi_service'`; `recomputeMultiServiceChain` line 403; `bookingCreateMultiServiceUrl` line 1994); `components/booking-wizard/ServiceBookingFlow.tsx` (`StepKey` type line 37 ends at `'confirm'`); `components/booking-wizard/ConfirmStep.tsx` (single `appointment_service_id` line 229)
  - **Fix:** Introduce a `multi_service` review step in `ServiceBookingFlow.tsx` after slot selection that lists chosen segments and offers "Add another service" (re-entering service→variant→addons for the same practitioner), recomputing chained start times. Add a `useCreateMultiServiceBooking` mutation hitting the web's multi-service create endpoint and render a `MultiServiceSummaryCard`-equivalent using the existing `Card` primitives.

#### High

- **No in-app card/Stripe payment capture during booking** — _function · high_
  - **Web:** When an online deposit or full payment is required, the flow advances to a Stripe `PaymentStep` and collects the card before confirmation (appointment/class/event/resource).
  - **App:** Never collects payment; on success it shows "A payment link has been sent to the guest", relying on the backend emailing `payment_url`. Staff taking a phone booking cannot charge the card there and then.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`PaymentStep`, step `'payment'` lines 4049 & 4700, gated on `createResult.client_secret`); `components/booking-wizard/ConfirmStep.tsx` (payment-link notice line 138); `components/booking-wizard/BookingFlowPrimitives.tsx` ("A payment link has been sent to the guest")
  - **Fix:** If product wants payment-at-booking on mobile, integrate `@stripe/stripe-react-native` `PaymentSheet`: when `useCreateBooking` returns `client_secret` + `stripe_account_id`, present the sheet before showing the success card; otherwise keep the payment-link copy. Lower priority if the deposit-link model is the intended mobile UX, but document the divergence either way.

#### Medium

- **No client-address collection for at-home (`client_address`) services** — _function · medium_
  - **Web:** When a chosen service has `location_type='client_address'`, `DetailsStep` shows an address fieldset (line1/line2/town/postcode; line1+town+postcode required) and sends `client_address_*` on create — this applies to the appointment flow (`anyServiceNeedsClientAddress` over the selected service id).
  - **App:** Absent — the catalog/flow ignores `location_type`; no address fields are ever collected or sent, so mobile appointment bookings for at-home services lose the address.
  - **Evidence:** `_reference/Resneo/src/components/booking/DetailsStep.tsx` (`collectClientAddress` fieldset lines 291-298); `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`anyServiceNeedsClientAddress` keyed on `svc.location_type==='client_address'` lines 1688-1697; `clientAddressPayloadFields` spread into create at lines 2007/2082/2133); `components/booking-wizard/GuestDetailsStep.tsx` + `components/booking-wizard/ConfirmStep.tsx` (no address handling)
  - **Fix:** Thread `location_type` through the `useAppointmentCatalog` types and, when the selected service is `client_address`, render an address fieldset in `GuestDetailsStep.tsx` and add `client_address_line1/line2/city/postcode` to the `ServiceBookingFlow` `ConfirmStep` `buildPayload` (mirror `clientAddressPayloadFields`).

- **No `?tab=` deep-link persistence or "reset to start" on re-entry** — _ui · medium_
  - **Web:** Active surface tab syncs to the URL (`?tab=appointment/class/…`), and re-selecting "New Booking" in the sidebar resets the whole stack (clears tab, rebook prefill, remounts) so each visit starts blank.
  - **App:** Accepts an initial `?type=` but tab choice lives only in component state (`activeTab` useState — not persisted or shareable), and there is no reset-to-start when navigating back to the booking tab, so stale wizard state can persist across opens.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/bookings/new/NewBookingPageClient.tsx` (`handleTabChange` `router.replace ?tab=` line 143; `resetToStart` line 122; `onNavReselect` line 133; `resetKey` line 158); `app/(app)/booking/new.tsx` (`activeTab` useState only, line 135 — no URL sync, no reselect reset)
  - **Fix:** In `app/(app)/booking/new.tsx`, write the active tab to a router param on change and key the flow subtree on a reset token cleared on screen focus (`useFocusEffect`) so returning to the tab starts fresh. Lower priority than the create-capability gaps.

- **Rebook pre-fill only works for appointments, not class/event/resource** — _function · medium_
  - **Web:** `staffRebookBootstrap` pre-fills the picker for appointment **and** resource surfaces (and guest fields broadly), letting staff re-create a prior booking quickly.
  - **App:** Only `ServiceBookingFlow` consumes the rebook bootstrap (`readAndClearRebookBootstrap`); `ClassBookingFlow`/`EventBookingFlow`/`ResourceBookingFlow` only honour a `?guestId` guest prefill, not a full service/date/duration rebook. The rebook payload type carries only an `appointment` shape.
  - **Evidence:** `components/booking-wizard/ServiceBookingFlow.tsx` (`readAndClearRebookBootstrap` lines 215-293) vs `ResourceBookingFlow.tsx`/`ClassBookingFlow.tsx`/`EventBookingFlow.tsx` (only `useGuestDetail` `?guestId` prefill; 0 rebook refs); `lib/rebook-bootstrap.ts` (`RebookBootstrapPayload` has only `.appointment`, lines 25-36); `_reference/Resneo/src/components/booking/ResourceBookingFlow.tsx` (`staffRebookBootstrap`, 12 refs)
  - **Fix:** Extend `lib/rebook-bootstrap.ts` to carry resource/class/event selections and consume it in `ResourceBookingFlow.tsx` (pre-select resource + duration + date) at minimum, mirroring the web resource rebook; reuse the existing guarded-apply pattern from `ServiceBookingFlow`.

- **Table / restaurant reservation + walk-in surface absent (orphaned walk-in form exists)** — _function · medium_
  - **Web:** Restaurant-mode venues get a "Table" surface (table/area/covers selection, walk-in seating via `WalkInModal`, `UnifiedBookingForm`).
  - **App:** Absent from the wizard — no table tab in `BookingTypeTabs` and no table/walk-in form is reachable. A `RestaurantWalkInForm.tsx` component does exist and consumes `useCreateWalkIn`, but it is imported by no screen under `app/` (dead/orphaned UI), so there is no navigable walk-in surface.
  - **Evidence:** `_reference/Resneo/src/components/booking/StaffSurfaceBookingStack.tsx` (`table_reservation` → `UnifiedBookingForm`/`WalkInModal` lines 339-365); `components/booking-wizard/BookingTypeTabs.tsx` (`BookingFlowType` has no `table_reservation`, line 12); `components/booking-wizard/RestaurantWalkInForm.tsx` (uses `useCreateWalkIn` but unimported by any route — grep over `app/` returns 0 matches); `lib/queries/useCreateWalkIn.ts`
  - **Fix:** Intentional scope exclusion per the appointments-first redesign (4-tab nav, no restaurant). If `table_reservation` venues come into scope, wire the existing `RestaurantWalkInForm` + a table-picker step and a "Table" `BookingFlowType`; otherwise consider deleting the orphaned `RestaurantWalkInForm` to avoid dead code. Listed for completeness.

#### Low

- **Resource date step shows no per-day availability indicator** — _ui · low_
  - **Web:** Resource flow pre-loads a month availability calendar and highlights days that have at least one bookable slot (green) before duration/slot.
  - **App:** Resource date step passes `availableDates={null}` to `MonthDatePicker`, so every future day looks selectable; the user only discovers no-availability after picking duration + time.
  - **Evidence:** `components/booking-wizard/ResourceBookingFlow.tsx` (`MonthDatePicker availableDates={null}`, line 213 — vs `ClassBookingFlow` which passes its session dates for green dots); `_reference/Resneo/src/components/booking/ResourceBookingFlow.tsx` (`ResourceCalendarMonth` + `availableDates`)
  - **Fix:** Add a resource month-availability query (extend `lib/queries/useBookableOfferings` or a new `useResourceMonthAvailability` hitting the resource calendar endpoint) and pass its date set to `MonthDatePicker` in `ResourceBookingFlow.tsx`.

- **No waitlist join when a day is fully booked** — _function · low_
  - **Web:** When no appointment slots are available and `waitlist_v2` is enabled, the *public* flow shows `AppointmentWaitlistJoin` so the guest can join the waitlist.
  - **App:** Absent — the empty time-slot state just tells the user to try another date.
  - **Evidence:** `_reference/Resneo/src/components/booking/AppointmentBookingFlow.tsx` (`AppointmentWaitlistJoin` gated by `appointmentWaitlistEnabled && isPublicGuest`, line 3574; `isPublicGuest` line 548); `components/booking-wizard/TimeSlotStep.tsx` (empty state)
  - **Fix:** Web gates this to the public audience (`isPublicGuest`), so it is **not** part of the staff create flow — mirror only if staff-initiated waitlist adds are wanted. Documented as public-only; the staff flow lacks any waitlist affordance but the web staff flow does too.

### Investigated — not a gap

- **Missing "Occasion" field on appointment bookings** — False positive. The web does **not** collect "occasion" on appointment (or class) bookings. In `_reference/Resneo/src/components/booking/DetailsStep.tsx` the Occasion input renders only inside `{!useAppointmentFields && (...)}` (line 582), and `useAppointmentFields = isAppointment || isClass` (line 238); for the appointment variant occasion is explicitly sent as `undefined` (line 286). Occasion belongs to the restaurant/`table_reservation` surface only — which the app intentionally omits. The app is therefore already at parity for the appointment flow. (The `occasion` key in `CreateBookingPayload` at `lib/queries/useCreateBooking.ts` line 45 is just an unused type member mirroring the web's shared payload type.) Folded into the table/restaurant surface gap.

### Recommended work (ordered)

1. **Multi-service visit (critical, highest leverage).** Add a `multi_service` review step in `components/booking-wizard/ServiceBookingFlow.tsx` after slot selection (list segments + "Add another service" re-entering service→variant→addons), recompute chained start times, and add a `useCreateMultiServiceBooking` mutation in `lib/queries`. Smaller surface area than group; same client/guest throughout.
2. **Group appointment booking (critical).** Add `group_*` `StepKey`s to `ServiceBookingFlow.tsx` reusing the existing per-step components per attendee, plus a `useCreateGroupBooking` mutation and a group review card. If too large for one pass, ship a same-service/same-time party-of-N first (collect N names, one slot).
3. **In-flow Stripe capture (high) — product decision first.** If payment-at-booking is wanted on mobile, integrate `@stripe/stripe-react-native` `PaymentSheet` in `components/booking-wizard/ConfirmStep.tsx`, triggered when `useCreateBooking` returns `client_secret` + `stripe_account_id`; otherwise document the payment-link divergence and close.
4. **Client-address fieldset (medium).** Thread `location_type` through `useAppointmentCatalog` types; render an address fieldset in `GuestDetailsStep.tsx` for `client_address` services and add `client_address_*` to `ServiceBookingFlow` `ConfirmStep.buildPayload`.
5. **Tab persistence + reset-to-start (medium).** In `app/(app)/booking/new.tsx`, sync `activeTab` to a router param and key the flow subtree on a focus-cleared reset token (`useFocusEffect`).
6. **Extend rebook bootstrap to resource (medium).** Add resource (and optionally class/event) shapes to `lib/rebook-bootstrap.ts` and consume them in `ResourceBookingFlow.tsx`, reusing the guarded-apply pattern from `ServiceBookingFlow`.
7. **Resource month-availability dots (low).** Add a `useResourceMonthAvailability` query and pass its date set to `MonthDatePicker` in `ResourceBookingFlow.tsx` (replace `availableDates={null}`).
8. **Dead-code cleanup (low).** Either wire `components/booking-wizard/RestaurantWalkInForm.tsx` (+ `useCreateWalkIn`) into a navigable surface or delete the orphan to avoid confusion; revisit only if `table_reservation` venues come into scope.


---

## 05. Clients / Contacts / Guests & Import

**Parity:** Strong — every per-contact and directory capability is at near-complete parity (and the app exceeds web in several places), with one deliberate, large exclusion: the desktop-grade CSV/Excel import wizard.

The contact directory, search/filter/sort, individual-contact CRUD, tags, custom fields, documents, household, marketing, compliance, communications, merge, GDPR export/erase, bulk actions and filtered CSV export all map closely to the web staff dashboard — and the app is functionally **ahead** in a handful of spots (it can edit a full postal address that the web shows read-only, adds an A–Z jump rail, instant-save marketing toggles, swipe-to-call/text, infinite scroll, bulk remove-tag, and screen-capture protection on the PII profile). The single material gap is the multi-step **CSV/Excel import wizard** (`ImportHub` + Upload→Map→Review→References→Validate→Importing), which is entirely absent — there are zero references to `/api/import/*` anywhere in `app/`, `lib/`, or `components/` — and is replaced by an explicit "Open Data Import on the web" link in Settings → Business profile. Remaining differences are secondary and confirmed: bulk Message uses a consent-gated marketing broadcast vs web's per-guest fan-out, the filter sheet shows labels without web's per-option helper hints, and there is no page-size control (infinite scroll, fixed `PAGE_SIZE=50`). All seven candidate gaps were verified real; no false positives.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Contact directory / list | `ContactsDashboard.tsx` (`ContactRow`, list body ~L1794–1937) | `app/(app)/(tabs)/clients.tsx` (`GuestRow`, FlatList, `PAGE_SIZE=50` L67) | Strong | App adds A–Z rail, infinite scroll, swipe-to-call/text, realtime LiveDot, press-in prefetch; navigates to full-screen detail vs web accordion. |
| Search | `ContactsDashboard.tsx` (`OperationsToolbarGuestSearchPanel`) | `clients.tsx` (`SearchBar`, `SEARCH_DEBOUNCE_MS=280`, `MIN_SEARCH_LENGTH=2`) | Full | Both debounce ~300ms, search name/phone/email via same endpoint, removable chip + clear. App enforces a visible 2-char minimum. |
| Filters (who-to-include + smart lists + dates/staff/service/marketing) | `ContactsDashboard.tsx` (`ContactsToolbarOptionPopover` "Filters", `CONTACT_SHOW_OPTIONS` L58–74) | `components/clients/ContactFilterSheet.tsx` | Strong | Same identity scope + 7 segments + date/staff/service/tag/marketing. App restricts marketing to the two backend-valid values; omits web's per-option hint copy. |
| Sort | `ContactsDashboard.tsx` (`CONTACTS_SORT_OPTIONS` popover) | `clients.tsx` (`SORT_OPTIONS` chip row) | Full | Identical sort set (recent/oldest visit, name A–Z/Z–A, most visits, recently added); app surfaces as always-visible chip row. |
| Active-filter summary chips | `ContactsDashboard.tsx` (`contactsSummaryContent`) | `clients.tsx` (`filterChips`) | Full | Both render removable summary chips + total + page/loaded count; "All N loaded" footer (clients.tsx L775). |
| Create contact | `CreateContactModal.tsx` | `components/clients/CreateContactSheet.tsx` (+ `useCreateGuest.ts`) | Full | Field-for-field match: first/last/email/phone, same maxLengths, dedupe-by-email-then-phone via `POST /api/venue/guests`, same identity gating. |
| Contact profile / detail | `ContactDetailPanel.tsx` | `app/(app)/client/[id].tsx` | Strong | Identity hero, call/email/message, visits/stats, notes, inline tags, booking history, marketing, custom fields, household, documents, compliance, communications, merge, GDPR. App can also **edit** address (web render-only). |
| Edit contact (identity, address, notes, tags, marketing) | `ContactDetailPanel.tsx` (inline first/last/email/phone only; address render-only L490–499) | `components/clients/GuestEditSheet.tsx` (+ `MarketingPreferencesCard`, `GuestTagEditor`) | Strong | App's single sheet covers identity + tags + notes + marketing **plus** `address_line1/2/address_city/address_postcode` (L38–41, L112–118). App is functionally ahead. |
| Tags editor (per-contact) | `GuestTagEditor.tsx` | `components/clients/GuestTagEditor.tsx` | Strong | Add/remove chips with venue-tag typeahead, PATCH tags. App also offers comma-separated entry in the edit sheet. |
| Custom client fields | `CustomerProfileNotesCard` + `custom_field_definitions` | `components/clients/CustomFieldsSection.tsx` (+ `useGuests include_custom_fields`) | Strong | Renders active definitions (text/number/boolean/date), inline edit + save via `custom_fields` PATCH, exports as CSV columns. |
| Documents | `ContactDocumentsSection.tsx` | `components/clients/DocumentsSection.tsx` (+ `useGuestDocuments.ts`) | Strong | List/upload (signed-URL 3-step)/download/delete with size, date, category; degrades gracefully if `expo-document-picker` unavailable. |
| Household / relationships | `ContactHouseholdSection.tsx` | `components/clients/HouseholdSection.tsx` (+ `useGuestHousehold.ts`) | Strong | Lists households + members, link by name search, navigate to a member. By-name picker is a usability win over pasting UUIDs. |
| Marketing preferences | `ContactMarketingSection.tsx` | `components/clients/MarketingPreferencesCard.tsx` | Full | Two toggles (consent + opt-out), consent timestamp, guidance. App saves instantly on toggle; both PATCH same fields. App shows stronger opt-out warning. |
| Compliance records (per contact) | `ContactComplianceSection.tsx` (records + audit only, no booking-requirements panel) | `components/clients/ComplianceSection.tsx` (read-only L118–126) | Strong | At parity — both read-only, gated by `compliance_records_enabled`; tap-to-view via `ComplianceRecordSheet`. Neither captures/sends-link here. |
| Communications / message log + send | `ContactDetailPanel.tsx` ("Messages & privacy" accordion) | `client/[id].tsx` (`CommunicationsSection` + `GuestMessageSheet`) | Strong | Both list history + send SMS/email with channel select. App routes via `GuestMessageSheet` → `/api/venue/guests/[id]/message`; web inlines composer. |
| Merge duplicate contacts | `MergeContactsModal.tsx` | `components/clients/MergeContactDetailSheet.tsx` (+ `useMergeGuests` → `/api/venue/guests/merge`) | Strong | Admin-only merge wizard on both, opened from detail; both navigate to the surviving contact after merge. |
| GDPR export + erase | `ContactGdprSection.tsx` + `EraseGuestDataModal` | `components/clients/GdprSection.tsx` | Full | App combines JSON export (Share sheet) + two-step erase in one admin section. Same endpoints (`/export-guest`, `/erase-guest`). |
| Bulk actions | `ContactsDashboard.tsx` (`runBulkAddTag`, `runBulkContactMessage` L693–756) | `components/clients/BulkActionSheets.tsx` + `BulkActionBar`; `useContactsBulk.ts` | Strong | Multi-select Add-tag + Bulk-message on both. App **adds** bulk Remove-tag. Bulk Message semantics differ (see gaps). Neither has bulk delete/export-selected. |
| CSV export (filtered) | `ContactsDashboard.tsx` (`exportFilteredCsv`) | `clients.tsx` (`handleExport`, `EXPORT_PAGE_SIZE=250` L71) | Full | Identical column set incl. one column per active custom field. App adds a 5000-row cap + toast + chunked build; web caps at 120 pages. Admin-gated. |
| CSV/Excel import wizard | `_reference/Resneo/src/app/dashboard/import/*` + `/api/import/sessions` | absent (link-out: `venue-profile.tsx` L876–887, `WEB_IMPORT_PATH='/dashboard/import'`) | Missing | Full AI-assisted ETL on web; **none** in app (zero `/api/import/*` references). Deliberate scope exclusion. |
| Import session list / management (`ImportHub`) | `dashboard/import/ImportHub.tsx` (L100–230) | absent | Missing | Web lists prior sessions with status, counts, "Undo available until", Continue/Resume/Report-CSV/Undo/Delete. No app equivalent. |
| Pagination / page-size control | `ContactsDashboard.tsx` (25/50/100/250 per page, "Page X of Y · N total" L1912–1936) | `clients.tsx` (infinite scroll, fixed `PAGE_SIZE=50`, "All N loaded" footer L775) | Partial | Intentionally different paradigm for mobile; no page-size choice or page index, but shows "X of N" + "All loaded". |
| Screen-capture protection on PII profile | n/a | `client/[id].tsx` (`useScreenCaptureProtection('client-detail')` L217) | App-only | Blocks screenshots/recording while a PII-heavy profile is open — mobile-only hardening, no web counterpart. |

The **directory** is a faithful mobile reimagining of the web list: both show avatar/initials, name, phone + email, visit and no-show counts, last-visit, a next-booking pill, tag chips with overflow, and a selection model. The app trades web's classic prev/next pager for infinite scroll (`onEndReached`/`loadNextPage` L871–872) and adds an A–Z jump rail (`ContactAzRail`), swipe-to-call/text, a realtime `LiveDot`, and press-in prefetch. Web expands detail in-place via an accordion; the app navigates to a full-screen route.

The **filter sheet** (`ContactFilterSheet.tsx`) is at strong parity but worth calling out for correctness: it deliberately limits marketing to the only two backend-valid values, `subscribed` / `not_subscribed`, via `normaliseMarketing()` (L42–48) — the inline comment notes the previous `opted_in/opted_out/no_record` options returned the wrong contacts because the backend silently defaulted unknowns to `subscribed`. Its `SEGMENT_OPTIONS` and `IDENTITY_OPTIONS` (L16–31) render label-only chips/segments; the web's `CONTACT_SHOW_OPTIONS` carries a one-line hint per option that the app omits.

The **edit sheet** is the clearest "app ahead of web" case. `GuestEditSheet.tsx` writes `address_line1`, `address_line2`, `address_city`, and `address_postcode` (L38–41, L112–118) through `PATCH /api/venue/guests/[id]`, whereas the web `ContactDetailPanel` renders address strictly read-only (L490–499, no inputs) and scatters identity/notes/marketing edits across separate inline widgets — the app consolidates all of it into one sheet.

**Bulk actions** mostly match, but the Message action diverges by design: `useBulkMarketingMessage` (`useContactsBulk.ts` L52–73) sends one `POST /api/venue/contacts/bulk {action:'marketing_message'}` with `subject` + `body` + a `channel` of `email`/`sms`/`both`, consent-gated so only subscribed contacts on a matching channel receive it; web fans out a per-guest `/api/venue/guests/[id]/message` over `Promise.all` (L693–756). Different audience model, payload, endpoint, and channel options.

### Gaps & deficiencies

#### High

- **CSV/Excel contact import is entirely absent in the app** — _function · high_
  - **Web:** Admins import clients (and bookings/staff) from CSV/Excel via a 6-step wizard: upload (auto kind-detection + report reshape), AI column mapping (drag-drop, split combined columns, create custom fields, free-text AI instructions), review, reference resolution (create services/staff), async validation with row-level issue triage, then import with imported counts, a downloadable report CSV, and a 24-hour undo.
  - **App:** Absent. Zero references to `/api/import/*` anywhere in `app/`, `lib/`, or `components/`. Settings → Business profile shows a "Data import" section that only links out to the web tool.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/import/ImportHub.tsx`; `_reference/Resneo/src/app/dashboard/import/[sessionId]/{upload,map,review,references,validate,importing}/`; `_reference/Resneo/src/app/api/import/sessions/`; `app/(app)/manage/venue-profile.tsx` (L876–887, `WEB_IMPORT_PATH='/dashboard/import'`)
  - **Fix:** Treat as a deliberate v1 scope exclusion — the wizard is desktop-grade (drag-drop, multi-file, AI mapping, async jobs) and a poor fit for a phone; keep the link-out. If a mobile MVP is ever wanted, scope to the simplest path only: single-file "clients" CSV upload + auto/AI map + validate + import using the existing `/api/import/sessions` endpoints, reusing `useGuests`/`useCreateGuest` patterns — do NOT port reshape/references/staff-creation. At minimum, surface the link-out from the Contacts tab (e.g. an overflow action), not only Business profile.

#### Medium

- **No import session history / status / undo surface in the app** — _function · medium_
  - **Web:** `ImportHub` lists prior import sessions with status pills, imported-client/booking counts, an "Undo available until" notice, and Continue/Resume/Report-CSV/Undo/Delete actions (`POST /api/import/sessions/[id]/undo`), so a mistaken import can be reverted within 24h from anywhere.
  - **App:** Absent — no way to see or undo a recent import from the app; a staffer on mobile who needs to undo a bad import must find a desktop.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/import/ImportHub.tsx` (L100–230, Undo button → `/api/import/sessions/[id]/undo`); `app/(app)/manage/venue-profile.tsx` (link-out only)
  - **Fix:** Low-effort, high-value subset — add a read-only "Recent imports" list (plus an Undo button) under the Data import section of `app/(app)/manage/venue-profile.tsx`, backed by `GET /api/import/sessions` and `POST /api/import/sessions/[id]/undo`. Gives mobile admins the safety net without porting the whole wizard.

#### Low

- **Filter sheet omits the web's explanatory helper hints per option** — _content · low_
  - **Web:** Each "Who to include" choice carries a one-line plain-English hint (e.g. "People with a name plus email or phone you can reach.", "Everyone we can recognise. Anonymous walk-ins stay hidden."), and date/staff/service/marketing sections have contextual guidance.
  - **App:** Chips/segments render labels only with no per-option hint text. App segment labels are fairly self-explanatory ("New this period", "By last visit", "Upcoming visit", "By last staff"), which softens discoverability, but the web copy is absent.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/contacts/ContactsDashboard.tsx` (`CONTACT_SHOW_OPTIONS` hints L58–74); `components/clients/ContactFilterSheet.tsx` (`IDENTITY_OPTIONS`/`SEGMENT_OPTIONS` label-only, L16–31, no hint rendering)
  - **Fix:** Add optional hint lines under the selected segment / identity option in `ContactFilterSheet.tsx`, mirroring the web copy from `CONTACT_SHOW_OPTIONS` and the segment hints. Cheap content-only parity improvement.

- **Bulk message semantics differ (marketing broadcast vs per-guest message)** — _function · low_
  - **Web:** Bulk "Message" fans out an individual `/api/venue/guests/[id]/message` to each selected guest (same single-channel `GuestMessageChannel` as single-contact messaging), reporting per-recipient success/failure (`runBulkContactMessage` `Promise.all` over `selectedIds`).
  - **App:** Bulk "Message" sends a marketing broadcast via `useBulkMarketingMessage` → `POST /api/venue/contacts/bulk {action:'marketing_message'}` with `subject` + `body` and a channel of `email`/`sms`/`both`; only consented contacts on a matching channel receive it; reports sent/skipped counts. Different audience model (consent-gated), payload, endpoint, and channel options.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/contacts/ContactsDashboard.tsx` (`runBulkContactMessage` L693–756); `components/clients/BulkActionSheets.tsx` (`BulkMessageSheet` L137–227); `lib/queries/useContactsBulk.ts` (`useBulkMarketingMessage` L52–73)
  - **Fix:** Confirm with product which semantics the directory's bulk Message should have. If it should match web (transactional-style fan-out respecting each contact's reachability rather than marketing-consent gating), switch `BulkMessageSheet` to loop `/api/venue/guests/[id]/message`; otherwise document the intended divergence.

- **No page-size control and no explicit page/total position indicator** — _function · low_
  - **Web:** Directory lets the user pick 25/50/100/250 per page (persisted to `localStorage`) and always shows "Page X of Y · N total" plus prev/next.
  - **App:** Infinite scroll with a fixed 50-row page (`PAGE_SIZE=50`); shows an "All N loaded" footer (clients.tsx L775) and an "X of N clients" count, but no page-size choice or page index.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/contacts/ContactsDashboard.tsx` (`CONTACTS_PAGE_SIZE_OPTIONS` `[25,50,100,250]`, pagination footer L1912–1936); `app/(app)/(tabs)/clients.tsx` (`PAGE_SIZE=50` L67, `onEndReached` L871, `listFooter` L775)
  - **Fix:** Intentional mobile pattern — infinite scroll is correct. No action needed beyond confirming the "X of N" count and "All loaded" footer remain (they do). Flagged for completeness.

- **Contact compliance is view-only on mobile (no capture / send-link)** — _function · low_
  - **Web:** The contact-panel compliance section renders records + audit only (no capture/send-link, no booking-requirements panel), gated by `compliance_records_enabled`. Capture/requirements live on the booking surface.
  - **App:** Same — records list + collapsible audit, tap-to-view via `ComplianceRecordSheet`, no capture/send-link.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/contacts/ContactComplianceSection.tsx` (wraps dashboard `ComplianceSection` with no booking context); `components/clients/ComplianceSection.tsx` (L118–126, read-only intent gated on `compliance_records_enabled`)
  - **Fix:** This is at parity (web's contact compliance is also read-only). No action required; documented to confirm the app's read-only compliance here is intentional and correct, not a regression.

### Investigated — not a gap

_No items were dismissed during this audit — all seven candidate gaps were verified as real._

### Recommended work (ordered)

1. **Surface the import link-out from the Contacts tab.** Add an overflow/menu action in `app/(app)/(tabs)/clients.tsx` that opens `WEB_IMPORT_PATH` (`/dashboard/import`), so admins discover import where they manage contacts — not only buried in Settings → Business profile. _(Low effort; addresses the High gap's discoverability without building the wizard.)_
2. **Add a read-only "Recent imports" list + Undo to Business profile.** Under the Data import section of `app/(app)/manage/venue-profile.tsx`, render sessions from `GET /api/import/sessions` with status, imported counts and "Undo available until", plus an Undo button calling `POST /api/import/sessions/[id]/undo`. Gives mobile admins the 24h safety net cheaply. _(Medium gap; new read-only hook + small UI.)_
3. **Decide and align bulk-Message semantics.** Confirm with product whether the directory bulk Message should be a marketing broadcast (current) or a per-guest fan-out (web). If aligning to web, change `BulkMessageSheet` (`components/clients/BulkActionSheets.tsx`) to loop `/api/venue/guests/[id]/message` per `selectedId`; otherwise add an in-sheet note clarifying it only reaches consented contacts. _(Low; either a behavioural change or a copy clarification.)_
4. **Add per-option hint copy to the filter sheet.** In `components/clients/ContactFilterSheet.tsx`, render an optional hint line under the selected identity/segment option, mirroring web's `CONTACT_SHOW_OPTIONS` and segment hints. _(Low; content-only.)_
5. **If a mobile import MVP is ever prioritized,** scope it to a single-file "clients" CSV upload → auto/AI map → validate → import path against the existing `/api/import/sessions` endpoints, reusing `useGuests`/`useCreateGuest` — explicitly excluding reshape, reference resolution and staff/service creation. _(High effort; only if product wants it — default is to keep the link-out.)_
6. **No action on page-size and contact-compliance read-only** — both are intentional, at-parity mobile decisions confirmed during this audit; listed only so future "web parity" passes don't re-open them.


---

## 06. Classes & Events

**Parity:** Strong — core class/event management (type & event CRUD, scheduling, weekly rules, rosters with check-in, CSV) is at strong-to-full parity over the same Bearer routes the web uses, but the entire Class Products / class-commerce surface (credit packs, courses, memberships) is absent.

Day-to-day running of classes and events is genuinely well covered in the app, and in a few places (weekly-rule **creation**, per-row custom-date pickers, plan-gate handling) it is ahead of the current web view. The dominant gap is commercial, not operational: the web's prepaid **credit packs, fixed-session courses with enrollment management + refunds, and recurring memberships** have zero hooks, screens, or types in the app — confirmed by grep across `app/`, `components/`, and `lib/`. Secondary gaps are all surfacing/polish: no month-grid or class-type filter or stats bar on the timetable, the event public-booking-link not exposed on the Events screen (the link itself is already copyable elsewhere in the app), Classes/Events buried under Settings, and the per-session admin cancel reachable only from the manager list rather than the open roster.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Class timetable (list/agenda) | `class-timetable/ClassTimetableView.tsx`, `ClassTimetableReadOnlyCalendar.tsx`, `ClassTimetableStatsRow.tsx` | `app/(app)/classes.tsx`, `components/classes/ClassSessionCard.tsx` | Partial | App is a rolling 7-day agenda; web adds a month-grid calendar, class-type filter, and stats bar. |
| Class type create/edit | `class-timetable/ClassTimetableView.tsx` (class-type modal) | `components/classes/ClassTypeEditorSheet.tsx` | Full | Field parity confirmed; app adds a swatch palette + hex field. |
| Schedule sessions (single/weekly/every-N-days) | `class-timetable/ClassScheduleModal.tsx` | `components/classes/ClassScheduleSheet.tsx` | Strong | Same expansion math + 100 cap; app uses a date-picker field, web a month grid. |
| Weekly recurring rule create/edit | `class-timetable/ClassTimetableView.tsx` (editingTimetable + chips) | `components/classes/ClassRuleSheet.tsx`, `ClassTypesManagerSheet.tsx` | Strong | App is ahead: it **creates** weekly rules + "Generate sessions"; web only edits/removes existing ones. |
| Class session roster / check-in | `practitioner-calendar/ClassInstanceDetailSheet.tsx` | `components/classes/ClassRosterView.tsx` | Strong | Full check-in/no-show/CSV/tap-through; missing the per-session cancel that lives in the roster header on web. |
| Class manager (types + sessions + rules hub) | `class-timetable/ClassTimetableView.tsx` | `components/classes/ClassTypesManagerSheet.tsx` | Strong | Lists types, next sessions, active rules, all CRUD + cancel-and-notify; web also has a "Class products" link. |
| Event list + manager | `event-manager/EventManagerView.tsx` | `app/(app)/events.tsx`, `components/events/EventManagerSheet.tsx`, `EventCard.tsx` | Strong | Upcoming/Past segmented + roster + manager; web adds ticket-tier/cap pills + copy-link. |
| Event create/edit | `event-manager/EventManagerView.tsx` (event form) | `components/events/EventEditorSheet.tsx` | Full | Full parity (112 matches); app's per-row date pickers are more robust than web's textarea. |
| Event attendee roster | `event-manager/EventManagerView.tsx` (attendees + EventAttendeeArrivedActions) | `components/events/EventAttendees.tsx` | Full | Full parity (46 matches): party size, per-ticket lines, deposit, Arrived/Clear, CSV. |
| Class Products — credit packs | `class-timetable/products/ClassCommerceProductsClient.tsx` (CreditPackPanel) | absent | Missing | No screen/route/hook/type; gated behind `class_commerce_enabled` on web. |
| Class Products — courses + enrollments | `products/ClassCommerceProductsClient.tsx` (CoursePanel, CourseEnrollmentsPanel) | absent | Missing | Web manages enrollments + admin cancel-with-refund; app has no usage at all. |
| Class Products — memberships | `products/ClassCommerceProductsClient.tsx` (MembershipPanel) | absent | Missing | Recurring class memberships (allowance/unlimited, rollover, discount); no app equivalent. |
| Event public booking link | `event-manager/EventManagerView.tsx` (line 819 copy, line 888 open) | `app/(app)/events.tsx`, `EventManagerSheet.tsx` (absent here) — but present in `manage/booking-page.tsx` | Partial | Action not on the Events screen; the same `/book/[slug]` link is already copyable/openable in `booking-page.tsx`. |

**Class timetable.** The app's `classes.tsx` is a rolling 7-day `SectionList` agenda with week prev/next navigation and live-sync. Web pairs an agenda with a read-only month calendar (`ClassTimetableReadOnlyCalendar.tsx`) and a `scheduledClassFilterId` per-class-type filter plus a compact stats row. The screen is reached via **Settings → Booking types** (`appRoute '/classes'`), not a tab.

**Class type create/edit.** `ClassTypeEditorSheet.tsx` matches web field-for-field: name, description, colour, active, duration, capacity, a required calendar column with inline add, instructor label, booking rules, and price + payment radios with conditional deposit and a Stripe-not-connected warning. The app additionally offers a curated swatch palette plus a hex field, and gates non-admins to their managed calendars.

**Schedule sessions.** `ClassScheduleSheet.tsx` ports the date-expansion math (single / weekly / every-N-days), caps creation at 100, reports created/skipped counts, and can edit an existing instance. The only difference is the date input: the app uses a `DatePickerField` (6 refs, no month grid) where web uses a month-grid cell picker that shows existing sessions inline — functionally equivalent.

**Weekly recurring rule.** The app is genuinely ahead here. `ClassRuleSheet.tsx` both **creates** and edits a weekly rule (`day_of_week`, time, interval 1–8 weeks, end never/until/count), and `ClassTypesManagerSheet.tsx` exposes "Generate sessions". The current web view only edits/removes existing rules. Both use the same payloads to edit/remove.

**Class session roster.** `ClassRosterView.tsx` shows the attendee list with status/contact/deposit/checked-in time, per-attendee **Check in** and **No-show**, **Check in all**, CSV export, and tap-through to the booking detail, and it handles the class-commerce 403 gracefully. It is downgraded from full to strong for one reason: the per-session admin **Cancel class & notify** is absent from this roster header (it lives in `ClassTypesManagerSheet`), and the footer note (lines 356–357) wrongly states that cancelling a session is web-only.

**Event surfaces.** `events.tsx` is a read-only Events screen (Upcoming / Past 90 days segmented, expandable roster, live-sync over `experience_events` + bookings); `EventManagerSheet.tsx` adds New/search/View attendees/Edit/Delete and admin Cancel-and-notify. Create/edit (`EventEditorSheet.tsx`) and the attendee roster (`EventAttendees.tsx`) are both at full parity. Web additionally shows ticket-tier pills, a cap pill, and a copy-booking-link affordance.

### Gaps & deficiencies

#### High

- **Class Products / class-commerce surface entirely missing (credit packs, courses, memberships)** — _function · high_
  - **Web:** At `/dashboard/class-timetable/products` (linked from the timetable header when `class_commerce_enabled`), staff create/edit/archive/delete prepaid credit packs, fixed-session courses, and recurring memberships, and see class-commerce metrics. Backed by `/api/venue/class-credit-products`, `/api/venue/class-course-products`, `/api/venue/class-membership-products`, `/api/venue/class-commerce-reports`.
  - **App:** Absent — no screen, route, hook, or type for any class product. `lib/queries/useClassesManage.ts` (the only classes hook) covers only class types/instances/rules/attendees, and `ClassTypesManagerSheet.tsx` has no "Class products" entry. `settings.tsx` even comments that setup & products still live on the web.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/products/ClassCommerceProductsClient.tsx` + `products/page.tsx`; route groups on disk `src/app/api/venue/class-credit-products`, `class-course-products`, `class-membership-products`, `class-commerce-reports`. APP grep for `credit|course|membership|class-commerce` across `app/`, `components/`, `lib/` returns only unrelated files; `lib/queries/useClassesManage.ts` imports no commerce routes.
  - **Fix:** Build a gated `app/(app)/manage/class-products.tsx` reachable from `ClassTypesManagerSheet` (add a "Class products" button shown when a new `useClassCommerceEnabled()` flag mirrors web's `venueHasClassCommerceEnabled`). Add `lib/queries/useClassProducts.ts` wrapping the three Bearer route groups + class-commerce-reports, and `types/class-products.ts`. Phase it: credit packs first (simplest CRUD), then courses + the enrollment/cancel-refund panel, then memberships. Reuse `Sheet`/`Input`/`Segmented` and the `ConfirmDialog`/`Sheet` patterns already in `ClassTypesManagerSheet`. If deferring memberships, ship credits + courses and note the rest.

- **Course enrollment management + refunds unavailable on mobile** — _function · high_
  - **Web:** Within a course, staff list enrollees with per-session attendance and cancel an enrollment, triggering an automatic refund when inside (or bypassing) the cancellation window via `POST /api/venue/class-course-products/[id]/enrollments/[enrId]/cancel`.
  - **App:** Absent — no way to view or cancel course enrollments or issue course refunds; no `class-course-products` usage anywhere in the app.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/products/ClassCommerceProductsClient.tsx` `CourseEnrollmentsPanel` (`cancelEnrollment`, `bypass_window`, `refund_amount_pence`); routes on disk `src/app/api/venue/class-course-products/[id]/enrollments/route.ts` and `.../enrollments/[enrId]/cancel/route.ts`. APP has no `class-course-products` references.
  - **Fix:** As part of the class-products screen, port `CourseEnrollmentsPanel` into `components/classes/CourseEnrollmentsSheet.tsx` calling the enrollments + `enrollments/[id]/cancel` routes; surface the refunded amount in a Toast. This is a money action web can do and the app cannot, so prioritise it alongside courses.

#### Medium

- **No month-grid calendar view of class sessions** — _ui · medium_
  - **Web:** The timetable shows a read-only month calendar (sessions as coloured chips per day) above the agenda, and scheduling uses a month grid where tapping a day shows existing sessions inline.
  - **App:** The Classes screen shows only a rolling 7-day `SectionList` agenda; scheduling (`ClassScheduleSheet`) uses a plain `DatePickerField` with no month/day context.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableReadOnlyCalendar.tsx` + `ClassScheduleModal.tsx` month grid; APP `app/(app)/classes.tsx` (agenda only) + `components/classes/ClassScheduleSheet.tsx` (DatePickerField, no month/grid refs).
  - **Fix:** Add a `Segmented` "Agenda | Month" toggle to `app/(app)/classes.tsx`, reusing the existing `components/booking-wizard/MonthDatePicker.tsx` primitive and the `useClassSessions` feed to render session chips by day. Lower priority than class-commerce.

#### Low

- **No per-class-type filter on the timetable** — _function · low_
  - **Web:** A class-type dropdown (`scheduledClassFilterId`) filters both calendar and agenda to one class type and auto-resets if that type is deleted.
  - **App:** Absent — the agenda (`classes.tsx`) always shows all class types with no filter control.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableView.tsx` (`scheduledClassFilterId`, `filteredInstances`); APP `app/(app)/classes.tsx` has only week nav + `SectionList`.
  - **Fix:** Add a class-type chip/`Segmented` row above the `SectionList` in `app/(app)/classes.tsx`, deriving options from `useManagedClasses()` class_types and filtering the `useClassSessions` feed by name (or thread `class_type_id` once the feed exposes it).

- **Timetable stats bar absent** — _ui · low_
  - **Web:** A compact bar shows active class types, sessions in the next 7 days, upcoming sessions, and total booked spots above the timetable.
  - **App:** Absent — `classes.tsx` has no summary metrics.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableStatsRow.tsx`; APP `app/(app)/classes.tsx` has no stats strip.
  - **Fix:** Compute the same four metrics from `useManagedClasses()` (class_types + instances) and render a small stats strip in the `ClassTypesManagerSheet` header or atop the classes screen; trivial, reuses existing data.

- **Event public booking link not surfaced on the Events screen** — _function · low_
  - **Web:** Event manager has "Copy booking link" (`copyPublicBookingLink`, line 819) and an "Open booking page" link (line 888) to the public `/book/[slug]` page where guests buy tickets.
  - **App:** The Events surface (`events.tsx` + `EventManagerSheet`) offers no copy/share/open action. However, the same venue-level `/book/[slug]` link is already copyable **and** openable in the app via Settings → Booking page (`manage/booking-page.tsx` lines 298–310), so the capability exists app-wide — it is just not one tap from Events.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/event-manager/EventManagerView.tsx` (`copyPublicBookingLink` line 819; "Open booking page" Link line 888; both gated on `publicBookingUrl.includes('/book/')`). APP grep for `Clipboard|booking link|openURL|Linking|/book/` in `components/events` and `app/(app)/events.tsx` returns no matches; `app/(app)/manage/booking-page.tsx` already does `Clipboard.setStringAsync(`${webBase}/book/${slug}`)` (line 303) + `WebBrowser.openBrowserAsync` (line 309), `publicUrl` derived from `venue?.slug` (lines 298–300).
  - **Fix:** Add "Copy booking link" / "Open booking page" actions (IconButtons in the `EventManagerSheet` header or `events.tsx` headerRight) by lifting the `publicUrl` + copy/open logic already in `manage/booking-page.tsx` (`expo-clipboard` + `expo-web-browser`, `venue?.slug`). Trivial — all primitives are proven in the app.

- **Classes & Events buried in Settings rather than a first-class entry** — _design · low_
  - **Web:** Class timetable and Event manager are top-level dashboard sidebar destinations.
  - **App:** Both `/classes` and `/events` are reachable only from Settings → Booking types tiles; there is no tab-bar or calendar-level shortcut.
  - **Evidence:** APP `app/(app)/(tabs)/settings.tsx` `SECONDARY_MODEL_ROWS` (lines 107–108) register Classes (`appRoute '/classes'`) and Events (`appRoute '/events'`) under the booking-models group; `app/(app)/_layout.tsx` has no classes/events tab. WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lists them directly.
  - **Fix:** Surface Classes/Events from the Calendar tab header or a quick-action when the venue has those booking models enabled, so staff running classes don't have to dig through Settings each time. Intentional given the appointments-first 4-tab redesign, but worth a more prominent shortcut.

- **Per-session admin cancel-and-notify lives only in the manager list, not on the open roster** — _ui · low_
  - **Web:** When an admin opens a session's roster (`ClassInstanceDetailSheet`), a "Cancel class & notify guests" button sits alongside CSV / Check-in-all.
  - **App:** The roster view (`ClassRosterView`) has no cancel button; admins must back out to `ClassTypesManagerSheet` and use the per-session "Cancel" in the upcoming list. `ClassRosterView`'s footer note (lines 356–357) also wrongly states "Cancelling the whole session is managed on the web dashboard" even though it IS available in-app.
  - **Evidence:** WEB `_reference/Resneo/src/components/practitioner-calendar/ClassInstanceDetailSheet.tsx` (`handleCancelInstance` in the roster); APP `components/classes/ClassRosterView.tsx` has CSV/check-in but no cancel action, footer note lines 356–357; the cancel actually lives in `components/classes/ClassTypesManagerSheet.tsx` (per-session "Cancel" button lines 494–505 + cancel-and-notify Sheet lines 581–623, via `useCancelClassInstance`).
  - **Fix:** Add an admin "Cancel session & notify" action to `ClassRosterView`'s header (reusing `useCancelClassInstance`, already wired in `ClassTypesManagerSheet`) so cancel is reachable from the roster like web, and fix the misleading footer note (lines 356–357) that claims it's web-only.

### Recommended work (ordered)

1. **Credit packs first (`manage/class-products.tsx` + `useClassProducts.ts` + `types/class-products.ts`).** Stand up a gated class-products screen reachable from `ClassTypesManagerSheet`, behind a new `useClassCommerceEnabled()` flag; wrap `/api/venue/class-credit-products` CRUD. Establishes the screen, hook, and types the rest builds on.
2. **Courses + enrollment management with refunds.** Add `CoursePanel`-equivalent CRUD and `components/classes/CourseEnrollmentsSheet.tsx` calling `class-course-products/[id]/enrollments` and `.../enrollments/[enrId]/cancel`; show the refunded amount in a Toast. (Money action web can do that the app cannot.)
3. **Recurring memberships.** Port `MembershipPanel` into the class-products screen over `/api/venue/class-membership-products` (allowance/unlimited, rollover, discount %, eligible classes, recurring Stripe price). Defer if needed, but note the gap.
4. **Surface the event public booking link.** Lift the `publicUrl` + copy/open logic from `manage/booking-page.tsx` (lines 298–310) into IconButtons on `EventManagerSheet`/`events.tsx`. Trivial, all primitives proven.
5. **Add the per-session cancel to the roster + fix the note.** Wire `useCancelClassInstance` into `ClassRosterView`'s header and correct the misleading footer note (`ClassRosterView.tsx` lines 356–357).
6. **Month view toggle on the timetable.** Add a `Segmented` "Agenda | Month" to `app/(app)/classes.tsx` reusing `components/booking-wizard/MonthDatePicker.tsx` + `useClassSessions`.
7. **Class-type filter on the timetable.** Add a chip/`Segmented` row above the `SectionList` in `classes.tsx` from `useManagedClasses()` class_types.
8. **Stats bar.** Render the four metrics (active types, sessions next 7 days, upcoming, booked spots) atop the classes screen or in the manager header.
9. **More prominent Classes/Events entry.** Add a Calendar-tab shortcut/quick-action when those booking models are enabled, rather than Settings-only.


---

## 07. Resources, Floor-plan & Tables

**Parity:** Strong — resource management is mirrored almost field-for-field with the web `/dashboard/resource-timeline`; the only "missing" surfaces are the restaurant table-management suite, which the web itself gates behind `table_management_enabled` and is an intentional, restaurant-only scope exclusion.

Resource management is one of the strongest-parity domains in the app, and adversarial verification confirms it. The web resource timeline is reproduced in-app with full CRUD (`ResourceEditorSheet.tsx` + `ResourceManagerSheet.tsx`): a required host-calendar single-select with inline admin "New calendar for this resource" and 409-conflict auto-prefill, booking rules (slot/min/max + book-ahead/notice/cancellation/same-day), pricing/deposit/full-payment with a Stripe-not-connected warning and a server-mirrored deposit ceiling, weekly hours with match-calendar + live outside-calendar warning, a web-parity date-exceptions month calendar, a per-resource day-bookings view, and an in-app resource booking flow. The restaurant table-management suite (live floor plan, table-grid timeline, layout editor, dining areas, table combinations) is entirely absent — but the web redirects every one of those pages to `/dashboard/day-sheet` unless `venue.table_management_enabled`, so this is a deliberate scope call, not a true gap. All four candidate gaps were confirmed real and none were false positives; every genuine in-domain gap is secondary/low (no reorder UI, no tappable help tooltips, a condensed caption instead of the web detail-panel StatTiles).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Resources day view | `resource-timeline/ResourceTimelineView.tsx` (Bookings SectionCard, 1873-1937) | `app/(app)/resources.tsx`; `components/resources/ResourceDaySection.tsx` | Strong | App lists ALL resources' days at once; web shows one resource at a time. Both list-based, no time grid. |
| Resource list / manager | `ResourceTimelineView.tsx` (sidebar aside + ResourceMobileStrip, 1081-1170) | `components/resources/ResourceManagerSheet.tsx` | Strong | Bottom sheet from header vs persistent left rail. Detail-panel StatTiles condensed to a caption. |
| Resource create/edit editor | `ResourceTimelineView.tsx` (showForm branch, 1195-1748) | `components/resources/ResourceEditorSheet.tsx` | Strong | Near-complete field parity incl. deposit ceiling + 409 auto-prefill. Missing only per-field HelpTooltips. |
| Weekly hours editor | `resource-timeline-ui.tsx` (WeekHoursEditor, 560) | `components/resources/ResourceWeekHoursEditor.tsx` | Strong | Per-day enable + start/end, match-calendar action; save path preserves split-shift extra ranges. |
| Date-exceptions calendar | `ResourceExceptionsCalendar.tsx` + step 6 (1588-1740) | `components/resources/ResourceExceptionsCalendar.tsx`; `ResourceExceptionsEditor.tsx` | Strong | Mobile month-grid port; capacity-override exception type (table-model only) intentionally omitted. |
| Book this resource flow | `ResourceTimelineView.tsx` (ResourceBookingFlow dialog, 2033-2067) | `app/(app)/resources.tsx` (`bookResource`); `components/booking-wizard/ResourceBookingFlow.tsx` | Strong | Routes to multi-model new-booking flow with resource preselected. Functionally equivalent. |
| Floor plan (live service view) | `floor-plan/page.tsx`; `FloorPlanLiveView.tsx`; `LiveFloorCanvas.tsx`; `UnifiedFloorPlanView.tsx` | none | Missing | Intentional: `floor-plan/page.tsx:21` redirects to day-sheet unless `table_management_enabled`. |
| Table grid (timeline) | `table-grid/page.tsx`; `TableGridView.tsx`; `TimelineGrid.tsx` | none | Missing | Intentional: `table-grid/page.tsx:22` redirects to day-sheet unless `table_management_enabled`. |
| Floor plan editor (layout designer) | `settings/floor-plan/FloorPlanEditor.tsx`; `KonvaCanvas.tsx` | none | Missing | Intentional restaurant-only; canvas drag-to-design is a poor mobile fit. |
| Dining areas | `src/components/areas/*` | none | Missing | Intentional — areas only scope the table floor plan, itself out of scope. |
| Table combinations | `settings/tables/TableCombinationsPage.tsx`; `lib/table-management/combination-engine.ts` | none | Missing | Intentional restaurant-only. |
| Resources entry in navigation | `DashboardSidebar.tsx` (`resource_booking` MODEL_NAV_ITEMS, 66-68) | `app/(app)/(tabs)/settings.tsx` (SECONDARY_MODEL_ROWS, 109); `app/(app)/(tabs)/_layout.tsx` | Strong | Resources surfaced when `resource_booking` enabled; "Tables" (line 110) is web-only link-out. |

**Resources day view** — `ResourceDaySection.tsx` renders each resource as a card showing the selected day's bookings (time range, guest, party size, deposit caption, status pill), with prev/today/next date nav, resource filter chips carrying per-resource counts, pull-to-refresh, a live-sync dot (`useVenueLiveSync`), and tap-to-open `BookingDetailSheet`. The web shows bookings for one selected resource at a time, so the app's all-resources-at-once layout arguably exceeds web for daily scanning. Both are list-based (Pressable rows, not a slot grid), which matches the web's own Bookings SectionCard.

**Resource manager** — `ResourceManagerSheet.tsx` lists every resource with an active dot/colour, type, slot interval, price, host-calendar name (or a red "No calendar"), payment summary, plus New/Edit/Delete/Book/Set-calendar actions, mirroring the web sidebar list. The structural difference is presentation only: the web list is a persistent left rail driving a detail panel, while the app opens a bottom sheet from the header.

**Resource editor** — `ResourceEditorSheet.tsx` reaches near-complete field parity: name, type (+ quick-pick chips), required host-calendar radio with inline admin "New calendar for this resource", slot interval, advanced shortest-booking toggle synced to the slot step, longest, book-ahead days, min-notice hours, cancellation hours, allow-same-day, price/slot, payment radio (none/deposit/full) with deposit field + Stripe-not-connected warning, active toggle, weekly hours, and the date-exceptions calendar. Client validation mirrors the server `resourceSchema` including the deposit ceiling (`ResourceEditorSheet.tsx:418-423`: deposit ≤ price × max bookable slots), and calendar-conflict (409) errors auto-open the add-calendar form prefilled with the resource name (`:484-487`).

**Weekly hours / exceptions** — `ResourceWeekHoursEditor.tsx` is wired into the editor at `:791` and offers per-day enable + start/end with a "Match selected calendar's hours" action and sensible defaults (weekdays 09:00-17:00 on, weekends off). It exposes one range per day, but the save path preserves any web-authored split-shift extra ranges so multi-range days round-trip without data loss. `ResourceExceptionsCalendar.tsx` (wired at `:804`) is a Monday-first 6×7 month grid with prev/next nav, colour-coded cells (closed = danger, amended = warning) with Off/Hrs badges, range/editing/today rings, a legend, and a 366-day cap; the web's capacity-override exception type is intentionally omitted as table-model-only.

**Floor-plan & tables** — none of the floor-plan, table-grid, layout-editor, dining-area, or table-combination surfaces exist in the app. A repo-wide search across `app/` and `components/` (excluding `_reference/` and `Docs/`) returns only the Settings web link-out (`settings.tsx:110` routes "Tables" → `/dashboard/tables`, `webPath` only, no `appRoute`) and an unrelated string in `manage/venue-profile.tsx`. Web gates each page behind `table_management_enabled` (`floor-plan/page.tsx:21`, `table-grid/page.tsx:22` both redirect to day-sheet), confirming the exclusion is intentional and restaurant-only.

### Gaps & deficiencies

#### Low

- **Entire restaurant table-management suite absent (floor-plan, table-grid, layout editor, areas, combinations, table-tracking)** — _function · low_
  - **Web:** Restaurant-tier venues with `table_management_enabled` get a live Floor Plan (Konva canvas with table statuses, turn timers, drag-to-move bookings, undo), a Table Grid timeline (tables × slots dnd assignment), a Floor Plan layout editor (place/resize/rotate/shape tables, seat angles, covers, per-area layouts), Dining Areas CRUD, and Table Combinations.
  - **App:** Absent — no table/floor-plan/area/combination component code anywhere in `app/` or `components/`. The only references are the Settings web link-out (`app/(app)/(tabs)/settings.tsx:110`, `webPath` only, no `appRoute`) and an unrelated string in `manage/venue-profile.tsx`. `ResourceDaySection` is the closest in-domain surface and is a booking list, not a floor map.
  - **Evidence:** Repo-wide grep for table_management/floor-plan/table-grid/dining-area/table-combination (excluding `_reference`/`Docs`) returns only `settings.tsx:110` and `venue-profile.tsx`. Web gating verified directly: `_reference/Resneo/src/app/dashboard/floor-plan/page.tsx:21` and `table-grid/page.tsx:22` both `redirect('/dashboard/day-sheet')` unless `venue.table_management_enabled`. `settings.tsx:96` comments "Tables remain web-only".
  - **Fix:** Keep as an intentional scope exclusion for the appointments-first app — NOT a true parity gap. Canvas drag-to-design and live floor dragging are poor mobile fits and are restaurant-only on web. Leave the Settings → Tables web link-out (`settings.tsx:110`) as the bridge. If ever pursued, the highest-value mobile slice is a read-mostly live floor status view (mirroring `FloorPlanLiveView`), not the editor; defer until a restaurant business type enters mobile scope.

- **No resource reordering (`sort_order`) in app** — _function · low_
  - **Web:** Resources carry `sort_order` and the web returns/honours it; the directory and calendar render in that order.
  - **App:** The app reads and sorts by `sort_order` (`lib/queries/useResourcesManage.ts:53-54` — `.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))`; `useResources.ts:69` likewise) but provides no UI to change it — `ResourceManagerSheet.tsx:242-257` exposes only Edit/Delete (plus a conditional Book / Set-calendar button), no up/down or drag handles.
  - **Evidence:** `components/resources/ResourceManagerSheet.tsx:242-257`; `lib/queries/useResourcesManage.ts:53-54`; `types/resources-manage.ts:50` (`sort_order: number`). `useUpdateResource` (PATCH `/api/venue/resources`) already exists and could carry `sort_order`. Web also lacks an explicit reorder control in resource-timeline — a shared minor limitation.
  - **Fix:** Low priority. If addressed, add up/down IconButtons (or a drag handle) to `ResourceManagerSheet` cards that PATCH `sort_order` via the existing `useUpdateResource` hook (the `VariantsEditor.tsx` move-up/down pattern can be reused). Confirm `/api/venue/resources` PATCH accepts `sort_order` before building UI.

- **Per-field help tooltips missing in resource editor** — _ui · low_
  - **Web:** The resource form shows `HelpTooltip` (?) explainers next to "Start times every (minutes)" (`RESOURCE_SLOT_INTERVAL_HELP`, `ResourceTimelineView.tsx:1377`) and "Shortest booking (minutes)" (`RESOURCE_MIN_BOOKING_HELP`, `:1420`), plus another at `:1237`, clarifying slot-grid vs min/max semantics.
  - **App:** The editor uses static helper text under inputs (`ResourceEditorSheet.tsx:648` "Spacing of bookable start times.", `:668` "Matches the start-time step.") but no tappable tooltip with the longer explanations. No `HelpTooltip`/`InfoTooltip` component exists in the app at all (the only "Tooltip" match outside `_reference` is a chart tooltip in `components/reports/SvgLineChart.tsx`).
  - **Evidence:** `_reference/Resneo/src/app/dashboard/resource-timeline/ResourceTimelineView.tsx:1377` & `:1420`; `components/resources/ResourceEditorSheet.tsx:646-652` & `:666-674` (helper prop only). App-wide grep for HelpTooltip/InfoTooltip/Tooltip returns only `SvgLineChart.tsx`.
  - **Fix:** Low-priority polish; the inline helpers cover the essentials. If desired, port the web `lib/help/resource-booking-tooltips` strings into a tappable info affordance on `Input` (or a small reusable `InfoTooltip`) for the slot-interval and shortest-booking fields in `ResourceEditorSheet.tsx`.

- **Resource detail StatTiles condensed to a caption** — _design · low_
  - **Web:** The resource detail panel renders a grid of StatTiles (Start-time step, Shortest booking, Longest booking, Price/slot, Guest payment) plus a full weekly-availability list and date-exceptions list as a read view before editing (`ResourceTimelineView.tsx:1815-1827` and surrounding panel).
  - **App:** `ResourceManagerSheet` condenses this to one caption line per card (`type · slot min slots · price/slot` at `:198-202`, plus "On <calendar>"/"No calendar" and the payment summary at `:209-222`); there is no dedicated read-only detail panel showing the weekly-hours rows or exceptions summary — the user opens the editor to see full hours.
  - **Evidence:** `components/resources/ResourceManagerSheet.tsx:198-222` (caption + metaGrid); web `ResourceTimelineView.tsx:1815-1827` (StatTile grid) plus the weekly-availability and exceptions read lists in the same panel.
  - **Fix:** Low priority — the editor already exposes everything. If a richer read view is wanted, add an expandable detail (or tap-through) in `ResourceManagerSheet` showing the weekly-hours rows and exception list, reusing data already on the Resource record from `useResourcesManage`.

### Recommended work (ordered)

1. **Leave the table-management suite out of scope (no action).** Confirm the Settings → Tables web link-out (`app/(app)/(tabs)/settings.tsx:110`) remains the bridge for restaurant venues; do not treat the absent floor-plan/table-grid/editor/areas/combinations surfaces as a parity gap to close on mobile.
2. **(If reorder is wanted) Add resource reordering to `ResourceManagerSheet.tsx`.** First confirm `/api/venue/resources` PATCH accepts `sort_order`, then add up/down IconButtons to each card (`:242-257`) that call the existing `useUpdateResource` hook; reuse the `VariantsEditor.tsx` move-up/down pattern. The list already sorts by `sort_order` (`useResourcesManage.ts:53-54`).
3. **(Polish) Add tappable help tooltips to the resource editor.** Port the web `lib/help/resource-booking-tooltips` strings (`RESOURCE_SLOT_INTERVAL_HELP`, `RESOURCE_MIN_BOOKING_HELP`) into a small reusable `InfoTooltip`/`Input` affordance for the slot-interval (`ResourceEditorSheet.tsx:646-652`) and shortest-booking (`:666-674`) fields.
4. **(Polish) Add an optional read-only detail view in `ResourceManagerSheet.tsx`.** Expand each card (or add a tap-through) to surface weekly-hours rows and an exceptions summary, mirroring the web StatTile read panel, using data already present on the Resource record.


---

## 08. Availability, Business Hours & Closures

**Parity:** Partial — day-to-day availability (per-staff working hours, breaks, leave, time blocks, opening hours, closures calendar) is at strong parity, but the web's entire bookable-calendar management surface (create/edit/delete/activate/reorder/assign/booking-link) is absent and several confirmation/scoping behaviours diverge.

For the appointments-first surfaces the app is in good shape: per-staff weekly working hours (split shifts + copy-to-day), per-day breaks, staff leave/unavailability (full-day + partial windows, apply-to-all), a color-coded team-leave month calendar, per-calendar single-day time blocks, weekly venue opening hours, and a web-parity closures calendar backed by `availability_blocks`. All eight candidate gaps were checked against the app code and **confirmed** (no false positives). The dominant gap is calendar-column management: the web "Calendars" tab (`BookableCalendarsPanel`) is a full admin surface for the bookable calendars themselves, and the app has none of it — only a name-only inline `useCreateHostCalendar` reachable from the class/event/resource editors. Secondary gaps are confirmation/scoping fidelity: no 409 "save hours anyway" prompt for either hours editor, missing reduced-capacity yield/service-scope fields on closures, a creatable `special_event` type the web doesn't offer, non-admin staff able to target any calendar's leave, and no legacy `days_off` migration banner. Restaurant-tier capacity config (fixed-intervals/sittings/max-covers/turn-time/blocked-dates) is intentionally out of scope; note that appointment slot-granularity + buffer are *not* missing — they live in the per-service editor (Services domain).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
|---|---|---|---|---|
| Working hours editor | `scheduling/WorkingHoursControl.tsx`; `availability/AppointmentAvailabilitySettings.tsx` (`saveWorkingHours` 706-747) | `components/availability/WorkingHoursEditor.tsx`; `app/(app)/availability.tsx` (Hours sheet) | Strong | Mon–Sun rows, per-day toggle, split ranges, copy-to-open-days, brand info note. Missing the 409 acknowledge retry. |
| Breaks editor | `AppointmentAvailabilitySettings.tsx` (`BreaksScheduleEditor`, tab `breaks`) | `components/availability/BreaksEditor.tsx`; `app/(app)/availability.tsx` (Breaks sheet) | Full | Per-weekday break list, add/remove, copy-to-all, same data model. App uses 15-min ± steppers vs free inputs. |
| Staff leave / unavailability | `availability/StaffLeaveCalendarPanel.tsx` | `app/(app)/availability.tsx` (Add-leave sheet + Leave card); `components/availability/TeamLeaveCalendar.tsx` | Strong | Full/partial-day leave, type label, notes, admin apply-to-all, upcoming/past split. App adds a color-coded month calendar. Divergence: non-admin scoping (see gaps). |
| Per-calendar time blocks | `practitioner-calendar/PractitionerCalendarView.tsx` (Block-time modal) | `app/(app)/availability.tsx` (Time-blocks card + sheet); `lib/queries/useAvailabilityManage.ts` (`useCalendarBlocks`/`useCreateBlock`/`useUpdateBlock`/`useDeleteBlock`, 30-122) | Strong | Full CRUD parity for single-day blocks (date + start/end + reason). Relocated from the diary to the Availability screen — reasonable on mobile. |
| Bookable calendars management (Calendars tab) | `availability/BookableCalendarsPanel.tsx` (35-227, 264-313); `AppointmentAvailabilitySettings.tsx` (tab `team`) | `lib/queries/usePractitioners.ts` (`useCreateHostCalendar`, name-only, 57-82); `app/(app)/availability.tsx` (read-only list) | Minimal | Largest gap. Web admins create/edit/rename/delete columns, toggle Active, drag-reorder, edit per-calendar slug + copy URL, assign services/classes/resources/events, see plan-limit/conflicts. App only lists practitioners read-only. |
| Weekly opening hours editor | `settings/sections/OpeningHoursSection.tsx` (55-99); `scheduling/OpeningHoursControl.tsx` | `app/(app)/manage/hours.tsx`; `components/manage/OpeningHoursEditor.tsx` | Strong | Per-day open/closed, up to two periods, copy-to-open-days, sticky Save bar, legacy `{open,close}` canonicalization, read-only for non-admin. Missing the 409 acknowledge retry. |
| Closures, Amended Hours & Capacity | `settings/sections/BusinessClosuresSection.tsx` (166-195); `resource-timeline/ResourceExceptionsCalendar.tsx` | `components/manage/AvailabilityBlocksSection.tsx`; `components/manage/ClosuresCalendar.tsx` | Strong | Month calendar colour-coded by type, tap-to-select range → create, tap block → edit, upcoming/past, full CRUD on `/api/venue/availability-blocks`. `closed` + `amended_hours` at full parity. Gaps: no yield/service-scope; exposes `special_event` as creatable. |
| Restaurant availability config (intervals/sittings/capacity/rules) | `availability/page.tsx`; `settings/sections/AvailabilityConfigSection.tsx`; `availability/components/ServiceCapacitySection.tsx`, `ServiceDurationSection.tsx`, `ServiceBookingRulesSection.tsx` | absent (per-service buffer/slot lives in `lib/queries/useServicesManage.ts`) | Missing | Table-reservation tier (fixed-intervals/named-sittings, max-covers-by-day, turn-time, blocked dates, capacity/party-size/booking windows). Intentionally out of scope. Appointment slot-granularity + buffer are reachable per-service. |

**Working hours / breaks.** Both editors mirror the web feature-for-feature: `WorkingHoursEditor` exposes `addRange`/`removeRange` for split shifts and `copyToOtherOpenDays`, and `BreaksEditor` passes `break_times`/`break_times_by_day` with copy-to-all. The app substitutes native time UI (`TimePickerField`, 15-min steppers) for the web's free inputs — an appropriate mobile choice. The only behavioural divergence is the absent 409 confirmation on save (below).

**Staff leave.** Create/edit/delete flow through `/api/venue/practitioner-leave` with full-day or partial "unavailable window", a `leave_type` label, notes, and an admin-only "Apply to all" (gated at `availability.tsx` line 732). The app's color-coded `TeamLeaveCalendar` is a net add over the web. The scoping divergence — non-admins seeing the practitioner chip row — is the medium gap below.

**Closures calendar.** `AvailabilityBlocksSection` + `ClosuresCalendar` closely match the web closures picker, with `closed` (optional partial-day times) and `amended_hours` (two override periods) at full parity. The reduced-capacity and `special_event` divergences are gaps below; the underlying hook (`useAvailabilityBlocks.ts`) already carries the richer fields, so those gaps are form-layer only.

### Gaps & deficiencies

#### Critical

- **No bookable-calendar management (create/edit/delete/activate/reorder/assign/booking-link)** — _function · critical_
  - **Web:** The "Calendars" tab renders `BookableCalendarsPanel` + an Add/Edit Dialog: admins create/rename/delete calendar columns, toggle Active (bookable), drag-reorder to set column order (PATCH `sort_order`), edit a per-calendar booking-link slug and copy its public URL, and assign appointment services / class types / resources / ticketed events to each column (with single-column reassignment confirmation). It also surfaces the plan calendar-limit (`entitlement`/`at_calendar_limit`) with an upgrade modal and per-column conflict alerts (`/api/venue/calendar-column-conflicts`).
  - **App:** Absent. `app/(app)/availability.tsx` only lists practitioners read-only (`usePractitioners`) to pick a target for Hours/Breaks/Leave. The single creation path is `useCreateHostCalendar` (`lib/queries/usePractitioners.ts`, name-only, posts `calendar_type:'practitioner'`, `is_active:true`), invoked from the class/event/resource editors; there is no rename/delete/activate/reorder/slug/service-assignment/entitlement UI anywhere. Partial plumbing already exists: `PatchPractitionerInput` accepts `name` + `is_active` (`types/availability-manage.ts` 82-83) and `Practitioner` carries `sort_order` (`types/practitioner.ts` line 16) — the hook/type layer is half-ready; only the UI plus a slug field and a delete mutation are missing.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/availability/BookableCalendarsPanel.tsx` (slug 35/191/296-313, reorder 38/97/199-227/264-275, entitlement 77-95), `…/AppointmentAvailabilitySettings.tsx` (tab `team`). APP `app/(app)/availability.tsx` (read-only list), `lib/queries/usePractitioners.ts` (57-82), `types/availability-manage.ts` (77-84), `types/practitioner.ts` (line 16).
  - **Fix:** Add a `components/availability/BookableCalendarsManager.tsx`, opened from a tab/segment on `app/(app)/availability.tsx`, admin-gated. Reuse `usePractitioners` for the list and `useCreateHostCalendar` for create; `usePatchPractitioner` already covers `name`/`is_active` for rename/activate — extend `PatchPractitionerInput` with `sort_order` + `slug` for reorder/booking-link, and add a delete mutation against `DELETE /api/venue/practitioners`. Mirror `BookableCalendarsPanel`: name + Active toggle, up/down reorder (IconButton pattern from `booking-settings.tsx`; `Practitioner.sort_order` already available), booking-link slug field + copy URL, and service/class/resource/event assignment checkboxes (reuse `useServicesManage`, `useClassesManage`, `useResourcesManage`, `useEventsManage`). Surface the calendar-limit via a 403 `upgrade_required` `ApiError` → reuse the plan-upsell pattern.

#### High

- **Narrowing hours past existing bookings fails instead of prompting "Save anyway?"** — _function · high_
  - **Web:** Both opening-hours (`OpeningHoursSection.save`) and working-hours (`saveWorkingHours`) retry the PATCH with `?acknowledge_affected_bookings=true` after a 409 `{ requires_confirmation, message }` and a `window.confirm('…Some upcoming bookings fall outside the new hours. Save these hours anyway?')`. The change is allowed but made knowingly; existing bookings are kept.
  - **App:** Neither path handles the 409. `useUpdateOpeningHours` PATCHes `/api/venue/opening-hours` with no acknowledge param and no 409 branch (`useVenueSettings.ts` 145-155); `usePatchPractitioner` PATCHes `/api/venue/practitioners` the same way (`useAvailabilityManage.ts` 227-237). A 409 surfaces as a generic `ApiError` (caught in `hours.tsx` `handleSave` and `WorkingHoursEditor.handleSave` and shown as an error), so the admin simply cannot save the narrowed hours from the app.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/sections/OpeningHoursSection.tsx` (59-93), `…/AppointmentAvailabilitySettings.tsx` (`saveWorkingHours` 712-741). APP `lib/queries/useVenueSettings.ts` (140-163), `lib/queries/useAvailabilityManage.ts` (223-240), `app/(app)/manage/hours.tsx` (`handleSave` 91-112), `components/availability/WorkingHoursEditor.tsx` (`handleSave` 150-177).
  - **Fix:** Add a 409 confirmation flow to both mutations. In `useUpdateOpeningHours` accept an `{ acknowledge?: boolean }` option and append `?acknowledge_affected_bookings=true`; on a 409 with `requires_confirmation`, surface `body.message` to the caller and re-run with `acknowledge:true` after a Sheet/Toast confirm (`Alert.alert` is a no-op on web per project memory — reuse the two-step armed-button confirm already used in `availability.tsx`, or a Sheet). Mirror in `usePatchPractitioner` so `WorkingHoursEditor.tsx` can re-save. Requires `ApiError` to expose the 409 status + parsed body.

#### Medium

- **Reduced-capacity closures missing yield overrides and service scope** — _function · medium_
  - **Web:** The `reduced_capacity` block exposes `override_max_covers`, a "Service scope" selector (All services or a specific `service_id`), and optional `yield_overrides` (`max_bookings_per_slot`, `slot_interval_minutes`, `buffer_minutes`, `duration_minutes`) persisted in the payload (`draftToPayload` builds `yield_overrides` from `yield_*` draft fields and sets `service_id`). The whole `reduced_capacity` type + service scope is gated behind `isRestaurant`.
  - **App:** `AvailabilityBlocksSection`'s `reduced_capacity` only collects `override_max_covers`; `draftToCreatePayload` hardcodes `yield_overrides: null` (line 141) and never sets `service_id`, and there is no service-scope picker. The `YieldOverrides` type and `service_id` field exist in `CreateBlockInput` (`useAvailabilityBlocks.ts` 19-52) but the form's `DraftState` (80-92) never populates them.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/sections/BusinessClosuresSection.tsx` (166-195). APP `components/manage/AvailabilityBlocksSection.tsx` (`DraftState` 80-92, `draftToCreatePayload` 131-162, `reduced_capacity` UI 657-665), `lib/queries/useAvailabilityBlocks.ts` (19-52).
  - **Fix:** Extend `DraftState` with `yield_max_bookings`/`yield_interval`/`yield_buffer`/`yield_duration` + `service_id`; render them (numeric `Input`s + a service picker from `useServicesManage`) when `block_type==='reduced_capacity'`, and populate `base.yield_overrides`/`base.service_id` in `draftToCreatePayload`. Gate behind the restaurant-table tier (mirror web's `isRestaurantTableProductTier`) so appointments venues don't see it. Lower priority — `reduced_capacity` is table-reservation-only, so impact on appointments venues is nil.

- **Non-admin staff can target other calendars' leave (web restricts to self)** — _function · medium_
  - **Web:** `StaffLeaveCalendarPanel` computes `canManageUnavailability = isAdmin || Boolean(selfPractitionerId)`, passes `selfPractitionerId` for non-admins, locks `calendarId` to `selfPractitionerId` (hiding the calendar picker), and only allows editing periods owned by that calendar — non-admins can manage only their own calendar's closures.
  - **App:** `app/(app)/availability.tsx` shows the practitioner chip row to all roles. For non-admins it only defaults `practitionerId` to `staff.linked_calendar_ids[0]` (`defaultPractitionerId`, 208-214) but still renders the full chip row (745-765) and lets them tap any practitioner. The save guard is merely `!practitionerId`, and only apply-to-all is admin-gated (line 732). Creating/editing leave for another calendar is invitable from the UI (relying on the backend to reject), risking confusing failures.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/availability/StaffLeaveCalendarPanel.tsx` (133-160). APP `app/(app)/availability.tsx` (`defaultPractitionerId` 208-214, chip row 744-765, `isAdmin` gating apply-to-all 732), `types/staff.ts` (`linked_calendar_ids` line 15).
  - **Fix:** When `!isAdmin`, restrict the leave practitioner choices to `staff.linked_calendar_ids` (hide the chip row and lock `practitionerId` to the self calendar, matching `selfPractitionerId`), and guard `openEditLeave`/`openEditBlock` so non-admins can only edit periods they own (filter the lists or disable Edit on other-owner rows). Use `useStaffMe().data.staff.linked_calendar_ids` (already read for `defaultPractitionerId`).

#### Low

- **App can create "Special Event" closures that the web does not offer** — _function · low_
  - **Web:** `blockTypeOptions` offers only Closure and Amended Hours (plus Reduced Capacity for restaurant tier); `special_event` is **not** a user-creatable type — it is only rendered as a colour/label for blocks created elsewhere.
  - **App:** `AvailabilityBlocksSection` lists `special_event` as a selectable creation type (`BLOCK_TYPES` includes `'special_event'`, line 59; `TypeSelector` maps over all of `BLOCK_TYPES`), so an app admin can create a `special_event` block with no extra fields — producing blocks the web create UI never makes. The app additionally offers `reduced_capacity` to all tiers, whereas web gates it behind `isRestaurant` (same class of create-option divergence).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/sections/BusinessClosuresSection.tsx` (`blockTypeOptions` 383-389). APP `components/manage/AvailabilityBlocksSection.tsx` (`BLOCK_TYPES` line 59, `TypeSelector` 338-373).
  - **Fix:** Drop `'special_event'` from the creatable `BLOCK_TYPES` (keep the `BLOCK_TYPE_LABELS`/`BLOCK_BG_KEY`/`BLOCK_TEXT_KEY` mappings so existing `special_event` blocks still display), matching web's create options, and gate `reduced_capacity` behind the restaurant tier to fully match `blockTypeOptions`. Keep `ClosuresCalendar`'s `special_event` legend/colour for display.

- **No legacy per-calendar "days off" migration banner** — _content · low_
  - **Web:** The Closures/days-off tab shows an amber "Legacy blocked dates" banner when any calendar still has `YYYY-MM-DD` entries in the older per-calendar `days_off` list, warning that those dates still block booking and should be re-added as proper blocks.
  - **App:** Absent. The leave/closures UI never reads or surfaces `practitioner.days_off` — the field is not on the `Practitioner` type and is referenced nowhere outside docs — so admins migrating from the legacy field get no warning that hidden blocking dates exist.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/availability/AppointmentAvailabilitySettings.tsx` (1049-1059). APP `app/(app)/availability.tsx` (no `days_off` handling), `types/practitioner.ts` (no `days_off` field, 11-26).
  - **Fix:** If `days_off` is present on the practitioners payload, add it to `types/practitioner.ts` and render an amber notice `Card` at the top of `app/(app)/availability.tsx` (mirror the web copy) when any practitioner has a date-shaped `days_off` entry. Data-hygiene only.

- **Restaurant capacity & booking-window config not in app** — _function · low_
  - **Web:** Table-reservation venues get `AvailabilityConfigSection` (fixed-intervals vs named-sittings, interval, max-covers-by-day, turn-time/sitting duration, `blocked_dates`) plus per-service capacity rules, party-size durations, and booking windows (min/max advance, party sizes, large-party redirect, deposits, cancellation notice).
  - **App:** Absent — partly by design: the app targets appointments, not restaurant tables, and appointment slot-granularity + buffer are already editable per-service (`booking_interval_minutes`, `booking_minute_marks`, `buffer_minutes`).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/sections/AvailabilityConfigSection.tsx`; `…/availability/components/ServiceCapacitySection.tsx`, `ServiceDurationSection.tsx`, `ServiceBookingRulesSection.tsx`. APP `lib/queries/useServicesManage.ts` (`BookingStartFields`, `VariantWriteInput.buffer_minutes` — appointment-side equivalents only).
  - **Fix:** Intentional scope exclusion for an appointments-first app; no action needed unless table-reservation support is added. If appointment-level min/max-advance booking windows are desired later, mirror `ServiceBookingRulesSection`'s `min_advance_minutes`/`max_advance_days` into the app service editor against `/api/venue/booking-restrictions`.

### Investigated — not a gap

- None dismissed. All eight candidate gaps were verified against the app code and confirmed. Note two items are kept-but-intentional: the restaurant capacity/booking-window config (low) records a real but correctly-scoped exclusion and explicitly flags that the appointment-relevant knobs (slot interval + buffer) are *not* missing — they live in the Services domain.

### Recommended work (ordered)

1. **Build the bookable-calendars management surface** (critical). New `components/availability/BookableCalendarsManager.tsx`, admin-gated tab/segment on `app/(app)/availability.tsx`. Reuse `usePractitioners` + `useCreateHostCalendar`; `usePatchPractitioner` already does `name`/`is_active`. Extend `PatchPractitionerInput` (`types/availability-manage.ts`) with `sort_order` + `slug`; add a `DELETE /api/venue/practitioners` mutation. Implement: name + Active toggle, up/down reorder, booking-link slug + copy URL, and service/class/resource/event assignment checkboxes (reuse `useServicesManage`/`useClassesManage`/`useResourcesManage`/`useEventsManage`), plus a 403 `upgrade_required` calendar-limit upsell.
2. **Add the 409 "save hours anyway" confirmation to both hours editors** (high). Extend `useUpdateOpeningHours` (`useVenueSettings.ts`) and `usePatchPractitioner` (`useAvailabilityManage.ts`) to accept `{ acknowledge }`, append `?acknowledge_affected_bookings=true`, and re-throw the 409 `message`. Wire a Sheet/armed-button confirm in `app/(app)/manage/hours.tsx` (`handleSave`) and `components/availability/WorkingHoursEditor.tsx` (`handleSave`). Ensure `ApiError` exposes status + parsed body.
3. **Scope non-admin leave to the self calendar** (medium). In `app/(app)/availability.tsx`, when `!isAdmin` hide the practitioner chip row (745-765), lock `practitionerId` to `staff.linked_calendar_ids[0]`, and disable Edit on leave/time-block rows the user doesn't own.
4. **Remove `special_event` (and tier-gate `reduced_capacity`) from creatable closure types** (low). In `components/manage/AvailabilityBlocksSection.tsx`, trim `BLOCK_TYPES` (line 59) to `['closed','amended_hours']` (+`reduced_capacity` only on restaurant tier); keep the label/colour maps for display.
5. **Add reduced-capacity yield + service-scope fields** (medium, restaurant-tier only). Extend `DraftState` and `draftToCreatePayload` in `AvailabilityBlocksSection.tsx` to populate `yield_overrides` + `service_id` (already in `CreateBlockInput`), behind the restaurant-tier gate.
6. **Add the legacy `days_off` migration banner** (low). Add `days_off` to `types/practitioner.ts` and render an amber notice `Card` on `app/(app)/availability.tsx` when any practitioner has date-shaped entries.


---

## 09. Waitlist

**Parity:** Strong — the appointment-waitlist management screen matches the web list, actions, gating, realtime, and the staff-choose alerts panel; the confirmed remaining gaps are a cross-dashboard alert banner, in-app waitlist enablement/mode config, and a richer add-to-waitlist sheet.

The app's `app/(app)/waitlist.tsx` has reached near-full functional parity with the web appointment waitlist. It fetches the same `GET /api/venue/waitlist` feed, renders status-striped rows, exposes the Active/All filter with live counts, gates Offer on `can_offer`, surfaces `offer_unavailable_reason`, toasts `notify_failed`, live-syncs over the `waitlist_entries` realtime channel, and even embeds the `staff_choose` open-slot alerts panel *inside* the screen — something the web waitlist page itself does not do (web surfaces those via a global banner instead). The deltas are not in the list view: staff working outside the Waitlist screen get no proactive open-slot nudge (no cross-dashboard banner), there is no in-app UI to enable the waitlist or pick its mode, and the staff add-to-waitlist sheet is all-day-only and reachable only from the appointment wizard's empty-slot dead-end. Table-kind waitlist is intentionally out of scope for this appointments-first app.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Waitlist list (Active/All) | `dashboard/waitlist/WaitlistPageClient.tsx` | `app/(app)/waitlist.tsx` | Strong | Same feed, status strips, Active/All filter with counts, Live indicator. App adds `illustration="waitlist"` empty state. |
| Offer / Cancel / Remove actions | `dashboard/waitlist/WaitlistPageClient.tsx` | `app/(app)/waitlist.tsx` | Strong | Same PATCH/DELETE + `can_offer` disable + `notify_failed` toast; both omit a Confirm for appointment entries. App uses arm-then-tap instead of `window.confirm`. |
| Staff-choose open-slot alerts (in-screen) | `dashboard/waitlist/WaitlistPageClient.tsx` (none) | `app/(app)/waitlist.tsx:529-590` | App-only | App renders the alerts panel atop the Waitlist screen; the web waitlist page renders no alerts (web uses a global banner). |
| Global open-slot availability banner (cross-dashboard) | `components/dashboard/waitlist/WaitlistAvailabilityBanner.tsx` (mounted in `dashboard/layout.tsx:317`) | absent | Missing | Web shows the banner on every dashboard surface; the app has no equivalent in `_layout.tsx` or the tabs. |
| Add guest to waitlist (staff) | `api/booking/appointment-waitlist/route.ts` | `components/booking-wizard/TimeSlotStep.tsx:358-467` | Partial | App sheet collects name/email/phone only and hardcodes `all_day`; no time-range, no notes; reachable only from the wizard empty-slot. |
| Waitlist enablement + mode configuration | `dashboard/settings/sections/WaitlistConfigSection.tsx` | absent | Missing | App only *reads* `waitlist_v2`/`waitlist_mode`; no UI to enable the waitlist or change the slot-opens mode. |
| Table-booking waitlist + kind tabs | `lib/booking/waitlist-venue-capabilities.ts` | absent | Missing (intentional) | App hardcodes `useWaitlist('appointment')`; table waitlist is out of product scope. |

**Waitlist list.** Both fetch `GET /api/venue/waitlist` (app via `useWaitlist('appointment')`, `waitlist.tsx:370`) and render a left-status-striped card per entry — `warning/brand/success/neutral/danger` via `statusStripColor` (`waitlist.tsx:60-72`). The app card shows name, status badge (rendering `'Complete'` for `confirmed`, matching the web `statusDisplayLabel`), the date · time/window (`whenLabel`), service · practitioner, phone, email, joined-at, notes (`waitlist.tsx:285-289`), `offer_unavailable_reason`, and a `notify_in_order`-only expiry countdown. The Active/All `Segmented` filter carries inline counts (`waitlist.tsx:635-642`) and a Live/Reconnecting indicator is backed by a `waitlist_entries` realtime subscription (`waitlist.tsx:387-394`). Web extras (party_size/kind for table entries, SectionCard eyebrow) are table-only or cosmetic.

**Offer / Cancel / Remove.** Both PATCH `/api/venue/waitlist` for Offer (`waiting→offered`) and Cancel (`→cancelled`) via `useUpdateWaitlistEntry`, DELETE expired/cancelled via `useDeleteWaitlistEntry`, disable Offer when `can_offer===false` (`offerDisabled`, `waitlist.tsx:240`) with the reason shown, and toast `notify_failed` (`waitlist.tsx:453`). Both correctly omit a Confirm for appointment entries — the app has an explicit comment that appointment offers complete server-side (`waitlist.tsx:317-320`). On confirm with a `booking_id`, the app routes to `/booking/:id` (`waitlist.tsx:456`). The web's `window.confirm` + trash icon is adapted on mobile to an arm-then-tap two-step (`Alert.alert` is a no-op on RN-web) plus haptics.

**Staff-choose alerts.** The app renders an "Open slot alerts" section at the top of the Waitlist screen in `staff_choose` mode only (`alertsHeader`, `waitlist.tsx:529-590`), driven by `GET /api/venue/waitlist/alerts` (`useWaitlistAlerts`, `useWaitlist.ts:92`) with per-alert Offer/Dismiss wired to `POST /api/venue/waitlist/alerts` (`useActOnWaitlistAlert`, `useWaitlist.ts:112`) and `matching_waitlist_count` shown. The web waitlist *page* renders no alerts; it relies entirely on the global banner. The app's in-screen placement is arguably better integrated, but it is not a substitute for the cross-dashboard reach the web banner provides (see the Missing gap below).

### Gaps & deficiencies

#### High

- **No cross-dashboard open-slot alert banner** — _function · high_
  - **Web:** `WaitlistAvailabilityBanner` is mounted in `dashboard/layout.tsx:317` (import at `:35`), so it renders on every dashboard surface (calendar, bookings, today) whenever a slot opens in `staff_choose` mode. It shows "Availability opened for {service} on {date} at {time}. N guests match", Offer appointment / Dismiss / View waitlist, and a "+N more open slots" line, polling `GET /api/venue/waitlist/alerts`.
  - **App:** The `staff_choose` alerts render only inside `app/(app)/waitlist.tsx` (`alertsHeader`, lines 529-590). A staff member on the Calendar, Bookings, or Today tab gets no proactive nudge that a slot opened — they must remember to open the Waitlist screen.
  - **Evidence:** `_reference/Resneo/src/components/dashboard/waitlist/WaitlistAvailabilityBanner.tsx`; `_reference/Resneo/src/app/dashboard/layout.tsx:35,317`. App: `app/(app)/waitlist.tsx:378` is the only consumer of `useWaitlistAlerts`; `app/(app)/_layout.tsx` has zero `waitlist` references.
  - **Fix:** Create `components/waitlist/WaitlistAvailabilityBanner.tsx` reusing `useWaitlistAlerts`/`useActOnWaitlistAlert` (`lib/queries/useWaitlist.ts:92,112`), gated to `staff_choose`, mirroring the web banner's primary-alert + "+N more" summary and Offer/Dismiss/View actions (View deep-links to `/waitlist`). Mount it once near the top of the authed shell (`app/(app)/_layout.tsx` or a shared `(tabs)` header). Reuse the existing toast on offer success.

- **No in-app screen to enable the waitlist or choose the slot-opens mode** — _function · high_
  - **Web:** Settings → Features exposes the `waitlist_v2` toggle and, when on, a radio group to pick the mode — Staff choose / First in line (notify in order) / Offer to all (`WaitlistConfigSection`) — saved to `feature_flags.waitlist_config.mode` via `PATCH /api/venue/feature-flags`. This controls offer routing/notification behaviour and whether the alerts banner appears.
  - **App:** Absent. The app reads `waitlist_mode` (for expiry display, `waitlist.tsx:374`) and `waitlist_v2` (for the comms template, `communications.tsx:502`) but provides no UI to turn the waitlist on or change the mode. An admin cannot switch between notify-in-order and staff-choose from the app.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/settings/sections/WaitlistConfigSection.tsx`; mode labels in `_reference/Resneo/src/lib/booking/waitlist-config.ts:4,18` (`APPOINTMENT_WAITLIST_MODES`, `WAITLIST_MODE_LABELS`). App: `useUpdateFeatureFlags` exists (`lib/queries/useVenueSettings.ts:113`, PATCH `/api/venue/feature-flags`) but is consumed only by `app/(app)/manage/compliance.tsx:176`; the sole `waitlist_v2`/`waitlist_config` reference under `app/` is the read at `communications.tsx:502`.
  - **Fix:** Add a "Waitlist" section to `app/(app)/manage/booking-settings.tsx` (or a new `app/(app)/manage/waitlist-settings.tsx`): a `Switch` bound to `resolved.waitlist_v2` and, when on, a three-option Segmented/radio for `waitlist_config.mode` using labels mirrored from `_reference/Resneo/src/lib/booking/waitlist-config.ts` (`WAITLIST_MODE_LABELS`). Persist with the existing `useUpdateFeatureFlags()` PATCH (`{ waitlist_v2, waitlist_config: { mode } }`). Gate to admins. No new endpoint needed.

#### Medium

- **Staff add-to-waitlist sheet supports all-day only (no preferred time window, no notes)** — _function · medium_
  - **Web:** `POST /api/booking/appointment-waitlist` accepts `preferred_window` `all_day` *or* `time_range` (with `desired_time`/`desired_time_end`) and an optional `notes` field (max 500). A guest/staff can request a specific time band and leave a note, which surfaces as the entry's time-window label and notes.
  - **App:** `useJoinWaitlist` hardcodes `preferred_window:'all_day'` (`useJoinWaitlist.ts:26`) and never sends `desired_time`/`desired_time_end` or `notes` (the mutationFn input type, `useJoinWaitlist.ts:14-22`, has no such fields). `WaitlistJoinSheet` collects only first/last/email/phone (`TimeSlotStep.tsx:374-377,433-449`), so every staff-created entry is an all-day request with no note — even though the app's own list view renders `entry.notes` when present (`waitlist.tsx:285-289`).
  - **Evidence:** `lib/queries/useJoinWaitlist.ts:14-27`; `components/booking-wizard/TimeSlotStep.tsx:358-467`. Web schema: `_reference/Resneo/src/app/api/booking/appointment-waitlist/route.ts` (`joinSchema` includes `time_range`, `desired_time`, `desired_time_end`, `notes`).
  - **Fix:** Extend `WaitlistJoinSheet` (`components/booking-wizard/TimeSlotStep.tsx`) with an optional "Preferred time" toggle (All day vs a from/to time pair) and a Notes input, and widen the `useJoinWaitlist` mutationFn input (`lib/queries/useJoinWaitlist.ts`) to pass `preferred_window:'time_range'` with `desired_time`/`desired_time_end` and `notes` when provided. Validate the time pair client-side to match the backend's `validateGuestWaitlistTimeInput`.

- **Add-to-waitlist is only reachable from the appointment wizard's empty-slot state** — _function · medium_
  - **Web:** The appointment-waitlist join is a first-class flow; a fully-booked date routes guests to the waitlist regardless of context, and staff can direct guests to it.
  - **App:** The only staff entry point is the "Join waitlist for this date" button shown when the appointment `TimeSlotStep` has zero available slots (`TimeSlotStep.tsx:287-292`). There is no "Add to waitlist" affordance from the Waitlist screen itself (its header has only the Live pill, `waitlist.tsx:606-614`), nor from the class/event booking flows.
  - **Evidence:** `WaitlistJoinSheet` is rendered only by `components/booking-wizard/TimeSlotStep.tsx:345`; `useJoinWaitlist` has no other caller. `app/(app)/waitlist.tsx` `Stack.Screen` `headerRight` (lines 606-614) renders only the Live/Reconnecting dot.
  - **Fix:** Add a header "Add" action on `app/(app)/waitlist.tsx` (`Stack.Screen` `headerRight` or a primary button) that opens the existing `WaitlistJoinSheet` (export it from `TimeSlotStep.tsx` or lift it to `components/waitlist/WaitlistJoinSheet.tsx`), letting staff add a guest with a service/date/practitioner picker without walking the wizard into a dead-end date. Reuse `useServicesManage`/`useAppointmentAvailability` for the pickers.

#### Low

- **Confirmed (Complete) entries have no tap-through to the resulting booking from the list** — _ui · low_
  - **Web:** `isActiveWaitlistEntry` treats appointment `confirmed` as inactive (same as the app), so confirmed entries appear only under "All"; web also has no delete for confirmed entries (only expired/cancelled). Parity is intact here — flagging only the minor UX nuance.
  - **App:** Confirmed appointment entries show the "Complete" badge but offer no tap-through to the created booking from the list. The `router.push` to `/booking/:id` fires only transiently inside the offer mutation's `onSuccess` (`waitlist.tsx:456`); the card is not `Pressable` and the action block renders nothing for confirmed (`waitlist.tsx:306-344`).
  - **Evidence:** `app/(app)/waitlist.tsx` `isActive()` (lines 100-102), `isDeletable()` (lines 104-106), confirmed-row action block (306-344). Web: `_reference/Resneo/src/app/dashboard/waitlist/WaitlistPageClient.tsx` `isActiveWaitlistEntry` (lines 122-125).
  - **Fix:** When an entry has `booking_id` and `status==='confirmed'`, make the card pressable to `router.push(`/booking/${entry.booking_id}`)` in `app/(app)/waitlist.tsx` so staff can jump to the resulting appointment from the All view.

- **Offer-expiry shown as a relative countdown only (no absolute clock time)** — _design · low_
  - **Web:** Renders the offer expiry as an absolute clock time — "Expires 14:35" (`toLocaleTimeString`) — alongside the status pill (`WaitlistPageClient.tsx:241-249`).
  - **App:** Renders a relative countdown — "Offer expires in 2h 10m" — that self-ticks every 60s via a shared store (`offerExpiryLabel` + `OfferCountdown`, `waitlist.tsx:112-122`). Both are valid; the relative form loses the exact deadline at a glance.
  - **Evidence:** `app/(app)/waitlist.tsx:112-196`; web `_reference/Resneo/src/app/dashboard/waitlist/WaitlistPageClient.tsx:241-249`.
  - **Fix:** Optionally append the absolute time in `offerExpiryLabel` (`app/(app)/waitlist.tsx`), e.g. "Offer expires in 2h 10m (14:35)", so staff see both urgency and the hard deadline as on web.

### Investigated — not a gap

- **Table-booking waitlist + All/Table/Appointments kind tabs** — Intentional product-scope exclusion. The web supports table waitlist, kind tabs (`showKindTabs`), Confirm-booking, and table-offer expiry; the app hardcodes `useWaitlist('appointment')` (`waitlist.tsx:370`) and the screen doc-comment states it is appointments-plan only. Not a defect.

### Recommended work (ordered)

1. **Cross-dashboard alert banner (high).** Build `components/waitlist/WaitlistAvailabilityBanner.tsx` on the existing `useWaitlistAlerts`/`useActOnWaitlistAlert` hooks (`lib/queries/useWaitlist.ts:92,112`), gated to `staff_choose`, and mount it once in `app/(app)/_layout.tsx` (or the shared `(tabs)` header) with primary-alert + "+N more" summary and Offer/Dismiss/View(→`/waitlist`) actions.
2. **In-app waitlist enable + mode config (high).** Add a "Waitlist" section (in `app/(app)/manage/booking-settings.tsx` or a new `manage/waitlist-settings.tsx`): a `Switch` for `resolved.waitlist_v2` plus a three-option mode selector, persisted via the existing `useUpdateFeatureFlags()` (`lib/queries/useVenueSettings.ts:113`) with labels mirrored from `_reference/Resneo/src/lib/booking/waitlist-config.ts`. Admin-gated; no new endpoint.
3. **Enrich the add-to-waitlist sheet (medium).** Add an optional preferred-time toggle (all-day vs from/to) and a Notes input to `WaitlistJoinSheet` (`components/booking-wizard/TimeSlotStep.tsx`), and widen `useJoinWaitlist`'s input (`lib/queries/useJoinWaitlist.ts:14-22`) to send `time_range` + `desired_time`/`desired_time_end` + `notes` when provided, with client-side time validation.
4. **Add-to-waitlist entry point on the Waitlist screen (medium).** Lift/export `WaitlistJoinSheet` and add a header "Add" action on `app/(app)/waitlist.tsx` with service/date/practitioner pickers (reuse `useServicesManage`/`useAppointmentAvailability`) so staff aren't forced through the wizard's empty-slot dead-end.
5. **Tap-through from confirmed rows (low).** Make confirmed entries with a `booking_id` pressable to `/booking/:id` in `app/(app)/waitlist.tsx`.
6. **Absolute expiry time (low).** Append the clock time to `offerExpiryLabel` in `app/(app)/waitlist.tsx`.


---

## 10. Dashboard Home, Reports & Referrals

**Parity:** Partial — Reports are at near-full parity (and the app even adds a History/trends + Client Lifetime Value section), and the Today overview is mature, but the entire Referrals / Refer & Earn programme is absent and the Today screen is not the landing surface.

Reports (`app/(app)/reports.tsx`) faithfully mirror the web `ReportsView`: date-range presets, Reports 1/2/3/4/7, baseline appointment-performance metrics, booking-log email config, an embedded clients directory, full-venue CSV export, and an app-only History/trends + Client Lifetime Value addition. The Dashboard Home equivalent (`app/(app)/today.tsx`) is feature-rich — greeting, KPI grid, booking-type chips, capacity card, alerts, 7-day forecast, tappable diary, dismissible setup checklist — but it is a "Today" tile under Settings rather than the home tab (the home tab is the Calendar, an intentional IA choice), and it omits three secondary visualisations (capacity heatmap, secondary-booking-activity, KPI sparklines) that are already typed but never read. The single largest miss is **Referrals (Refer & Earn)**: the web has a complete programme plus a referee trial-credit banner, and the app has no route, tile, or banner at all.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Dashboard Home / Today overview | `dashboard/page.tsx`, `DashboardHomeClient.tsx` | `app/(app)/today.tsx` + `components/today/*` | Strong | Full greeting/KPI/checklist/forecast/diary; not the landing screen, and missing heatmap, secondary activity, sparklines, referee banner. |
| 7-day capacity heatmap / outlook | `DashboardHomeClient.tsx` (~L221-223, L475) | absent | Missing | Typed in `types/dashboard.ts` (L47-55, L78) but never rendered. |
| Secondary booking activity ("Other booking types") | `DashboardHomeClient.tsx` L190 | absent | Missing | `DashboardSecondaryActivity` typed (L62-68, L77) but unrendered; hybrid-restaurant scope. |
| Setup checklist | `dashboard/SetupChecklist.tsx` | `today.tsx` `SetupChecklistCard` + `useSetupStatus.ts` | Strong | Admin-only, dismissible 5-step checklist; app uses a fixed appointment-oriented list vs the web's model-specific copy. |
| Reports — overview (Report 1/2/3/4/7) | `reports/ReportsView.tsx` | `app/(app)/reports.tsx` | Strong | Presets, sub-tabs, SVG charts, CSV; omits `report_by_booking_model` render + table-utilisation (Report 5). |
| Reports — appointment performance (baseline) | `reports/BaselineMetricsSection.tsx` | `components/reports/BaselineMetricsCard.tsx` | Full | Faithful port of the full `VenueBaselineMetrics` shape. |
| Reports — daily booking-log email config | `reports/ReportsView.tsx` (`setDayTime` L1113, `type=time` L1208) | `components/reports/BookingLogEmailCard.tsx` | Partial | Toggles digest + recipient + which days; send time hard-coded 17:00 and read-only. |
| Reports — Clients directory (embedded sub-tab) | `reports/ClientsSection.tsx` | `components/reports/ClientsTab.tsx` | Strong | Searchable/paginated/editable/erase/CSV; tags read-only in this sub-tab only (full tag edit+filter exist on the primary contacts surfaces). |
| Reports — Client lifetime value & history trends | n/a | `components/reports/HistorySection.tsx` + `useReportHistory.ts` | App-only | History card + Client Lifetime Value card with CSV — net positive. |
| Reports — full data export (bookings/guests CSV) | `reports/DataExportSection.tsx` | `components/reports/DataExportCard.tsx` | Full | Both export full-venue bookings/guests from `GET /api/venue/export`. |
| Referrals / Refer & Earn | `dashboard/referrals/*`, `lib/referrals/load-dashboard.ts` | absent | Missing | No route, tile, or banner; web loads via SSR (no API route → backend endpoint needed). |
| Referee trial-credit banner | `dashboard/page.tsx` `loadRefereeBannerData` (L59-91), banner L38-44 | absent | Missing | No banner and no payload field in `types/dashboard.ts`. |

The **Today overview** is the strongest non-Reports surface: `today.tsx` renders `GreetingHeader`, an admin-only dismissible `SetupChecklistCard`, `KpiGrid`, `BookingTypeChips` (shown only when more than one model is active and not table-secondaries), a `CapacityCard` for non-appointment venues, `AlertsCard`, `ForecastChart`, and a tappable `DiarySection`. The confirmed deltas vs the web are all secondary: it is reached as a featured tile (`settings.tsx` L203, `target: '/today'`) rather than as the index route; there is no 7-day capacity heatmap, no secondary-booking-activity block, no inline KPI sparkline, and no referee banner.

**Reports** is at near-full parity. `reports.tsx` provides 7d/30d/90d + custom ranges, Overview/Clients sub-tabs, SVG bar/line charts, and CSV export, with Reports 1/2/3/4/7 and the baseline metrics all present. The only web reports the app does not render are `report_by_booking_model` (typed but not surfaced) and `report5_table_utilisation` (table-only). The app additionally ships a History/trends section and a Client Lifetime Value card that the web does not isolate — a genuine plus.

The **Reports → Clients sub-tab** is a lighter secondary directory: it is searchable, paginated, has expandable detail with inline profile edit, two-step GDPR erase, history, and CSV, but renders tags read-only (`ClientsTab.tsx` L320-333) and has no tag filter. This is a localised gap — the app's primary contacts surfaces already have full tag parity (editing via `components/clients/GuestTagEditor.tsx`, wired in `app/(app)/client/[id].tsx` L450; filtering via `useGuestTags` + `segment='tag'` in `app/(app)/(tabs)/clients.tsx`).

### Gaps & deficiencies

#### High

- **Referrals / Refer & Earn programme entirely absent** — _function · high_
  - **Web:** A full Refer & Earn surface (`dashboard/referrals`): referral code + shareable link with copy-to-clipboard, three KPI cards (credits earned, credit remaining on next invoice, in-progress count), and a referrals table (referee name, status pill, credit, updated date, plus explain-outcome guidance). Data from `src/lib/referrals/load-dashboard.ts`.
  - **App:** Absent — no route, no settings tile, no banner. The `settings.tsx` workspace tiles (L203 Today → L209 Notifications) contain no Refer & Earn entry, and no refer-earn route exists.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/referrals/ReferralsDashboardContent.tsx`, `ReferAndEarnClient.tsx`, `src/lib/referrals/load-dashboard.ts` (+ 14 supporting modules under `src/lib/referrals/`). APP: no referrals file outside `Docs/`; `app/(app)/(tabs)/settings.tsx` L203/L205.
  - **Fix:** Build `app/(app)/refer-earn.tsx` mirroring `ReferAndEarnClient` + `ReferralsDashboardContent` (Card-based: code + shareable link with `Clipboard` copy, three KPI `Card`s, a referrals list using `StatusPill`). Register it in `app/(app)/_layout.tsx` and add an admin-gated "Refer & Earn" tile to the workspace group in `settings.tsx` (mirror the Reports tile at L205). Backend prerequisite: the web exposes referrals only via SSR `loadReferralsDashboardForVenue()` (no API route), so add a Bearer `GET /api/venue/referrals` in `C:/Resneo` and a matching `useReferrals` hook under `lib/queries/`.

#### Medium

- **7-day capacity heatmap / outlook not rendered** — _function · medium_
  - **Web:** Dashboard home renders `payload.heatmap[]` as a colour-coded 7-day fill-% outlook (quiet→full legend) with per-dining-service stacked rows for service-engine venues.
  - **App:** Absent — `DashboardHomePayload` models `heatmap[]`/`DashboardHeatmapDay`/`DashboardHeatmapService` but `today.tsx` never reads it.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` (heatmap ~L475; per-service depth L221-223). APP `types/dashboard.ts` L38-55 + L78 define the types; `app/(app)/today.tsx` has no `heatmap` usage.
  - **Fix:** Add `components/today/HeatmapWeek.tsx` rendering a 7-column row from `payload.heatmap`, background colour by `fill_percent` (null=muted, <40=brandSubtle, 40-69=brand, 70-89=warning, 90+=danger) with an optional per-service stack from `by_service`. Render in `today.tsx` only when `!isAppointment`. Data already arrives in the payload.

- **Dashboard home is not the app's landing screen** — _design · medium_
  - **Web:** `/dashboard` IS the home overview (greeting, KPIs, checklist, diary) — the first thing staff see after login.
  - **App:** The home tab (`tabs/index.tsx`) is the Calendar; the dashboard-home equivalent (`today.tsx`) is reached only as a featured "Today" tile in the Settings/More hub.
  - **Evidence:** APP `app/(app)/(tabs)/index.tsx` is the Calendar (imports `CalendarDayGrid`/`AllCalendarsDayGrid`, `useCalendarGrid`); `settings.tsx` L203 registers Today (`target: '/today'`, `featured: true`). WEB `_reference/Resneo/src/app/dashboard/page.tsx` renders `DashboardHomeClient` as the index route.
  - **Fix:** Product decision — the redesign memo intentionally chose a Calendar-first 4-tab IA. If closer parity is wanted, surface a few home KPIs atop the Calendar tab or promote Today to a tab; at minimum keep the Today tile prominent (already `featured: true`). Treat as an intentional IA divergence, not a defect.

#### Low

- **Secondary booking-activity section missing for hybrid table venues** — _function · low_
  - **Web:** For `tableFocusSecondariesEnabled` venues the web shows an "Other booking types" section: today-by-type chips, four KPI tiles (bookings, confirmed, deposit revenue, next up), and a 7-day non-table forecast chart.
  - **App:** Absent — `secondary_booking_activity` is typed but `today.tsx` renders nothing for it.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` L190. APP `types/dashboard.ts` L62-77 define `DashboardSecondaryActivity`; `today.tsx` reads `table_focus_secondaries_enabled` (L125) only to gate `BookingTypeChips`, never to render the section.
  - **Fix:** In `today.tsx`, when `payload.table_focus_secondaries_enabled`, render a section reusing `KpiGrid` (deposit-revenue tile from `secondary.today.revenue`) and `ForecastChart` (`secondary.forecast`). Low priority — only affects hybrid restaurant+secondary venues, tangential to the appointments-first product.

- **KPI tiles lack the inline 7-day sparkline** — _ui · low_
  - **Web:** `DashboardStatCard` embeds a sparkline driven by `forecastSpark` (`payload.forecast`) on the today and confirmed tiles.
  - **App:** Absent — `KpiGrid` tiles show value + up to two hint lines only, no sparkline; the component isn't even passed the forecast.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` L220 (`forecastSpark`) + L301/L316 (`sparklineValues`). APP `components/today/KpiGrid.tsx` props are `{today, isAppointment}` only; `today.tsx` renders `<KpiGrid today isAppointment>` at L177.
  - **Fix:** Add a small `react-native-svg` polyline `MiniSparkline` (the project already ships `SvgLineChart` in `components/reports`) and render it inside the primary KPI tile in `KpiGrid.tsx`, passing the forecast already loaded by `useDashboardHome`. Cosmetic polish.

- **Booking-log email: per-day send time not editable** — _function · low_
  - **Web:** `BookingLogEmailSettingsPanel` renders a `type=time` input per enabled weekday so each day's digest send time is configurable.
  - **App:** `BookingLogEmailCard` only toggles days on/off; each enabled day is hard-coded to 17:00 and the time is shown read-only.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx` L1113 (`setDayTime`) + L1208-1211 (`type=time`). APP `components/reports/BookingLogEmailCard.tsx` — `DEFAULT_SCHEDULE` hard-codes `'17:00'` (L21-27), `setDayEnabled` inserts `{day, time:'17:00'}` (L69), and `entry.time` renders as static `Text` (L174-178).
  - **Fix:** In `BookingLogEmailCard.tsx` add a time picker (the app already has `components/ui/DatePickerField` used in `reports.tsx`) bound to each enabled day's `entry.time` with a `setDayTime` updater, then include edited times in the existing `useBookingLogEmailMutation` PATCH (schedule already carries `{day,time}`).

- **Reports → Clients sub-tab shows tags read-only with no tag filter** — _function · low_
  - **Web:** `ClientsSection` (the web's main clients directory) shows a "Filter by tags" chip row (`GET /api/venue/guests/tags`, `tags=` query param) and a `TagEditor` in each expanded client that PATCHes guest tags.
  - **App:** Tag editing AND filtering already exist in the app, just not inside the Reports → Clients sub-tab. `components/reports/ClientsTab.tsx` renders tags read-only (L320-333) and has no tag filter. The primary contacts surfaces have full parity: editing via `components/clients/GuestTagEditor.tsx` (wired in `app/(app)/client/[id].tsx` L450, persisted with `useUpdateGuest({tags})`); filtering in `app/(app)/(tabs)/clients.tsx` (`useGuestTags` L286, `segment='tag'`+`segmentTag` L296, plus `BulkTagSheet`/`BulkRemoveTagSheet`).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx`. APP exists: `components/clients/GuestTagEditor.tsx`; `lib/queries/useGuestTags.ts`; `useUpdateGuest` payload includes `tags?: string[]` (`lib/queries/useGuestMutations.ts` L15); `useGuests` supports `segment='tag'`/`segmentTag` (`lib/queries/useGuests.ts` L36-38, L66-70). APP gap localised to `ClientsTab.tsx` (read-only tags L320-333; `handleSave` omits tags, L129-134).
  - **Fix:** If parity is wanted in the Reports sub-tab specifically, drop the existing `GuestTagEditor` into `ClientsTab`'s `GuestDetail` (it already takes `useUpdateGuest`'s `mutateAsync`) and add a tag-filter chip row backed by the existing `useGuestTags` hook, passing `segment='tag'`/`segmentTag` into `useGuests`. No new hook or backend work needed.

- **Per-booking-model breakdown report not surfaced** — _function · low_
  - **Web:** The reports payload includes `report_by_booking_model` (booking_count, covers, cancelled, completed, checked-in, deposit collected per model), used for the full export's per-model breakdown.
  - **App:** Typed but not rendered — `types/reports.ts` defines `ReportByModelRow` and `ReportsResponse.report_by_booking_model`, but `app/(app)/reports.tsx` never reads it.
  - **Evidence:** WEB `_reference/Resneo/src/app/api/venue/reports/route.ts` (`report_by_booking_model`). APP `types/reports.ts` L59-68 (`ReportByModelRow`) + L159 (`report_by_booking_model?:`); `app/(app)/reports.tsx` has no reference.
  - **Fix:** Render a compact per-model summary (StatRows/table) in `reports.tsx` for multi-model venues (show when `enabled_models.length > 1`) from the already-typed `report_by_booking_model`, and include it in a CSV export. The type already exists, so no `types/reports.ts` change is needed.

- **Table utilisation report omitted** — _function · low_
  - **Web:** Report 5 "Table utilisation" (per-table utilisation %, occupied/available hours, bars, CSV) for table-management venues.
  - **App:** Absent — `reports.tsx` has no table-utilisation section, though `table_management_enabled` is typed in `ReportsResponse`.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx` L1029 ("Table utilisation") + `report5_table_utilisation` (L103/L424/L509). APP `types/reports.ts` L151 types `table_management_enabled`; `app/(app)/reports.tsx` has no report5 reference.
  - **Fix:** Intentional scope exclusion — table-management is a restaurant feature outside the appointments-first app. If a table venue ever uses the app, mirror the web's gated section behind a `table_management_enabled` check; otherwise leave out.

- **Referee trial-credit banner missing on home** — _content · low_
  - **Web:** Dashboard home shows a green banner for venues that signed up via a referral and are still trialling ("Your referral month is active … first charge on [date]").
  - **App:** Absent — `today.tsx` has no referee banner and the dashboard-home payload (`types/dashboard.ts`) exposes no such field.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/page.tsx` L38-44 (banner) + `loadRefereeBannerData` L59-91. APP `app/(app)/today.tsx` has no banner; `types/dashboard.ts` `DashboardHomePayload` has no referee field.
  - **Fix:** Lower priority; ties to the broader Referrals gap. If implemented, add `refereeBanner?: {trialEndDisplay}` to the dashboard-home payload (`C:/Resneo`) and render a dismissible info `Card` above `SetupChecklistCard` in `today.tsx`.

### Investigated — not a gap

- **Clients tag editing/filtering "missing" from the app** — corrected. Both already exist: tag editing via `components/clients/GuestTagEditor.tsx` (wired in `app/(app)/client/[id].tsx` L450) and tag filtering via `useGuestTags` + `segment='tag'` in `app/(app)/(tabs)/clients.tsx` (plus bulk tag sheets). The candidate's evidence ("`useGuests` has no tags arg", "add a new `useGuestTags` hook") was factually wrong — `useGuests` already supports `segment='tag'`/`segmentTag` and `useGuestTags.ts` already exists. Residual is only that the Reports → Clients sub-tab doesn't reuse them; downgraded medium → low (kept above as a localised low gap).
- **`report_by_booking_model` "not typed" in the app** — corrected. The type IS defined (`types/reports.ts` `ReportByModelRow` + `ReportsResponse.report_by_booking_model` L159). The genuine gap is only that `reports.tsx` does not render it; severity unchanged (low, kept above).

### Recommended work (ordered)

1. **Build the Refer & Earn surface** — new `app/(app)/refer-earn.tsx` (code + shareable link with `Clipboard` copy, three KPI `Card`s, referrals list with `StatusPill`); register in `app/(app)/_layout.tsx`; add an admin-gated tile to the workspace group in `settings.tsx`; add a Bearer `GET /api/venue/referrals` in `C:/Resneo` + a `useReferrals` hook under `lib/queries/`. (High)
2. **Render the 7-day capacity heatmap** — add `components/today/HeatmapWeek.tsx` from `payload.heatmap`, gated to `!isAppointment` in `today.tsx`. Data already in the payload. (Medium)
3. **Decide on the landing-screen IA** — confirm Calendar-first is intentional (it is per the redesign memo); optionally surface home KPIs atop the Calendar tab or promote Today to a tab. (Medium, product decision)
4. **Make booking-log email send time editable** — wire a per-day time picker (`components/ui/DatePickerField`) into `components/reports/BookingLogEmailCard.tsx` and include edited times in the existing PATCH. (Low)
5. **Add KPI sparklines** — pass the already-loaded forecast into `components/today/KpiGrid.tsx` and render a `MiniSparkline` (reuse `SvgLineChart` from `components/reports`) in the primary tile. (Low)
6. **Surface the per-model breakdown report** — render `report_by_booking_model` as StatRows/table in `reports.tsx` for multi-model venues, with CSV. No type change needed. (Low)
7. **Bring tag edit/filter into the Reports → Clients sub-tab** — drop `GuestTagEditor` into `ClientsTab`'s `GuestDetail` and add a tag-filter chip row backed by `useGuestTags` (`segment='tag'`). No new hook/backend. (Low)
8. **Add the secondary booking-activity section** — in `today.tsx`, render `secondary_booking_activity` via `KpiGrid` + `ForecastChart` when `table_focus_secondaries_enabled`. (Low, hybrid-venue only)
9. **Add the referee trial-credit banner** — once referrals exist, expose `refereeBanner` on the dashboard-home payload and render a dismissible `Card` above `SetupChecklistCard` in `today.tsx`. (Low)
10. **Table utilisation (Report 5)** — leave out as an intentional restaurant-feature scope exclusion; revisit only if a table venue adopts the app. (Low)


---

## 11. Services / Appointment Services & Add-ons

**Parity:** Strong — the admin service create/edit flow and the entire Add-ons library are field-complete (and in places exceed the web); every confirmed gap is about non-admin self-service or three form-embedded extras, not core service authoring.

This is one of the strongest-parity domains in the app. For an **admin**, the service create/edit form (`app/(app)/manage/services.tsx`) mirrors the web's `appointment-service-form-to-payload.ts` field-for-field — name, description, duration, buffer, price, deposit/payment-requirement, the 10-colour palette, active toggle, guest booking rules, booking interval + per-hour start marks, the seven `staff_may_customize_*` flags, location/online-meeting, per-service and per-option processing-time blocks, custom weekly availability, inline multi-option variant editing, and inline add-on group linking. The Add-ons library tab and `AddonGroupEditorSheet` reach **full** parity and slightly exceed the web (group description, group active toggle, per-add-on cost-to-business). The substantive gaps cluster in two areas: (1) **non-admin staff self-service** — the app deliberately admin-gates the whole screen to close a re-link privilege hole (documented at `services.tsx` lines 488–492), so the web's `linkedPractitionerIds` branches, per-calendar offer toggles, and `StaffServiceOverrideModal` have no app equivalent; and (2) three **form-embedded extras** the web has (compliance editor, availability preview, inline add-calendar) plus one editor limitation (weekly-only custom availability). All nine candidate gaps were verified against both app source and the web reference — no false positives, nothing dismissed.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Services list (admin) | `dashboard/appointment-services/AppointmentServicesView.tsx` | `manage/services.tsx` (`ServicesScreen` + `ServiceRow`, 384–513) | Strong | Card per service with colour dot, duration, price, variant + add-on-group counts, Inactive badge, single-accordion expand → Edit/Delete (admin only). |
| Service create/edit form | `appointment-services/AppointmentServiceFormFields.tsx` | `manage/services.tsx` (Sheet + `handleSave`, 908–1122, 1324–1700) + `components/services/*` | Strong | Field-complete; `handleSave` mirrors `appointment-service-form-to-payload.ts`. Missing the web's live availability preview, embedded compliance editor, inline add-calendar. |
| Add-ons library tab | `dashboard/addons/AddonsLibraryView.tsx` | `manage/services.tsx` (`AddonsTab`, 519–707) | Full | Archived toggle, selection-rule label, option count + prompt, expandable option list, "Used by (N)" list, admin New/Edit. |
| Add-on group editor | `appointment-services/AddonGroupEditor.tsx` | `components/manage/AddonGroupEditorSheet.tsx` | Full | Meets and slightly exceeds web — app adds group Description, group Active toggle, and per-add-on Cost to business. |
| Add-ons section in service form | `appointment-services/AddonGroupsSection.tsx` | `components/manage/AddonLinksEditor.tsx` | Strong | Link/unlink, reorder, edit-in-place, create-inline (auto-linked). Web previews each group's options inline; app shows name + rule/count caption only. |
| Staff per-calendar service override | `appointment-services/StaffServiceOverrideModal.tsx` | absent | Missing | No override UI and no `/api/venue/practitioner-service-overrides` call anywhere in app source. |
| Non-admin staff self-service | `AppointmentServicesView.tsx` (`linkedPractitionerIds` branches) | `manage/services.tsx` (`isAdmin` gating, line 717) | Missing | App is fully admin-gated; non-admins get a read-only catalogue. |
| Per-service compliance (in form) | `AppointmentServicesView.tsx` (`ComplianceRequirementsEditor`, line ~998) | absent (`manage/compliance.tsx` is a separate check-in dashboard) | Missing | No compliance section in the service form. |
| Service availability preview calendar | `AppointmentServiceFormFields.tsx` (`ServiceAvailabilityCalendar`, 859–863) | absent | Missing | App's custom-availability section is editor-only; source hours aren't even fetched on the screen. |

**Services list (admin).** Each service renders as a card with a colour dot, duration, price, variant + add-on-group counts, and an Inactive badge. A single-accordion expand reveals Edit/Delete, gated to admins (`ServiceRow` lines 493–505). The New-service button (line 1250) and empty state are both admin-aware. The only difference is presentation — the web's always-open `SectionCard`s vs the app's tap-to-expand — which is a reasonable mobile choice, not a gap.

**Service create/edit form.** `handleSave` (lines 908–1122) faithfully reproduces `appointment-service-form-to-payload.ts`: primary-option derivation (927–966), deposit zeroing when the payment mode isn't `deposit` (line 1032), replace-semantics for `variants` and `addon_group_links` (1069–1093), and the full-payment per-option price rule. Advanced sections are grouped into `CollapsibleCard`s, and option-mode switching is implicit (add/remove options) rather than the web's explicit radio + confirm dialog — equivalent outcome.

**Add-on group editor.** The app meets and slightly exceeds the web. Both expose group name, prompt, single/multi selection, required toggle / min-max, `hidden_from_online`, inline add-on rows (name, description, extra price, extra minutes, active) with add/remove, and delete-with-auto-archive messaging (lines 334–340). The app additionally surfaces group Description (411–418), a group Active toggle (506–509), and per-add-on Cost to business (586–592) — all backend-supported (`cost_to_business_pence`) but absent from the web UI. Validation matches the schema (≥1 option, max 40, single-select normalisation 211–231, 0–240 duration).

**Add-ons section inside the service form.** `AddonLinksEditor` handles link/unlink, reorder up/down, edit-in-place, create-new-inline (auto-linked, `services.tsx` 1308–1321), and pick-from-library, with links travelling as `addon_group_links[{addon_group_id, sort_order}]`. The confirmed difference: the web shows each linked group's active options inline (`visibleAddons`), while the app shows only the group name plus a rule/option-count caption (`AddonLinksEditor` 118–125, `groupCaption` 62–70).

### Gaps & deficiencies

#### High

- **Non-admin staff cannot manage services at all (web allows self-service)** — _function · high_
  - **Web:** A non-admin staff member linked to a calendar can create services on calendars they control, toggle which of their calendars offer each service inline ("Offer on your calendars" checkboxes → `PUT /api/venue/practitioner-services`), and edit/delete services they created. `AppointmentServicesView` branches extensively on `linkedPractitionerIds`.
  - **App:** The entire services screen is gated behind `isAdmin` (`venue.current_user_role === 'admin'`, `services.tsx` line 717). Non-admins get a read-only catalogue: no New-service button (584, 1250), no Edit/Delete (`ServiceRow` 493–505), no per-calendar offer toggle. The app **deliberately** admin-gated even the per-calendar toggle (documented code comment at lines 488–492) to close a hole where a non-admin could re-link calendars they don't manage.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/appointment-services/AppointmentServicesView.tsx` (`linkedPractitionerIds` 128/136/260, `toggleStaffServiceCalendar` 320–329, "Offer on your calendars" 765–795, `created_by_staff_id` edit/delete 830). APP `app/(app)/manage/services.tsx` 717 (`isAdmin`), 493–505 (`ServiceRow` admin-only), 584/1250 (New buttons admin-only).
  - **Fix:** Relax the admin gating to match the web's `linkedPractitionerIds` logic. The screen already loads `practitioner_services` (`query.data?.practitioner_services`, line 805) and exposes `venue.current_user_role`. **Prerequisite:** there is no `current_staff_id` / staff→calendar linkage surfaced today (`VenueProvider` exposes only role) — add it first (e.g. via `useStaffMe`) to scope create/edit/delete to the staff member's managed calendars (web's `calendarsForServiceForm` + `created_by_staff_id` check). Then add a per-calendar offer toggle in the `ServiceRow` expanded view (new `useToggleCalendarService` mutation → `PUT /api/venue/practitioner-services`).

- **No per-calendar staff field overrides (`StaffServiceOverrideModal`)** — _function · high_
  - **Web:** When `staff_may_customize_*` flags are on, non-admin staff get "Edit your settings" on each offered service and set per-calendar overrides for name/description/duration/buffer/price/deposit/colour via `PATCH /api/venue/practitioner-service-overrides`, with a calendar picker when managing several. The modal diffs each field to `null` when it equals the venue base.
  - **App:** Absent. Admins can set the `staff_may_customize_*` flags in the form (`handleSave` 1049–1056; flags on `ManagedService` in `types/services-manage.ts` 74–81), but there is no UI for staff to apply overrides and no `/api/venue/practitioner-service-overrides` call anywhere.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/appointment-services/StaffServiceOverrideModal.tsx` (`buildPatch` + PATCH 108–184; null-when-equals-base diffing; calendar selector 209–224). APP grep for `practitioner-service-overrides` / `StaffServiceOverride` returns matches only in Docs + `_reference`, none in app source.
  - **Fix:** Add a `useUpdateServiceOverride` mutation (`PATCH /api/venue/practitioner-service-overrides`) and a `StaffServiceOverrideSheet` rendering only the fields permitted by the service's `staff_may_customize_*` flags. Mirror the modal's null-when-equals-base diffing and `mergeAppointmentServiceWithPractitionerLink` for showing the venue default. Depends on the same staff-id/calendar-linkage prerequisite as the gap above.

#### Medium

- **Service form lacks the embedded per-service compliance requirements editor** — _function · medium_
  - **Web:** When editing a service and the compliance feature flag is on, the edit dialog embeds `ComplianceRequirementsEditor` so an admin sets which compliance types this specific service requires (`appointmentServiceId={editingId}`).
  - **App:** Absent in the service form. The app's compliance screen (`app/(app)/manage/compliance.tsx`) is a check-in/capture dashboard that links out to the web (`WEB_COMPLIANCE_PATH`) for template + requirement management.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/appointment-services/AppointmentServicesView.tsx` (import line 41, render line 998). APP grep `ComplianceRequirements` → no matches in app source; `compliance.tsx` links out.
  - **Fix:** Add an admin-only, edit-mode-only "Compliance requirements" `CollapsibleCard` to the service sheet, gated by the compliance feature flag (via `useVenueContext().featureFlags`). Build it against the same per-service compliance-type requirement endpoint `ComplianceRequirementsEditor` uses; reuse compliance types already fetched by `lib/queries/useCompliance`.

- **Custom-availability editor only authors weekly rules (web supports specific dates & date-range patterns)** — _function · medium_
  - **Web:** `ServiceCustomAvailabilityEditor` (web) lets admins add weekly windows, specific-date entries, and date-range patterns (the `ServiceCustomScheduleV2` rule kinds: `weekly | specific_dates | date_range_pattern`), each with its own add-rule affordance and editor.
  - **App:** The app editor only writes `weekly` rules; `specific_dates` and `date_range_pattern` rules are preserved on read/round-trip but cannot be created or edited on mobile. The editor even surfaces a caption noting N advanced rules set on the web are kept and still apply.
  - **Evidence:** APP `components/services/ServiceCustomAvailabilityEditor.tsx` writes only a single weekly rule (`writeWindows` 167–174; `otherRules` preserved at 164, 173; advanced-rule caption 204–209); `types/services-manage.ts` 42–52 documents the round-trip-only kinds. WEB `_reference/Resneo/src/components/scheduling/ServiceCustomAvailabilityEditor.tsx` authors all three (`newRule` + `addRule` 64–78, 114, 236–252; dedicated editors at 389/531/660).
  - **Fix:** Extend `components/services/ServiceCustomAvailabilityEditor.tsx` to author `specific_dates` (a date picker) and `date_range_pattern` (start/end + days-of-week + ranges) rules, serialising into the existing `ServiceCustomScheduleV2.rules`. The round-trip plumbing already preserves these kinds, so only the editor UI is missing.

- **No live service availability preview in the form** — _ui · medium_
  - **Web:** The form renders `ServiceAvailabilityCalendar` showing the actual bookable windows (overlap of venue opening hours + each linked calendar's weekly hours + the service's custom schedule), helping admins sanity-check what guests will see.
  - **App:** Absent. The Custom availability section (`ServiceCustomAvailabilityEditor`) only exposes the editor; there is no preview of the resulting bookable windows, and venue opening hours / linked-calendar hours are not fetched in the services screen.
  - **Evidence:** WEB `_reference/Resneo/src/components/dashboard/appointment-services/AppointmentServiceFormFields.tsx` (import line 16, render 859–863 with `venueOpeningHours` + `linkedCalendarsForPreview`). APP `components/services/ServiceCustomAvailabilityEditor.tsx` is editor-only; grep `ServiceAvailabilityCalendar` in app → none.
  - **Fix:** Lower priority. If added, build a read-only week/day preview fed by venue opening hours (fetch `/api/venue`), each selected practitioner's `working_hours`, and `form.customSchedule`; render it inside the Custom availability `CollapsibleCard`. Otherwise document as an intentional mobile simplification.

#### Low

- **No inline "Add calendar" from the service form** — _function · low_
  - **Web:** Admins can create a new calendar directly from the "Calendars that offer this service" section via "Add calendar" (`POST /api/venue/practitioners` with default working hours); the new id is auto-selected so the service saves linked to it. Plan-limit messaging (`CalendarLimitMessage`) shows at the entitlement cap.
  - **App:** Absent. The "Offered by" section only lists existing active practitioners as toggle chips (`services.tsx` 1556–1589); to add a calendar the user must leave for Team settings.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/appointment-services/AppointmentServicesView.tsx` (`handleCreateCalendar` 453+, Add-calendar button + entitlement 1024/1058). APP `app/(app)/manage/services.tsx` 1556–1589.
  - **Fix:** Add a small "New calendar" row beneath the "Offered by" chips (admin only) opening a minimal Sheet with a name input → `POST /api/venue/practitioners` (reuse/extend `usePractitioners`' create path); on success refetch practitioners and add the new id to `practitionerIds`. Optionally surface plan-limit copy. Convenience-only — defer behind the higher-severity gaps.

- **Add-on "Used by" chips don't deep-link to a specific service** — _function · low_
  - **Web:** On the Add-ons library, each "Used by" chip is a `Link` to `/dashboard/appointment-services?tab=services&service=<id>`, jumping straight to that service (and the page reads `?service=` to focus it).
  - **App:** Tapping a "Used by" chip switches to the Services tab and expands the service via `setExpandedId` (`services.tsx` 1288–1291), but there is no addressable/deep-linkable service route and no auto-scroll to the expanded row. **(Partial — the "jump to service" behaviour exists; only the URL-addressable deep link and auto-scroll are missing.)**
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/addons/AddonsLibraryView.tsx` (`Link href ...&service=`). APP `app/(app)/manage/services.tsx` 1288–1291 (`onPressService` → `setActiveTab('services')` + `setExpandedId`); AddonsTab chips 672–691.
  - **Fix:** Minor. Optionally scroll the `FlatList` to the expanded service after `onPressService` (track its index, call `scrollToIndex`), and/or accept a route param to open the screen with a service pre-expanded for parity with the web's `?service=` deep link.

- **Linked add-on groups in the service form don't preview their options** — _ui · low_
  - **Web:** `AddonGroupsSection` lists each linked group's active options inline (name + price + extra minutes) under the group so the admin sees the contents without opening the editor.
  - **App:** `AddonLinksEditor` shows only the group name and a rule/option-count caption per linked group (e.g. "Pick one (optional) · 3 options"); individual options are not previewed inline.
  - **Evidence:** WEB `_reference/Resneo/src/components/dashboard/appointment-services/AddonGroupsSection.tsx` 217–232 (`visibleAddons` list). APP `components/manage/AddonLinksEditor.tsx` 118–125 (name + `groupCaption` only); `groupCaption` 62–70.
  - **Fix:** In `components/manage/AddonLinksEditor.tsx`, optionally render the linked group's active add-ons (`addonsByGroup[group.id]`, filtered to `is_active`) as a compact sub-list under each linked row, matching the web preview. The `addonsByGroup` data is already passed into the component, so the fix is small. Cosmetic.

### Recommended work (ordered)

1. **[High] Surface staff→calendar linkage in app context.** Add `current_staff_id` / managed-calendar ids (e.g. via `useStaffMe` or extend `VenueProvider`). This is the blocking prerequisite for both High gaps below — without it the screen cannot scope create/edit/delete to a non-admin's own calendars.
2. **[High] Unlock non-admin self-service in `manage/services.tsx`.** Relax `isAdmin` gating to the web's `linkedPractitionerIds` model: allow create on controlled calendars, `created_by_staff_id`-scoped edit/delete, and a per-calendar offer toggle (`useToggleCalendarService` → `PUT /api/venue/practitioner-services`) in the `ServiceRow` expanded view. Preserve the documented re-link safeguard (488–492) by scoping toggles to calendars the staff member actually manages.
3. **[High] Add `StaffServiceOverrideSheet` + `useUpdateServiceOverride`.** `PATCH /api/venue/practitioner-service-overrides`, rendering only fields permitted by each service's `staff_may_customize_*` flags, with null-when-equals-base diffing.
4. **[Medium] Embed per-service compliance editor in the service sheet.** Admin-only, edit-mode-only `CollapsibleCard` gated by the compliance feature flag; reuse `lib/queries/useCompliance` types.
5. **[Medium] Extend `ServiceCustomAvailabilityEditor` to author `specific_dates` + `date_range_pattern` rules.** Round-trip plumbing already preserves these kinds — only the editor UI is missing.
6. **[Medium] Add a read-only service availability preview** inside the Custom availability card (fetch `/api/venue` hours + practitioner `working_hours` + `form.customSchedule`), or formally document the omission as an intentional mobile simplification.
7. **[Low] Inline "Add calendar"** beneath the "Offered by" chips (admin only) → `POST /api/venue/practitioners`, auto-select the new id.
8. **[Low] Preview linked group options** inline in `AddonLinksEditor` using the already-passed `addonsByGroup`.
9. **[Low] Auto-scroll / deep-link "Used by"** — `scrollToIndex` to the expanded service and/or accept a route param to pre-expand a service for parity with the web's `?service=` link.


---

## 12. Booking Page / Widget editor

**Parity:** Partial — the branding half of the booking-page editor is at near-full parity, but the web's entire WIDGET/embed half (embed snippet, embed accent colour, downloadable QR) is missing from the app.

The booking-page **branding** editor (`app/(app)/manage/booking-page.tsx`) is a faithful, well-built mobile port of the web `BookingPageEditor`: slug-derived public URL with copy/open, quick palettes, brand + accent hex with preview swatches and a low-contrast warning, the identical 12 font presets (`lib/booking/bookingPageConfig.ts` `BOOKING_FONT_PRESET_KEYS` matches web exactly), announcement banner, logo upload with pan/zoom framing, cover upload with a free-form cropper and full/contained layout, Services/Team/About tab toggles, per-service photos, team profiles, gallery, social links, about text, debounced autosave, and a live preview. The decisive gap is the web's **"Website widget & QR code"** half of the same settings tab (web `WidgetSection`, mounted in `SettingsView.tsx`): the app has no embed/iframe snippet, no `embed_accent_colour`, and no client-side QR generation/download. Secondary gaps are all fidelity/IA differences rather than missing data: the live preview is a hand-built static mock (no real fonts/content, no device toggle), the slug editor lives on a separate Venue-profile screen, font presets render in the UI font rather than their own typeface, and turning the team tab off does not cascade `hidden:true` onto member profiles the way web does. Useful assets already on hand for the fixes: `expo-clipboard`, `expo-sharing`, `react-native-svg`, `expo-font` and `@expo-google-fonts/inter` are all dependencies, and `getWebUrl() + venue.slug` already build `publicUrl` at `booking-page.tsx:298-300`.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Booking-page branding editor (main screen) | `BookingPageEditor.tsx`; `settings/sections/BookingPageSection.tsx` | `app/(app)/manage/booking-page.tsx` | Strong | Same `booking_page_config` PATCH + debounced autosave, admin-gated; matches palettes, brand/accent hex, the 12 fonts, announcement, logo/cover, tabs, social, about, preview. |
| Live preview | `InlineBookingPreview.tsx` (renders real `BookPublicLayout`) | `components/bookingPage/BookingPagePreview.tsx` | Partial | Bespoke static mock; cannot load the 12 Google fonts, renders no real services/team/gallery/about, no device toggle. |
| Public URL panel (copy / open) | `BookingPageEditor.tsx` (bookUrl block) | `booking-page.tsx:375-397` | Full | Copy link + Open page (`expo-clipboard` / `WebBrowser`) plus a "Change web address →" link. Equal or better for mobile. |
| Booking page address (slug) editor | `settings/sections/VenueSlugField.tsx` (addressSlot) | `app/(app)/manage/venue-profile.tsx:700-727`; `lib/queries/useSlugAvailable.ts` | Strong | Validated slug + live availability hint; saved via venue-profile bulk Save instead of co-located autosave. |
| Logo upload + framing | `BookingPageDraggableLogo.tsx` + `BookingPageLogoFramingControls.tsx` | `components/bookingPage/LogoFramingSheet.tsx`; `booking-page.tsx:491-512` | Full | Uploads logo, stores `logo_crop`, dedicated reposition sheet. |
| Cover photo upload + crop + layout | `BookingPageCoverCropper.tsx` | `components/bookingPage/CoverCropperSheet.tsx`; `booking-page.tsx:503-521` | Full | Upload, Full-width vs Contained (`booking-page.tsx:513-521`), free-form `cover_crop_box`. |
| Per-service photos | `BookingPageEditor.tsx` (Services group) | `components/bookingPage/ServicePhotosSheet.tsx`; `booking-page.tsx:528-534` | Strong | Photo per bookable service into `config.service_photos`. |
| Meet-the-team profiles | `BookingPageEditor.tsx` (Team group; `hideAllTeamProfilesOnPage`) | `components/bookingPage/TeamProfilesSheet.tsx`; `booking-page.tsx:537-544` | Strong | Per-member photo/specialties/bio/hidden; tab-off does NOT cascade hide (see Low gap). |
| Photo gallery | `BookingPageEditor.tsx` (gallery group) | `components/bookingPage/GalleryEditorSheet.tsx`; `booking-page.tsx:563-567` | Full | Add (≤12), remove, reorder `config.gallery`. |
| About text + social links | `BookingPageEditor.tsx` (about/social group) | `booking-page.tsx:547-569` | Full | About (max 2000) + Instagram/Facebook/TikTok/X, identical fields/limits. |
| Website embed code / iframe snippet | `settings/widget/WidgetSection.tsx:204-317`; `lib/embed/accent-colour.ts` (`buildVenueEmbedSnippet`) | absent | Missing | No embed surface anywhere in the app (grep excluding `_reference` → only Docs). |
| QR code (generate + download) | `settings/widget/WidgetSection.tsx:145-190, 319-341` | absent (booking page) | Missing | The only app QR (`InviteLinkSheet.tsx`) is server-rendered; no client generator to reuse. |
| Import from a member (collective prefill) | `ImportFromMember.tsx`; `applyImport` | absent | n/a | Collective-only even on web (`BookingPageSection.tsx` passes `importSources: []`); never shows for a standalone venue. Not raised as a gap. |

The branding editor closely tracks the web original: both edit `booking_page_config` through the same PATCH path with debounced autosave and are admin-gated (`booking-page.tsx:330`). The app reproduces quick palettes, brand & accent hex inputs with preview swatch + Reset + low-contrast warning (`booking-page.tsx:429-447`), the identical 12 font presets, announcement, logo/cover upload+remove with cover full/contained layout, the Services/Team/About tab switches, social links and about. The structural differences are IA only: web groups sections with per-section "Show on booking page" toggles and embeds the slug as an `addressSlot` plus a richer inline preview, whereas the app uses Cards and a single "Public page tabs" card and moves the slug to Venue-profile.

The **live preview** (`components/bookingPage/BookingPagePreview.tsx`) is visually polished but materially lower-fidelity than web's. It renders a white "page" card with the announcement bar, cover (full/contained, honouring `coverCropBox`), a circular logo badge (honouring `logoCrop`), the venue name, and a decorative "Book now" CTA. It cannot load the 12 Google fonts, so it approximates serif-vs-sans via `SERIF_PRESETS` (`BookingPagePreview.tsx:40-47`) with a `SYSTEM_SERIF` stand-in (`:50`) and an "Aa · <preset label>" hint (`:139-144`), and it renders none of the real services/team/gallery/about content and offers no device toggle. Web's `InlineBookingPreview` instead renders the real `BookPublicLayout` from a synthetic draft with actual fonts and content plus mobile/desktop + Refresh.

The **slug editor** is functionally complete but lives on the separate Venue-profile screen (`venue-profile.tsx:700-727`): it validates (lowercase/digits/hyphen, max 100), shows a `/book/` prefix line and live availability via `useSlugAvailable`, and saves through the venue-profile bulk Save rather than autosaving inline. The booking-page screen shows only the resulting URL plus a "Change web address →" link (`booking-page.tsx:391-396`).

### Gaps & deficiencies

#### High

- **No website embed / iframe snippet generator** — _function · high_
  - **Web:** Settings → Booking Page renders `WidgetSection`: a copyable `<iframe src="/embed/<slug>?accent=…">` + `/embed/resize.js` snippet, a "What to embed" selector (own venue vs each eligible active collective), and a Copy code button with success/error feedback (`WidgetSection.tsx:204-317`; snippet from `lib/embed/accent-colour.ts` `buildVenueEmbedSnippet`; mounted at `SettingsView.tsx:1580`).
  - **App:** Absent — `app/(app)/manage/booking-page.tsx` has no embed section and there is no embed code anywhere in the app.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/widget/WidgetSection.tsx`; `_reference/Resneo/src/lib/embed/accent-colour.ts` (`buildVenueEmbedSnippet`); `_reference/Resneo/src/lib/embed/widget-frame.ts` (`EMBED_IFRAME_DEFAULT_HEIGHT_PX`). App: grep for `embed_accent_colour|buildVenueEmbedSnippet|EMBED_IFRAME|reserveni-widget|resize.js` excluding `_reference` returns only Docs. Confirmed absent — it is a whole web capability with zero app equivalent (a share/distribution tool rather than a core booking flow).
  - **Fix:** Add a "Website embed" Card to `app/(app)/manage/booking-page.tsx` (or a new `components/bookingPage/EmbedCodeCard.tsx`). Port `buildVenueEmbedSnippet` + `EMBED_IFRAME_DEFAULT_HEIGHT_PX` into a pure-TS `lib/embed/embedSnippet.ts` (no DOM). Build the snippet from `getWebUrl() + venue.slug` (already used for `publicUrl` at `booking-page.tsx:298-300`) plus the embed accent colour; show it in a read-only monospace block with a "Copy code" button using `expo-clipboard` (already imported) + a toast. Optionally add the collective target selector by reusing `lib/queries/useCollectives.ts`.

#### Medium

- **No embed accent colour field (`embed_accent_colour`)** — _function · medium_
  - **Web:** `WidgetSection` has a dedicated "Accent colour" picker (separate from page brand colours) that normalises to 6-hex (`normalizeEmbedAccentHex`), autosaves via PATCH `/api/venue { embed_accent_colour }`, and feeds the embed snippet's `?accent=` (`WidgetSection.tsx:76-99, 236-292`; seeded from `venue.embed_accent_colour` at `SettingsView.tsx:1584`).
  - **App:** Absent — no embed accent colour field and no `embed_accent_colour` anywhere in app code.
  - **Evidence:** Web `WidgetSection.tsx:76-99` (`persistAccent` → PATCH `/api/venue`); `_reference/Resneo/src/lib/embed/accent-colour.ts` `normalizeEmbedAccentHex`. App: grep for `embed_accent_colour` excluding `_reference` returns only Docs. Confirmed absent (depends on the embed card existing).
  - **Fix:** When adding the embed card, include a hex colour field (reuse the `ColourField` helper at `app/(app)/manage/booking-page.tsx:605-654`) bound to a new venue field. Persist via the existing `useUpdateVenue` hook (`lib/queries/useVenueSettings`, already imported) with `{ embed_accent_colour }`, mirroring `WidgetSection`'s normalise-and-save and debouncing like the existing config autosave. Add `embed_accent_colour` to the venue type in `types/`.

- **No QR code generation or download** — _function · medium_
  - **Web:** `WidgetSection` renders a client-side QR (`QRCode.toDataURL`) for the booking-page URL and a "Download QR code" button that composes a branded PNG (QR + venue name) on a canvas (`WidgetSection.tsx:145-190, 319-341`).
  - **App:** Absent for the booking page. The app does render QR images elsewhere (`components/linked/InviteLinkSheet.tsx`), but those come from a server-rendered data URL (`lib/queries/useLinkedVenues.ts`) — there is no in-app QR generator and no booking-page QR.
  - **Evidence:** Web `WidgetSection.tsx:145-190`. App: grep `QRCode|qrcode|qr-code` excluding `_reference` → `InviteLinkSheet.tsx` (server `qrDataUrl` only) + Docs/README; no booking-page QR and no client QR library in `package.json`. Severity is medium (print/marketing convenience — table cards, window stickers — not a booking-flow blocker; staff can still get a QR from the web dashboard).
  - **Fix:** Add a QR Card to `app/(app)/manage/booking-page.tsx` generating the QR from `publicUrl` (`booking-page.tsx:298-300`). `react-native-svg` (15.15.4) is already a dependency, so `react-native-qrcode-svg` renders without a new native dep — verify against https://docs.expo.dev/versions/v56.0.0/ first. For download/share, capture the SVG and hand off to `expo-sharing` (already a dependency); `react-native-view-shot` would need adding. Reuse the existing `venueName` + `publicUrl` already computed in `booking-page.tsx`.

- **Live preview is a static mock, not the real booking page** — _ui · medium_
  - **Web:** `InlineBookingPreview` renders the REAL `BookPublicLayout` from a synthetic draft `VenuePublic`, with actual fonts (loaded stylesheet), real services/team/gallery/about content, and a mobile/desktop device toggle + Refresh button (`InlineBookingPreview.tsx`).
  - **App:** A bespoke static card mirrors the header (announcement, cover honouring crop, circular logo badge honouring framing, name, decorative "Book now" CTA) but cannot load the 12 Google fonts (approximates serif-vs-sans via `SERIF_PRESETS` and shows an "Aa · <preset label>" hint) and renders NO services/team/gallery/about content and no device toggle (`BookingPagePreview.tsx:40-50, 139-144`).
  - **Evidence:** App `components/bookingPage/BookingPagePreview.tsx` (`SERIF_PRESETS` :40-47, `SYSTEM_SERIF` :50, `fontHint` :139-144; no content sections). Web `_reference/Resneo/src/components/booking-page-editor/InlineBookingPreview.tsx` renders `BookPublicLayout`. A preview DOES exist and is polished, so this is a fidelity gap, not a missing feature.
  - **Fix:** Improve fidelity in `components/bookingPage/BookingPagePreview.tsx`: (a) load the actual preset fonts via `expo-font` / `@expo-google-fonts` (`expo-font` and `@expo-google-fonts/inter` are already deps; add the remaining families) so the chosen typeface renders, and (b) optionally render an in-app WebView of the real `/embed/<slug>` page via `getWebUrl()` for a true preview, native-gated. At minimum the existing "Open page" button (`booking-page.tsx:385`) already lets staff verify the real result.

#### Low

- **Team-tab-off does not hide each member profile** — _function · low_
  - **Web:** Turning the Meet-the-team tab off marks every member profile `hidden:true` (`onShowTeamTabChange → hideAllTeamProfilesOnPage`), so re-enabling the tab does not silently re-expose members (`BookingPageEditor.tsx:600-618`).
  - **App:** The app toggles `show_team_tab` independently of per-member hidden flags. `hidden` is set only inside `TeamProfilesSheet` (`:167`); the booking-page screen's `showTeam` switch (`booking-page.tsx:537`) has no cascade, so switching the tab off then on can re-show members who were visible before.
  - **Evidence:** App `app/(app)/manage/booking-page.tsx:537` (SwitchRow for `showTeam`, no cascade onto `team_profiles`); `components/bookingPage/TeamProfilesSheet.tsx:167` (hidden edited only per-member). Web `BookingPageEditor.tsx:600-618`. Confirmed behavioural drift; edge case since the tab toggle still controls overall visibility.
  - **Fix:** In `app/(app)/manage/booking-page.tsx`, when `showTeam` is toggled off, batch-set `hidden:true` on existing `team_profiles` (or replicate web's rule by forcing `hidden` when `!showTeam`) via `useUpdateBookingPageConfig`. Alternatively, document the simpler "tab toggle = master switch" semantics if intentional.

- **Slug editor not co-located with the booking-page editor** — _design · low_
  - **Web:** The `/book/` slug field (prefix affix + live availability) sits INSIDE the booking-page editor as the `addressSlot` and autosaves on its own (`VenueSlugField.tsx`; wired in `BookingPageSection.tsx:165`).
  - **App:** The booking-page screen shows only the resulting URL + a "Change web address →" link; the editable slug lives on the separate Venue-profile screen as part of its bulk Save (`venue-profile.tsx:700-727`).
  - **Evidence:** App `app/(app)/manage/booking-page.tsx:391-396` (link out); `app/(app)/manage/venue-profile.tsx:700-727` (slug Input + live hint via `useSlugAvailable`). Web `BookingPageSection.tsx:165` addressSlot. IA/design difference; functionally complete on venue-profile.
  - **Fix:** Consider adding an inline slug field (with `/book/` prefix + the existing `useSlugAvailable` hint from `lib/queries/useSlugAvailable.ts`) directly to `app/(app)/manage/booking-page.tsx` so URL, branding and preview live on one screen. Keep or link the venue-profile copy to avoid two divergent edit points.

- **Font presets shown as plain chips, not in their actual typeface** — _design · low_
  - **Web:** `BookingFontPresetSelect` renders each option label IN its own preset font (loads the booking font stylesheet) so the admin previews the typeface in the dropdown (`BookingFontPresetSelect.tsx`).
  - **App:** The app shows the 12 presets as identical text chips in the default UI font; only a serif-vs-sans hint distinguishes them in the live preview (`booking-page.tsx:451-474`).
  - **Evidence:** App `app/(app)/manage/booking-page.tsx:451-474` (chip row, no per-preset font). The preset list itself is correct and complete: `lib/booking/bookingPageConfig.ts:46-80` (`BOOKING_FONT_PRESET_KEYS` + labels) matches web exactly. Web `BookingFontPresetSelect.tsx`. The data already matches web; only the rendering differs.
  - **Fix:** Load the preset Google fonts via `expo-font` / `@expo-google-fonts` and apply each font family to its chip label in `booking-page.tsx` (and to the preview heading in `BookingPagePreview.tsx`), so staff see the real typeface before selecting. (`expo-font` + `@expo-google-fonts/inter` already deps; the other preset families would need adding.)

### Investigated — not a gap

- **Import from a member (collective prefill)** — Absent on the app, but scope-limited: web only shows it when `importSources` is non-empty, and the single-venue `BookingPageSection.tsx` passes `importSources: []` (`:212`) — i.e. it is collective-only even on web and never appears for a standalone venue. Low impact; not raised as a standalone gap.

### Recommended work (ordered)

1. **Build the embed snippet card (High).** Add `components/bookingPage/EmbedCodeCard.tsx` mounted in `app/(app)/manage/booking-page.tsx`; port `buildVenueEmbedSnippet` + `EMBED_IFRAME_DEFAULT_HEIGHT_PX` into a pure-TS `lib/embed/embedSnippet.ts`; build from `getWebUrl() + venue.slug` (already at `booking-page.tsx:298-300`); render read-only monospace + a "Copy code" button via `expo-clipboard` + toast.
2. **Add the embed accent colour field (Medium).** In the embed card, reuse the `ColourField` helper (`booking-page.tsx:605-654`); persist `{ embed_accent_colour }` via `useUpdateVenue` (`lib/queries/useVenueSettings`) with normalise-and-save + debounce; add `embed_accent_colour` to the venue type in `types/`; feed it into the snippet's `?accent=`.
3. **Add a QR card with share/download (Medium).** Generate from `publicUrl` using `react-native-qrcode-svg` on top of the existing `react-native-svg` dep (verify against the v56 docs first); capture + hand off to `expo-sharing`; add `react-native-view-shot` if a rasterised PNG is needed.
4. **Raise live-preview fidelity (Medium).** In `components/bookingPage/BookingPagePreview.tsx`, load the preset Google fonts via `expo-font`/`@expo-google-fonts` so the real typeface renders; optionally add a native-gated WebView of `/embed/<slug>` for a true preview and a mobile/desktop toggle.
5. **Render font presets in their own typeface (Low).** Apply each preset's font family to its chip label in `booking-page.tsx:451-474` (and the preview heading) once the fonts from step 4 are loaded.
6. **Cascade team-tab-off to member profiles (Low).** When `showTeam` is toggled off in `booking-page.tsx:537`, batch `hidden:true` onto `team_profiles` via `useUpdateBookingPageConfig` (or document the master-switch semantics if intentional).
7. **Co-locate the slug editor (Low).** Add an inline `/book/` slug field with the `useSlugAvailable` hint to `app/(app)/manage/booking-page.tsx`; link or dedupe the venue-profile copy to avoid two divergent edit points.


---

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


---

## 14. Settings, Account, Venue Profile, Plan/Billing & Team

**Parity:** Strong — nearly every web Settings tab has a full-featured in-app equivalent over Bearer-reachable endpoints; the shortfalls are a missing self-serve venue-deletion danger zone, an unenforced staff seat cap, two absent growth/embed surfaces, and three phone fields that skip E.164 normalization.

This is arguably the best-covered domain in the app. The web ships a single tabbed Settings page (Profile / Business hours / Booking Settings / Booking Page / Plan / Payments / Communications / Compliance / Staff / Reports / Refer & Earn / Linked Accounts); the app reorganises this into a searchable "More" hub (`app/(app)/(tabs)/settings.tsx`) that routes each concern to a dedicated `/manage/*` screen, role-gating admin-only rows via `useStaffMe`. Personal account, venue profile, plan & billing, Stripe Connect/Portal, team management, and booking settings all have full equivalents — several with app-side UX improvements (a searchable IANA timezone picker, live usage meters, a Portal fallback). The notable absences are a "Delete this venue" flow, plan-seat enforcement on invites, a Refer & Earn surface, and an in-app booking-widget/QR embed. Three settings phone fields also save with only `.trim()` despite a normalizer already living at `lib/phone/normalize.ts` (wired only into the booking wizard).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Settings hub / index | `settings/SettingsView.tsx` (12-tab TabBar) | `app/(app)/(tabs)/settings.tsx` (searchable "More" hub) | Strong | Covers almost all web tabs as `/manage/*` routes + app-only items; only web tab with no destination is Refer & Earn |
| Personal account & security | `sections/StaffPersonalSettingsSection.tsx` | `app/(app)/manage/account.tsx`; `components/manage/MyAccountSheet.tsx` | Strong | Same fields & endpoints; app has two parallel surfaces; web normalizes phone to E.164, app does not |
| Venue profile & contact | `sections/VenueProfileSection.tsx` | `app/(app)/manage/venue-profile.tsx` | Strong | Field-for-field match incl. slug availability check; app's timezone picker is better UX; explicit Save vs web autosave |
| Booking Page (URL, branding, widget/QR) | `sections/BookingPageSection.tsx` + `widget/WidgetSection.tsx` | `app/(app)/manage/booking-page.tsx` | Partial | Slug/URL has parity; web's Website-Widget + QR-code embed section has no app equivalent |
| Plan & subscription | `SettingsView.tsx` PlanSection | `app/(app)/manage/plan.tsx`; `components/plan/{PlanChangeSection,UsageMeter}.tsx` | Strong | Excellent; tier/status/meters/proration all present; web TrialBreakdownBanner + complimentary-access copy not reproduced |
| Billing administration (Stripe Portal) | `openManageBilling()` → `/api/billing/portal-session` | `plan.tsx handleManageBilling()` | Full | Both open the Stripe Customer Portal; app adds a graceful "Open billing on web" fallback |
| Payments / Stripe Connect | `sections/StripeConnectSection.tsx` | `components/plan/StripeConnectCard.tsx` (in `plan.tsx`) | Strong | Connect status + onboarding redirect present; folded into Plan screen; non-admins get web link |
| Team / staff management | `sections/StaffSection.tsx` | `app/(app)/manage/team.tsx`; `components/manage/{InviteStaffSheet,StaffMemberSheet,SessionSettingsSheet}.tsx` | Strong | Invite/role/calendar-assign/reset/resend/remove/session-timeout all match; GAP: no plan seat-cap guard |
| Booking settings (models, login, flags) | `sections/{BookingTypesSection,RequireAccountLoginSection,FeatureFlagsSection}.tsx` | `app/(app)/manage/booking-settings.tsx` | Strong | Active models, require-login, appointments feature flags all mirrored; explicit Save vs web autosave |
| Delete venue (danger zone) | `sections/DeleteVenueSection.tsx` | absent | Missing | No venue-deletion UI or API calls anywhere in the app |
| Refer & Earn (referrals) | `refer-earn` tab → `ReferralsDashboardContent` | absent | Missing | No referrals surface in shipping app code |
| Compliance settings | `sections/ComplianceSettingsSection.tsx` | `app/(app)/manage/compliance.tsx` | Partial | Reachable from hub; depth-of-parity owned by the Compliance-domain auditor |
| Privacy & security (app lock) | none | `settings.tsx` AppLock toggle (`providers/AppLockProvider`) | App-only | Opt-in Face ID / fingerprint lock; intentional native-only feature |
| Sign out | dashboard shell | `settings.tsx` (Sign out row + confirm Sheet) | Full | Confirm-sheet sign-out; functionally equivalent |

**Settings hub.** Web is one tabbed page; the app makes it a searchable hub with a quick-actions grid and grouped inset lists, routing each concern to its own screen. Functionally the navigation covers almost every web tab plus app-only items (Today, Waitlist, Push notifications, Web-dashboard link, biometric app-lock). The only web tab with no app destination is Refer & Earn.

**Personal account & security.** Both edit display name, sign-in email, phone, and password (min 8, confirm) against identical endpoints (`PATCH /api/venue/staff/me`, `POST /api/venue/staff/change-password`). On email change, `account.tsx:139` calls `getSupabase().auth.refreshSession()` so the new claim loads. The app has two surfaces for this same edit (the dedicated screen + `MyAccountSheet` from Team), a slight redundancy. The web phone field uses `PhoneWithCountryField` with E.164 normalization; the app uses a plain phone-pad `Input` with only `.trim()`.

**Venue profile & contact.** App matches every web field: name, 4-part address, phone, email, website (URL validation + domain-only acceptance), debounced slug availability check, no-show grace (10–60), restaurant-only cuisine/price-band/kitchen-email hidden on appointments plans, and logo + cover upload. The app's searchable IANA timezone picker is better UX than the web free-text field. Web autosaves on debounce; the app uses an explicit "Save changes" button (acceptable on mobile). The app casts `no_show_grace_minutes`, `logo_url`, `cover_photo_url`, `cuisine_type`, `price_band`, and `kitchen_email` via a local `VenueBootstrapExtended` interface because `types/venue.ts` lacks them.

**Plan & subscription.** Excellent parity. The app shows tier, status badge, est. next invoice, coupon/discount lines, current period, next-billing/access-until, a calendar usage meter, a live SMS usage meter (`useSmsUsage`) with overage box, a trial countdown banner, and past-due/cancelling/cancelled/expired banners with resume & resubscribe actions. The Change-Appointments-plan card (`PlanChangeSection`) renders live proration previews with inline confirm, mirroring web. The app re-fetches on app-foreground (mirrors web focus/visibility sync). Web-only extras not reproduced: `TrialBreakdownBanner` (referral-bonus trial-day breakdown) and `isFreeAccess`/superuser-complimentary-access messaging.

**Team / staff management.** Near-complete: invite (email/name/role/calendar-ids), per-staff role change, per-staff calendar assignment (All/None with inactive-calendar warning), reset password, resend invite, remove member (with self-protection), and session-timeout config — all matching web endpoints. The app presents these as a list + per-member tabbed sheet vs web's inline icon buttons. The one functional gap is the missing plan-seat cap guard (see below).

### Gaps & deficiencies

#### Critical

- **No self-serve "Delete this venue" danger zone** — _function · critical_
  - **Web:** On Settings → Plan an admin sees a Danger-zone card (`DeleteVenueSection`) to schedule a 30-day venue deletion: type the venue name to confirm, `POST /api/venue/delete-request` schedules it (and cancels the subscription at period end), `GET /api/venue/delete-request` shows the scheduled date, and `POST /api/venue/delete-request/cancel` reverses it before the grace period ends.
  - **App:** Absent — no venue-deletion UI or calls anywhere. A grep for `delete-request` / `deletion_scheduled` / "Delete venue" / `DeleteVenue` across the entire repo (`app/`, `components/`, `lib/`, even `Docs/`) returns zero hits.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/sections/DeleteVenueSection.tsx` (present, 6.6 KB), rendered at `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:1611`. App: no match anywhere.
  - **Fix:** Add `components/manage/DeleteVenueSheet.tsx` (type-to-confirm venue name) surfaced from `app/(app)/manage/plan.tsx` (admin-only, below `StripeConnectCard`), mirroring `DeleteVenueSection`'s three states (loading / scheduled / request-form). Add a new `lib/queries/useVenueDeletion.ts` using `apiFetch` against `GET`+`POST /api/venue/delete-request` and `POST /api/venue/delete-request/cancel` (same Bearer pattern as `lib/queries/useBillingStatus.ts`). Reuse the inline two-step confirm pattern from `components/manage/StaffMemberSheet.tsx` rather than `Alert.alert`.

#### High

- **Staff invite ignores the plan seat cap** — _function · high_
  - **Web:** `StaffSection` computes `staffCap = planStaffLimit(pricingTier)` (Light=1, Plus=5, Pro=∞). When `staff.length >= cap` it hides "Add User" and shows an amber upgrade nudge linking to Settings → Plan, preventing an over-limit invite.
  - **App:** `team.tsx` always renders the invite FAB for admins and `InviteStaffSheet` never checks the cap, so an admin can fill in and submit an invite the server rejects — discovered only via a raw API-error toast.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/sections/StaffSection.tsx:6` (import `planStaffLimit`), `:114-115` (`staffCap`/`staffPlanLimitReached`), `:576-596` (hidden Add User + banner); `_reference/Resneo/src/lib/plan-limits.ts` present. App `app/(app)/manage/team.tsx:234` (FAB rendered on `isAdmin` alone); `components/manage/InviteStaffSheet.tsx` (no cap logic).
  - **Fix:** Add `planStaffLimit()` to `components/plan/planConstants.ts` (light→1, plus→5, appointments→∞, mirroring `_reference/Resneo/src/lib/plan-limits.ts`). In `app/(app)/manage/team.tsx` compute `staffPlanLimitReached` from `members.length` vs the cap (`venue.pricing_tier` from `useVenueContext`), hide the FAB when reached, and render an upgrade nudge card (link to `/manage/plan`) like the web amber banner.

#### Medium

- **Refer & Earn (referrals) surface entirely missing** — _function · medium_
  - **Web:** Admins get a Refer & Earn tab (`ReferralsDashboardContent`) to share a referral code and track earned subscription credit when referred venues subscribe; gated by `referralProgrammeEnabled()`.
  - **App:** Absent — no referrals screen or navigation entry in shipping code.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:1664-1669` + `../referrals/ReferralsDashboardContent`. App: grep `referral` returns only `Docs/*` (no `app/components/lib` code).
  - **Fix:** If in scope, add `app/(app)/referrals.tsx` backed by a `useReferralsDashboard` hook (GET the same endpoint `loadReferralsDashboardForVenue` uses) and an admin-gated "Refer & Earn" destination in `app/(app)/(tabs)/settings.tsx`'s destinations list. Otherwise document as an intentional exclusion.

- **No in-app booking-widget / QR-code embed** — _function · medium_
  - **Web:** The Booking Page tab includes `WidgetSection`: a copyable `<iframe>` embed snippet, an embed accent-colour control, and a downloadable QR code that opens the public booking page.
  - **App:** The venue-profile screen links to `/manage/booking-page` for branding but exposes no widget snippet, accent-colour control, or QR download. Grep for `WidgetSection`/`iframe`/`qrcode`/`embed_accent` in app code finds nothing relevant (the only iframe/QR-adjacent hit is `components/linked/InviteLinkSheet.tsx`, an unrelated linked-venue flow).
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/widget/WidgetSection.tsx` (present, 13.6 KB), rendered at `SettingsView.tsx:1580`. App `app/(app)/manage/venue-profile.tsx:848-855` only offers "Edit booking page branding".
  - **Fix:** Add a "Share & embed" card to `app/(app)/manage/booking-page.tsx`: a copy-to-clipboard iframe snippet (`expo-clipboard`), an accent-colour field PATCHing `venues.embed_accent_colour` via `useUpdateVenue` (`lib/queries/useVenueSettings.ts`), and a QR generator (e.g. `react-native-qrcode-svg`) plus a share/save action. Mirror `WidgetSection`'s snippet format and `publicBaseUrl` handling.

- **Phone fields not normalized to E.164 (no country picker)** — _function · medium_
  - **Web:** Both `StaffPersonalSettingsSection` and `VenueProfileSection` use `PhoneWithCountryField` + `normalizeToE164(value, 'GB')`; a non-normalizable number is rejected client-side and the saved value is canonical E.164.
  - **App:** `account.tsx`, `MyAccountSheet.tsx`, and `venue-profile.tsx` send phone after only `.trim()` — no normalization, no validation, no country selector — so a national-format number can be saved and may break SMS. A best-effort normalizer **already exists** at `lib/phone/normalize.ts` (`normalizePhone`), but it is imported ONLY by the booking-wizard flows (`ResourceBookingFlow`/`EventBookingFlow`/`ClassBookingFlow`/`ConfirmStep`), never these three settings surfaces.
  - **Evidence:** Web `_reference/Resneo/src/lib/phone/e164.ts` present; `StaffPersonalSettingsSection.tsx` + `VenueProfileSection.tsx` use `normalizeToE164`. App `app/(app)/manage/account.tsx:128`, `components/manage/MyAccountSheet.tsx:80-81`, `app/(app)/manage/venue-profile.tsx:452` all do plain `.trim()`; `lib/phone/normalize.ts:1-10` docstring confirms it is the booking-wizard normaliser; grep confirms `normalizePhone` / `lib/phone` is not imported in `app/(app)/manage/` or `components/manage/`.
  - **Fix:** Reuse the existing `lib/phone/normalize.ts normalizePhone()` (or port the fuller `_reference/Resneo/src/lib/phone/e164.ts`). Either build a `PhoneInput` primitive (country code + normalize-on-blur) or normalize+validate inside the three save handlers (`account.tsx buildProfilePatch`, `MyAccountSheet handleSaveProfile`, `venue-profile.tsx handleSave`), surfacing an inline error like the web.

#### Low

- **Trial-breakdown detail and complimentary-access messaging absent on Plan screen** — _content · low_
  - **Web:** `PlanSection` renders `TrialBreakdownBanner` (standard signup trial days + referral-bonus days = total, first-charge date) and special `isSuperuserFreeBillingAccess` copy ("complimentary ResNeo access", no charges) when applicable.
  - **App:** Shows only a generic "Free trial — N days remaining (ends …)" banner with no complimentary/free-access branch.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:34,374,715-727` (`isSuperuserFreeBillingAccess` + complimentary copy). App `app/(app)/manage/plan.tsx:401-406` (single generic trial banner); `lib/queries/useBillingStatus.ts` has no `billing_access_source` / trial-breakdown fields.
  - **Fix:** Extend `lib/queries/useBillingStatus.ts BillingStatus` with `billing_access_source` and (if available) trial-breakdown fields, then in `app/(app)/manage/plan.tsx` add a referral/standard trial-days breakdown line and a complimentary-access branch mirroring web copy. Affects a minority of venues.

- **Two parallel personal-account surfaces risk drift** — _design · low_
  - **Web:** One canonical `StaffPersonalSettingsSection` for personal profile + password.
  - **App:** Ships two implementations of the same edit (name/email/phone/password): standalone `app/(app)/manage/account.tsx` (raw `apiFetch` + `getSupabase().auth.refreshSession`) and `components/manage/MyAccountSheet.tsx` (`useTeamMutations` hooks). They have slightly different validation/messaging and can diverge.
  - **Evidence:** App `app/(app)/manage/account.tsx:74,103,139` (`apiFetch` to `/api/venue/staff/me` + change-password, `getSupabase().auth.refreshSession`) vs `components/manage/MyAccountSheet.tsx:76-81` (`usePatchStaffMe` hook). Duplicated profile+password logic across the two files.
  - **Fix:** Pick one source of truth: have `account.tsx` render `MyAccountSheet`'s underlying logic, or extract a shared `useStaffAccountForm` hook in `lib/queries/` so both the dedicated screen and the Team sheet share validation, the email-change session refresh, and copy.

### Investigated — not a gap

None — all eight candidate gaps held up against the app codebase after verification.

### Recommended work (ordered)

1. **Build the venue-deletion danger zone** (critical). New `components/manage/DeleteVenueSheet.tsx` + `lib/queries/useVenueDeletion.ts` (`apiFetch` against `/api/venue/delete-request` GET/POST and `.../cancel`), surfaced admin-only in `app/(app)/manage/plan.tsx` below `StripeConnectCard`, with the three states (loading / scheduled / request-form) and a type-to-confirm step.
2. **Enforce the staff seat cap on invites** (high). Add `planStaffLimit()` to `components/plan/planConstants.ts`; in `app/(app)/manage/team.tsx` compute `staffPlanLimitReached` from `members.length` vs the cap (`venue.pricing_tier`), hide the invite FAB (`team.tsx:234`) when reached, and show an upgrade nudge linking to `/manage/plan`.
3. **Wire E.164 normalization into the three settings phone fields** (medium). Import the existing `lib/phone/normalize.ts normalizePhone()` into `account.tsx` (`buildProfilePatch`), `MyAccountSheet.tsx` (`handleSaveProfile`), and `venue-profile.tsx` (`handleSave`) — ideally behind a shared `PhoneInput` primitive with normalize-on-blur and inline validation.
4. **Add the booking-widget / QR embed surface** (medium). New "Share & embed" card in `app/(app)/manage/booking-page.tsx`: copy-to-clipboard iframe snippet (`expo-clipboard`), `embed_accent_colour` field via `useUpdateVenue`, and a QR generator with share/save — mirroring `WidgetSection`.
5. **Decide on Refer & Earn** (medium). Either build `app/(app)/referrals.tsx` + `useReferralsDashboard` and add an admin-gated destination in `settings.tsx`, or formally document referrals as an intentional app exclusion.
6. **Consolidate the two personal-account surfaces** (low). Extract a shared `useStaffAccountForm` hook so `account.tsx` and `MyAccountSheet.tsx` share validation, the email-change session refresh, and copy.
7. **Enrich the Plan trial messaging** (low). Add `billing_access_source` / trial-breakdown fields to `useBillingStatus.ts` and render a trial-days breakdown line + complimentary-access branch in `plan.tsx`.


---

## 15. Communications, Email Templates & Notifications

**Parity:** Strong — the app ports the full guest-messaging policy surface, previews, manual messaging, SMS usage and the notification feed, and is ahead of the web on mobile-native push prefs and the per-booking message log; the only true gaps are the venue-level owner booking-alert email and the feed's lack of realtime/polling.

This domain is in good shape. Communications policy cards, the email/SMS preview, manual guest/client messaging, SMS-usage itemisation, the in-app notification feed and linked-venue email preferences are all at or near parity, and two app-only surfaces (per-user push notification preferences and the inline per-booking message log) put the app ahead of the web. Three real gaps survive verification: the web's venue-level "New booking alert" owner-email toggle + recipient field has no app UI (high), the notification feed has no realtime/polling refresh that the web bell has (medium), and there is no communication-lane switcher so the restaurant `table` lane is unreachable (low, intentional for an appointments-first product). Two earlier-reported gaps were verified as false positives and are listed under "Investigated — not a gap": the SMS overage banner is already implemented, and the "merge-variable affordance" item is not a parity gap (both products are append-only with no merge tokens). Neither product supports true template body/subject editing, so template-editing depth is shallow on both sides and is not counted as a gap.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Guest communications / message policies | `CommunicationTemplatesSection.tsx` | `app/(app)/manage/communications.tsx` | Strong | All 12 message cards + waitlist invite ported; app uses a sticky Save bar vs web auto-save; no lane switcher; venue owner-email toggle missing. |
| Communication preview (email HTML / SMS) | `CommunicationTemplatesSection.tsx` (PreviewModal) | `components/manage/CommunicationPreviewSheet.tsx` + `usePreviewCommunication` | Full | Both POST `/api/venue/communication-preview` and render email HTML / SMS text with loading + error states. |
| New booking alert (owner email) | `CommunicationTemplatesSection.tsx` (Business notifications) | absent | Missing | Venue-level email toggle + recipient field (`owner_booking_notification_*`, PATCH `/api/venue`); no app equivalent. |
| Manual message to guest (booking detail) | `booking-detail-communications.ts` + `/api/venue/bookings/[id]/message` | `BookingDetailContent.tsx` (MessageGuestCompose) + `GuestMessageSheet.tsx` | Full | Inline email/SMS/both compose + sent-log; the per-booking log is not rendered in any web component (app slightly ahead). |
| Manual message to client (client detail) | guest contact detail + `/api/venue/guests/[id]/message` | `app/(app)/client/[id].tsx` + `GuestMessageSheet.tsx` | Full | Custom email/SMS/both via POST `/api/venue/guests/[guestId]/message`, channel auto-selected, partial-failure toasts. |
| SMS usage / credits | `SmsUsageBanner.tsx` + Plan SMS tile | `app/(app)/manage/plan.tsx` (`useSmsUsage`) | Strong | App itemises overage (`plan.tsx:542-550`); only delta is the web's dedicated Reports-tab card (app has no Reports tab). |
| In-app notifications feed | `NotificationBell.tsx` | `app/(app)/notifications.tsx` + `useNotifications.ts` | Strong | Day-grouped feed, unread dots, mark-read, deep-link-on-tap all match; app lacks the web's 60s poll + realtime subscription. |
| Linked-venue notification email prefs | `NotificationPrefsCard.tsx` | `app/(app)/notifications.tsx` (EmailPrefsSection) + `useLinkedNotificationPrefs` | Full | Admin-only per-category email opt-in via GET/PATCH `/api/venue/notifications/preferences` with optimistic update. |
| Per-user push notification preferences | no staff UI (lib only) | `app/(app)/manage/notification-preferences.tsx` + `useNotificationPreferences.ts` | App-only | OS-permission flow, master toggle, per-event toggles, booking scope + quiet-hours → `user_profiles.notification_preferences`. App ahead. |
| Support / contact us | `dashboard/support/page.tsx` | `app/(app)/support.tsx` | Full | Near-1:1 port: category, optional contact email/phone, subject 200 / message 5000 with counter, POST `/api/venue/support`, help-centre link, support@resneo.com mailto. |
| Email template gallery | `email-templates/page.tsx` | absent | Missing | Intentional exclusion — dev/internal preview gallery gated behind `NODE_ENV!=='production'`, 404s in prod. No app equivalent needed. |

**Guest communications / message policies.** The app ports all 12 message cards (`booking_confirmation` … `custom_message`) plus the feature-flagged (`waitlist_v2`) waitlist invite. Each card matches the web: enable Switch, email/SMS channel chips with the "at least one channel" rule, an hoursBefore/hoursAfter stepper clamped 1–168, and optional email/SMS custom-message inputs with counters and per-channel Preview. The differences are intentional: the app uses an explicit sticky Save bar that batches `PUT /api/venue/communication-policies` for the lane plus a settings mutation for staff alerts (`handleSave`, `communications.tsx:566-579`), whereas the web auto-saves each edit with a 350ms-debounced PUT and a Saving/Saved/error indicator; the app caps custom messages (email 500 / SMS 320) and surfaces the count, while the web shows a raw count with no max. The app additionally exposes a "Staff alerts" card (`communications.tsx:694-731`) — daily schedule / new-booking / cancellation toggles writing `notification_settings.*` — that the web does not render in any UI. The one thing missing relative to the web is the venue-level "New booking alert" owner-email toggle + recipient field (see gaps).

**Communication preview.** Functionally equivalent on both sides — same POST `/api/venue/communication-preview` body `{lane, messageKey, channel, customMessage}`, rendering the returned email HTML (web in a sandboxed iframe, app in `CommunicationPreviewSheet`) or SMS text, with loading and error states.

**SMS usage / credits.** Corrected from the prior pass: the app *does* itemise overage. `plan.tsx:542-550` renders an amber box (`styles.overageBox`) showing `{overage_count} segment(s) beyond your allowance — about £{(overage_amount_pence/100).toFixed(2)}` whenever `overage_count > 0`, mirroring the web `SmsUsageBanner` Overage block. The only residual delta is surface placement: the web also surfaces SMS usage in a dedicated Reports-tab card, and the app has no Reports tab, so the data lives only on the Plan screen.

**In-app notifications feed.** Both read GET `/api/venue/notifications` and POST `/api/venue/notifications/read` (single + mark-all) with optimistic updates, day-grouped lists, unread dots, relative timestamps and deep-link-on-tap. The app's `useNotifications` (`useNotifications.ts:15-29`) is a plain react-query GET — no `refetchInterval`, no realtime — so the feed and the More-tab badge (derived from the same query, `_layout.tsx:159-160`) only update on focus / pull-to-refresh / invalidation (see gaps).

**Per-user push notification preferences.** Genuinely app-only: an OS-permission banner with enable/open-settings flow, a master push toggle, per-event toggles, booking scope (all vs mine) and quiet-hours, persisted to `user_profiles.notification_preferences`. The web backend has the `staff-notification-prefs` library but exposes no staff-facing settings UI, so the app is ahead here.

### Gaps & deficiencies

#### High

- **Web "New booking alert" owner email + recipient address is missing from the app** — _function · high_
  - **Web:** The Communications section ("Business notifications → New booking alert") exposes a venue-level, email-only toggle (`owner_booking_notification_enabled`) and a "Notification email" input (`owner_booking_notification_email`) that defaults to the venue profile email, with inline email validation, saved via PATCH `/api/venue`. This lets the business choose *where* booking-alert emails are delivered. The route accepts both fields (schema lines 48-50, write lines 232-237) and returns them on GET (line 368).
  - **App:** Absent. The app Communications screen has a "Staff alerts" card (`communications.tsx:694-731`) that toggles a different object (`notification_settings.daily_schedule_enabled` / `staff_new_booking_alert` / `staff_cancellation_alert`) and provides no recipient-email control. A staff user cannot set or change the business booking-alert email address from the app. Grep for `owner_booking_notification` across the app (excluding `_reference`) returns zero matches.
  - **Evidence:** `_reference/Resneo/src/app/dashboard/settings/sections/CommunicationTemplatesSection.tsx` (lines 421-479), `_reference/Resneo/src/app/api/venue/route.ts` (lines 48-50, 232-237, 368) vs `app/(app)/manage/communications.tsx:694-731`; `types/venue.ts:64-97` surfaces `email` (line 81) but neither `owner_booking_*` field.
  - **Fix:** Add a "New booking alert" card to `app/(app)/manage/communications.tsx`: a Switch bound to `owner_booking_notification_enabled` and an Input bound to `owner_booking_notification_email` (placeholder = `venue.email`, already on `VenueBootstrap`). Add the two `owner_booking_*` fields to `VenueBootstrap` (`types/venue.ts`) so current values can be read on load — `email` is already present, so only those two need adding — then PATCH them via `/api/venue` (mirror `lib/queries/useVenueProfile`, or fold into the existing `handleSave` flow). Validate the email with the same `/^\S+@\S+\.\S+$/` regex the web uses, and call `refetch` on the VenueProvider after save.

#### Medium

- **Notification feed has no realtime/polling refresh (web has both)** — _performance · medium_
  - **Web:** `NotificationBell` polls `/api/venue/notifications` every 60s (`POLL_MS = 60_000`, line 10; `setInterval` lines 87-91) *and* subscribes to Supabase `postgres_changes` INSERTs on `account_link_notifications` filtered by `venue_id` (lines 96-115), so a new cross-venue notification and the unread badge update within seconds without user action.
  - **App:** `useNotifications` is a plain react-query GET (`useNotifications.ts:15-29`) with no `refetchInterval` and no realtime subscription; the feed and the bottom-tab unread badge (derived from the same query, `_layout.tsx:159-160`) only update on mount, screen focus, pull-to-refresh or react-query's default invalidations. New notifications can sit unseen until the user revisits.
  - **Evidence:** `_reference/Resneo/src/components/linked-accounts/NotificationBell.tsx` (line 10, lines 87-91, lines 96-115) vs `C:/Resneo-app/lib/queries/useNotifications.ts:15-29` and `app/(app)/(tabs)/_layout.tsx:159-160`.
  - **Fix:** Add `refetchInterval: 60_000` and `refetchIntervalInBackground: false` to `useNotifications` in `lib/queries/useNotifications.ts` so the tab badge and feed stay current (matches the web poll). Optionally wire a lightweight Supabase realtime subscription via the realtime client already used by the linked-venue calendars to invalidate `queryKeys.notifications.list(...)` on INSERT.

#### Low

- **No communication-lane switcher; the restaurant `table` lane is unreachable** — _function · low_
  - **Web:** When both lanes apply, `CommunicationTemplatesSection` renders a tablist (lines 201-210, 535-558) to switch between "Table bookings" and "Appointments & other", editing each lane's policy map independently (`availableLanes`/`activeLane`, gated by `showTableLane = isRestaurantCommsTier` and `shouldShowAppointmentsOtherLane`).
  - **App:** The app hard-codes the `appointments_other` lane only: it seeds `lane` from `policiesQuery.data.appointments_other` (`communications.tsx:532`) and PUTs `{ appointments_other: lane }` (line 571). The `table` lane is never shown or editable.
  - **Evidence:** `app/(app)/manage/communications.tsx:532` (`setLane(policiesQuery.data.appointments_other ?? {})`) and `:571` (`updatePolicies.mutateAsync({ appointments_other: lane })`) vs `_reference/Resneo/src/app/dashboard/settings/sections/CommunicationTemplatesSection.tsx` (lines 201-210, 535-558).
  - **Fix:** Intentional for an appointments-first product — the app drops restaurant table reservations everywhere, and the web only shows the table lane for `isRestaurantCommsTier` venues. Keep as-is. If a restaurant/table tier is ever supported in the app, add a Segmented lane switcher above the message cards and key `setLane` / the PUT off the active lane.

### Investigated — not a gap

- **Reports SMS-usage overage banner not available in the app** — FALSE POSITIVE. Already implemented: `app/(app)/manage/plan.tsx:542-550` renders an amber overage box (`styles.overageBox`) showing `{overage_count} segment(s) beyond your allowance — about £{(overage_amount_pence/100).toFixed(2)}` whenever `overage_count > 0`, which is exactly the prior agent's own recommendation and mirrors the web `SmsUsageBanner` Overage block (`_reference/Resneo/src/app/dashboard/reports/SmsUsageBanner.tsx:60-71`). The claim that the app "never itemises overage_count × £" is factually wrong. The only residual delta is surface placement (web also has a Reports-tab card; the app has no Reports tab), which is cosmetic and already noted under the SMS usage screen at Strong parity — not a standalone gap.
- **Custom-message inputs lack merge-variable affordance / guidance** — NOT A PARITY GAP. Both products use the identical append-only model (an optional extra line on top of the standard template) and neither exposes merge tokens — verified in the app (`communications.tsx` ChannelEditor inputs, placeholder "Optional extra line shown with the standard template…") and the web (`CommunicationTemplatesSection` ChannelEditor, same placeholder, no token picker). The app additionally adds character-limit helpers (email 500 / SMS 320 with counters), making it slightly *more* helpful, not worse. There is no respect in which the app does worse than the web, so it does not meet the bar for a gap; a merge-token legend would be an enhancement to both products equally.

### Recommended work (ordered)

1. **Add the venue "New booking alert" card to `app/(app)/manage/communications.tsx`** (High) — Switch for `owner_booking_notification_enabled` + Input for `owner_booking_notification_email` (placeholder `venue.email`), with `/^\S+@\S+\.\S+$/` validation; PATCH via `/api/venue`, then refetch the VenueProvider.
2. **Surface the two owner_booking_* fields on `VenueBootstrap` (`types/venue.ts`)** (High, prerequisite for #1) — add `owner_booking_notification_enabled?: boolean` and `owner_booking_notification_email?: string | null` so current values load on mount; `email` is already present.
3. **Keep the notification feed current** (Medium) — add `refetchInterval: 60_000` and `refetchIntervalInBackground: false` to `useNotifications` in `lib/queries/useNotifications.ts` so the More-tab badge (`_layout.tsx:159-160`) and feed match the web's 60s poll.
4. **(Optional, Medium) Add realtime to the notification feed** — subscribe to Supabase `postgres_changes` INSERTs via the realtime client already used by linked-venue calendars, invalidating `queryKeys.notifications.list(...)` on insert, to match the web bell's seconds-latency updates.
5. **(Deferred, Low) Communication-lane switcher** — only if/when a restaurant/table tier ships in the app: add a Segmented lane switcher above the message cards in `communications.tsx` and key `setLane` / the PUT off the active lane. No action while the app remains appointments-first.


---

## 16. Linked Venues & Collectives

**Parity:** Strong — near-total parity with the web staff dashboard across the full link lifecycle, the entire collectives feature, and grant-gated cross-venue calendars; cross-venue booking *creation* actually exceeds web, and the only remaining gaps are minor view-only/polish items.

This is one of the most complete domains in the app. The full link lifecycle (search/lookup, invite QR, send/accept/reject/accept-with-changes, edit/grant/reduce/propose permissions, pending-change negotiation, unlink, suspended state, and the audit log with action/user/date filters + pagination), the whole collectives feature (create, combined-page config editor with autosave/branding/team-profiles/gallery, catalogue builder with the calendar-assignment matrix, members management, lifecycle), and grant-gated cross-venue calendars (day/week/All + a rich detail sheet) are faithfully reproduced with copy ported largely verbatim. All five candidate gaps were confirmed real (zero false positives), but two prior write-ups had stale premises that are corrected here: the app **already ships** a generic, prop-driven native booking-page preview (`components/bookingPage/BookingPagePreview.tsx`) and native image croppers (`CoverCropperSheet`/`LogoFramingSheet`), all three already wired into the single-venue booking-page editor — so the combined-page editor's missing preview and missing crop framing are cheap *reuse* tasks, not bespoke-tooling builds. What is left is genuinely minor: no audit CSV export, audit date filter is preset-only (no custom from/to), no live preview in the combined-page editor, no logo/cover crop in the combined-page editor, and no dismissible first-run onboarding explainer.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Linked venues hub (list) | `dashboard/settings/.../LinkedAccountsSection.tsx` | `app/(app)/linked-venues/index.tsx` | Strong | Incoming / Active / Sent / Past sections, status badges, Send + Get-invite, eligibility gating, soft link-count warning, admin gate. Web adds a dismissible onboarding card; app uses a plain EmptyState. |
| Linked venue detail | `LinkedAccountsSection.tsx` (ActiveLinkRow + modals) | `app/(app)/linked-venues/[id].tsx` | Full | Dedicated screen vs web's expandable row; every capability present. |
| Send link request | `LinkedAccountsSection.tsx` (SendRequestModal) | `components/linked/LinkRequestSheet.tsx` + `useLinkedVenues.ts` | Strong | Debounced search (≥2 chars, slug-aware, server-capped), slug lookup, invite prefill, GrantPairEditor with zero-way validation. Web combobox adds arrow-key nav; app is tap-only. |
| Get invite link (QR) | `LinkedAccountsSection.tsx` (InviteLinkModal) | `components/linked/InviteLinkSheet.tsx` + `useCreateInvite` | Full | One-time 30-day link + server QR data URL, Copy + native Share, expiry note. |
| Receive invite (verify + prefill) | `LinkedAccountsSection.tsx` (`?invite=` effect) | `components/linked/AcceptInviteSheet.tsx` + `linked-venues/index.tsx` (~124-141) | Strong | Accepts pasted token *and* in-app `?invite=` deep link (guarded), verifies server-side, opens prefilled editor. External tap-to-open deferred on both (needs domain association). |
| Review incoming request | `LinkedAccountsSection.tsx` (ReviewRequestModal) | `components/linked/IncomingRequestSheet.tsx` | Full | Message, grant summary, controller-to-controller notice, Accept / Reject / Accept-with-changes. |
| Edit permissions / grant / reduce / propose | `LinkedAccountsSection.tsx` (EditPermissions + ReduceAccess) | `EditPermissionsSheet.tsx` + `ReduceAccessSheet.tsx` + `lib/linked/grants.ts` | Full | `useGrantAccess` (increase-only), `useReduceAccess` (zero-way→422), `propose_change`; `classifyGrantChange` mirrors web routing + pending-change block. |
| Cross-venue audit log | `components/linked-accounts/LinkedAccountAuditModal.tsx` | `components/linked/LinkAuditView.tsx` + `useLinkedVenueAudit` | Strong | Action filter, acting-user filter, before→after diff (same 5 keys), 50/page pagination. Shortfalls: date filter is preset chips not free From/To; no CSV export. |
| Notification email preferences | `components/linked-accounts/NotificationPrefsCard.tsx` | `LinkedNotificationPrefsCard.tsx` + `useUpdateLinkedNotificationPrefs` | Full | Optimistic update + rollback (`onMutate`/`onError`); same categories/copy and "in-app bell always fires" framing. |
| Collectives list | `components/linked-accounts/VenueCollectivesPanel.tsx` | `app/(app)/collectives/index.tsx` | Full | Create hidden once in a live collective, amber disabled note without a full-mutual link, Host/Member + status pills, member names, View combined page (openWeb → `/book/c/<slug>`), Accept/Decline, Manage, Leave. |
| Collective detail / combined-page manager | `components/linked-accounts/CombinedPageManager.tsx` | `app/(app)/collectives/[id].tsx` (Page/Services/Members) | Strong | Tabbed host manager + non-host read-only explainer. Shortfall: web Page tab embeds BookingPageEditor with a live preview; app's editor has none (though a reusable preview component exists). |
| Combined-page config editor (Page tab) | `CombinedPageManager.tsx` (pageAdapter + BookingPageEditor) | `CombinedPageConfigEditor.tsx` + `CombinedPageTeamProfiles.tsx` + `CombinedPageGallery.tsx` | Strong | Page name, address strategy, brand/accent + palettes/low-contrast warning, font preset, logo+cover upload/remove, cover layout, announcement, about+social, public-tab toggles, team profiles, gallery — all autosaved. Deferred: live preview + logo/cover crop (both reusable from the single-venue editor). |
| Collective catalogue builder (Services & calendars) | `CombinedPageManager.tsx` (HostCatalogue/VenueServicesPicker/CalendarAssignment) | `CollectiveCatalogueBuilder.tsx` + `useCatalogueAction` | Full | Per-venue picker with "On page" de-dup, inline rename, archive, custom offering, calendar-assignment matrix (`add_provider`). Copy ported verbatim. |
| Collective members panel | `CombinedPageManager.tsx` (MembersSection) | `CollectiveMembersPanel.tsx` | Full | Host/invited markers, Make host (confirm), Remove (confirm), invite eligible non-member, Dissolve (confirm). |
| Create collective | `VenueCollectivesPanel.tsx` (CreateCollectiveModal) | `CreateCollectiveSheet.tsx` + `useSlugAvailable`/`useCreateCollective` | Full | Name, debounced slug-availability (`/book/c/<slug>`), eligible-venue invite checkboxes, explainer copy. |
| Cross-venue calendar (dedicated + Calendar tab) | `LinkedCalendarView.tsx` + day-sheet/practitioner-calendar/bookings | `linked-venues/calendar.tsx` + `LinkedVenueCalendarGrid.tsx` + `LinkedVenueWeekGrid.tsx` + `(tabs)/index.tsx` | Strong | Grant-gated day grids (busy overlays for time_only, lock for read-only, draggable for editable), week grids, side-by-side "All" columns, dedicated screen with date stepper + now-line. Web's list-per-practitioner page is subsumed by the grid views. |
| Cross-venue booking detail / edit / create | `LinkedCalendarView.tsx` (detail/edit/create modals) | `LinkedBookingDetailSheet.tsx` + `app/(app)/booking/new.tsx` (ownerVenueId) | Full | Rich grant-gated detail sheet (identity hero, at-a-glance, contact quick-actions, guest+internal notes, inline status/reschedule/note/cancel) with `viewed_booking` ping. App advantage: New booking routes to the full multi-model wizard scoped to the linked owner venue, vs web's appointment-only create. |
| Admin incoming-requests banner | `LinkedAccountBanner.tsx` + `NotificationBell.tsx` | `components/ui/LinkedVenueBanner.tsx` + `useIncomingLinks` | Strong | Admin nudge driven by `/account-links/incoming` (gated `enabled:isAdmin` to avoid a 403). Web also has a dedicated NotificationBell dropdown; the app surfaces this via its general notifications screen. |
| Public combined booking page (`/book/c/[slug]`) | `app/book/c/[slug]/collective-page-view.tsx` | `app/(app)/collectives/index.tsx` (openWeb, ~58-61) | Missing | Intentional scope exclusion — the public page is a customer surface; the staff app links out via WebBrowser. Listed for completeness. |

The **linked venues hub** and **detail** screens split the lifecycle the web folds into one expandable row into a list + dedicated detail route, which is the right mobile shape; functionally nothing is lost. **Send request** verified hooks: debounced `useVenueSearch`/`useVenueLookup`, invite prefill, and a `GrantPairEditor` for both directions with a zero-way guard. The **audit log** reproduces the action filter, acting-user filter, before→after summary over the same five keys (`booking_date`, `booking_time`, `status`, `practitioner_id`, `appointment_service_id` — `LinkAuditView.tsx:61`), and 50/page pagination; its two shortfalls are detailed below. The **combined-page editor** implements every field with debounced autosave via `useUpdateCollective` (config merged key-by-key); only the live preview and crop framing are deferred, both of which the app can satisfy by reusing existing components. The **cross-venue booking create** path is an app-only advantage: it routes into the full multi-model wizard (Appointments/Class/Event/Resource) scoped to the linked owner venue, where the web modal only creates appointments.

### Gaps & deficiencies

#### Medium

- **No live booking-page preview in the combined-page editor** — _function · medium_
  - **Web:** The host's combined-page manager embeds the full `BookingPageEditor`, which renders a live preview of the public `/book/c/<slug>` page from the draft config via `pageAdapter.buildPreviewVenue` (`collectiveSettingsToPreviewPublic`), so the host sees branding/cover/services/team exactly as customers will before publishing.
  - **App:** `CombinedPageConfigEditor.tsx` implements every field (branding, address, logo/cover, announcement, about/social, tabs, team profiles, gallery) with debounced autosave, but renders no preview — the only feedback is small colour-swatch previews (`COLOUR_SWATCHES`, lines 39-42). The host must open the live page in a browser (the "View combined booking page" link-out on `collectives/index.tsx`) to see the effect. Crucially, the app **already** owns a generic, prop-driven native preview, `components/bookingPage/BookingPagePreview.tsx`, that the single-venue editor renders at the top of its form (`app/(app)/manage/booking-page.tsx:8`, `:362`).
  - **Evidence:** WEB `_reference/Resneo/src/components/linked-accounts/CombinedPageManager.tsx` (BookingPageEditor + buildPreviewVenue). APP `components/linked/CombinedPageConfigEditor.tsx` (no preview). Reusable preview at `components/bookingPage/BookingPagePreview.tsx:18-31` — `BookingPagePreviewProps` takes `venueName`/`logoUrl`/`coverUrl`/`coverFullWidth`/`coverCropBox`/`logoCrop`/`primary`/`accent`/`fontPreset`/`announcement`, all config values with no venue-specific entity.
  - **Fix:** Render `BookingPagePreview` above the form in `CombinedPageConfigEditor`, fed from the editor's current state + `assembleConfig()` output (`venueName=name`, `primary=normalizedPrimary`, `accent=normalizedAccent`, `fontPreset`, `announcement`, `logoUrl`, `coverUrl`, `coverFullWidth`, and `null` crop boxes until crop framing lands). This is a wiring task, not new tooling. Cheaper fallback: add a "Preview combined page" button to `collectives/[id].tsx` Page tab reusing the `openWeb` helper.

#### Low

- **Audit date filtering is preset-only (no custom from/to range)** — _function · low_
  - **Web:** The audit modal exposes free From and To date inputs (`type="date"`), so an admin can scope the log to any arbitrary window with both bounds.
  - **App:** `LinkAuditView` offers only fixed preset chips (All time / 7 / 30 / 90 days) mapped to a `from` filter via `isoDaysAgo` (`RANGE_OPTIONS`, lines 30-35); there is no `to` bound and no arbitrary start date.
  - **Evidence:** WEB `_reference/Resneo/src/components/linked-accounts/LinkedAccountAuditModal.tsx` (fromDate/toDate state ~lines 80-81, date inputs ~lines 155-172). APP `components/linked/LinkAuditView.tsx:30-35` (presets; `from` derived at `:115-118`, `to` never set in the query `:120-126`). The `useLinkedVenueAudit` hook (`lib/queries/useLinkedVenues.ts`) **already** accepts both `from` and `to` and forwards them.
  - **Fix:** The hook already plumbs both bounds. Add an optional custom-range row to `LinkAuditView` using the app's `DatePickerField` for both bounds (falling back to the presets) to reach full filter parity. Low effort.

- **Audit log cannot be exported to CSV** — _function · low_
  - **Web:** `LinkedAccountAuditModal` has an "Export CSV" button (`exportCsv`) that opens `/api/venue/account-links/<id>/audit?format=csv&<filters>` in a new tab, letting an admin download the full filtered cross-venue audit trail for compliance.
  - **App:** `LinkAuditView.tsx` renders the same filtered, paginated log but has no export action (header comment "no CSV; mobile is view-only, §11" at line 100).
  - **Evidence:** WEB `_reference/Resneo/src/components/linked-accounts/LinkedAccountAuditModal.tsx` (exportCsv ~line 127, "Export CSV" button ~lines 189-191). APP `components/linked/LinkAuditView.tsx:100` (no export anywhere in file).
  - **Fix:** Optional. If desired, add a "Share audit (CSV)" button in `LinkAuditView` that fetches the same endpoint with `format=csv` via `apiFetch` (Bearer), writes the body to a temp file with `expo-file-system`, and opens the OS share sheet via `expo-sharing`. Otherwise keep as a deliberate exclusion — the on-screen filtered log covers the day-to-day need.

- **Logo/cover crop framing not editable for the combined page** — _function · low_
  - **Web:** The web `BookingPageEditor` lets the host set crop boxes for the logo and cover (`logo_crop` / `cover_crop_box`) so images frame correctly on the public page; surfaced through `CombinedPageManager`'s embedded editor.
  - **App:** `CombinedPageConfigEditor.tsx` uploads and removes logo/cover but cannot adjust crop framing. Its header comment (lines 98-100) claims this "needs a bespoke native image cropper with no equivalent yet" — that premise is **out of date**: the app already ships native croppers, `components/bookingPage/CoverCropperSheet.tsx` and `components/bookingPage/LogoFramingSheet.tsx`, which the single-venue editor already uses (`app/(app)/manage/booking-page.tsx:9` & `:11`; persists `logo_crop`/`cover_crop_box`).
  - **Evidence:** WEB `_reference/Resneo/src/components/booking-page-editor/BookingPageEditor.tsx` (`logo_crop` / `cover_crop_box`). APP missing in `components/linked/CombinedPageConfigEditor.tsx` (only `Image` + upload/remove). Existing croppers wired into the single-venue editor: `components/bookingPage/CoverCropperSheet.tsx` (`manage/booking-page.tsx:591`), `components/bookingPage/LogoFramingSheet.tsx` (`manage/booking-page.tsx:581`).
  - **Fix:** Reuse `CoverCropperSheet` + `LogoFramingSheet` in `CombinedPageConfigEditor` exactly as `manage/booking-page.tsx` does, and include `logo_crop`/`cover_crop_box` in the assembled `bookingPageConfig` payload (server already accepts these keys for the single-venue page). Also update the now-incorrect header comment at lines 98-100. Low-effort reuse, not a deferral.

- **No dismissible first-run onboarding explainer for linked accounts** — _ui · low_
  - **Web:** When a venue has zero links, the web shows a rich, dismissible gradient onboarding card explaining the data-sharing model with three bullets (you stay sole owner — linking shares access not data; you choose per-direction what each venue can see/do down to specific calendars; either venue can reduce access or unlink anytime) and a "Send your first link request" CTA, remembered via `localStorage` (`reserveni.linkedAccountsOnboardingDismissed`).
  - **App:** `app/(app)/linked-venues/index.tsx` shows a plain `EmptyState` ("No linked venues yet" + a one-line message) plus Send/Get-invite buttons in the `links.length===0` branch (line 325) — informative but without the educational bullets or dismiss-and-remember behaviour.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/sections/LinkedAccountsSection.tsx` (onboarding state ~lines 155-174; card with 3 bullets ~lines 356-407). APP `app/(app)/linked-venues/index.tsx:329-339` (EmptyState in the empty branch).
  - **Fix:** Enhance the empty-state branch in `app/(app)/linked-venues/index.tsx` with the three explainer bullets verbatim from the web card (ownership stays yours / per-direction control down to specific calendars / reduce or unlink anytime). Persistence is optional on mobile since the card only shows when there are zero links.

### Investigated — not a gap

- **Public combined booking page (`/book/c/[slug]`)** — not a deficiency. The public-facing combined page is a customer surface; a staff app correctly links out to it via `WebBrowser` (`openWeb` in `app/(app)/collectives/index.tsx`, ~lines 58-61). Listed in the screen table for completeness, not counted as a gap.

### Recommended work (ordered)

1. **Wire `BookingPagePreview` into `CombinedPageConfigEditor.tsx`** (medium) — render the existing prop-driven preview above the form, fed from current state + `assembleConfig()`. Closes the largest remaining gap with zero new components.
2. **Reuse `CoverCropperSheet` + `LogoFramingSheet` in `CombinedPageConfigEditor.tsx`** (low) — mirror `manage/booking-page.tsx`, add `logo_crop`/`cover_crop_box` to the assembled payload, and fix the stale "no equivalent yet" comment at lines 98-100. Pairs naturally with item 1 (crop boxes then feed the preview).
3. **Add a custom from/to date row to `LinkAuditView.tsx`** (low) — the `useLinkedVenueAudit` hook already accepts both bounds; add two `DatePickerField`s alongside the preset chips to reach full audit-filter parity.
4. **Add the 3-bullet onboarding explainer to the empty-state branch of `linked-venues/index.tsx`** (low) — port the web card's bullets verbatim; dismiss-persistence optional.
5. **Add an optional "Share audit (CSV)" button to `LinkAuditView.tsx`** (low) — fetch `…/audit?format=csv` via `apiFetch`, write with `expo-file-system`, share via `expo-sharing`; or keep as a documented mobile exclusion.


---

## 17. Auth, Onboarding & Support

**Parity:** Partial — sign-in, password reset and support are at strong/full parity, but the app has **no first-run onboarding at all** (the web ships a ~4,648-line wizard plus a server-enforced dashboard gate), and three secondary auth flows (set-password, `claim_user_account` backfill, granular callback errors) are missing or coarser.

This domain splits cleanly. The **authentication surface a returning staff member touches** is solid: a Password/Magic-Link toggle, a forgot-password sub-view with the web's "Check your inbox" copy, a deep-link callback that exchanges PKCE codes and OTP token hashes, and a clean session-expiry path. **Support** is effectively identical to the web (same payload, same fields, same success copy). What is absent is the entire **provisioning/first-run story**: there is no onboarding wizard, no `onboarding_completed` gate, and no set-password step for invited staff or password-reset recipients — the callback just signs them in and drops them on the Calendar. The post-onboarding `SetupChecklistCard` exists but is a hardcoded 5-step stub that ignores the model-aware/secondary-catalog/progress-bar logic the web computes. Business-type/plan selection and the dual-role destination chooser are intentionally web-only (the app targets existing staff, never new-venue acquisition).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Sign in (password / magic link) | `login/login-form.tsx`, `login/page.tsx` | `app/(auth)/sign-in.tsx`, `providers/AuthProvider.tsx` | Strong | Password/Magic toggle, both methods, analytics; app has no post-login resolver (`resolve-next`). |
| Forgot / reset password request | `login/login-form.tsx` (handleForgotPasswordSubmit) | `sign-in.tsx:85`, `AuthProvider.tsx:172` | Strong | Same "Check your inbox" copy; app's reset link lands on `/callback` (no set-password form), web's on `/auth/set-password`. |
| Magic-link / deep-link callback | `auth/callback/page.tsx` | `app/(auth)/callback.tsx`, `lib/auth/completeSession.ts`, `lib/auth/params.ts` | Strong | Both exchange code / verify OTP; app hardcodes `router.replace('/')`, skips `claim_user_account` + `resolve-next`. |
| Auth error / expired-link states | `login/AuthCallbackErrorBanner.tsx` | `callback.tsx` (ErrorState), `completeSession.ts` (mapExchangeError), `components/AuthNoticeBridge.tsx` | Partial | App collapses keywords into one string + generic Retry; web has per-reason copy + "Go to login". |
| Set / create password (invited staff & reset) | `auth/set-password/page.tsx` | absent (only later change-password in `account.tsx` / `MyAccountSheet.tsx`) | Missing | No set-password route; invited/reset users are silently signed in. |
| First-run onboarding / setup wizard | `onboarding/page.tsx` (~4,648 lines), `onboarding/layout.tsx`, `onboarding/steps/` | absent | Missing | App has no wizard, welcome, model setup or go-live step. |
| Onboarding gate / dashboard redirect | `dashboard/layout.tsx:124,152-154` (`redirect('/onboarding')`) | `app/(app)/_layout.tsx` (staff gate only) | Missing | App never reads `onboarding_completed`; half-provisioned venues land on tabs. |
| Setup checklist (post-onboarding) | `dashboard/SetupChecklist.tsx`, `lib/venue/compute-setup-status.ts` | `app/(app)/today.tsx:32-110`, `lib/queries/useSetupStatus.ts` | Partial | App hardcodes 5 steps, no per-model/secondary-catalog rows, no progress bar. |
| Business-type / plan / model selection | `signup/business-type/page.tsx`, `signup/booking-models/page.tsx` | absent | Missing | Intentional scope exclusion — no new-venue creation/billing in-app. |
| Choose destination (dual-role) | `auth/choose-destination/page.tsx` | absent | Missing | App is staff-only; chooser out of scope. |
| Support / contact form | `dashboard/support/page.tsx`, `api/venue/support/route.ts` | `app/(app)/support.tsx` | Full | Same category/subject/message/contact fields, same POST, same success copy; app adds haptics + Toast. |
| Staff-required gate | n/a (web silently redirects) | `components/auth/StaffRequired.tsx`, `app/(app)/staff-required.tsx`, `app/(app)/_layout.tsx` | App-only | Mobile equivalent of the web's silent redirect — Try again / Sign out, shows signed-in email. |
| Session handling / expiry | `components/SessionTimeoutGuard.tsx`, `?reason=session_expired` banner | `AuthProvider.tsx` (isExplicitSignOutRef / sessionExpired), `components/AuthNoticeBridge.tsx` | Strong | App distinguishes revocation vs explicit signOut, clears query cache; lacks an explicit idle-timeout guard. |

**Sign in.** `sign-in.tsx` defaults staff to the Password tab (`mode = 'password'`, line 45) with email+password fields routed through `signInWithPassword` (line 52), a Magic-Link mode (`handleMagicLink` → `magic-sent` confirmation view, line 79), and a forgot-password sub-view (`handleForgotPassword`, line 85). On success, `AuthProvider.onAuthStateChange` fires `signInSucceeded` for `SIGNED_IN` (line 102) and the root `Stack.Protected` switches into `(app)`. The structural gap vs web is the absence of a post-login resolver — the web routes through `/api/auth/resolve-next`, which performs the `claim_user_account` backfill, dual-role choose-destination, and set-password gating that the app does not replicate.

**Callback.** `app/(auth)/callback.tsx` delegates to `completeAuthSession` (`lib/auth/completeSession.ts`), which short-circuits on an existing session, exchanges `params.code` via `exchangeCodeForSession`, or verifies `token_hash` for the supported OTP types (`params.ts` `SUPPORTED_OTP_TYPES`: signup/invite/magiclink/recovery/email_change). On success it unconditionally calls `router.replace('/')` (line 37) — no `claim_user_account` RPC and no recovery/invite branch to a set-password screen.

**Setup checklist.** `SetupChecklistCard` (`today.tsx:32`) is admin-gated, reads `useSetupStatus`, is dismissible (`useDismissSetupChecklist`), and hides when complete (line 51) — all matching the web. But its `steps` array is a fixed 5 entries (lines 43-49: profile / availability / booking-page / stripe / first-booking) and it renders only `doneCount/steps.length` (line 62). The `SetupStatus` interface already exposes `booking_model`, `enabled_models`, `active_booking_models`, and `secondary_event/class/resource_catalog_ready` (`useSetupStatus.ts:19-25`), but the card reads none of them.

**Session handling.** `AuthProvider` tracks an unexpected `SIGNED_OUT` (refresh-token revoke/expiry) versus an explicit `signOut()` via `isExplicitSignOutRef` (lines 56, 107-110), raising a single `sessionExpired` flag consumed by `AuthNoticeBridge`. `signOut` clears the query cache (`queryClient.clear()`, line 212) so a subsequent user never transiently sees stale venue data.

### Gaps & deficiencies

#### High

- **No in-app onboarding / first-run setup wizard** — _function · high_
  - **Web:** `/onboarding` is a ~4,648-line multi-step wizard (Welcome → Business details → Opening hours → Calendars/team → Calendar availability → Invite team → per-model setup for Appointments/Classes/Events/Resources → Your dashboard → Stripe Connect → Review & Go Live), persisting progress via `PATCH /api/venue/onboarding` and migrating legacy step indices.
  - **App:** Absent — no wizard, welcome, model setup or go-live step. A new or partially-set-up venue simply lands on the tabs (Calendar). The only first-run surface is the dismissible `SetupChecklistCard` on Today.
  - **Evidence:** Web `_reference/Resneo/src/app/onboarding/page.tsx` (4,648 lines), `onboarding/layout.tsx`, `onboarding/steps/`. App: no onboarding files under `app/` routes (grep `onboard` matches only Docs + `lib/queries/useSetupStatus.ts`).
  - **Fix:** A full wizard is a large build; target a guided first-run that reuses existing manage screens. Phase 1: strengthen `SetupChecklistCard` in `app/(app)/today.tsx` into a real onboarding surface (model-aware steps + progress bar — see checklist gap below) and render it expanded/non-dismissible at the top when `status.onboarding_completed === false`. Phase 2 (optional): add `app/(app)/onboarding.tsx` that sequences the existing editors (venue-profile, hours, team `InviteStaffSheet`, `ResourceManagerSheet`/`ClassTypesManagerSheet`/`EventEditorSheet`, plan/Stripe) using `useSetupStatus` to mark steps done, mirroring the web step order.

- **No set-password screen for invited staff / reset recipients** — _function · high_
  - **Web:** `/auth/set-password` exchanges the invite/recovery link, then requires the user to choose a password (min 8, confirm, POST `/api/account/password`) before continuing; both forgot-password and staff invites redirect here.
  - **App:** Absent — `app/(auth)/callback.tsx` completes a recovery/invite session and immediately `router.replace('/')` (line 37). The user is signed in but never prompted to set a first password. Password change is only reachable later under More → Account settings (`account.tsx` / `MyAccountSheet.tsx` → POST `/api/venue/staff/change-password`).
  - **Evidence:** Web `_reference/Resneo/src/app/auth/set-password/page.tsx`. App: `app/(auth)/callback.tsx:37`, `lib/auth/completeSession.ts` (recovery handled, no routing), `providers/AuthProvider.tsx:182` (`requestPasswordReset` `redirectTo = getAuthCallbackRedirectUrl()`, i.e. `/callback`, not set-password). No set-password route exists (grep finds only the `setPassword` useState setter in `sign-in.tsx`).
  - **Fix:** Add `app/(auth)/set-password.tsx` (or branch in `callback.tsx`): when `parseAuthCallbackParams` returns `otpType` `recovery` or `invite` (`lib/auth/params.ts` already parses these), after `completeAuthSession` route to a screen that collects new password + confirm and calls the app's existing endpoint — note it is **POST `/api/venue/staff/change-password`** (used in `account.tsx:103` and `MyAccountSheet.tsx`), **not** the web's `/api/account/password`. Point `AuthProvider.requestPasswordReset`'s `redirectTo` at this route. Reuse the `account.tsx` validation (min 8, match).

#### Medium

- **Dashboard not gated on `onboarding_completed`** — _function · medium_
  - **Web:** `dashboard/layout.tsx` reads `onboarding_completed` (line 124) and calls `redirect('/onboarding')` (line 153) before the dashboard renders for any venue with `onboarding_completed === false`; `onboarding/layout.tsx` in turn redirects to `/signup/business-type` or `/signup/booking-models` when prerequisites are missing.
  - **App:** Absent — `app/(app)/_layout.tsx` (`useStaffGateStatus`) gates only on `staff/me` (401 → `StaffRequired`). A venue mid-setup gets the full tab UI with empty calendars; admins can still invite staff in-app (`manage/team.tsx`) and open the manage editors, but there is no onboarding gate or guided flow.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/layout.tsx:124,152-154`. App: `app/(app)/_layout.tsx` (`useStaffGateStatus` only; never reads setup-status). `onboarding_completed` is already exposed on `SetupStatus` (`lib/queries/useSetupStatus.ts:16`).
  - **Fix:** In `app/(app)/_layout.tsx` (or a lightweight provider), read `useSetupStatus` and, when `onboarding_completed === false` and the user is admin, route to the Phase-2 onboarding screen above (or pin the checklist expanded). Do not hard-block non-admins. Keep `keepPreviousData` semantics like `useStaffMe` to avoid the Stack-remount footgun documented in `staff-gate-stack-remount`.

- **Setup checklist uses fixed steps, omits per-model catalog steps and progress bar** — _function · medium_
  - **Web:** `SetupChecklist.getSteps` computes model-aware steps (Appointments → "Team & services", Events/Classes/Resources → catalog steps), adds `secondary_event/class/resource_catalog_ready` rows for enabled add-on models (`getSecondaryCatalogSteps`), relabels steps for onboarding-completed vs not, and renders a gradient % progress bar with a `progressPct` pill.
  - **App:** `SetupChecklistCard` hardcodes 5 steps (profile / availability / booking-page / stripe / first-booking), ignores secondary catalog readiness fields, has no per-model variation, and shows only an "N/total" count (no progress bar).
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/SetupChecklist.tsx` (`getSteps` lines 185-224, `getSecondaryCatalogSteps` lines 116-152, `progressPct` line 318, gradient bar lines 354-358). App: `app/(app)/today.tsx:43-49` (fixed 5-step array), line 62 (count only). `useSetupStatus.ts:19-25` already returns `booking_model`, `enabled_models`, `active_booking_models`, and the three `secondary_*_catalog_ready` fields, none read by the card.
  - **Fix:** Refactor `SetupChecklistCard` in `app/(app)/today.tsx` to mirror `getSteps`: branch on `status.booking_model` and append secondary catalog steps when `status.enabled_models` includes `event_ticket`/`class_session`/`resource_booking`, deep-linking to `/events`, `/classes`, `/resources`. Add a thin progress bar (`completedCount/totalCount`) and the onboarding-completed-aware labels. The status fields already exist on the `SetupStatus` interface.

#### Low

- **Coarser auth-callback error messaging vs web** — _content · low_
  - **Web:** Distinct copy for `otp_expired` ("already used or has expired, ask your admin to resend / use forgot password") vs `exchange_failed` ("use the latest link… or sign in with your password") vs generic, on both the login banner and the set-password page, plus a "Go to login" CTA; reads `#error_code` from the URL hash.
  - **App:** `mapExchangeError` (`completeSession.ts:67-79`) collapses several keywords (`expired`/`invalid`/`already been used`/`code verifier`) into one "This sign-in link has expired. Request a new magic link." and otherwise echoes the raw Supabase message; `callback.tsx` shows a generic `ErrorState` with a single Retry to `/sign-in`.
  - **Evidence:** Web `_reference/Resneo/src/app/login/AuthCallbackErrorBanner.tsx` (`OTP_EXPIRED_MSG` / `EXCHANGE_FAILED_MSG` / `GENERIC_MSG`). App: `lib/auth/completeSession.ts:67-79`, `app/(auth)/callback.tsx:55-65`.
  - **Fix:** Expand `mapExchangeError` to return a discriminated reason (`otp_expired` | `exchange_failed` | `generic`) and have `callback.tsx` render reason-specific copy + a "Back to sign in" action (and, for invite/recovery, "ask your admin to resend"). Mirror the three strings from `AuthCallbackErrorBanner.tsx`.

- **`claim_user_account` RPC never run on app sign-in/callback** — _function · low_
  - **Web:** After both password sign-in (via `/api/auth/resolve-next`) and magic-link callback, the web calls the `claim_user_account` RPC to backfill any unlinked guest/staff rows for that email before resolving the destination.
  - **App:** Absent — `AuthProvider.signInWithPassword`/`signInWithEmail` and `callback.tsx` never call `claim_user_account`; the app assumes staff rows are already linked to the auth user id.
  - **Evidence:** Web `_reference/Resneo/src/app/auth/callback/page.tsx:31` (`supabase.rpc('claim_user_account')`, warn-on-error). App: `providers/AuthProvider.tsx` (no rpc call), `app/(auth)/callback.tsx` (`router.replace('/')` with no RPC).
  - **Fix:** After a successful session in `app/(auth)/callback.tsx` (and optionally after `signInWithPassword` in `AuthProvider.tsx`), call `getSupabase().rpc('claim_user_account')` best-effort before `router.replace('/')`, matching the web (which logs but does not block on a claim error). Low severity because invited staff are normally linked by `user_id`, but this closes the email-only-match edge case that would otherwise 401 into `StaffRequired`.

### Investigated — not a gap

- **Business-type / plan / model selection** (`signup/business-type`, `signup/booking-models`) — intentional scope exclusion. The mobile app targets existing staff signing in, not new-venue acquisition/billing; a venue can never be created or have its plan/models chosen from the app. Noted for completeness only.
- **Choose destination (dual-role)** (`auth/choose-destination`) — the app is staff-only, so a chooser for users who are both staff and guest/sales-agent is out of scope. Noted for completeness only.

### Recommended work (ordered)

1. **Set-password flow for invites & resets** (high) — add `app/(auth)/set-password.tsx`, branch in `app/(auth)/callback.tsx` on `otpType` `recovery`/`invite`, collect+confirm password, POST `/api/venue/staff/change-password`, and repoint `AuthProvider.requestPasswordReset` `redirectTo` at it. Reuse `account.tsx` validation. Closes the silent sign-in hole for invited staff.
2. **Onboarding-aware setup checklist** (medium, enables #3) — refactor `SetupChecklistCard` in `app/(app)/today.tsx` to mirror the web `getSteps`/`getSecondaryCatalogSteps`: model-aware steps, secondary-catalog rows driven by `status.enabled_models`, onboarding-aware labels, and a progress bar. All required fields already exist on `SetupStatus`.
3. **Onboarding gate + guided first-run** (high/medium) — in `app/(app)/_layout.tsx` read `useSetupStatus`; when `onboarding_completed === false` and admin, pin the (now richer) checklist expanded at the top of Today, or route to a new `app/(app)/onboarding.tsx` that sequences the existing manage editors. Use `keepPreviousData` to avoid the Stack-remount reset.
4. **Granular auth-callback errors** (low) — make `mapExchangeError` in `lib/auth/completeSession.ts` return a discriminated reason and render reason-specific copy + "Back to sign in" in `callback.tsx`, mirroring `AuthCallbackErrorBanner.tsx`.
5. **`claim_user_account` backfill** (low) — call `getSupabase().rpc('claim_user_account')` best-effort in `callback.tsx` (and optionally after `signInWithPassword`) before `router.replace('/')`, logging but not blocking on error.


---

## 18. Design Language & UX Consistency (cross-cutting)

**Parity:** Strong — token-level design parity is effectively 1:1 (and the app *exceeds* the web on craft: light+dark theming, haptics, reduce-motion on every animated primitive, capped Dynamic Type, branded empty-state illustrations, a converged confirm/feedback system), with only five polish-level gaps remaining — none structural.

This is one of the app's strongest domains. `theme/index.ts` faithfully ports the web `globals.css` `:root` ramps — brand/accent ramps match hex-for-hex, surfaces/text/status colors match, shadow tiers map (`--ds-shadow-card`/`elevated` ↔ `elevation.card`/`raised`), the type scale aligns, and motion durations (`fast=150`/`normal=200`) line up — while adding a full dark palette the web lacks. The primitive layer (`components/ui/`) is broader and more consistent than the web's hand-rolled Tailwind: a central `Button`, `Input`, `Sheet`/`ConfirmSheet`, a single global `Toast` host, `Chip`/`Segmented`/`SearchBar`/`IconButton` toolbar set, `EmptyState` with illustrations, `ErrorState`/`ErrorBoundary`/`OfflineBanner`, and a shared `Dot` status primitive. I re-confirmed **zero live `Alert.alert` calls** across `app/` and `components/` (the only textual match is a docstring in `providers/ToastProvider.tsx:60`). The five remaining gaps are all low-severity craft items: the skeleton uses an opacity pulse rather than a gradient shimmer; compliance pills lack a reusable state→tone map; reports stat rows lack inline sparklines/trend chips; there is no `SectionCard` compound primitive; and there is no tap-to-reveal help-tooltip. Two prior candidate gaps were mischaracterized and are corrected below (the app already ships a standalone `Dot` primitive, and the home tab is the Calendar diary with no stat cards — the real stat surface is `reports.tsx`).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Design tokens (color/spacing/radius/type/shadow/motion) | `globals.css` `:root` + `@theme inline` | `theme/index.ts` | Full | Near-identical values; app adds a full `darkColors` map the web lacks. |
| Buttons | inline Tailwind / `.ap-btn-primary` | `components/ui/Button.tsx` | Full | App Button is richer (5 variants + `customColors`, 3 sizes, loading spinner, haptic, reduce-motion press spring, disabled-contrast token swap, auto ≥44pt). |
| Inputs / form fields | `ui/NumericInput.tsx`, `.ap-input-focus` | `components/ui/Input.tsx` | Strong | App Input: labelled field, required/optional adornments, Reanimated focus ring, error/helper text, 16px iOS-zoom guard. Web ships a dedicated clearable NumericInput. |
| Sheets / modals | various modals, `.booking-panel-animate-in` | `components/ui/Sheet.tsx`, `ConfirmSheet.tsx` | Full | Theme scrim, drag-to-dismiss, self-driven keyboard inset, `fill` mode, reduce-motion fallback, full a11y. |
| Toasts / transient feedback | `ui/Toast.tsx` | `providers/ToastProvider.tsx` | Full | Single global host; app adds tone icons, Undo slot, haptics, safe-area + above-tab-bar position, spring entrance. Dark HUD (iOS) vs web colored bg. |
| Status pills / badges | `dashboard/Pill.tsx`, `BookingStatusPill.tsx` | `components/ui/Badge.tsx` (Badge + StatusPill), `Dot.tsx` | Strong | StatusPill sources `bookingStatusVisualForKey`; standalone `Dot` primitive exists. Residual: 6 compliance-state tone variants not packaged as a reusable set. |
| Cards / section containers | `dashboard/SectionCard.tsx` (Root/Header/Body/Divider/Footer) | `Card.tsx`, `CollapsibleCard.tsx`, `SectionHeader.tsx` | Strong | No `SectionCard` compound in `components/ui` (Grep = 0); app composes Card + SectionHeader + CollapsibleCard per screen. |
| Empty states | `dashboard/EmptyState.tsx` | `components/ui/EmptyState.tsx` (+ test) | Full | App supports branded illustration variants plus glyph/title/message/action. |
| Error states / boundaries | inline blocks + Next `error.tsx` | `ErrorState.tsx`, `ErrorBoundary.tsx`, `OfflineBanner.tsx` | Strong | Centralized reusable error idiom is a parity strength vs Next route-level boundaries. |
| Loading skeletons | `ui/Skeleton.tsx` (gradient shimmer) | `components/ui/Skeleton.tsx`, `Skeletons.tsx` | Strong | App = opacity pulse (`Skeleton.tsx:30-46`); web = gradient shimmer. Both honor reduced-motion. |
| Filter chips / segmented controls | `dashboard/TabBar.tsx`, `ViewToolbar.tsx` | `Chip.tsx`, `Segmented.tsx`, `SearchBar.tsx`, `IconButton.tsx`, `MetaChip.tsx` | Full | Complete toolbar set; IconButton enforces 44pt + haptics + a11y. |
| Typography hierarchy | `globals.css` (h1/h2/h3 navy, Inter) | `Text.tsx` + theme typography | Full | Both Inter + shared scale; app caps Dynamic Type at 1.3× (a11y nicety the web lacks). |
| Dark mode | absent (light-only) | `theme/index.ts` `darkColors` + `useTheme.ts` | App-only | Hand-tuned dark palette wired through every primitive. Not a gap — the app leads. |
| Haptics / motion / reduce-motion | `prefers-reduced-motion` guards | `lib/haptics`, `lib/motion` (`useReduceMotion`) | Full | `useReduceMotion` routed through Button/IconButton/Sheet/Skeleton/Toast; pairs haptics with Reanimated springs. |
| Data-viz design language (charts / stat tiles) | `dashboard/StatTile.tsx` + `MiniSparkline.tsx`, `DashboardStatCard.tsx` | `reports/SvgLineChart.tsx`, `SvgBarChart.tsx`; `reports.tsx` (`StatRow`) | Partial | App has branded SVG charts + `StatRow` (label/value + accent); no inline sparkline/trend chip. Home tab is the calendar — no stat cards there. |
| Booking-page brand customization | `globals.css` (`--ap-accent` runtime re-skin) | `app/(app)/manage/booking-page.tsx` | Strong | Staff set `brand_primary`/`brand_accent` with swatches, presets, font preset, `readableTextColor`. |
| Web-only desktop primitives (hover tooltips, sparklines, summary strips) | `ui/HoverTooltip.tsx`, `dashboard/HelpTooltip.tsx`, `dashboard/SummaryStrip.tsx` | absent | Missing | Hover/desktop-driven primitives; mostly intentional platform exclusions. |
| Confirm / destructive-action idiom | native confirm + modal dialogs | `ConfirmSheet.tsx` + two-step inline confirms | Full | Grep for `Alert.alert(` = 0 live calls; fully migrated to ConfirmSheet / arm→confirm. |

**Design tokens.** `theme/index.ts` is a deliberate port of the web design system — the file header even names "ResNeo Night (navy #003B6F) + Neo Teal (#00C2C7)" and the brand ramp (`brand.600 = #003B6F`, lines 51-60) matches the web `:root`. Spacing is multiples of 4 (lines 17-27), radius mirrors the web's rounded cards (`card = 16`, lines 33-42), and `minTouchTarget = 44` (line 45) enforces Apple HIG. The standout addition is the full `darkColors` mapping wired through `useTheme`, which the web staff dashboard simply has no equivalent for.

**Status pills / badges.** `StatusPill` (`Badge.tsx:59-80`) pulls colors from `bookingStatusVisualForKey`, so calendar bars, list rows, and the detail panel all speak one palette — and the docstring at lines 49-58 notes this fixed a prior color-scramble. The app *does* have a dot affordance: `Dot.tsx` is a standalone primitive (exported from the barrel) that "unifies the booking attendance/arrived dots, the live-sync dot, and the compliance-flag dot" (its own docstring, lines 12-16). The only true residual vs the web `Pill` is that `Badge` exposes generic tones (`neutral|brand|accent|success|warning|danger`, line 8) rather than the web's six first-class compliance states.

**Data-viz.** The app home tab (`app/(app)/(tabs)/index.tsx`) is the Calendar diary and has **no stat cards at all** — there is nothing to compare there. The real stat surface is `reports.tsx`, whose `StatRow` (lines 54-85) renders only label + value + an optional accent color (`emerald|amber|red|brand`), alongside branded `SvgLineChart`/`SvgBarChart` (imported lines 10/12). It carries no inline sparkline and no trend/delta chip, so the at-a-glance KPI language is thinner than the web `StatTile`/`DashboardStatCard`.

### Gaps & deficiencies

_No Critical, High, or Medium gaps in this domain. All five are Low-severity polish items._

#### Low

- **Loading skeletons pulse opacity instead of the web's gradient shimmer** — _design · low_
  - **Web:** `Skeleton` uses a left-to-right gradient shimmer (`@utility skeleton`: linear-gradient `#e2e8f0→#f1f5f9→#e2e8f0`, `background-size 200% 100%`, `ds-skeleton-shimmer` 1.4s loop), giving a premium loading motion, with a `prefers-reduced-motion` fallback to a static block.
  - **App:** `components/ui/Skeleton.tsx` animates a flat opacity pulse from 0.5→1 on a single solid color (`colors.skeleton`) over an 800ms inOut loop (lines 30-46); no directional shimmer. Reduced-motion correctly rests at 0.7 opacity (no `withRepeat`, lines 33-36).
  - **Evidence:** `_reference/Resneo/src/app/globals.css` lines 252-255 (keyframes) + 278-282 (`@utility skeleton`) vs `C:/Resneo-app/components/ui/Skeleton.tsx` lines 30-46.
  - **Fix:** Upgrade `components/ui/Skeleton.tsx` to a moving gradient — an `expo-linear-gradient` inside an `Animated.View` whose `translateX` loops via `withRepeat(withTiming(...))`, clipped to the block bounds; keep the existing `reduceMotion` early-return so reduced-motion stays a static `colors.skeleton` block. `ListSkeleton`/`DetailSkeleton` in `Skeletons.tsx` inherit it for free.

- **App Badge lacks reusable compliance-state tone variants (compliance pills mapped ad hoc)** — _ui · low_
  - **Web:** `dashboard/Pill.tsx` ships 6 first-class compliance states (`compliance-current/expiring/expired/missing/pending/voided`), each with a matching `variantClasses` color set + an optional status dot via `dotClasses`, so every compliance surface speaks one visual language.
  - **App:** The app **does** have a dot affordance — `components/ui/Dot.tsx`, exported from the barrel, unifies the compliance-flag/attendance/live-sync dots. What is genuinely missing is a reusable compliance-**state** tone set: `Badge` exposes only generic tones (`Badge.tsx:8`), so compliance screens (`manage/compliance.tsx`, `compliance-types.tsx`, `components/bookings/ComplianceCard.tsx`) map each state onto a generic Badge tone by hand rather than via a shared `CompliancePill` / tone map.
  - **Evidence:** `_reference/Resneo/src/components/ui/dashboard/Pill.tsx` lines 18-46 vs `C:/Resneo-app/components/ui/Badge.tsx` lines 8-42 (generic tones) and `C:/Resneo-app/components/ui/Dot.tsx` (existing dot primitive); ad-hoc usage at `app/(app)/manage/compliance.tsx` lines 439/520/576/624.
  - **Fix:** Add a small compliance tone map (or a `CompliancePill` wrapper) in `components/ui/Badge.tsx` mirroring the web `compliance` `variantClasses`, and reuse the existing `Dot` primitive for the optional status dot (do *not* add a dot prop to Badge). Refactor `manage/compliance.tsx`, `compliance-types.tsx`, and `components/bookings/ComplianceCard.tsx` to use it so compliance colors are centralized and identical to web.

- **Analytics/reports stat tiles lack the web's inline sparkline + trend chip** — _design · low_
  - **Web:** `StatTile.tsx` + `DashboardStatCard.tsx` render a color-coded tile with an optional `MiniSparkline` series and a trend pill (e.g. +12%) for at-a-glance KPI scanning, used on the dashboard home overview and the reports view.
  - **App:** The home tab (`app/(app)/(tabs)/index.tsx`) is the Calendar diary and has **no** stat cards. The app's actual stat surface is `reports.tsx`, whose `StatRow` (lines 54-85) renders label + value + optional accent only, plus branded `SvgLineChart`/`SvgBarChart`. No inline sparkline, no trend/delta chip.
  - **Evidence:** `_reference/Resneo/src/components/ui/dashboard/StatTile.tsx` lines 37-69 + `components/dashboard/DashboardStatCard.tsx` vs `C:/Resneo-app/app/(app)/reports.tsx` (`StatRow` lines 54-85; charts imported lines 10/12). Grep for StatTile/Sparkline/trend in `app/(app)/(tabs)/index.tsx` = 0 (it's the calendar).
  - **Fix:** Add a reusable `StatTile` primitive under `components/ui/` composing a tiny MiniSparkline (reuse the `SvgLineChart` drawing logic + the `chart-1..5` palette) and an optional trend `Badge`, then adopt it for the overview cards in `app/(app)/reports.tsx` — *not* the calendar home tab. (Also relevant to the Reports/Home domain.)

- **App composes cards/headers ad hoc rather than via one SectionCard compound primitive** — _design · low_
  - **Web:** Standardizes grouped content with `SectionCard.{Root,Header,Body,Divider,Footer}` — gradient header strip, eyebrow/title/description slots, divider, tinted footer — giving every settings/detail panel an identical anatomy.
  - **App:** Achieves visual consistency but assembles it from separate `Card` + `SectionHeader` + `CollapsibleCard` primitives per screen, so header/footer treatment (eyebrow casing, divider, footer bg) is reproduced by hand and can drift. No `SectionCard` compound exists in `components/ui` (Grep = 0 files).
  - **Evidence:** `_reference/Resneo/src/components/ui/dashboard/SectionCard.tsx` lines 1-93 vs `C:/Resneo-app/components/ui/Card.tsx` + `SectionHeader.tsx` + `CollapsibleCard.tsx`.
  - **Fix:** Introduce a `SectionCard` compound in `components/ui/` (Root/Header/Body/Footer) mirroring the web anatomy and migrate high-density settings screens (`app/(app)/manage/*.tsx`) to it so eyebrow/title/footer styling is defined once. Low priority — current screens are already consistent; this is preventive hardening.

- **No in-context help-tooltip pattern (web HelpTooltip/HoverTooltip)** — _ui · low_
  - **Web:** Uses `HoverTooltip.tsx` and `dashboard/HelpTooltip.tsx` (an 'i'/'?' button opening a positioned, dismissible, Escape-aware popover) to attach contextual explanations to settings labels and metrics on hover/focus.
  - **App:** Absent — touch has no hover, and there is no equivalent tap-to-reveal help/info popover primitive under `components/ui`, so explanatory microcopy is either inlined as helper text or omitted.
  - **Evidence:** `_reference/Resneo/src/components/ui/HoverTooltip.tsx` + `src/components/dashboard/HelpTooltip.tsx` lines 23-144 vs no equivalent under `C:/Resneo-app/components/ui/` (Grep for Tooltip/HelpTooltip/Popover found only `Dot`/`LiveDot`).
  - **Fix:** Add a lightweight `HelpTooltip` primitive (an IconButton 'info' that opens a small Sheet/popover) under `components/ui/`, reusing the existing `Sheet` for the body. Scope to the few settings where the explanation is load-bearing — many web tooltips are desktop-only affordances and intentionally out of scope.

### Recommended work (ordered)

1. **Compliance tone map (highest user-visible payoff).** Add a `compliance` tone map / `CompliancePill` wrapper to `components/ui/Badge.tsx` mirroring the web's six states, reusing `Dot.tsx` for the status dot; refactor `app/(app)/manage/compliance.tsx` (lines 439/520/576/624), `compliance-types.tsx`, and `components/bookings/ComplianceCard.tsx` to consume it.
2. **Gradient shimmer skeleton.** Rebuild `components/ui/Skeleton.tsx` as an `expo-linear-gradient` + looping `translateX` (clipped), preserving the `reduceMotion` early-return; `ListSkeleton`/`DetailSkeleton` inherit automatically.
3. **`StatTile` primitive for reports.** Create `components/ui/StatTile.tsx` composing a MiniSparkline (from `SvgLineChart` logic + `chart-1..5` palette) and an optional trend `Badge`; adopt it for the overview cards in `app/(app)/reports.tsx` (not the calendar home tab).
4. **`SectionCard` compound (preventive).** Add `components/ui/SectionCard.tsx` (Root/Header/Body/Footer) and migrate `app/(app)/manage/*.tsx` high-density screens so eyebrow/title/footer styling is defined once.
5. **`HelpTooltip` primitive (scoped).** Add an IconButton-'info'-opens-`Sheet` `HelpTooltip` under `components/ui/` and attach it only to the few settings where the explanation is load-bearing.
