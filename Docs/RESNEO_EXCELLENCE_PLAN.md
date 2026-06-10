# Resneo App — Excellence Plan (R20+)

**Status:** Proposed
**Created:** 2026-06-10
**Owner:** Andrew
**Predecessors:** `RESNEO_REDESIGN_PLAN.md` (R0–R9, done) · `RESNEO_PARITY_PLAN.md` (R10–R19.1, done)
**Reference:** `_reference/reserve-ni` — refreshed to `0a0831d`
**Goal:** Take an app that now *covers* the appointments-plan feature set to one that is **exceptional end to end** — web-depth functionality, a consistent and beautiful UI system, and release-grade quality.

> Scope guardrails (unchanged): appointments-plan venues only; admin/config editors that are deep web tooling (add-on group CRUD, template text, floor plans) stay on web with clear link-outs.

---

## 1. Where the app stands

All primary surfaces exist and work: Calendar (day/week/month grid, blocks overlay, tap-to-create with time prefill, long-press reschedule), Appointments list (status filters, search, realtime), full booking detail (lifecycle + reverts, timeline, message/resend/deposit, edit), a 7-step wizard (variants, add-ons, any-available pooling, slot-length-correct availability), Contacts CRM (edit, tags, marketing, message, timeline), and a More hub mirroring the web sidebar + settings (Services with variant/add-on editors, Business hours editor, Communications, Compliance, Booking settings, Team, Plan, Today, Waitlist, Calendar availability, Notifications, Reports).

**What separates this from "exceptional":** the web has another layer of *operational depth* on each core surface (filters, bulk actions, attendance, price breakdowns, month availability pickers), and the app has accumulated *consistency debt* (10 hand-rolled bottom sheets, 5 money formatters, a hard-coded scrim that breaks dark mode) plus unfinished release work (push deep links, art, Sentry, on-device tuning).

---

## 2. Findings — comparison vs web + code review

### 2.1 Consistency & code-quality debt (app-internal)
| # | Finding | Files |
|---|---|---|
| C1 | **10 hand-rolled bottom sheets** with identical Modal/backdrop/handle scaffolding | Reschedule, Deposit, EditBooking, GuestMessage ×2, GuestEdit, VariantsEditor, AddonLinks, services edit/create, availability create |
| C2 | **Hard-coded scrim `rgba(15,23,42,0.45)`** in all 10 sheets — not theme-aware (dark-mode bug) | same 10 files |
| C3 | **5 duplicate money formatters** (`money`, `formatMoney`, `formatAmount`, `formatCurrencyPence`, inline) + 2 `parsePounds` copies | services, reports, ConfirmStep, DepositSheet, client detail, AddonsStep |
| C4 | **GuestMessageSheet duplicated** ~99% between bookings/ and clients/ (only the hook differs) | both GuestMessageSheet.tsx |
| C5 | **RN-web deprecation warnings**: `shadow*` style props (Segmented/Card elevation) and `pointerEvents` prop (calendar grid) | theme elevation usage, CalendarDayGrid |
| C6 | Long lists rendered via ScrollView+map (services, waitlist, notifications, availability) — fine at venue scale, but FlashList/FlatList is the right engine for contacts/bookings-sized data | manage/services, waitlist, notifications |
| C7 | A11y: `MenuRow`/`ToolRow` pressables lack explicit `accessibilityLabel`; audit pass needed | settings, several rows |

### 2.2 Booking detail — web has, app lacks
| # | Feature | Notes |
|---|---|---|
| D1 | **Add-ons section + price breakdown** | API already returns `addons` on GET; app type omits the field entirely. Show addon list (name/group/price/duration) + service+variant+add-ons = total |
| D2 | **Attendance confirmation** | Web: "Confirm attendance" / guest-confirmed / staff-confirmed pills + `client_arrived_at`. PATCH supports `staff_attendance_confirmed`, `client_arrived` |
| D3 | **Guest history accordion** | Other bookings for this guest inline (app: must navigate to contact) |
| D4 | **Compliance flag** | "Outstanding" badge + link when records missing (`bookings/[id]/compliance`) |
| D5 | **Modify service/variant/add-ons** on an existing booking | Web does this via a modify modal with validation (`validate-appointment-modification`) |
| D6 | Calendar **peek** presentation | Web opens detail as popover/drawer from the grid; app always full-screen navigates |

