# R7 Master Execution Plan

**Author:** Tech-lead / PM planning pass · **Date:** 2026-06-18
**Inputs:** `Docs/APP_GAP_REPORT_R7.md` master backlog (126 gaps: 7 crit / 20 high / 38 med / 61 low) + all 18 `Docs/audit-r7/NN-*.md` domain sections.
**Repos:** APP `C:\Resneo-app` (Expo/RN, primary) · WEB `C:\Resneo` (Next.js backend working copy — edit THIS, not `_reference/`).

This plan tells a fleet of implementer agents what to build, in what order, and which work can run concurrently without two agents editing the same file. It is grounded in the real code, which in several places contradicts the audit's stated prerequisites — those corrections are called out because they collapse most of the planned backend wave.

---

## 0. Ground-truth corrections (read first — they reshape the waves)

I validated the live code in both repos. Five audit assumptions are **already satisfied**, which removes them from the critical path:

1. **`ApiError` already exposes `status` + parsed `body`.** `lib/api/client.ts:40-49` — `class ApiError extends Error { ..., readonly status: number, readonly body?: ApiErrorBody | unknown }`, and `apiFetch` throws it with `(message, response.status, data)` at L141-145. The audit's repeated "expose status + body on `ApiError`" prerequisite (Availability High, Bookable-calendars Critical) is **done**. Wave F only needs to *verify consumers read it* and add a tiny typed accessor for the 409 `requires_confirmation` body — no structural change.

2. **The compliance authoring routes are ALREADY Bearer-capable.** The audit (and the stale docstring in `lib/queries/useComplianceTypeManage.ts:18-23`) claim `GET/POST /types`, `/types/[id]/versions`, `/library`, `/library/[slug]/clone`, `/requirements` are "bare `createClient()` → cookie-only". They are **not** anymore — every one now uses `createVenueRouteClient(request)` (Bearer + cookie) in `C:\Resneo`. Verified file-by-file:
   - `compliance/types/route.ts` GET+POST → `createVenueRouteClient`; GET returns `listComplianceTypesWithCounts` (i.e. `service_requirement_count` + `record_count` already in the payload), honours `?include_archived=true`.
   - `compliance/types/[id]/versions/route.ts` GET+POST → `createVenueRouteClient`.
   - `compliance/library/route.ts` GET + `compliance/library/[slug]/clone/route.ts` POST → `createVenueRouteClient`.
   - `compliance/requirements/route.ts` GET+POST + `requirements/[id]/route.ts` PATCH+DELETE → `createVenueRouteClient`.
   **Consequence:** the entire compliance backend wave evaporates. Compliance is now a pure APP build. The `useComplianceTypeManage.ts` docstring is wrong and must be corrected as part of that work.

3. **The venue PATCH already accepts the owner-booking-alert + embed fields.** `C:\Resneo/src/app/api/venue/route.ts` schema has `owner_booking_notification_enabled` (L48), `owner_booking_notification_email` (L50), `embed_accent_colour` (L63); the PATCH writes them (L232-237, L254-266) and GET returns them (L123/368). No backend work for Communications High or Booking-page embed-accent. APP-side type widening only.

4. **The practitioners route already has `slug`, `sort_order`, `days_off`, and `DELETE`.** `C:\Resneo/src/app/api/venue/practitioners/route.ts`: GET selects `slug, working_hours, ..., days_off, sort_order` (L110) and returns `slug`/`sort_order` (L38/44); PATCH schema accepts `slug` (L184) + `sort_order` (L191); `DELETE` exists (L834). The Bookable-calendars Critical needs **no backend change** — only APP type widening (`PatchPractitionerInput`) and a DELETE mutation hook.

5. **`delete-request` + class-commerce routes already exist and are Bearer-capable.** `delete-request/route.ts` (GET+POST) + `delete-request/cancel/route.ts` (POST) → `createVenueRouteClient`. All four class-commerce route groups (`class-credit-products`, `class-course-products` incl. `[id]/enrollments/[enrId]/cancel`, `class-membership-products`, `class-commerce-reports`) → `createVenueRouteClient`. Venue-deletion (Settings Critical) and Class Products (Classes High) are APP-only builds.

**What genuinely remains as backend work (Wave B), confirmed by grep:**
- **Referrals:** there is **no** `C:\Resneo/src/app/api/venue/referrals` directory. The web loads referrals via SSR only (`src/lib/referrals/load-dashboard.ts` → `loadReferralsDashboardForVenue`). A Bearer `GET` route must be **created** to wrap that loader.
- **`practitioner-service-overrides/route.ts` (PATCH)** and **`practitioner-services/route.ts` (PUT)** still import `createClient` from `@/lib/supabase/server` (cookie-only). These two block the Services High gaps (staff self-service + per-calendar overrides) and must be migrated to `createVenueRouteClient`.

