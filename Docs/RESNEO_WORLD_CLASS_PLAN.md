# Resneo App — Path to World-Class (Improvement Plan)

_Original audit: 2026-06-14 · **Status refreshed: 2026-06-14** after a full verification pass (5 read-only audit subagents re-checked every item against the live source on `main`, HEAD `a6df648`)._

_Method: read-only audit pass — three parallel code-audit agents (app architecture, web-reference parity, bug/quality hunt) + a design-system visual review on web preview + targeted source verification, then a second verification pass that re-graded every workstream item and scouted out-of-plan best-in-class gaps. **Live authenticated runtime testing was not performed**: the Expo web bundle (origin `localhost:8081`) cannot reach the staging venue API because those routes send no CORS headers for a browser origin (they are only ever called from native devices). Login itself works (Supabase auth → 200); the staff-access gate then stalls. **On-device QA is therefore a required step, not optional — see W3.4.** Every file:line below is from static analysis._

**Status legend:** ✅ Done & verified · 🟡 Partial / shipped-but-incomplete · ⬜ To do · ⛔ Blocked or deferred (needs a device, account, backend deploy, or DSN)

---

## Implementation status — current

Two implementation passes have landed on `main` since the plan was written. The original "Phase A" reliability/correctness/test work shipped (commits `a361433`, `0e93751`, `be34a6a`, `e2cc744`), and then — contrary to the plan's original sequencing — **the device-gated calendar interaction work (drag/resize + a real week matrix) was also built and shipped** (`e5d46b9`, `1ca5312`, `ab6f747`, `a6df648`). The codebase is **tsc + lint clean, 265 unit tests green** (`npm test` → 13 suites, 0 failures, ~3 s).

### Scoreboard

| Workstream | Done | Partial | To do | Blocked/Deferred |
|---|---|---|---|---|
| W1 Reliability | 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, sign-out cache-clear | — | 1.9 (new) | 1.6, 1.7 |
| W2 Correctness | 2.1, 2.2, 2.3, 2.4, 2.5\*, 2.6 | 2.7 | — | — |
| W3 Observability | 3.3 | 3.1, 3.4, 3.5 | 3.2, 3.6 (new) | parts of 3.1/3.4/3.5 |
| W4 Tests | 4.1 | 4.4 | 4.3 | 4.2 |
| W5 Interaction | 5.1, **5.2 (week matrix)** | 5.2 (tablet), 5.4, 5.5 | 5.3 | — |
| W6 Accessibility | 6.2, 6.3 | 6.1, 6.4 | — | VoiceOver/TalkBack device pass |
| W7 Parity edges | 7.3, 7.4, 7.5 | 7.1 | 7.2 | 7.1 create (backend) |
| **W8 Performance (new)** | — | — | 8.1–8.5 | — |
| **W9 Security/privacy (new)** | session in SecureStore | — | 9.1–9.4 | — |
| **W10 Notifications/links (new)** | tap→routing | — | 10.1–10.4 | — |

\* 2.5 was based on a false premise — see the correction in W2.

