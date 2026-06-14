# Resneo App — Path to World‑Class (Improvement Plan)

_Date: 2026‑06‑14_

_Method: read‑only audit pass — three parallel code‑audit agents (app architecture, web‑reference parity, bug/quality hunt) + a design‑system visual review on web preview + targeted source verification. **Live authenticated runtime testing was not performed**: the Expo web bundle (origin `localhost:8081`) cannot reach the staging venue API because those routes send no CORS headers for a browser origin (they are only ever called from native devices). Login itself works (Supabase auth → 200); the staff‑access gate then stalls. **On‑device QA is therefore a required step, not optional — see W3.** Every file:line below is from static analysis._

---

## TL;DR — the thesis

Resneo‑app is a **mature, disciplined codebase, not a prototype.** `tsc --noEmit` and `expo lint` pass clean; the bug hunt found **no Critical defects and no crash‑on‑device patterns**; the design system is genuinely polished; Bearer auth, optimistic mutations with rollback, realtime live‑sync, and loading/error/empty states are handled well across ~33 routes and 50+ venue API endpoints. The Reanimated‑worklet, Fabric‑focus, and `SymbolView` object‑form rules are followed throughout.

So the gap to **world‑class is not feature breadth.** The appointments‑only scope (vs the web app's five booking models, AI import tool, floor‑plan editor, settings form‑builders) is a **deliberate and correct product cut‑line** — mobile = at‑the‑counter operations, web = deep configuration. We should *respect* that boundary, not chase it. Porting the web's CRUD surfaces would make the app worse, not better.

The path to world‑class is five things, in priority order:

1. **Resilience** — the app trusts the network too much: no request timeouts, no offline mutation queue, and a font fetch failure throws the whole app to an error screen.
2. **Observability + on‑device verification** — there is no crash reporting and no analytics, and nothing has been verified on a real device because web preview can't exercise authed flows.
3. **A test safety net** — the mobile app has **zero automated tests**; the web app it mirrors has 100+ Vitest/Playwright specs. Every change below risks silent regressions until this exists.
4. **A few real correctness bugs** — two of them *silently lose data on save*.
5. **Interaction depth ("feel")** — drag‑to‑reschedule, week/tablet calendar, motion, accessibility — the device‑gated polish that separates "good" from "world‑class."

This plan builds on the team's own roadmaps (`RESNEO_EXCELLENCE_PLAN.md` R20–R25, `APP_GAP_REPORT_R4.md`) and consolidates them into prioritized workstreams with a phased sequence.

---

## What is already excellent (don't regress it)

- **Design system** — verified visually on web: clean navy/teal ramps, coherent typography (Inter), a full status‑pill palette, well‑differentiated badges, proper button hierarchy and elevation. The primitive layer is world‑class already.
- **Architecture** — TanStack Query throughout, one fetch wrapper, a namespaced key factory, per‑domain hooks, optimistic patches + rollback + `seedDetailFromRow` to avoid empty flashes.
- **Auth done right** — Bearer JWT to `/api/venue/*`; the dangerous global "401 → signOut" is *deliberately absent* (`lib/queries/queryClient.ts`) — keep it that way.
- **Realtime** — `VenueLiveSyncProvider` with per‑instance channel topics + 30 s polling fallback + live/reconnecting state.
- **Discipline** — stable list keys everywhere, correct timezone date math (`lib/dates/venue-dates.ts`, noon‑UTC parsing for the 6×7 grids), near‑zero TODO/FIXME debt, strong doc culture.

---

## Scope guardrail — what we should NOT build

These are web‑only **by design** and should stay link‑outs/read‑only on mobile. Listing them so they don't creep into "parity":

- Multi‑model CRUD (tables/floor plans, events, classes, resources) — read + at‑counter actions only.
- AI data‑import wizard, booking‑page cover cropper, compliance form‑builder authoring, settings form editors.
- Self‑serve venue deletion danger‑zone, super‑admin, sales portal, marketing/SEO pages.

World‑class = *excellent at the chosen scope*, not feature‑complete vs the web dashboard.

---

## Workstreams

Effort: **S** ≤ ½ day · **M** ~1–3 days · **L** ~1 week+. Impact is for end users / reliability.

### W1 — Reliability & resilience hardening  ·  highest ROI, mostly small

| # | Item | Where | Effort | Impact |
|---|------|-------|--------|--------|
| 1.1 | **Add request timeout + abort to `apiFetch`.** No `AbortController`/timeout today, and React Query is `networkMode:'online'` — a stalled request never rejects, so any `loading={mutation.isPending}` button spins until the OS socket times out (60 s+). | `lib/api/client.ts:82‑97` | S | **High** |
| 1.2 | **Don't crash on font‑load failure.** `useEffect(() => { if (error) throw error })` throws into the router ErrorBoundary (white screen) if the Inter fetch fails offline/cold. Render on `loaded || error` and fall back to system fonts. | `app/_layout.tsx:39‑41` | S | **High** |
| 1.3 | **Invalidate the calendar after create/walk‑in.** `useCreateBooking`/`useCreateWalkIn` invalidate `bookings.all()`+`dashboard.all()` but **not** `calendar.all()` (which `useBookingMutations.invalidateBookingCaches` does). New bookings show stale on the grid until the 60 s poll. | `lib/queries/useCreateBooking.ts:70‑79`, `useCreateWalkIn.ts:50‑53` | S | Med |
| 1.4 | **Remove dead detail‑invalidation no‑op.** `bookings.detail(undefined, id)` never matches the token‑scoped key, so the call does nothing (harmless but misleading). | `lib/queries/useCreateBooking.ts:74‑78` | S | Low |
| 1.5 | **Don't retry auth‑failed queries.** `staff/me` inherits global `retry:1`, so a genuine not‑staff 401 costs an extra round‑trip before the gate settles. Skip retry on 401/403. | `lib/queries/useStaffMe.ts`, `queryClient.ts:28` | S | Med |
| 1.6 | **Stop keying the whole cache on the raw JWT.** Every query key embeds `accessToken`; with hourly auto‑refresh the token rotates and orphans the *entire* cache → full refetch of every screen mid‑shift. Key on a stable user/session id; pass the token only to the `queryFn`. | `lib/queries/keys.ts`, `useAccessToken.ts` | M | Med |
| 1.7 | **Offline mutation resilience.** `OfflineBanner` is informational only. Consider a write queue (or at least block + clearly message) so a tap during signal loss isn't silently lost. Pairs with 1.1. | `components/ui/OfflineBanner.tsx`, query client | M | Med |
| 1.8 | **Push re‑registers on every token refresh** (dedupe ref keyed on `accessToken`). Key it on device/user id. | `providers/PushNotificationsProvider.tsx:49‑54` | S | Low |

### W2 — Correctness / data‑integrity bugs  ·  real, user‑visible

| # | Item | Where | Effort | Impact |
|---|------|-------|--------|--------|
| 2.1 | **Variant editor wipes per‑variant `processing_time_blocks`.** Variant save rebuilds each variant without the field → deleted server‑side. (Service‑level processing blocks *are* now round‑tripped in `services.tsx:735`; the per‑variant path is not.) Round‑trip it through the editor + write input. | `components/manage/VariantsEditorSheet.tsx`, `lib/queries/useServicesManage.ts` | M | **High** (data loss) |
| 2.2 | **Add‑on group editor drops `cost_to_business_pence`.** Group save is delete+reinsert and never sends the field → reset to null. Confirmed absent from app source. Round‑trip it. | `components/manage/AddonGroupEditorSheet.tsx`, `types/addon-groups.ts` | M | **High** (data loss) |
| 2.3 | **"Manage on web" link‑outs point at the API origin.** Web‑dashboard URLs are derived from `EXPO_PUBLIC_API_URL` (the API host), so taps land on an API endpoint, not the dashboard. Add a dedicated `EXPO_PUBLIC_WEB_URL`. | `lib/env.ts` `getApiUrl`, `app/(app)/(tabs)/settings.tsx:38‑42`, `app/(app)/manage/plan.tsx:59` | S | Med (broken links) |
| 2.4 | **My Account save was silently 401‑ing** (`staff/me` PATCH was cookie‑only). **Now unblocked:** web commit #66 made `staff/me` PATCH Bearer+cookie (on `main`). Verify the app's PATCH path and surface success/failure with a toast. | `app/(app)/manage/account.tsx` | S | Med |
| 2.5 | **Per‑service booking interval not respected.** New web #65 feature (`booking_interval_minutes` / `booking_minute_marks`) appears **nowhere** in app source — the wizard time‑slot engine generates slots without it, so offered times can diverge from web. Implement in the availability/slot layer. | booking‑wizard time engine, `lib/appointments/*` | M | Med |
| 2.6 | **Time‑slot "now" is computed impurely during render** (`new Date()` in render, not timer‑driven) and **"Start now" can pick a slot hidden by the min‑notice filter** (searches unfiltered `slots`). Drive "now" from a 30–60 s tick like `useNowMinutes`; search `visibleSlots`. | `components/booking-wizard/TimeSlotStep.tsx:199‑207, 243‑252` | S | Low |
| 2.7 | **`Alert.alert` fallback is a no‑op on web** (CSV export failure path) — use the Toast host. Low impact (web is dev‑only) but it's the documented anti‑pattern. | `lib/reports/csv-export.ts:69` | S | Low |

### W3 — Observability & production readiness  ·  the "is it real?" layer

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 3.1 | **Crash + error reporting (Sentry).** Deferred since R25 — do it now. Releases, breadcrumbs, source maps, and wrap `apiFetch`/mutations so silent failures become visible. A world‑class app cannot ship blind. | M | **High** |
| 3.2 | **Product analytics.** Instrument the core funnels (login → calendar → create‑booking → detail actions) so decisions are data‑driven and dead features are found. | M | Med |
| 3.3 | **EAS dev build + coordinate the backend Bearer deploy.** Several mobile features are blocked on the web repo's cookie→Bearer migration ("batches 5/6/7") reaching `main` + deploying (some already on `staging`). One coordinated deploy unblocks a chunk of W7. Stand up the EAS dev build (already linked: projectId `88e39a06…`) so device QA is possible. | M | **High** (unblocks others) |
| 3.4 | **On‑device QA matrix (iOS + Android, the S23).** The only way to verify what web preview can't: calendar drag/long‑press, gesture sheets, push deep‑links, Stripe/deposit flows, secure‑store session, haptics, keyboard avoidance. Build a scripted pass from `DEVICE_TEST_PLAN.md`. | M | **High** |
| 3.5 | **Release pipeline.** EAS build profiles, OTA‑update strategy/rollback, store‑listing assets (icon/feature‑graphic/screenshot scripts already exist), privacy declarations. | M | Med |

### W4 — Automated test safety net  ·  currently zero in mobile

The app ships **no tests** (`package.json` has no test runner/script); the web mirror has 100+. This is the single biggest structural risk to everything above.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 4.1 | **Unit‑test the pure logic.** Highest value, no device needed: `lib/dates/venue-dates`, the booking‑status state machine (`lib/booking/booking-status-actions`), `lib/format` (pence/parse), calendar `grid-layout.ts`, booking‑interval, `rebook-bootstrap`. Port equivalents from the web's `processing-time`, `service-variant`, `validate-appointment-modification` specs where logic mirrors. (Add Jest/Vitest + `react-native` preset.) | M | **High** |
| 4.2 | **Component tests** for the keystone `BookingDetailContent` + wizard steps (React Native Testing Library) — status transitions, optimistic rollback, disabled gating. | M | Med |
| 4.3 | **E2E smoke** (Maestro or Detox) for the critical path: login → calendar → create booking → detail action → cancel. | L | Med |
| 4.4 | **CI:** run `typecheck` + `lint` + tests on every PR. | S | Med |

### W5 — Interaction depth & "feel"  ·  device‑gated polish

| # | Item | Where | Effort | Impact |
|---|------|-------|--------|--------|
| 5.1 | **On‑grid drag‑to‑reschedule + resize.** The biggest "feel" gap vs web; today reschedule is a long‑press sheet only. The `DraggableAppointmentBlock` scaffolding exists. | calendar components | L | **High** |
| 5.2 | **7‑column week matrix + tablet/landscape multi‑practitioner columns.** Week is currently a day‑picker; `AllCalendarsDayGrid` exists for columns. | calendar | L | Med |
| 5.3 | **Cross‑practitioner drag reassign** on the multi‑column grid. | calendar | M | Med |
| 5.4 | **Motion system** — route/shared‑element transitions, list enter/exit, sheet spring tuning, **respect Reduce Motion**. Deferred R25. | global | M | Med |
| 5.5 | **Haptics consistency pass** + **empty‑state illustrations/iconography** (deferred R25) for a finished feel. | global | S–M | Med |

### W6 — Accessibility & inclusivity  ·  table stakes for world‑class

| # | Item | Where | Effort | Impact |
|---|------|-------|--------|--------|
| 6.1 | **Full a11y audit + VoiceOver/TalkBack pass** on the core flows; finish `accessibilityLabel/role` coverage on touchables. | global | M | **High** |
| 6.2 | **Hit targets ≥ 44 pt.** `sm` Button is 36 px; the Sheet drag‑handle implies a drag affordance that isn't wired. | `components/ui/Button.tsx:47`, `Sheet.tsx:105` | S | Med |
| 6.3 | **Dynamic Type / font scaling** support and **status not by color alone** (pair the pill color with text/icon — already mostly done, verify contrast on tinted backgrounds). | global | M | Med |
| 6.4 | **Localization readiness.** Currency/number/date are GBP/`Europe/London`; centralize user‑facing strings and route formatting through `Intl` so i18n is a config change, not a rewrite (even if EN‑only ships first). | global | M | Low‑Med |

### W7 — Feature‑parity edges (within the cut‑line)  ·  unblocked by W3.3

| # | Item | Where | Effort |
|---|------|-------|--------|
| 7.1 | Compliance template **list/create** now partly Bearer — wire up (was treated cookie‑only). | `lib/queries/useComplianceTypeManage.ts` | M |
| 7.2 | Merge **custom‑fields resolution step** (which value survives a guest merge). | clients merge flow | M |
| 7.3 | Booking detail: surface **compliance‑flag UI on calendar/list rows** (wiring exists, not cross‑domain wired); finish **modify‑service** edge cases. | bookings/calendar | M |
| 7.4 | Variant editor: add the missing **description / buffer / is_active** fields (parity with web variant form). | `VariantsEditorSheet.tsx` | M |
| 7.5 | Dead‑code cleanup: `lib/rebook-bootstrap.ts` appointment branch (never written). | `lib/rebook-bootstrap.ts` | S |

---

## Suggested sequence

**Phase A — "Tighten the bolts" (no device required, ~1 sprint).**
W1.1–1.5, W2.1–2.4, W2.6–2.7, stand up **Sentry (3.1)**, and begin **unit tests (4.1)** + **CI (4.4)**. All small, high‑confidence, shippable without a device. Biggest reliability‑per‑hour return in the whole plan.

**Phase B — "Make it real" (unblock + verify).**
Coordinate the **backend Bearer deploy + EAS dev build (3.3)**, then run the **on‑device QA matrix (3.4)**. With a device in hand, land **W7** parity edges and **W2.5** booking‑interval. Add analytics (3.2).

**Phase C — "Make it feel world‑class."**
W5 interaction depth (drag/resize, week/tablet, motion) — needs device + a little design. W6 accessibility pass in parallel.

**Phase D — "Ship it."**
W4.2–4.3 component/e2e tests, W6.4 i18n readiness, release pipeline (3.5), store submission.

---

## Risks & dependencies

- **Cross‑repo dependency (critical):** the web repo's cookie→Bearer migration must reach `main` + deploy before W7 and parts of W2 can be verified end‑to‑end. Track in `WEB_BEARER_AUTH_MIGRATION.md`.
- **No device verification yet:** web preview can't authenticate against the venue API (CORS). Treat W3.4 as a gate before any "done" claim on interaction‑heavy work.
- **No test net:** until W4.1 lands, the hardening changes in W1/W2 are regression‑prone — sequence at least the pure‑logic unit tests alongside Phase A.

---

## Quick‑wins checklist (start tomorrow, all Effort = S)

- [ ] `apiFetch` timeout/abort (1.1)
- [ ] Font‑load no longer crashes the app (1.2)
- [ ] Calendar invalidation on create/walk‑in (1.3)
- [ ] No retry on 401/403 (1.5)
- [ ] `EXPO_PUBLIC_WEB_URL` for dashboard link‑outs (2.3)
- [ ] Verify + surface My Account save now that the route is Bearer (2.4)
- [ ] TimeSlot "now" tick + Start‑now uses visible slots (2.6)
- [ ] Toast (not `Alert.alert`) on web CSV failure (2.7)
- [ ] `sm` Button + tappable targets to ≥ 44 pt (6.2)
