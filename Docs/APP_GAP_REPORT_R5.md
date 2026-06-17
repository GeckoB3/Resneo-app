# App Gap Report R5 — Booking Page + Classes / Events / Resources Parity

_Generated 2026-06-16. Read-only reference refreshed to web `main` @ `4ef7126` (Staging #68). Four parallel audit agents compared the Expo app (`C:\Resneo-app`) against the web mirror (`C:\Resneo-app\_reference\Resneo`). Scope: **appointments-plan venues only** — services, classes, events, resources. Restaurant / tables / floor-plans explicitly out of scope._

---

## Executive summary

The user's two headline asks — **(1) edit the public booking page in-app** and **(2) set up & edit classes / events / resources in-app, functionally similar to web** — are blocked today only by **stale, conservative app code**, not by the backend.

**Headline finding: the backend is already Bearer-ready for almost all of this.** The 2026-06-12 cookie→Bearer migration is deployed to `main` (production, which the app points at). Every core CRUD route for classes, events, resources, and the booking-page `booking_page_config` blob is callable from the app right now. The app currently refuses to use them — it shows read-only screens and "manage this on the web dashboard" link-outs whose premises (recorded in several code docstrings) are now **factually wrong**.

| Area | App today | Backend ready? | Gap is… |
|---|---|---|---|
| **Booking page editor** | Slug ✓, logo/cover upload only; everything else link-out | **Bearer ✓** (single `/api/venue` PATCH carries the whole `booking_page_config`) — except gallery / team photos / team-list (cookie-only) | App UI: colours, palettes, fonts, announcement, about, social, tab toggles, service photos, logo/cover remove |
| **Classes** | Read-only 7-day timetable + roster; no CRUD | **Bearer ✓** (CRUD, scheduling, cancel, attendees). Check-in gated by `class_commerce_enabled` flag (may 403) | App UI: class-type editor, session scheduling, check-in, instance edit/cancel |
| **Events** | Read + check-in only; CRUD link-out (premise **wrong**) | **Bearer ✓** (full `experience-events` collection CRUD + cancel + attendees) | App UI: event editor with ticket types, delete, admin-cancel |
| **Resources** | Read-only day view; CRUD link-out (premise **stale**) | **Bearer ✓** (`resources` route fully migrated; the `practitioners?roster=1` trick is now only needed for the host-calendar picker) | App UI: resource editor (basics, host calendar, rules, pricing, weekly hours, exceptions) |

**Net:** ~95% of the work is app-side UI built on the proven `manage/services.tsx` + `useServicesManage.ts` + `components/services/*` pattern. Only **3 one-line server changes** (cookie→Bearer on `gallery`, `team-photo`, `booking-page-team`) are needed, and only to unlock two booking-page sub-features (photo gallery + team photos); they are **not** on the critical path.

**Stale claims to correct in code/memory:**
- `lib/queries/useResources.ts:38-47` & `app/(app)/resources.tsx:35` — "resources API is cookie-only" → **false**, it is Bearer.
- `app/(app)/events.tsx:49-55,179-191` — "event CRUD is managed on the web" → **unnecessary**, CRUD is Bearer.
- Memory `parity-push-2026-06` — "all class/event/resource CRUD routes are cookie-only" → **superseded** by the deployed migration.

---

## 1. Public Booking Page Editor

**Web** (`src/app/dashboard/settings/sections/BookingPageSection.tsx` → `BookingPageEditor.tsx`, 842 lines, autosave): edits the venue `booking_page_config` JSONB plus `logo_url`/`cover_photo_url`. Controls: public **slug** (live availability check); **logo** (upload/remove + drag-reposition `logo_crop {x,y,zoom}` + framing); **cover** (upload/remove + layout full-width/contained `cover_full_width` + freeform crop `cover_crop_box {x,y,w,h,ar}`); **6 quick palettes** + **brand/accent colour** (hex, low-contrast warning); **12 font presets** (`font_preset`); **announcement** banner (≤300); **Services group** toggle + per-service photos; **Team group** toggle + per-member photo/specialties/bio/hidden (`team_profiles`); **About group** toggle + about text (≤2000) + social links (ig/fb/tiktok/x) + **gallery** (≤12, reorder); live preview iframe.

**App today** (`app/(app)/manage/venue-profile.tsx`, 908 lines): **slug at parity**; logo/cover **upload/change only** (no remove, crop, framing, layout). Explicit link-out at `:720-727` ("for full booking-page branding open the web dashboard"). The app **never reads or writes `booking_page_config`** (`UpdateVenueInput` lacks the field). Settings tile `settings.tsx:261` opens the web.

**Gaps (P0 unless noted):** brand/accent colour + palettes; font preset; announcement / about / social; the 3 tab-visibility toggles; logo & cover **remove**; service photos (P1); cover layout toggle (P1); logo framing `logo_crop` (P1); cover crop `cover_crop_box` (P2); gallery (P2 — **blocked**); team profiles (P2 — text shippable, photos/list **blocked**); live preview (P2).

**Backend:** `GET/PATCH /api/venue` **Bearer** — PATCH accepts and server-merges the entire `booking_page_config` (`api/venue/route.ts:65-108,184-186`). `slug-available`, `logo`, `cover`, `appointment-services`, `service-photo` (POST+DELETE) all **Bearer**. **Cookie-only (blocked):** `gallery` POST, `team-photo` POST, `booking-page-team` GET — each needs a 3-line `createClient()`→`createVenueRouteClient(request)` swap.

**Plan:** new `app/(app)/manage/booking-page.tsx` (admin-only, mirrors `venue-profile`/`booking-settings` structure) + `lib/queries/useBookingPage.ts` (`useUpdateBookingPageConfig` → PATCH `/api/venue`) + port `lib/booking/bookingPageConfig.ts` (pure TS: `BookingPageConfig` type, font presets, palettes, `normalizeHexColor`, `primaryNeedsDarkText`). Extend `useVenueImageUpload.ts` with logo/cover **remove** + `service-photo` upload/delete. Flip `settings.tsx:261` tile to the new route; drop the `venue-profile.tsx:720-727` link-out. **MVP (no backend change): colours/palettes/font/announcement/about/social/tab-toggles + logo/cover remove + service photos.** Effort: MVP = **M**; framing/crop = **M-L** (custom RN gesture UIs); gallery/team = **M** but blocked on the 3 server tweaks.

---

## 2. Classes

**Web** (`src/app/dashboard/class-timetable/ClassTimetableView.tsx`): 3-stage workflow on `/api/venue/classes` (multiplexed by `entity_type`). **(A) Class type** — name, description, colour, `is_active`, `duration_minutes` (5-480), `capacity` (≥1), **required `instructor_id`** (calendar column), booking rules (advance/notice/cancellation/same-day), price/payment (`none|deposit|full_payment` + deposit, cross-validated). **(B) Scheduling** — recurring weekly rule (`entity_type:'timetable'`) materialised by `POST classes/generate-instances` (admin), or direct placement via `ClassScheduleModal` (single / weekly-repeat / every-N-days → `class-instances` + `class-instances/bulk`, 100-cap). **(C) Live session** — roster from `class-instances/[id]/attendees` (carries reliable `checked_in_at`), per-attendee check-in / no-show, check-in-all, admin cancel-and-notify.

**App today** (`app/(app)/classes.tsx`, 272 lines): **read-only** 7-day timetable from the `GET /api/venue/schedule` feed (display fields only — no class-type/pricing/recurrence data, no editing). Roster via `bookings/list?class_instance_id=` which **does not select `checked_in_at`** (so class check-in state is invisible today). No CRUD, no `manage/classes.tsx`, no `useClassesManage.ts`.

**Gaps:** P0 — create/edit class type (all fields), class-type catalogue (must call `GET /api/venue/classes`; the schedule feed lacks the data), schedule a single session, per-attendee check-in + check-in-all. P1 — roster via the attendees route (reliable `checked_in_at`), instance edit, remove instance/type/rule, bulk scheduling, recurring rule + generate, admin cancel-and-notify. P2 — staff-scope nuance, CSV, inline add-calendar, commerce products (defer entirely).

**Backend:** all core routes **Bearer** (`classes` GET/POST/PATCH/DELETE `:217,347,443,674`; `class-instances` + `bulk`; `generate-instances` admin; `cancel` admin; `attendees`). **Gotcha:** check-in / no-show / check-in-all are gated by `requireClassCommercePlan` (the `class_commerce_enabled` feature flag) — they 403 on venues without it; degrade gracefully. `class-availability` is the only cookie-only route and is not needed. Class routes are **not** behind the commerce flag (only `requireVenueExposesSecondaryModel('class_session')`).

**Plan:** `app/(app)/manage/classes.tsx` (list + editors) + `lib/queries/useClassesManage.ts` + `components/classes/ClassTypeEditorSheet.tsx` + `ClassScheduleSheet.tsx`; extend `ClassRosterView.tsx` for check-in driven by a new `useClassInstanceAttendees`. Class types are flat field updates (no replace-array semantics — simpler than services). **Build order: class-type CRUD → check-in → single-session schedule → instance edit/delete → bulk/recurring → admin cancel.** Effort: A (type CRUD) **M**, check-in **S-M**, scheduling depth **M-L**.

---

## 3. Events

**Web** (`src/app/dashboard/event-manager/EventManagerView.tsx`, 1840 lines): one form on `/api/venue/experience-events`. Fields — name, description, `event_date`, start/end time (end>start), capacity (≥1), image URL, **ticket types** (≥1 named; `{name, price_pence, capacity?}`), calendar column, booking rules (advance/notice/cancellation/same-day), payment (`none|deposit|full_payment` + deposit), create-only schedule modes (single/weekly/custom). Roster via `experience-events/[id]/attendees`; per-attendee **Arrived/Clear** check-in (`PATCH bookings/[id] {client_arrived}`); admin **cancel-and-notify**; delete (409 if active bookings).

**App today** (`app/(app)/events.tsx`, 242 lines): **read + check-in only** — lists from the schedule feed's `event_ticket` blocks (no ticket/settings data), roster + amber Arrived/Clear toggle already work. All CRUD link-outs to `app.resneo.com/dashboard/event-manager`. Subscribes only to `bookings` realtime (not `experience_events`).

**Gaps:** P0 — create event (all fields incl. ticket repeater), edit event (ticket types **replace-all**), source detail from the real `experience-events` API not the schedule feed. P1 — delete (409 handling), admin cancel-and-notify, calendar picker, booking-rules + payment + Stripe warning. P2 — `experience_events` realtime, richer attendees endpoint, schedule modes, inline add-calendar, image/description, CSV.

**Backend:** **all Bearer** — `experience-events` collection GET/POST/PATCH/DELETE (`route.ts:82,115,388,616`; non-admin allowed when the calendar is managed), `[id]/attendees`, `[id]/cancel` (admin), `bookings/[id]` check-in (already used). Admin-only `[id]` PATCH/DELETE have a non-admin alternative on the collection route. Only `event-offerings` is cookie-only — **not needed**. **No blockers.**

**Plan:** mirror services 1:1. `lib/queries/useEventsManage.ts` (`useManagedEvents` → switch list source to the real API; create/update/delete/cancel) + `components/events/EventEditorSheet.tsx` (reuse `services.tsx` payment radios + Stripe warning + booking-rules + pounds↔pence `parsePoundsToPence`). **Ticket types are REPLACE-ALL on PATCH** (omit to leave untouched) — always send the full list. Gate cancel on `current_user_role==='admin'`. Effort: hooks **M**, editor **L**, delete/cancel **S**.

---

## 4. Resources

**Web** (`src/app/dashboard/resource-timeline/ResourceTimelineView.tsx`, 2071 lines): a resource = `unified_calendars` row with `calendar_type='resource'`. Form sections — **Basics** (name + free-text type w/ quick-picks), **Host calendar** (required `display_on_calendar_id`, admins can inline-create), **Booking rules** (`slot_interval_minutes` 5-480, `max_booking_minutes` 15-1440, `min_booking_minutes` 15-480 ≥ slot, + guest window), **Pricing** (`price_per_slot_pence`, payment req + deposit, `is_active`), **Weekly hours** (`availability_hours` per weekday single range), **Date exceptions** (`availability_exceptions` closed/amended). Server enforces overlap/conflict 409s + soft `availability_warning`.

**App today** (`app/(app)/resources.tsx`, 307 lines): **read-only** per-resource day view; list via `practitioners?roster=1` surfacing only id/name/colour/active. Link-out for CRUD. **The `practitioners?roster=1` trick is now obsolete for the list** (resources GET returns the full shape) — it's still useful only for the **host-calendar picker**.

**Gaps:** P0 — list with full fields (swap to `GET /api/venue/resources`), create/edit/delete resource, basics, host-calendar picker, booking rules, pricing/payment. P1 — weekly hours editor, date exceptions editor. P2 — inline add-calendar, detail stat tiles, book-this-resource flow (separate larger effort, out of scope), `availability_warning` surfacing.

**Backend:** **all Bearer** — `resources` GET/POST/PATCH/DELETE (`route.ts:279,308,424,634`), `resources/[id]`, `resources/[id]/bookings?date=`, `practitioners?roster=1` (host calendars + inline create). `bookings/list` has **no `resource_id` param** — client-side filter by `resource_id` is correct (the app already does this). Cookie-only & irrelevant: `resource-options` (redundant superset in resources GET), `validate-resource-modification` (booking-edit dry-run, out of scope). Mutations 403 unless the venue has `resource_booking` enabled (config gate, surface cleanly). **No blockers for CRUD.**

**Plan:** `lib/queries/useResourcesManage.ts` (`useResourcesManageList` → `GET /api/venue/resources`; create/update/delete; `useHostCalendars` → filtered `practitioners?roster=1`) + `components/resources/ResourceEditorSheet.tsx` (Basics → Host calendar → Booking rules → Pricing → Weekly hours → Exceptions). Reuse `OpeningHoursEditor` for weekly hours (single range, numeric keys). Port client validation from web `handleSave`. **Fix the stale docstrings.** Defer the exceptions calendar (ship CRUD first, server defaults `availability_exceptions` to `{}`). Effort: read swap **S**, core CRUD + editor **M**, weekly hours **M**, exceptions **M-L**.

---

## 5. Unified backend-readiness matrix

**Bearer (app can call today) — no backend work:**
`/api/venue` GET+PATCH (incl. `booking_page_config`), `slug-available`, `logo`, `cover`, `service-photo` (POST+DELETE), `appointment-services`; `classes` (GET/POST/PATCH/DELETE), `class-instances` (+`bulk`, `[id]`, `[id]/attendees`), `classes/generate-instances` (admin), `class-instances/[id]/cancel` (admin), `class-instances/[id]/attendees/{check-in,check-in-all,[bookingId]/check-in,[bookingId]/no-show}` (⚠ `class_commerce_enabled`-gated); `experience-events` (GET/POST/PATCH/DELETE), `experience-events/[id]/{attendees,cancel(admin)}`; `resources` (GET/POST/PATCH/DELETE), `resources/[id]`, `resources/[id]/bookings`, `practitioners` (GET/POST); `bookings/[id]` PATCH (check-in).

**Cookie-only (blocked) — needs a server tweak, only blocks 2 minor booking-page sub-features:**
`/api/venue/gallery` POST, `/api/venue/team-photo` POST, `/api/venue/booking-page-team` GET.

**Cookie-only but irrelevant (don't use):** `class-availability`, `event-offerings`, `resource-options`, `bookings/[id]/validate-resource-modification`.

---

## 6. Implementation plan (phased, multi-agent)

**Pattern for all areas:** mirror `app/(app)/manage/services.tsx` + `lib/queries/useServicesManage.ts` + `components/services/*` + `components/ui/*` (Sheet/Input/Button/Toast). Rules: **no `Alert.alert`** (no-op on RN-web — use Sheet/Toast); **no new native deps** (build with existing primitives); query keys **local** to each hook (never edit `lib/queries/keys.ts` concurrently); replace-array semantics where noted (events ticket types); admin gating via `venue.current_user_role`.

- **Wave 1 — Core CRUD (4 parallel agents, disjoint file sets):**
  1. Booking-page editor (MVP: config controls + logo/cover remove + service photos)
  2. Classes (type CRUD + check-in + single-session schedule)
  3. Events (editor + ticket types + delete + admin cancel)
  4. Resources (list swap + CRUD editor: basics/host/rules/pricing)
- **Integration (main loop):** authoritative `tsc` + `expo lint` + `npm test` gate; wire navigation in `settings.tsx`/More-hub; fix the stale docstrings; remove link-outs.
- **Wave 2 — Depth + polish:** classes bulk/recurring scheduling + admin cancel; resources weekly-hours + exceptions editors; booking-page logo framing + cover layout/crop; events schedule modes + realtime. Plus a design/polish pass (motion, empty states, a11y, haptics) to world-class bar.
- **Wave 3 (backend, separate `C:\Resneo` repo):** the 3 cookie→Bearer tweaks to unlock gallery + team photos, then app-side gallery/team UI.

**Verification:** the Expo web preview cannot reach the authed venue API (no CORS for browser origin), so end-to-end proof needs an EAS build + on-device QA. Wave work is gated on `tsc` + `expo lint` + Jest + `expo export -p android` (Hermes) — the same bar used for prior parity rounds.

## 7. Backend follow-ups (web repo `C:\Resneo`)

Three mechanical swaps (`createClient()` → `createVenueRouteClient(request)` + add `request` param), matching what `service-photo`/`logo`/`cover` already do, to unlock the last booking-page slices:
1. `src/app/api/venue/gallery/route.ts` (POST)
2. `src/app/api/venue/team-photo/route.ts` (POST)
3. `src/app/api/venue/booking-page-team/route.ts` (GET)

## 7a. Wave 1 — SHIPPED (2026-06-16)

The core CRUD for all four areas is built, integrated, and **tsc + `expo lint` + 311 Jest tests green** (Hermes `expo export -p android` as the native gate). All four removed their "manage on the web" link-outs. Pattern: mirrors `services.tsx`/`useServicesManage.ts`; local query keys; `Sheet`/`Toast` (no `Alert.alert`); admin gating via `current_user_role`.

| Area | What shipped | Entry point | New files |
|---|---|---|---|
| **Booking page** | Full editor: brand+accent colour (swatches + hex + 6 palettes + low-contrast warning), 12 font presets, announcement, about, 4 social links, 3 public-tab toggles, logo + cover upload/remove, cover layout toggle. Server-merged `booking_page_config` PATCH. | More-hub **Booking page** tile now routes to `/manage/booking-page` (was web link-out); also a button in Venue profile | `app/(app)/manage/booking-page.tsx`, `lib/queries/useBookingPage.ts`, `lib/booking/bookingPageConfig.ts` |
| **Classes** | Class-type CRUD (all fields, calendar column, rules, pricing), single-session scheduling, instance edit, delete, per-attendee check-in / no-show / check-in-all (commerce-flag 403 handled), roster via attendees route | Header **Manage** action on `/classes` → `ClassTypesManagerSheet` | `lib/queries/useClassesManage.ts`, `components/classes/{ClassTypesManagerSheet,ClassTypeEditorSheet,ClassScheduleSheet}.tsx`, `types/classes-manage.ts` |
| **Events** | Event CRUD (name/desc/date/times/capacity/image), ticket-type repeater (replace-all), calendar column, booking rules, payment + deposit + Stripe warning, delete (409), admin cancel-and-notify | Header **Manage** action on `/events` → `EventManagerSheet` | `lib/queries/useEventsManage.ts`, `components/events/{EventManagerSheet,EventEditorSheet}.tsx`, `types/events-manage.ts` |
| **Resources** | Resource CRUD (basics + type quick-picks, required host calendar, slot/min/max rules, guest window, pricing + payment + deposit, weekly hours, active), delete (409). List now uses the Bearer `/api/venue/resources` (roster-trick retired for the manager). | Header **Manage** action on `/resources` → `ResourceManagerSheet` | `lib/queries/useResourcesManage.ts`, `components/resources/{ResourceManagerSheet,ResourceEditorSheet,ResourceWeekHoursEditor}.tsx`, `types/resources-manage.ts` |

Stale "cookie-only / web-only" docstrings corrected in `useResources.ts`, `resources.tsx`, `events.tsx`.

## 7b. Wave 2 + 3 — SHIPPED (2026-06-16)

Depth pass + the backend unblock. **tsc 0 · `expo lint` 0 · 311 Jest · Hermes export OK.** Built via 3 parallel background agents (classes/events/resources depth) + main-loop (booking-page photos + backend), then an independent adversarial review (verdict: no P0/data-loss bugs; the booking-page partial-PATCH merge is correct) whose P1 findings were fixed.

**Wave 3 — backend (in `C:\Resneo`, branch `staging`, uncommitted for deploy):** `gallery` (POST), `team-photo` (POST), `booking-page-team` (GET) swapped `createClient()` → `createVenueRouteClient(request)` (web `tsc` clean). Unblocks the app-side gallery + team-photo features once deployed. (`service-photo` was already Bearer → service photos work today.)

**Wave 2 — app depth:**
| Area | Added |
|---|---|
| **Classes** | Bulk scheduling (weekly-repeat + every-N-days via `class-instances/bulk`, 100 cap), recurring weekly rule (`ClassRuleSheet`) + admin `generate-instances`, admin **cancel-and-notify** per session (refunds + comms, distinct from delete) |
| **Events** | Create-time **schedule modes** — Single / Weekly (until date) / Custom (multi-date), one event row per date |
| **Resources** | **Date-exceptions editor** (`ResourceExceptionsEditor` — closed / amended hours per date) + start<end + deposit-ceiling client guards |
| **Booking page** | **Photo gallery** (add/remove/reorder ≤12), **service photos** (per-service), **team profiles** (photo/bio/specialties/hidden), **live preview** (opens `/book/{slug}`) |

### Still deferred (lower-value / out of scope)
- **Booking page:** logo reposition/framing (`logo_crop`), cover freeform crop (`cover_crop_box`) — heavy custom RN gesture/crop UIs, marginal mobile value; embedded WebView preview (a link-out preview ships).
- **Classes/Events/Resources:** CSV exports (low mobile value), inline "add calendar" (admins use the Team screen), resource detail stat tiles, the resource "book this resource" guest flow (separate larger initiative).
- **On-device QA:** an EAS build is the only authed-runtime test path (web preview can't reach the authed API). All work is static + bundle-verified.

### Deploy / commit state
- App (`C:\Resneo-app`): uncommitted, ready for review. Gallery + team-photo features need the Wave-3 backend deployed (app points at production); everything else works against current production.
- Backend (`C:\Resneo`): 3 route files uncommitted on `staging` — promote via the usual staging→main deploy.

## 8. Deferred / out of scope

Restaurant / tables / floor-plans (not appointments-plan). Class commerce products (course/credit/membership — flag-gated separate surface). Book-this-resource guest flow (large, separate). Public class/event availability engines (`class-availability`, `event-offerings` — guest-facing, cookie-only).