**Shipped & verified (static analysis confirms real implementations, not just comments):**
- **W1 reliability:** `apiFetch` timeout/abort — and it chains React Query's cancellation signal into the same `AbortController`, distinguishing timeout (408) vs. cancel vs. network failure (1.1); font-load degrades to system fonts and reports via `captureException` instead of crashing (1.2); calendar invalidates on create **and** walk-in (1.3); dead detail-invalidation removed (1.4); no retry on 401/403 — enforced globally in `queryClient.ts`, not just on `staff/me` (1.5); push dedupes on the stable user id (1.8); **sign-out clears the query cache** (`AuthProvider.tsx:175`).
- **W2 correctness:** per-variant `processing_time_blocks` (2.1) and add-on `cost_to_business_pence` (2.2) round-trip — the two silent data-loss bugs, fixed; dedicated `EXPO_PUBLIC_WEB_URL` link-outs (2.3); My Account save toasts success/failure (2.4); time-slot "now" is timer-driven + Start-now respects the visible filter (2.6).
- **W3 observability:** reporting **seam** (`lib/observability/index.ts`) + global `ErrorUtils` uncaught-error handler + live user context (`setObservabilityUser` on auth change). The Sentry SDK itself is **not** installed — see deferred.
- **W4 tests:** Jest harness + **265 pure-logic unit tests** across 13 suites (formatting, venue dates incl. DST, the booking-status machine, calendar grid-layout, time-slot/CSV/timeline/terminology/model-inference helpers) + **CI** (lint + test).
- **W5 interaction (newly shipped, was originally deferred):** **on-grid drag-to-reschedule + resize** wired to a real `PATCH /api/venue/bookings/[id]` mutation with conflict detection, snap-to-grid, haptics, and an Undo toast (`DraggableAppointmentBlock.tsx`, `CalendarDayGrid.tsx`, `useBookingMutations.ts`); **a real 7-column week matrix** that replaced the old day-picker (`WeekGrid.tsx`, `a6df648`); per-practitioner columns in the day "All" view (`AllCalendarsDayGrid.tsx`).
- **W6 a11y:** ≥44 pt touch targets via `hitSlop` padding (6.2); sheet grabber is a real `Pressable` that closes on tap (resolves the "affordance not wired" note); Dynamic Type honoured with a central `maxFontSizeMultiplier` cap and status pills paired with text, not colour alone (6.3); broad label/role coverage — **326 a11y props across 95 files** (6.1, static portion).
- **W7 parity:** compliance-flag dot surfaced on calendar blocks **and** list rows, not just the detail sheet (7.3); variant editor exposes description / buffer / is_active (7.4); the rebook bootstrap appointment branch is now **wired and live** — not dead code to delete (7.5); **Rebook** pre-selection completed.

**Corrections to the original plan (the audit found these items were mis-stated):**
- **2.5 (booking interval)** — _premise was wrong._ There is **no client-side slot engine** in the app (`lib/appointments/` does not exist). The wizard is a pure consumer of `GET /api/venue/appointment-availability`, so `booking_interval_minutes` is necessarily honoured **server-side** and offered times cannot diverge. **No app change is needed.** Marked ✅ (resolved / not-applicable).
- **7.1 (compliance template list/create)** — _premise was wrong._ List **and** create remain **cookie-only → 401** from the app (the backend never made them Bearer). The team correctly re-verified this and shipped the maximal Bearer-possible subset instead: a **discovery** workaround that reconstructs the template list from Bearer-accessible payloads + per-id hydration + **PATCH edit/archive**. **Create stays a web-only link-out by backend constraint.** Marked 🟡 (done as constrained; true list/create is ⛔ blocked on backend).
- **7.5 (rebook dead-code cleanup)** — _outcome inverted._ The "dead" appointment branch was **completed and is now live** (`BookingDetailContent.tsx:941`, consumed at `booking/new.tsx:256`). **Do not delete it.** Marked ✅.

**Deferred — needs a device, a backend deploy, an account, or a DSN to do _safely_:**
- **W1.6** key the cache on a stable session id instead of the rotating JWT — confirmed still keyed on the raw `accessToken` (`keys.ts`). A ~40-file change whose cache-correctness can't be verified without authed runtime testing. The shipped sign-out cache-clear removes the only correctness risk meanwhile, leaving just the minor hourly-refetch cost.
- **W1.7** offline mutation queue — confirmed `OfflineBanner` is display-only; no write queue.
- **W3** Sentry **SDK** activation (SDK + config plugin + DSN — currently `isObservabilityConfigured()` is always false), **analytics backend (3.2)**, **EAS dev build + the web Bearer deploy**, **on-device QA matrix** (iOS + the S23) — all require accounts/devices/builds outside this environment.
- **W4.2/4.3** component + e2e (Maestro) tests — RNTL queries don't bind under React 19.2 / RN 0.85 yet (`@testing-library/react-native` is installed but unused); the v4-correct reanimated mock is **staged and verified** in `jest.setup.js:27`.
- **W6.1** the live VoiceOver/TalkBack pass (static coverage is done); **W6.4** i18n string extraction.

The workstream tables below remain the canonical backlog, now annotated with status.

---

## TL;DR — the thesis (updated)