6. **Persistence: use `expo-secure-store`, NOT AsyncStorage.** The audit says "AsyncStorage is not yet a dependency — add it" for calendar prefs. The app already persists `ownerVenueId` via `expo-secure-store` in `providers/LinkedVenueProvider.tsx` (L10, L55-70), which is already in `package.json`. The persisted-prefs hook MUST reuse SecureStore. **Do not add `@react-native-async-storage/async-storage`** — it is unnecessary and adds a native dep that can't be device-tested here.

Net effect: the original "huge backend wave" is reduced to **3 small WEB tasks**, and Wave F is lighter than the audit implied.

---

## 1. Wave F — Foundations (shared, serial, do FIRST)

These are shared edits that multiple domains import. They are small, must land before dependents, and several touch the same files so they run **serially as one focused pass** (a single agent, or strictly ordered). Each task lists exact file(s), the change, and the gaps it unblocks.

> Ordering note: F1–F3 are type/util-only and conflict-free; do them first so downstream agents compile. F4 (primitives) is additive new files. F5 (SecureStore prefs hook) is a new file. None of F's files overlap the heavily-shared screens, so Wave F can run **in parallel with Wave B** (different repo) and before all app feature waves.

### F1. Widen `types/venue.ts`
**File:** `C:\Resneo-app\types\venue.ts`
**Changes (additive, no breaking edits):**
- Add a nested optional `compliance` config to `VenueFeatureFlagsRaw`. Port `ComplianceConfig` shape from `C:\Resneo/src/lib/compliance/config.ts` (`default_capture_method`, `default_form_link_channel`, `reminder_cadence_days`, `form_link_expiry_days`, `lock_period_hours`, `auto_send_on_booking`) + `DEFAULT_COMPLIANCE_CONFIG`. Change `VenueFeatureFlagsRaw` from `Partial<Record<AppointmentsFeatureFlagKey, boolean>>` to `Partial<Record<AppointmentsFeatureFlagKey, boolean>> & { compliance?: ComplianceConfig; waitlist_config?: { mode: '...' } }` (a small intersection so the booleans stay).
- Add to `VenueBootstrap`: `owner_booking_notification_enabled?: boolean`, `owner_booking_notification_email?: string | null`, `embed_accent_colour?: string | null`. (`email` already present.)
- Fold in the fields `venue-profile.tsx` currently casts via its local `VenueBootstrapExtended`: `price_band?: string | null`, `kitchen_email?: string | null` (the rest — `no_show_grace_minutes`, `logo_url`, `cover_photo_url`, `cuisine_type`, `plan_status` — are already present).
**Unblocks:** Compliance 13 (general-settings High; also the `useUpdateFeatureFlags` config send), Communications 15 (owner-alert High), Booking-page 12 + Settings 14 (embed-accent Medium), Waitlist 9 (mode config High — `waitlist_config`).

### F2. Widen `types/practitioner.ts` + `types/availability-manage.ts`
**Files:** `C:\Resneo-app\types\practitioner.ts`, `C:\Resneo-app\types\availability-manage.ts`
**Changes:** `Practitioner` already has `sort_order`; add `slug?: string | null` and `days_off?: string[] | null`. In `PatchPractitionerInput` (availability-manage.ts:77-84) add `sort_order?: number` and `slug?: string | null`.
**Unblocks:** Availability 8 (Bookable-calendars Critical: reorder + booking-link slug; legacy `days_off` banner Low).

### F3. Verify + lightly extend `ApiError` consumption for the 409 flow
**File:** `C:\Resneo-app\lib\api\client.ts` (verify only) + the two mutation hooks below.
**Changes:** `ApiError` already carries `status` + `body`. Add a tiny typed guard for the acknowledge body, e.g. extend `ApiErrorBody` with optional `requires_confirmation?: boolean; message?: string` (additive). Thread `{ acknowledge?: boolean }` → `?acknowledge_affected_bookings=true` into `useUpdateOpeningHours` (`lib/queries/useVenueSettings.ts:141-163`) and `usePatchPractitioner` (`lib/queries/useAvailabilityManage.ts:223-240`); on a 409 with `requires_confirmation`, surface `body.message` to the caller for an armed-confirm re-run.
**Unblocks:** Availability 8 ("Save anyway?" High). (Note: this is the *hook* half; the UI armed-confirm in `hours.tsx` + `WorkingHoursEditor.tsx` is domain work in Wave 3.)