### 2.3 Appointments list — web has, app lacks
| # | Feature |
|---|---|
| L1 | **Practitioner + service filters** (check `bookings/list` payload exposes practitioner/service per row; add backend field if not) |
| L2 | **Sort** (date/time/client/service/practitioner/status/deposit, asc/desc) |
| L3 | **Add-on labels + attendance pill + compliance pill** on rows |
| L4 | **Bulk select → bulk message / bulk tag** (`contacts/bulk` exists; needs Bearer) |
| L5 | Day-view **time-range filter**; week/month note: `view=calendar` may omit cancelled — verify and fix |

### 2.4 Create wizard — web has, app lacks
| # | Feature |
|---|---|
| W1 | **Source choice: Phone vs Walk-in.** App always sends `source:'walk-in'`, which *skips server slot validation* — picked slots should book as `phone` (validated); walk-in becomes an explicit fast-path toggle. **Correctness fix, do first** |
| W2 | **Month date-picker with available-date markers** (`appointment-calendar` is now Bearer-ready; replaces the flat 28-day strip) |
| W3 | **Staff duration override presets** (15–120 min popover; engine + create both support `duration_minutes`) |
| W4 | **Waitlist-join when no slots** (POST `waitlist` from the empty-slots state) |
| W5 | **Multi-service appointments** (consecutive segments; `create-multi-service`) — v2 |
| W6 | **In-flow payment step** (deposit/full) — keep send-link/record-cash; native card capture remains out of scope |

### 2.5 Calendar — web has, app lacks
| # | Feature |
|---|---|
| K1 | **Recurring breaks from the practitioner schedule** (`break_times_by_day` via `GET /api/venue/schedule` — needs Bearer). App currently shows only one-off blocks, so recurring lunch breaks look free |
| K2 | **Practitioner multi-select / "All calendars"** (app is strictly one-at-a-time; at minimum a 2-column landscape/tablet mode) |
| K3 | **Guest search** from the calendar toolbar |
| K4 | **Undo** after reschedule (snackbar with revert) |
| K5 | **Drag-to-reschedule + drag-to-resize duration** (gesture-handler is installed; needs on-device tuning) |
| K6 | Card content density (status stripe, phone, add-on count) + compact mode |
| K7 | Month-view **colored count dots** per model (app: single count pill) |

### 2.6 Contacts — web has, app lacks
| # | Feature |
|---|---|
| G1 | **Sort options** (last visit asc/desc, name, visit count) — API supports; app hardcodes `last_visit_desc` |
| G2 | **Tag filter + segments** (by tag, marketing status, walk-ins scope) |
| G3 | **Bulk select → message / tag** (`contacts/bulk`) |
| G4 | **Merge duplicates** (`guests/merge`) |
| G5 | **CSV export** via share sheet (`export` is Bearer-ready) |
| G6 | Row polish: tag pills (3 + “+N”), last-visit relative pill |
| G7 | R14.1 leftovers: documents, household, loyalty, custom-fields editor, GDPR export/erase |

### 2.7 Platform & release
| # | Item |
|---|---|
| P1 | **Push → deep link**: tapping a booking push should open `/booking/[id]`; notification `href` mapping for in-app feed |
| P2 | **Unread badge** on the More tab (`tabBarBadge` from `unreadCount`) |
| P3 | **Today**: admin setup-checklist (`setup-status` needs Bearer) |
| P4 | **Sentry**, screen-transition/FAB motion, empty-state illustrations |
| P5 | **Icon/splash art** (still ReserveNI placeholders — your asset task), store listing, a11y/dark-mode matrix on device |