Resneo-app is a **mature, disciplined codebase, not a prototype** — and the original plan's first two priorities (resilience + the real correctness bugs) and a chunk of the fifth (interaction "feel") are now **shipped**. `tsc --noEmit` and `expo lint` pass clean; 265 unit tests are green; drag-to-reschedule and the week matrix exist and are wired to real mutations.

The appointments-only scope (vs the web app's five booking models, AI import tool, floor-plan editor, settings form-builders) remains a **deliberate and correct product cut-line** — mobile = at-the-counter operations, web = deep configuration. Respect that boundary; porting the web's CRUD surfaces would make the app worse.

With Phase A done, **the frontier to world-class has moved.** It is now five things, in priority order:

1. **Make it real & observable** — activate the Sentry SDK behind the seam, wire the render-`ErrorBoundary` into it (caught crashes are currently invisible), add analytics, and run the on-device QA matrix. The app still cannot see its own production failures.
2. **Performance & scale** — _newly identified, no workstream existed._ Five data-driven screens render unbounded arrays with `.map()` inside a `ScrollView` (violating the team's own `.cursorrules:105`), and only two components are `React.memo`'d. A busy salon's data will jank.
3. **Security & privacy at rest** — _newly identified._ The app holds a venue's entire client PII + GDPR + deposit book with no app-lock/biometric gate and no screen-capture protection.
4. **Close the remaining correctness/parity gaps** — the guest-merge flow **silently drops the source record's custom-field values** (a quiet data-loss path), and `Reduce Motion` is ignored by every new animation.
5. **Finish the test net & the "feel" edges** — component/e2e tests once RNTL binds, tablet/landscape columns, cross-practitioner drag, motion polish, empty-state art, notification depth, universal links.

This plan builds on the team's own roadmaps (`RESNEO_EXCELLENCE_PLAN.md` R20–R25, `APP_GAP_REPORT_R4.md`) and the now-shipped Phase A.

---

## What is already excellent (don't regress it)

- **Design system** — verified visually on web: clean navy/teal ramps, coherent typography (Inter), a full status-pill palette, well-differentiated badges, proper button hierarchy and elevation. The primitive layer is world-class already.
- **Architecture** — TanStack Query throughout, one fetch wrapper (now with timeout/abort + RQ-cancellation chaining), a namespaced key factory, per-domain hooks, optimistic patches + rollback + `seedDetailFromRow` to avoid empty flashes.
- **Auth done right** — Bearer JWT to `/api/venue/*`; the dangerous global "401 → signOut" is *deliberately absent*; session persisted in `expo-secure-store` (`lib/supabase.ts:13`); sign-out clears the cache.
- **Realtime** — `VenueLiveSyncProvider` with per-instance channel topics + 30 s polling fallback + live/reconnecting state.
- **Calendar interaction (new)** — drag-to-reschedule/resize with conflict refusal, snap-to-grid, haptics and Undo; a real 7-day week grid; per-practitioner day columns. This is now arguably the most polished interaction in the app.
- **Timezone discipline** — correct venue-tz date math (`lib/dates/venue-dates.ts`, noon-UTC parsing for the 6×7 grids, DST-boundary tests). 
- **Discipline** — stable list keys, centralized haptics vocabulary (`lib/haptics.ts`), consistent error/empty/retry + pull-to-refresh, near-zero TODO/FIXME debt, strong doc culture.

---

## Scope guardrail — what we should NOT build

These are web-only **by design** and should stay link-outs/read-only on mobile:

- Multi-model CRUD (tables/floor plans, events, classes, resources) — read + at-counter actions only.
- AI data-import wizard, booking-page cover cropper, compliance form-builder authoring (create stays web — backend-gated), settings form editors.
- Self-serve venue deletion danger-zone, super-admin, sales portal, marketing/SEO pages.

World-class = *excellent at the chosen scope*, not feature-complete vs the web dashboard.

---

## Workstreams

Effort: **S** ≤ ½ day · **M** ~1–3 days · **L** ~1 week+.

### W1 — Reliability & resilience hardening

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 1.1 | ✅ | Request timeout + abort in `apiFetch` (15 s default, chains RQ cancel, maps timeout→408). | `lib/api/client.ts:107` | S |
| 1.2 | ✅ | Font-load failure renders on `loaded \|\| error` + reports, no crash. | `app/_layout.tsx:50` | S |
| 1.3 | ✅ | Create **and** walk-in invalidate `calendar.all()`. | `useCreateBooking.ts:75`, `useCreateWalkIn.ts:54` | S |
| 1.4 | ✅ | Dead `bookings.detail(undefined,id)` no-op removed. | `useCreateBooking.ts` | S |
| 1.5 | ✅ | No retry on 401/403 (global, in `queryClient.ts:33`). | `queryClient.ts` | S |
| 1.6 | ⛔ | Stop keying the whole cache on the raw JWT — still keyed on `accessToken`; rotates hourly. Key on a stable session id; pass the token only to the `queryFn`. **Needs authed runtime testing to verify cache correctness.** | `lib/queries/keys.ts`, `useAccessToken.ts` | M |
| 1.7 | ⛔ | Offline mutation queue — `OfflineBanner` is display-only. Add a write queue (or block + clearly message). Pairs with 1.1 and 1.9. | `OfflineBanner.tsx`, query client | M |
| 1.8 | ✅ | Push dedupes on stable user id, not the token. | `PushNotificationsProvider.tsx:43` | S |
| **1.9** | ⬜ | **Session-expiry UX (new).** A failed token refresh silently bounces the user to sign-in — no "your session expired" messaging, no global 401→friendly-relogin. `AuthProvider` only `console.warn`s `getSession` failures; there's no `TOKEN_REFRESHED`/refresh-failure branch. Add explicit handling + a toast/relogin prompt. | `providers/AuthProvider.tsx:67` | S–M |

### W2 — Correctness / data-integrity

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 2.1 | ✅ | Per-variant `processing_time_blocks` round-trips. | `VariantsEditorSheet.tsx:164`, `useServicesManage.ts:76` | M |
| 2.2 | ✅ | Add-on `cost_to_business_pence` round-trips through delete+reinsert. | `AddonGroupEditorSheet.tsx:266` | M |
| 2.3 | ✅ | Dedicated `EXPO_PUBLIC_WEB_URL` for dashboard link-outs. | `lib/env.ts:49`, `settings.tsx:20`, `plan.tsx:33` | S |
| 2.4 | ✅ | My Account save toasts success/failure. | `account.tsx:88` | S |
| 2.5 | ✅ | ~~Per-service booking interval~~ — **corrected: not applicable.** App consumes server-generated slots (`/api/venue/appointment-availability`); no client slot engine exists, so the interval is honoured server-side. No app change. | `useAppointmentAvailability.ts`, `TimeSlotStep.tsx` | — |
| 2.6 | ✅ | TimeSlot "now" is timer-driven; Start-now searches `visibleSlots`. | `TimeSlotStep.tsx:202` | S |
| 2.7 | 🟡 | CSV web-failure path — the no-op `Alert.alert` is gone, replaced by `console.error` with a documented rationale (no React context in that plain module; web is dev-only). Strictly **not** the Toast host. Low impact; close it by refactoring the web export to call from a component that can toast, or accept the console log. | `lib/reports/csv-export.ts:68` | S |

### W3 — Observability & production readiness  ·  the "is it real?" layer

| # | Status | Item | Effort |
|---|---|------|--------|
| 3.1 | 🟡 | **Crash + error reporting.** The JS **seam** is live (`lib/observability/index.ts`: `captureException`/`captureMessage`/`setObservabilityUser`, a global `ErrorUtils` handler wired at `_layout.tsx:29`, live user context). **Still to do:** (a) install + init `@sentry/react-native` (0 occurrences in lockfile today), (b) supply `EXPO_PUBLIC_SENTRY_DSN`, (c) add a **Promise-`unhandledrejection` handler** (only the synchronous `ErrorUtils` hook exists — async rejections still vanish), (d) releases/breadcrumbs/source maps. | M |
| 3.2 | ⬜ | **Product analytics.** No instrumentation exists (no track/logEvent, no provider, no SDK). Instrument the core funnels (login → calendar → create-booking → detail actions) so dead features are found and decisions are data-driven. | M |
| 3.3 | ✅ | **EAS dev build (app-side).** `eas.json` has development/preview/production profiles; projectId `88e39a06…` in `app.json:78`; `expo-dev-client` installed. (Backend Bearer deploy is the external half — still needed to unblock W7.) | M |
| 3.4 | 🟡 | **On-device QA matrix.** `Docs/DEVICE_TEST_PLAN.md` is a real scripted plan (smoke, booking lifecycle, calendar gestures, push, light/dark × admin/staff matrix). **Execution on iOS + the S23 is the outstanding ⛔ gate** — especially for the just-shipped drag/resize (its last commit `ab6f747` fixed a 100%-repro release crash, proof the device gate is real). | M |
| 3.5 | 🟡 | **Release pipeline.** EAS profiles ✅ + store-asset scripts ✅ (`scripts/generate-*.mjs`). **Missing:** OTA strategy/rollback (no `expo-updates` dep, no `runtimeVersion`), Play Data-Safety / App-Privacy declarations (only a checklist line today). | M |
| **3.6** | ⬜ | **Global ErrorBoundary → observability (new).** There is no single root `ErrorBoundary` (only per-screen ones on Calendar + Bookings; clients, services, waitlist, all of `manage/*` are unprotected → bare router fallback on a render crash). Worse, `ErrorBoundary.componentDidCatch` only `console.error`s in `__DEV__` (`ErrorBoundary.tsx:28`) — it **never calls `captureException`**, so caught render crashes are invisible to the seam from 3.1. Add a root boundary with a recovery action and wire `componentDidCatch → captureException`. | S–M |

### W4 — Automated test safety net

Ground truth: **`npm test` → 13 suites, 265 tests, 0 failures, ~3 s.** All pure-logic; no `.skip`.

| # | Status | Item | Effort |
|---|---|------|--------|
| 4.1 | ✅ | **Unit tests for pure logic** — broad coverage: venue-dates (incl. DST, 75 tests), booking-status machine (38), calendar grid-layout (31), timeline, time-slot helpers, format (pence/parse), terminology, model-inference, csv, status-visual/colours. **Small gaps:** `lib/rebook-bootstrap.ts` is untested (now that it's live — 7.5); there is no `booking-interval` module to test (see 2.5). | M |
| 4.2 | ⛔ | **Component tests (RNTL)** for `BookingDetailContent` + wizard steps. Blocked: RNTL queries don't bind under React 19.2 / RN 0.85; `@testing-library/react-native` is installed but unused. The v4-correct reanimated mock is **staged** (`jest.setup.js:27`). Land when the renderer binds. | M |
| 4.3 | ⬜ | **E2E smoke** (Maestro or Detox): login → calendar → create booking → detail action → cancel. None exists (the only Playwright specs are in the read-only `_reference/` web clone). | L |
| 4.4 | 🟡 | **CI.** `.github/workflows/ci.yml` runs `lint` + `test` on push to `main`/`staging` + all PRs. **Typecheck is deliberately excluded** (needs gitignored `expo-env.d.ts`/`.expo/types`). Close the gap: have CI run `expo prebuild`-less type-gen (or `tsc` after generating types) so type regressions can't merge. | S |

### W5 — Interaction depth & "feel"

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 5.1 | ✅ | **On-grid drag-to-reschedule + resize** — fully wired to `PATCH /bookings/[id]` (`booking_time` + `duration_minutes`), with hold-to-arm, conflict refusal (overlap→red/refuse, off-hours→amber/allow), snap-to-grid, haptics, optimistic settle, and an Undo toast. | `DraggableAppointmentBlock.tsx`, `CalendarDayGrid.tsx`, `index.tsx:360`, `useBookingMutations.ts:181` | L |
| 5.2 | 🟡 | **Week matrix done; tablet/landscape not.** The 7-column week grid shipped (`WeekGrid.tsx`, replaced the day-picker) and the day "All" view has per-practitioner columns (`AllCalendarsDayGrid.tsx`). **Remaining:** no orientation/breakpoint logic anywhere — no tablet/landscape multi-practitioner roster layout; `WeekGrid` is single-practitioner only. | `WeekGrid.tsx`, `AllCalendarsDayGrid.tsx` | M (tablet) |
| 5.3 | ⬜ | **Cross-practitioner drag reassign.** `AllCalendarsDayGrid` is read-only by design (no per-column gesture bookkeeping); blocks aren't draggable and no reassign mutation is called. Add column-aware drag + a staff-reassign PATCH. | calendar | M |
| 5.4 | 🟡 | **Motion system.** List enter/exit + `LinearTransition` + sheet springs are in (`bookings.tsx:571`, `clients.tsx:465`, `BookingDetailSheet.tsx:204`). **Clean miss: `Reduce Motion` is ignored** — zero `useReducedMotion`/`AccessibilityInfo` references; every new fade/spring/layout animation runs regardless of the OS setting. Highest-value, lowest-effort remaining a11y win. Also add route/shared-element transitions. | global | S (RM) + M |
| 5.5 | 🟡 | **Haptics done; empty-state art not.** Centralized 5-verb haptics utility used consistently (`lib/haptics.ts`). `EmptyState` still uses SF-Symbol/Material glyphs, not bespoke illustrations — `react-native-svg` is already installed (used for charts), so this is a smaller lift than "deferred" implied. | global | S–M |

### W6 — Accessibility & inclusivity

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 6.1 | 🟡 | **a11y labels/roles** — broad static coverage (326 props / 95 files, incl. dense calendar surfaces). **Outstanding:** the live VoiceOver/TalkBack pass on core flows (⛔ device-gated). | global | M |
| 6.2 | ✅ | **Hit targets ≥ 44 pt** — `sm` Button auto-pads `hitSlop` to 44 pt; Sheet grabber is a real `Pressable` (closes on tap) with `hitSlop`. | `Button.tsx:74`, `Sheet.tsx:105` | S |
| 6.3 | ✅ | **Dynamic Type + status-not-by-colour-alone** — central `maxFontSizeMultiplier={1.3}` on the shared `Text` primitive; status pills pair colour with a text label everywhere (incl. drag conflict badge). | `Text.tsx:38` | M |
| 6.4 | 🟡 | **Localization readiness** — formatting is routed through `Intl` (good: currency centralized in `lib/format.ts:10`) but hard-coded `en-GB`/`GBP`; **no i18n layer and strings are inline.** Add `expo-localization` + a strings catalogue + a locale-driven money/date formatter (EN-only can still ship first). | global | M |

### W7 — Feature-parity edges (within the cut-line)  ·  some unblocked by the backend Bearer deploy (3.3)

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 7.1 | 🟡 | **Compliance templates — corrected.** List/create remain **cookie-only → 401** (backend never made them Bearer). Shipped instead: a discovery workaround (reconstructs the list from Bearer payloads) + per-id hydration + **PATCH edit/archive**; create is a web link-out. ⛔ True list/create is blocked on a backend change. | `useComplianceTypeManage.ts` | M |
| 7.2 | ⬜ | **Merge custom-fields resolution (data-loss bug).** The guest-merge wizard resolves name/email/phone/notes/tags/marketing but **omits `custom_fields` entirely** — so a merge **silently drops the source record's custom-field values**, with no warning. The web merge resolves them (`source_overlay`). Add a resolution step + warn before discarding. _Higher impact than its M sizing — it's quiet data loss._ | `MergeContactDetailSheet.tsx`, `types/guest-merge.ts` | M |
| 7.3 | ✅ | Compliance-flag dot surfaced on calendar **blocks** and list **rows** (not just the detail sheet); modify-service edge cases (archived/out-of-catalog service, variant reseed, staff reassignment, orphaned add-on drop, debounced validation) are thorough. | `BookingRow.tsx:145`, `AppointmentBlock.tsx:223`, `ModifyBookingSheet.tsx` | M |
| 7.4 | ✅ | Variant editor exposes description / buffer / is_active. | `VariantsEditorSheet.tsx:232` | M |
| 7.5 | ✅ | **Corrected — do not delete.** The rebook bootstrap appointment branch is now **wired and live** (`BookingDetailContent.tsx:941` → `booking/new.tsx:256`). Instead: **add a test** for it (covers the 4.1 gap). | `lib/rebook-bootstrap.ts` | S |

### W8 — Performance & scale  ·  NEW · the unaddressed dimension

The original plan had no performance workstream. Audit found virtualization is inconsistent and memoization is thin — fine for a small venue, janky for a busy one. This directly violates the team's own rule (`.cursorrules:105`: "Use FlatList not `.map()` over ScrollView for any list of >20 items").

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 8.1 | ⬜ | **Virtualize the unbounded lists.** Five data-driven screens render arrays with `.map()` inside a `ScrollView`. Priority order: client detail (renders up to 80 bookings + a full activity timeline in one ScrollView — heaviest), services (each row maps variants + addon groups), waitlist, classes, events. Convert to `FlatList`/`FlashList`. | `client/[id].tsx:407`, `services.tsx:898`, `waitlist.tsx:434`, `classes.tsx:187`, `events.tsx` | M |
| 8.2 | ⬜ | **Memoize heavy rows.** Only 2 `React.memo` in the whole repo. Wrap `GuestRow`, `BookingSwipeRow`, `ServiceRow`, and the waitlist card so they don't re-render on every parent state change. | list row components | S–M |
| 8.3 | ⬜ | **Stop the waitlist 60 s tick re-rendering all rows.** A `setInterval` for expiry countdowns re-renders the entire list every minute (`waitlist.tsx:152`). Move the tick into a per-row memoized countdown or a single shared clock. | `waitlist.tsx:152` | S |
| 8.4 | ⬜ | **FlatList tuning + pagination.** No `windowSize`/`removeClippedSubviews`/`maxToRenderPerBatch`/`initialNumToRender` anywhere. Bookings week/month loads the whole range into one in-memory list with no pagination. Add tuning + range pagination. | bookings/clients lists | S–M |
| 8.5 | ⬜ | **A render-profiling pass + budget.** No perf instrumentation exists. Add a lightweight profiling pass (RN Performance API or a dev-only render counter), set a cold-start + scroll-jank budget, and verify on the S23. Pairs with W3.4. | global | M |

### W9 — Security, privacy & at-rest protection  ·  NEW

The app holds a venue's entire client PII book (names, phones, emails), GDPR data, compliance records, and deposit history — with no device-level protection beyond the OS lock screen.

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 9.1 | ⬜ | **App-lock / biometric gate on resume.** No `expo-local-authentication`. Add an optional Face ID/fingerprint re-auth when the app returns to foreground (admin-configurable), so a borrowed/unlocked phone doesn't expose the client book. | new provider + settings | M |
| 9.2 | ⬜ | **Screen-capture protection on PII/compliance screens.** No `FLAG_SECURE`/`preventScreenCapture`. Apply on client detail, compliance records, and deposit screens. | sensitive routes | S |
| 9.3 | ✅/note | **Session storage is already in `expo-secure-store`** (`lib/supabase.ts:13`) — keep it. (Listed for completeness; no action.) | — | — |
| 9.4 | ⬜ | **GDPR/export hardening.** Contacts CSV builds the whole string synchronously on the JS thread up to 5 000 rows then `Share`s it — chunk/stream it, and confirm the `GdprSection` delete/export flows have explicit confirmation + audit. | `clients.tsx:70`, `client/[id].tsx:482` | S–M |

### W10 — Notifications & deep-linking depth  ·  NEW

Tap-to-route is solid; the rest is minimal.

| # | Status | Item | Where | Effort |
|---|---|------|-------|--------|
| 10.1 | ✅ | Notification tap routes to `/booking/{id}` incl. cold-start (`getLastNotificationResponseAsync`); calendar accepts `?date=` deep-links. Keep. | `PushNotificationsProvider.tsx:99` | — |
| 10.2 | ⬜ | **Android notification channels + badges.** Everything lands in one un-muteable default channel; `shouldSetBadge:false` and no `setBadgeCountAsync`. Define per-type channels (new booking, cancellation, reminder) and wire badge counts. | `PushNotificationsProvider.tsx:89` | S–M |
| 10.3 | ⬜ | **Actionable notifications.** No categories/action buttons. Add inline "Confirm"/"View" actions on a new-booking push (+ cold-start parity for the action). | push provider | M |
| 10.4 | ⬜ | **Universal / App Links.** Only the `resneo://` custom scheme is configured — no iOS `associatedDomains`, no Android verified App Links. Emailed magic-links and shared booking URLs won't reliably open the app. Add both. | `app.json:8` | S–M |

---

## Suggested sequence (updated)

**Phase A — "Tighten the bolts." ✅ DONE.** W1.1–1.5/1.8, W2.1–2.4/2.6, the observability seam, 265 unit tests + CI. Shipped on `main`.

**Phase A′ — interaction (shipped early).** W5.1 drag/resize + W5.2 week matrix landed ahead of schedule and need the on-device pass (W3.4) to certify.

**Phase B — "Make it real & observable" (do next, mostly no new device needed for the code).**
Activate **Sentry (3.1)** behind the existing seam + add the Promise-rejection handler; wire the **global ErrorBoundary → observability (3.6)**; add **analytics (3.2)**; add **typecheck to CI (4.4)**; ship **session-expiry UX (1.9)**; fix the **guest-merge custom-fields data loss (7.2)**; add **`Reduce Motion` (5.4)** — small and high-value. Then coordinate the **backend Bearer deploy + EAS dev build (3.3)** and run the **on-device QA matrix (3.4)** to certify drag/resize, push, and Stripe flows.

**Phase C — "Scale & harden."**
**W8 performance** (virtualize the five `.map()` screens, memoize rows, fix the waitlist tick) and **W9 security/privacy** (app-lock, screen-capture). **W10 notification depth + universal links.** These are what separate "polished demo" from "runs a busy salon all day."

**Phase D — "Finish the feel & the net."**
W5.2 tablet/landscape columns + W5.3 cross-practitioner drag + W5.5 empty-state art; W6.1 live VoiceOver/TalkBack pass + W6.4 i18n; W4.2 component / W4.3 e2e tests once RNTL binds; W1.6 cache-keying + W1.7 offline queue; W3.5 OTA/privacy; store submission.

---

## Risks & dependencies

- **Cross-repo dependency (critical):** the web repo's cookie→Bearer migration must reach `main` + deploy before W7.1 true list/create (and parts of compliance) can work end-to-end. Track in `WEB_BEARER_AUTH_MIGRATION.md`. Until then, 7.1 stays a constrained workaround by design.
- **No device verification yet:** web preview can't authenticate against the venue API (CORS). Treat W3.4 as a gate before any "done" claim on the **already-shipped** drag/resize/week-matrix — the last drag commit fixed a 100%-repro release crash, so the gate is not theoretical.
- **Observability is blind to render crashes:** until 3.6 wires `componentDidCatch → captureException`, the seam from 3.1 won't see caught UI crashes even after Sentry is live. Sequence 3.6 with 3.1.
- **Performance debt compounds silently:** W8 has no test or alarm; a power-venue's data is the only thing that surfaces it. Add the profiling budget (8.5) early so regressions are caught, not discovered in the field.

---

## Quick-wins checklist (all Effort = S)

Original Phase-A quick wins — **all shipped:**
- [x] `apiFetch` timeout/abort (1.1)
- [x] Font-load no longer crashes the app (1.2)
- [x] Calendar invalidation on create/walk-in (1.3)
- [x] No retry on 401/403 (1.5)
- [x] `EXPO_PUBLIC_WEB_URL` for dashboard link-outs (2.3)
- [x] My Account save toast (2.4)
- [x] TimeSlot "now" tick + Start-now uses visible slots (2.6)
- [x] `sm` Button + tappable targets to ≥ 44 pt (6.2)

New quick wins (start here):
- [ ] **`Reduce Motion`** — gate the new animations on `useReducedMotion` (5.4)
- [ ] **ErrorBoundary → `captureException`** + a root boundary (3.6)
- [ ] **Promise `unhandledrejection` handler** in the observability seam (3.1c)
- [ ] **Typecheck in CI** (4.4)
- [ ] **`React.memo` on `GuestRow`/`BookingSwipeRow`/`ServiceRow`** (8.2)
- [ ] **Fix the waitlist 60 s full-list re-render** (8.3)
- [ ] **`FLAG_SECURE`/`preventScreenCapture`** on PII/compliance screens (9.2)
- [ ] **Test for `rebook-bootstrap`** now that it's live (4.1 / 7.5)
- [ ] **Warn before discarding custom fields on merge** (interim guard for 7.2)