### F4. Cross-cutting design-system primitives (domain 18) — all NEW files
**Files (new):** `components/ui/SectionCard.tsx`, `components/ui/HelpTooltip.tsx`, `components/ui/StatTile.tsx` (composes a `MiniSparkline` built from the existing `components/reports/SvgLineChart` drawing logic), plus edits to `components/ui/Badge.tsx` (add a `compliance` tone map / `CompliancePill` mirroring the web's 6 states, reusing the existing `Dot` primitive — do NOT add a dot prop to Badge), and `components/ui/Skeleton.tsx` (rebuild as an `expo-linear-gradient` looping `translateX`, preserving the `reduceMotion` early-return). Also add a shared `components/ui/PhoneInput.tsx` wrapping `Input` + `lib/phone/normalize.ts normalizePhone()` (normalize-on-blur + inline error).
**Dependency check:** `expo-linear-gradient` is **NOT** in `package.json` — it must be added for the shimmer skeleton (it is an Expo SDK 56 package; verify the exact version at https://docs.expo.dev/versions/v56.0.0/ before installing). `react-native-svg` (15.15.4) is already present (StatTile/MiniSparkline). `expo-haptics`/`expo-secure-store` already present. No AsyncStorage.
**Unblocks:** Design 18 (all 5 low items); StatTile feeds Reports 10 (KPI sparkline Low); CompliancePill feeds Compliance 13 surfaces; HelpTooltip feeds Resources 07 (Low) + Compliance settings; PhoneInput feeds Settings 14 (E.164 Medium).
**Note:** `SectionCard` adoption across `manage/*` is explicitly *preventive*; build the primitive in F4 but do NOT migrate every screen (that would create massive conflicts) — migration is opportunistic, per-domain, only where an agent is already editing that screen.

### F5. Persisted-prefs hook (SecureStore) for calendar preferences
**File (new):** `lib/queries/usePersistedCalendarPrefs.ts` (or `providers/`), storing `{ scope, selectedId, startHourOverride, endHourOverride }` keyed by venue id, **using `expo-secure-store`** (mirror the get/set/delete + JSON pattern in `providers/LinkedVenueProvider.tsx:55-70`). Hydrate into `CalendarScreen` initial state with a stale-practitioner-id guard (mirror `reconcileOwnerVenue`).
**Unblocks:** Calendar 02 (persisted prefs Medium + visible-window control Medium, which depends on this hook).

---

## 2. Wave B — Backend prerequisites (`C:\Resneo`, parallel with Wave F)

Different repo → runs concurrently with Wave F. After the ground-truth audit, only **three** tasks remain. Each can be a separate agent (different files), so B1/B2/B3 are mutually parallel-safe.

### B1. Migrate `practitioner-service-overrides` to Bearer
**File:** `C:\Resneo/src/app/api/venue/practitioner-service-overrides/route.ts`
**Change:** swap `import { createClient } from '@/lib/supabase/server'` → `import { createVenueRouteClient } from '@/lib/supabase/venue-route-client'` and `const supabase = await createClient()` → `await createVenueRouteClient(request)` in the `PATCH` handler (L84-86). Keep the existing staff/venue resolution and `staff_may_customize_*` enforcement. (Pattern is identical to every already-migrated venue route.)
**Unblocks:** Services 11 (per-calendar overrides `StaffServiceOverrideSheet` — High).

### B2. Migrate `practitioner-services` to Bearer
**File:** `C:\Resneo/src/app/api/venue/practitioner-services/route.ts`
**Change:** same swap, in the `PUT` handler (L29-31).
**Unblocks:** Services 11 (non-admin staff self-service per-calendar offer toggle — High).

### B3. Create the referrals dashboard route (Bearer)
**File (new):** `C:\Resneo/src/app/api/venue/referrals/route.ts`
**Change:** add `export async function GET(request)` using `createVenueRouteClient(request)`, resolve the venue/staff, gate on `referralProgrammeEnabled()` (admin), and return `loadReferralsDashboardForVenue(...)` from `src/lib/referrals/load-dashboard.ts` (the loader exists — confirmed). Mirror the SSR shape the web `ReferralsDashboardContent` consumes (code, shareable link, 3 KPI numbers, referrals list).
**Unblocks:** Reports 10 (Refer & Earn High), Settings 14 + Navigation 01 (referrals tile Medium).

> **Do NOT invent any other endpoints.** Everything else the audit flagged as a backend prerequisite is already migrated (see §0). If an implementer hits a 401 on a compliance/class-commerce/delete-request/venue-PATCH/practitioners route from the app, the cause is a missing/expired Bearer token on the app side, NOT a cookie-only route — debug the app's `useAccessToken`, do not "re-migrate" the route.

---

## 3. Shared-file conflict map (APP files touched by >1 domain)

These are the parallelization hazards. Any two domains sharing a row **cannot** run concurrently against that file. Heavily-shared files are listed first.

| APP file | Domains that touch it | Why |
|---|---|---|
| `app/(app)/(tabs)/settings.tsx` | 01 (un-gate model rows; eligibility gates; search keywords), 10 (refer-earn tile), 14 (refer-earn tile) | Nav un-gating + new tiles + search filter all edit the destinations builder. **Serialize.** |
| `app/(app)/manage/services.tsx` | 11 (staff self-service High; overrides High; compliance editor Med; specific-dates Med; add-calendar Low; addon previews Low), 13 (per-service `ComplianceRequirementsEditor` Critical) | The service editor sheet is one giant file. **All Services + the compliance-requirements editor must serialize through one agent.** |
| `types/venue.ts` | F1, 13, 15, 12, 14, 09 | Stabilized in Wave F; after that, no domain re-edits it. |
| `app/(app)/manage/booking-settings.tsx` | 08 (Bookable-calendars may add a tab/segment entry), 09 (Waitlist enable+mode section) | Both add sections to this screen. **Serialize 08-calendars setup-entry and 09.** |
| `app/(app)/_layout.tsx` | 09 (mount `WaitlistAvailabilityBanner`), 17 (set-password Stack.Screen; onboarding gate read), 10 (refer-earn Stack.Screen), 06 (class-products Stack.Screen) | All register routes / mount shells in the same `Stack`. **Serialize route registrations** (small, fast edits — batch them). |
| `app/(app)/(tabs)/index.tsx` (Calendar) | 01 (Today header IconButton), 02 (window control, month-grid counts wiring, empty-slot walk-in/resource, week "All", prefs hydration) | Calendar screen. **All of domain 02 + the 01 Today-button serialize.** |
| `app/(app)/manage/booking-page.tsx` | 12 (embed card, embed-accent, QR, fonts, team cascade, slug), 14 (share/embed card, QR — same surface) | 12 and 14's embed/QR asks are the SAME card. **Merge into one task; do not double-build.** |
| `app/(app)/manage/communications.tsx` | 15 (owner-alert card High) | Single domain — no conflict, listed for completeness. |
| `app/(app)/manage/compliance.tsx` | 13 (link to general-settings; CompliancePill refactor) | Single domain. |
| `app/(app)/manage/plan.tsx` | 14 (DeleteVenueSheet mount Critical; seat-cap nudge High; trial copy Low) | Single domain — serialize within 14. |
| `app/(app)/today.tsx` | 10 (heatmap, sparkline, secondary activity), 17 (SetupChecklistCard onboarding refactor) | **Serialize 10 and 17** (both edit the Today composition). |
| `components/booking-wizard/ServiceBookingFlow.tsx` | 04 (group Critical; multi-service Critical; client-address Med; rebook is in sibling files) | One file, two criticals. **Serialize within 04** (multi-service first, then group, per the domain's own ordering). |
| `components/booking-wizard/ConfirmStep.tsx` | 04 (multi-service/group payloads; Stripe capture High; client-address) | Same flow. Serialize within 04. |
| `components/booking-wizard/TimeSlotStep.tsx` | 09 (enrich `WaitlistJoinSheet` Med; lift/export it Med) | Single domain (09). |
| `lib/queries/useVenueSettings.ts` | F3 (409 acknowledge on `useUpdateOpeningHours`), 12/14 (`useUpdateVenue` for embed-accent — additive field, no signature change) | F3 first; embed-accent uses the existing `useUpdateVenue` without editing it. Low risk. |
| `lib/queries/useAvailabilityManage.ts` | F3 (409 on `usePatchPractitioner`), 08 (Bookable-calendars reuses `usePatchPractitioner` + new DELETE) | F3 first, then 08 adds a sibling DELETE mutation (additive). |
| `lib/queries/useComplianceTypeManage.ts` | 13 (add create/version/library/clone hooks; fix stale docstring) | Single domain (13). |
| `components/ui/Badge.tsx` | F4 (CompliancePill) | Wave F only; consumers refactor in 13/03/18 after F lands. |
| `components/calendar/grid-layout.ts` (`computeGridBounds`) | 02 (window override) | Single domain. |
| `lib/rebook-bootstrap.ts` | 03 (guest-only "New for guest" Low), 04 (resource/class/event shapes Med) | **Serialize 03 and 04's rebook edits** (both widen the payload type). |
| `components/reports/SvgLineChart.tsx` (drawing logic, reused) | F4 (StatTile/MiniSparkline imports it — read-only reuse), 10 (sparkline) | Reuse, not edit — low risk if treated read-only. |

Files touched by exactly one domain (e.g. `availability.tsx`, `classes.tsx`, `waitlist.tsx`, `clients.tsx`, `bookings.tsx`, `resources.tsx`, every `components/<domain>/*` sheet) are safe to parallelize across domains as long as the domains differ.

---

## 4. Wave schedule (after F + B)

Principle: maximize parallelism while guaranteeing **no two concurrent agents edit the same file** (per §3). Each wave runs its "parallel-safe groups" concurrently in isolated git worktrees; "serial" items run one-after-another because they share a hot file. Domains that hammer `settings.tsx` / `services.tsx` / `_layout.tsx` / `index.tsx` are scheduled so their shared-file edits never overlap.

### Wave 1 — Critical path, file-disjoint criticals (run concurrently)
Goal: land the 7 criticals fast, choosing the disjoint subset to parallelize.

- **Group 1A (parallel):**
  - **13 Compliance** (all of it — backend already Bearer per §0.2). Owns: `useComplianceTypeManage.ts`, `useComplianceRequirements.ts` (new), `ComplianceTypeEditorSheet.tsx`, `compliance-types.tsx`, `ComplianceCaptureSheet.tsx`, a new compliance-settings screen. **Touches `services.tsx`** for the per-service requirements editor — so 13 and 11 must NOT run together. (See 1B.) Schedule 13 here; defer 11 to Wave 2.
  - **08 Availability — Bookable-calendars Critical** (+ the F3-dependent 409 UI). Owns: new `components/availability/BookableCalendarsManager.tsx`, `availability.tsx`, a DELETE mutation in `useAvailabilityManage.ts`, and the armed-confirm in `hours.tsx` + `WorkingHoursEditor.tsx`. May add a setup-entry to `booking-settings.tsx` — coordinate with 09 (Wave 2), so keep 08's `booking-settings` touch minimal or defer that entry.
  - **14 Settings — Delete-venue Critical** (+ seat-cap High, same screen-family). Owns: `DeleteVenueSheet.tsx` (new), `useVenueDeletion.ts` (new), `plan.tsx`, `team.tsx`, `planConstants.ts`. Backend `delete-request` already Bearer (§0.5).
- **Serial after 1A (shares `ServiceBookingFlow.tsx`/`ConfirmStep.tsx`):**
  - **04 New booking — multi-service Critical, then group Critical** (the domain's own order). One agent, sequential within the domain. Also touches `lib/rebook-bootstrap.ts` (coordinate with 03 later).

Justification: 13, 08, 14 edit disjoint file sets (compliance sheets vs availability vs plan/team). 04 is isolated to the booking-wizard files but its two criticals share one flow file, so they serialize internally and 04 runs alongside 1A as a 4th lane only if a distinct agent owns the wizard files (they don't overlap 1A) — it can in fact join Group 1A as **lane 1A-d**.

### Wave 2 — Highs, grouped by disjoint files
- **Group 2A (parallel):**
  - **11 Services** (staff self-service + overrides Highs, compliance-requirements editor, etc.) — needs **B1+B2 merged first**. Owns `services.tsx` entirely; since 13 already added the per-service requirements editor in Wave 1, 11 must rebase on that (sequential dependency 13 → 11 on `services.tsx`). Also `StaffServiceOverrideSheet.tsx` (new), `useUpdateServiceOverride.ts` (new), `useToggleCalendarService.ts` (new).
  - **06 Classes & Events — Class Products High + course refunds High** (backend already Bearer §0.5). Owns: new `manage/class-products.tsx`, `useClassProducts.ts`, `types/class-products.ts`, `CourseEnrollmentsSheet.tsx`, a `useClassCommerceEnabled()` flag, and one `_layout.tsx` Stack.Screen registration (batch with other route regs).
  - **09 Waitlist — banner High + enable/mode High.** Owns: `WaitlistAvailabilityBanner.tsx` (new), a Waitlist section in `booking-settings.tsx` (coordinate with 08's possible setup-entry — schedule 08's `booking-settings` touch in Wave 1 to finish first, then 09 owns the file in Wave 2), `_layout.tsx` mount (batch), `useJoinWaitlist.ts`, `TimeSlotStep.tsx`.
  - **15 Communications — owner-alert High** (type widened in F1; backend ready §0.3). Owns: `communications.tsx`, plus the `refetchInterval` Medium in `useNotifications.ts`.
  - **12 Booking-page / 14 embed — MERGED embed+QR+accent task** (High/Med). One agent owns `booking-page.tsx` for the embed card, `embed_accent_colour` (via existing `useUpdateVenue`), QR (`react-native-qrcode-svg` — verify v56), font typefaces, team cascade, inline slug. **Do not let 12 and 14 both touch this file.**
- **Serial / sequenced:**
  - **17 Auth — set-password High** (`set-password.tsx` new + `callback.tsx` branch + `AuthProvider` redirectTo + `_layout.tsx` reg). Independent files; can join 2A as a lane. The **onboarding checklist (17) edits `today.tsx`**, which collides with **10** — so 17's `today.tsx` work moves to Wave 3 next to 10.
  - **10 Reports — Refer & Earn High** (needs **B3 merged first**): new `refer-earn.tsx`, `useReferrals.ts`, `settings.tsx` tile, `_layout.tsx` reg. **`settings.tsx` collision with 01** → schedule 01's nav edits and 10's tile sequentially (10 tile in Wave 2, 01 nav in Wave 3, or vice-versa; pick one owner per pass).

Justification: 11, 06, 09, 15, 12+14-embed edit disjoint file sets. The only sequencing constraints are 13→11 (services.tsx), B1/B2→11, B3→10, and 08→09 on booking-settings.tsx — all honored by wave boundaries.

### Wave 3 — Mediums + the remaining shared-file work (carefully serialized)
- **Serial lane S1 (`settings.tsx`):** **01 Navigation** (un-gate `SECONDARY_MODEL_ROWS`, eligibility gates, search keywords, Today IconButton on `index.tsx`). Runs after 10's tile landed. The Today IconButton touches `index.tsx` → must follow/precede 02 (lane S2), so put 01's `settings.tsx` edits here and 01's `index.tsx` IconButton inside lane S2's window.
- **Serial lane S2 (`index.tsx` + calendar files):** **02 Calendar** (persisted prefs via F5, window control via `computeGridBounds`, month-grid enrichment, empty-slot walk-in/resource, week "All" matrix) + the 01 Today IconButton (same file). One agent owns the Calendar screen for this whole lane.
- **Serial lane S3 (`today.tsx`):** **10 Reports remaining** (heatmap, sparkline via F4 StatTile, secondary activity) then **17 onboarding** (SetupChecklistCard refactor + `_layout.tsx` onboarding gate read with `keepPreviousData`). Sequential because both compose `today.tsx`.
- **Serial lane S4 (`services.tsx`):** **11 Services Mediums** (specific-dates/date-range editor, availability preview) — after 11's Highs in Wave 2.
- **Group 3P (parallel, disjoint files):**
  - **03 Bookings** (summary stats, multi-service-row collapse, deposit amount on row, "New for guest" — coordinate `rebook-bootstrap.ts` with 04 which finished in Wave 1). Owns `bookings.tsx`, `BookingRow.tsx`, `BookingDetailContent.tsx`, new `lib/booking/collapseMultiServiceVisits.ts`.
  - **05 Clients** (import link-out + recent-imports/undo, filter hints, bulk-message decision). Owns `clients.tsx`, `venue-profile.tsx`, `ContactFilterSheet.tsx`.
  - **16 Linked venues** (preview wiring, crop reuse, audit date range, onboarding bullets). Owns `CombinedPageConfigEditor.tsx`, `LinkAuditView.tsx`, `linked-venues/index.tsx`.
  - **07 Resources** (reorder, help tooltips via F4, detail view). Owns `ResourceManagerSheet.tsx`, `ResourceEditorSheet.tsx`.

Justification: S1–S4 isolate the four remaining hot files (`settings.tsx`, `index.tsx`, `today.tsx`, `services.tsx`) into single-owner lanes that run sequentially relative to earlier waves' edits of those files; 3P bundles the genuinely disjoint domains to run concurrently.

### Wave 4 — Lows (broad parallel, last)
All 61 low items, grouped by file-disjoint domains. Most are single-file polish (deposit inline buttons, absolute expiry time, font-preset typefaces, audit CSV, days-off banner, etc.) and the design-18 lows are already delivered by F4's primitives (now just adoption). Parallelize freely by domain, applying the §3 conflict map (e.g. any remaining `settings.tsx`/`index.tsx`/`today.tsx`/`services.tsx`/`booking-page.tsx` low touches go through that file's single owner, not concurrently).

---

## 5. Per-domain test strategy

Repo: `jest` + `@testing-library/react-native` (jest-expo), ~230 existing test files. Pattern note from project memory: wrap `fireEvent.press` in `await act(...)` (RTL press/act flush). Pure logic → unit tests; hooks/reducers → hook tests; UI-wiring → render+interaction tests.

1. **Navigation** — unit-test the destinations builder's gating (model-row visibility for staff vs admin, eligibility gates) as a pure function over a fake venue; render-test the search-keyword filter.
2. **Calendar** — unit-test `computeGridBounds` with override windows and the SecureStore prefs hook (hydrate/guard stale id) with a mocked SecureStore; render-test month-grid count derivation.
3. **Bookings** — unit-test the ported `collapseMultiServiceVisits` and the summary-stats memo (pure). Render-test the deposit-amount pill.
4. **New booking wizard** — unit-test multi-service chain recomputation + group/multi-service `buildPayload` shapes; mock-mutation test `useCreateMultiServiceBooking`/`useCreateGroupBooking`. Render+interaction test the new step transitions.
5. **Clients** — mostly UI-wiring: render+interaction test the import link-out and the recent-imports/undo list (mock `/api/import/sessions`). Unit-test any bulk-message semantics change.
6. **Classes & Events** — unit-test `useClassProducts` payload mappers + `useClassCommerceEnabled`; render+interaction test `CourseEnrollmentsSheet` cancel→refund toast.
7. **Resources** — unit-test the `sort_order` reorder PATCH mapping; render-test help-tooltip open.
8. **Availability** — unit-test the 409 acknowledge threading (mock `apiFetch` throwing `ApiError(status:409, body:{requires_confirmation})`, assert retry with `?acknowledge_affected_bookings=true`); render+interaction test the armed-confirm and `BookableCalendarsManager` reorder/slug/DELETE (mock hooks).
9. **Waitlist** — render+interaction test `WaitlistAvailabilityBanner` (mock `useWaitlistAlerts`) and the enable/mode section (mock `useUpdateFeatureFlags`); unit-test the widened `useJoinWaitlist` input.
10. **Reports/Home** — unit-test `HeatmapWeek` fill-bucket→colour mapping (pure) and the StatTile/MiniSparkline series prep; render-test refer-earn (mock `useReferrals`).
11. **Services** — unit-test override null-when-equals-base diffing and the specific-dates/date-range serializer into `ServiceCustomScheduleV2.rules`; render+interaction test the per-calendar offer toggle and `StaffServiceOverrideSheet` field-gating.
12. **Booking page** — unit-test the ported `buildVenueEmbedSnippet` (pure `lib/embed/embedSnippet.ts`) and `normalizeEmbedAccentHex`; render-test the QR card + copy.
13. **Compliance** — heaviest test surface: unit-test the ported `validateFormSchemaForType`, the field-builder reducer (add/edit/reorder/delete), and the capture payload shapes (signature `{method,...}`, date `YYYY-MM-DD`, default_value/today). Mock-mutation test create/version/clone/requirements hooks. Render+interaction test the field editor.
14. **Settings** — unit-test `planStaffLimit()` + `staffPlanLimitReached`; render+interaction test `DeleteVenueSheet` type-to-confirm and the PhoneInput E.164 normalize-on-blur.
15. **Communications** — render+interaction test the owner-alert card (email validation, PATCH) ; unit-test the `refetchInterval` config (assert option present on `useNotifications`).
16. **Linked venues** — render-test `BookingPagePreview` wiring in `CombinedPageConfigEditor` (props from `assembleConfig`) and the audit custom-range filter (unit-test the from/to → query mapping).
17. **Auth/Onboarding** — unit-test `mapExchangeError`'s discriminated reasons and the set-password validation; render+interaction test the set-password screen and the onboarding-aware `SetupChecklistCard` step derivation (pure `getSteps`-equivalent unit test).
18. **Design system** — render-test each new primitive: `SectionCard` slots, `HelpTooltip` open/close (+ reduceMotion), `StatTile`/`MiniSparkline`, the `Badge` compliance tone map, and the shimmer `Skeleton` reduceMotion early-return. These are mostly snapshot + interaction.

---

## 6. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Stale audit premises (compliance/practitioner/venue/class-commerce/delete routes "cookie-only")** lead agents to "re-migrate" already-Bearer WEB routes, churning the backend. | §0 documents the real state. Implementer rule: a 401 from the app on those routes = app token problem, not a route problem. Only B1/B2/B3 touch the backend. Fix the `useComplianceTypeManage.ts` docstring (L18-23) in domain 13 so it stops misleading. |
| 2 | **Native deps that can't be device-tested here** (`@stripe/stripe-react-native` PaymentSheet, `react-native-qrcode-svg`, `expo-linear-gradient`, possible signature-canvas). Android emulator is blocked (no virtualization); web preview is light-only and can't reach the authed API. | Verify each against https://docs.expo.dev/versions/v56.0.0/ before adding (AGENTS.md mandate). Gate Stripe behind a product decision (audit marks it High but optional vs the payment-link model). For QR prefer `react-native-qrcode-svg` (rides existing `react-native-svg`, no new native module). Keep `expo-linear-gradient` the only new native add for F4 and confirm it's an Expo-managed package. Write logic in pure helpers so they're testable without a device. |
| 3 | **AsyncStorage over-adoption.** Audit says "add AsyncStorage" for calendar prefs. | Do NOT. Reuse `expo-secure-store` (already a dep, proven in `LinkedVenueProvider`). F5 mandates SecureStore. |
| 4 | **`types/venue.ts` ripple.** Widening `VenueFeatureFlagsRaw` (boolean record → intersection with `compliance`/`waitlist_config`) can break existing consumers that assume a flat record. | Make it additive (intersection, all optional). Run `npm run typecheck` immediately after F1 before any dependent wave starts. F1 is the very first task for this reason. |
| 5 | **Reanimated/Fabric focus footgun** (project memory: never `setState` in `onFocus`/`onBlur` — drops Android focus). New inputs in compliance builder, PhoneInput, embed-accent, set-password, owner-alert. | Reuse the existing `Input` primitive (already uses a Reanimated shared value for the focus ring). PhoneInput normalize-on-blur must use the shared-value pattern, not `setState` in `onBlur` that re-renders the field. Add a code-review check for this in every input-adding domain. |
| 6 | **Edge-to-edge keyboard handling (SDK 56)** — `adjustResize`/`KeyboardAvoidingView` is dead app-wide; Sheet + `Screen(keyboardAvoiding scroll)` drive their own inset. New long editor sheets (compliance field builder, class-products, BookableCalendarsManager, DeleteVenueSheet). | Build all new editors inside the existing `Sheet` (`fill` mode + flex:1 ScrollView so the pinned Save bar doesn't overlap — per `sheet-fill-bounded-scroll` memory) or `Screen` with its keyboard plumbing. Do NOT introduce `useAnimatedKeyboard`/keyboard-controller. |
| 7 | **Staff-gate Stack remount** — `(app)` gate keys on the rotating token; losing `staff/me` data resets to the Calendar tab. New 17 onboarding gate reads `useSetupStatus` in `_layout.tsx`. | Use `keepPreviousData` on the setup-status query (memory: `staff-gate-stack-remount`); do not add token-keyed nav-gate queries without it. Don't hard-block non-admins. |
| 8 | **Hot-file contention** corrupting the build when two agents edit `settings.tsx` / `services.tsx` / `index.tsx` / `today.tsx` / `_layout.tsx` / `booking-page.tsx` concurrently. | §3 conflict map + §4 single-owner serial lanes. Route registrations in `_layout.tsx` are batched into one small edit. The 12/14 embed overlap is explicitly merged into one task. |
| 13→11 | **Sequential dependency on `services.tsx`** (compliance-requirements editor lands in Wave 1 via 13; Services Highs rebuild the same file in Wave 2). | Schedule 13 before 11; 11 rebases on 13's `services.tsx` state. Never run them concurrently. |
| 9 | **`ConfirmStep.tsx`/`ServiceBookingFlow.tsx` two-criticals churn** (group + multi-service in one flow). | One agent, sequential within domain 04 (multi-service first per the domain's own ordering), in an isolated worktree. |
| 10 | **Backend referrals shape mismatch** — B3 wraps an SSR loader never exposed as JSON; the app `useReferrals` may expect different keys than `loadReferralsDashboardForVenue` returns. | B3 must return the loader output verbatim and the app hook must type against the actual returned shape (read `load-dashboard.ts` first), not the web component's view-model. Land B3 before 10's refer-earn screen. |
| 11 | **`Alert.alert` is a web no-op** (memory) — tempting for the 409 confirm, delete-venue, seat-cap. | All confirms use `ConfirmSheet` / two-step armed-button (zero live `Alert.alert` in the repo today — keep it that way). |
| 12 | **Plan limits / entitlement 403s** on BookableCalendarsManager + staff seat cap surface as raw error toasts. | Catch the 403 `upgrade_required`/cap and reuse the existing plan-upsell pattern; hide the invite FAB at cap (compute from `pricing_tier` via `planStaffLimit()`), mirroring web. |

---

## 7. One-line wave summary (for scheduling)

- **F (serial, first):** F1 venue types → F2 practitioner/availability types → F3 ApiError-409 hooks → F4 primitives (incl. `expo-linear-gradient`) → F5 SecureStore calendar-prefs.
- **B (parallel w/ F, WEB):** B1 overrides→Bearer · B2 practitioner-services→Bearer · B3 create referrals GET.
- **Wave 1 (criticals):** [13 Compliance ‖ 08 Bookable-calendars+409 ‖ 14 Delete-venue+seat-cap ‖ 04 multi-service→group].
- **Wave 2 (highs):** [11 Services (after 13,B1,B2) ‖ 06 Class-products ‖ 09 Waitlist (after 08's booking-settings) ‖ 15 owner-alert ‖ 12+14 embed/QR/accent (merged) ‖ 17 set-password ‖ 10 refer-earn (after B3)].
- **Wave 3 (mediums):** S1 01-nav(settings.tsx) · S2 02-calendar+01-Today(index.tsx) · S3 10-home→17-onboarding(today.tsx) · S4 11-mediums(services.tsx) ‖ 3P:[03 ‖ 05 ‖ 16 ‖ 07].
- **Wave 4 (lows):** broad parallel by disjoint domain; design-18 lows = adopt F4 primitives.