---

## 3. Phased plan

### R20 — Design-system consolidation (the multiplier — do first)
1. **`Sheet` primitive** (`components/ui/Sheet.tsx`): backdrop + theme `scrim` token + handle + SafeArea + max-height + keyboard handling. Migrate all 10 sheets. Adopt `@gorhom/bottom-sheet` *only if* the hand-rolled one fails on-device; otherwise keep it simple.
2. **`lib/format.ts`**: `formatPence` (Intl-based), `parsePoundsToPence`, `formatDuration`. Replace all 5+ copies.
3. Merge the two GuestMessageSheets into one component with an injected send-mutation.
4. Theme: add `scrim` to light/dark palettes; replace `shadow*` with `boxShadow` tokens (RN 0.85 supports it cross-platform); move `pointerEvents` to style.
5. A11y pass on rows/pressables (labels), and notifications **unread badge** on the More tab (P2).

### R21 — Booking detail to web depth
- D1 add-ons + price breakdown (type the `addons` payload; total = base/variant + add-ons; deposit line).
- D2 attendance: Confirm-attendance action + guest/staff-confirmed pills + “Arrived” (client_arrived).
- D3 guest-history accordion (reuse contact history rows).
- D4 compliance flag + link into Compliance screen.
- D5 **Modify booking** sheet: change service/variant/add-ons/duration with `validate-appointment-modification` before PATCH.
- D6 calendar peek: present detail as a sheet from the grid (full screen still one tap away).

### R22 — Wizard correctness & depth
- W1 source fix (phone-validated by default; explicit Walk-in toggle) — **ship first, small**.
- W2 month availability picker; W3 duration presets; W4 waitlist-join empty state.
- W5 multi-service (after R21’s modify work proves the segment UI), W6 payment step decision.

### R23 — Lists to web depth (Appointments + Contacts)
- L1–L3 filters/sort/row enrichment (verify/extend `bookings/list` payload server-side as needed).
- G1–G2 sort + tag/segment filters; G6 row polish.
- L4/G3 bulk select with message/tag actions (one shared bulk-bar component); G4 merge; G5 CSV export via share sheet.

### R24 — Calendar excellence
- K1 schedule breaks overlay (migrate `schedule` GET to Bearer).
- K4 undo snackbar; K6 card density; K7 month dots.
- K5 on-device drag (reschedule + resize) with haptics — needs the dev build; budget tuning time.
- K2 two-column landscape/tablet; K3 toolbar guest search.

### R25 — Release hardening
- P1 push deep links; P3 Today setup checklist; P4 Sentry + motion + empty-state art.
- Full on-device matrix (light/dark, admin/staff, S23 + tablet), a11y audit, perf pass (FlashList where it matters).
- P5 final art + store listing → TestFlight/Play internal.

**Backend (one batch, alongside the undeployed 5+6):** `schedule` GET, `contacts/bulk`, `guests/merge`, `setup-status`, `setup-checklist-dismiss`, and any `bookings/list` payload additions for L1/L3.

### Sequencing
R20 → R21 → R22 → R23 → R24 → R25. R20 first because every later phase builds sheets, money strings, and list rows — consolidation pays compounding dividends. R21/R22 are the biggest day-to-day value; R24’s drag work is gated on the dev build being in hand.

---

## Progress — 2026-06-10 execution pass

**R20 ✅ complete:** `Sheet` primitive (`components/ui/Sheet.tsx`, theme `overlay` scrim + keyboard avoidance) — all 10 sheets migrated; `lib/format.ts` (formatPence/parsePoundsToPence/penceToPoundsInput) replaced all 5+ formatter copies; GuestMessageSheet merged into `components/messaging/` (mutation injected); elevation tokens → `boxShadow` (Segmented/SignInModeTabs inline shadows too); `pointerEvents` → style; MenuRow a11y labels; **unread badge** on the More tab.

**R21 ✅ core:** add-ons + total price breakdown on booking detail (snapshot rows typed); **attendance** (guest/staff-confirmed + Arrived pills; Confirm-attendance & Mark-arrived actions via PATCH); **guest-history accordion** (lazy, top 5, links to contact); **calendar peek sheet** (tap block → `BookingPeekSheet`; long-press reschedule unchanged). *Deferred:* D4 compliance flag UI (route now Bearer in batch 7), D5 modify-service flow.

**R22 ✅:** **W1 source fix** — wizard defaults to `phone` (server slot-validation) with an explicit Walk-in toggle on Confirm; **W2 month date-picker** (`MonthDatePicker` + `useMonthAvailability`, availability dots, past/unavailable disabled, any-available pooling); **W3 duration presets** (chips on the slot step, threads `duration_minutes` through availability + create); **W4 waitlist-join** (empty-slot state → guest details sheet → public `appointment-waitlist`). DatePickerStep deleted. *Deferred:* W5 multi-service, W6 payment step.

**R23 ✅ (2nd pass):** Contacts **sort** + **tag filter chips**; **bulk select** (long-press rows) with **Tag / Message (marketing, consent-respecting) / Merge** (pick-the-keeper sheet, 2–5 contacts) + **Export CSV** via share sheet (current filter, up to 250 rows) — all admin-gated. Appointments list: **no backend change was needed** — `bookings/list` already returns `practitioner_id`/`calendar_id`/`calendar_name`/`service_variant_name`/`addons_count`/`booking_addon_labels`/attendance timestamps (the mobile type was just a narrow subset). Added **staff filter chips** (matches practitioner_id or calendar_id) and enriched rows (service/variant · staff · add-on count · arrived/confirmed dot). *Still open:* explicit sort selector (rows are time-sorted per day, matching web default).

**R24 🟡 partial:** **K1 recurring breaks** now overlay the day grid (derived from the roster's `break_times`/`break_times_by_day` — no extra API call; discovery: `GET /api/venue/schedule` is the classes/events feed, NOT breaks); **K4 undo snackbar** after reschedule (6s revert window, new `Snackbar` primitive). *Deferred (device-gated or minor):* K2 multi-column, K3 toolbar search, K5 drag, K6 card density, K7 month dots.

**R25 🟡 partial:** **P1 push deep links** — cold-start tap now routed via `getLastNotificationResponseAsync` (warm taps already worked); **P3 setup checklist** card on Today (admin, dismissible, web-completed steps). *Deferred:* Sentry (needs DSN + dev build), motion pass, empty-state art, on-device matrix (yours).

**Backend batch 7 ✅ migrated (deploy with 5+6):** `schedule`, `contacts/bulk`, `guests/merge`, `setup-status`, `setup-checklist-dismiss`, `bookings/[id]/compliance`.

**Device session:** `Docs/DEVICE_TEST_PLAN.md` — smoke pass, booking lifecycle, gesture tuning (drag deliberately NOT shipped blind; implementation notes included), More-surface sweep, contacts bulk, push warm/cold, light/dark × admin/staff matrix. Requires batches 5–7 deployed + the dev build.

---

## 4. Definition of “exceptionally high standard” (acceptance bar)
- **Functional:** every §2 row checked off or consciously deferred with a visible “manage on web” path.
- **Consistent:** one sheet primitive, one formatter, one empty/error/loading pattern, zero hard-coded colors outside `theme/`.
- **Polished:** light+dark verified on device, motion on transitions/FAB, haptics on every commit action, 44px+ targets, labels on every touchable.
- **Reliable:** Sentry wired, zero RN-web deprecation warnings, typecheck/lint/`expo-doctor` clean, realtime + push deep links verified on the S23.

*Living document — tick findings as they land.*
