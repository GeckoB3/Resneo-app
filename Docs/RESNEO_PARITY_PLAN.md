# Resneo App — Web-Parity & Functionality Plan (R10+)

**Status:** Proposed (follows on from `RESNEO_REDESIGN_PLAN.md`, whose R0–R9 redesign is complete)
**Created:** 2026-06-09
**Owner:** Andrew
**Reference:** `_reference/reserve-ni` (read-only clone of the Resneo **web** app — source of truth for features, API contracts, brand, data model)
**Goal:** Take the redesigned, appointments-first staff app from "core flows work" to a **professional, polished, fully-functional** mobile counterpart of the web staff dashboard.

> ⚠️ Before writing app code, read the versioned Expo docs at https://docs.expo.dev/versions/v56.0.0/ (per `AGENTS.md`). This repo is Expo SDK **56**.

---

## 1. Where we are today (R0–R9 recap)

The redesign shipped a solid skeleton: brand design system + Inter, 4-tab nav (Calendar · Bookings · Clients · Settings), a Bookings list with status filters, a custom Calendar grid (day/week/month) with tap-to-create and long-press reschedule, a 5-step create-appointment wizard, a redesigned booking detail with the core status lifecycle, a Clients directory + detail, a Settings screen, and the rebrand. The data/auth/realtime/push plumbing is reused and working.

**What that means:** the app can *view the diary, take a simple appointment, look someone up, and move a booking*. It does **not** yet do most of the day-to-day depth a busy counter needs, and it covers only ~1 of the web's booking models.

---

## 2. Gap analysis — web staff dashboard vs. mobile app

Legend: ✅ done · 🟡 partial · ❌ missing · 🔗 stays on web (link out)

### 2.1 Bookings & booking detail
| Web capability | Mobile status |
|---|---|
| List with status/practitioner/service/model/source/compliance filters, multi-key sort, search | 🟡 status + guest-search + date scope only (no practitioner/service/model/source/compliance filter, no sort) |
| Status lifecycle (Pending→Booked→Confirmed→Seated→Completed, no-show, cancel) + **reverts** | 🟡 forward + cancel/no-show; **no reverts/reopen** |
| Reschedule / modify time | ✅ (stepper sheet) |
| **Modify service / variant / add-ons** on an existing booking | ❌ |
| **Edit guest details / notes** (dietary, occasion, special, internal) | ❌ |
| **Message guest** (email/SMS/both) — `bookings/[id]/message` | ❌ |
| **Resend confirmation** — `bookings/[id]/resend-confirmation` | ❌ |
| **Deposit actions** (send link / waive / record cash / refund) — `bookings/[id]/deposit` | ❌ |
| **Status timeline / communications log** (events) | ❌ |
| Compliance flag / outstanding-record indicator | ❌ |
| Admin-vs-staff permission gating | ❌ |
| Bottom-sheet "peek" from calendar | ❌ (full screen only) |

### 2.2 Create / new booking
| Web capability | Mobile status |
|---|---|
| Service → **variant** → **add-ons** → practitioner → slot → details → payment → confirm | 🟡 service → date → time → guest → confirm (no variant/add-on/payment steps) |
| **Any-available-practitioner** pooling | ❌ |
| **Group** booking (multiple attendees, one slot) | ❌ |
| **Multi-service** booking (consecutive services) | ❌ |
| Deposit / full-payment collection at booking | ❌ |
| Custom date selection (month availability via `appointment-calendar`) | ❌ (next-7-days only) |
| Guest search / create / rebook prefill | ✅ |
| Walk-in fast path | 🟡 (restaurant form retained, not restyled) |
| Waitlist join when no slots | ❌ |

### 2.3 Calendar
| Web capability | Mobile status |
|---|---|
| Day / week / month views, practitioner columns | ✅ (single-column pager) |
| Service/practitioner-coloured cards, now-line | ✅ |
| **Breaks / closures / blocks overlay** (`schedule`, `practitioner-calendar-blocks`) | ❌ |
| Drag-to-reschedule (finger drag) | 🟡 long-press sheet only; on-device drag untuned |
| Multi-column (landscape/tablet) | ❌ |
| Class / event / resource lanes (CDE strip) | ❌ |

### 2.4 New staff surfaces (no mobile equivalent yet)
| Web area | Mobile status | Counter value |
|---|---|---|
| **Day Sheet** (period-grouped run-sheet, inline actions, dietary, capacity) | ❌ | **High** |
| **Dashboard home / Today** (KPIs, 7-day forecast, arriving-soon, setup checklist) | ❌ (hook exists, unused) | High |
| **Waitlist** (table + appointment, offer/convert/cancel) | ❌ | Medium-High |
| **Notifications** centre (in-app) | ❌ | Medium |

### 2.5 Guests / CRM depth
| Web capability | Mobile status |
|---|---|
| Profile + stats + booking history | ✅ |
| Tags (display) | 🟡 display only (no add/remove) |
| **Timeline / audit** (`guests/[id]/timeline`) | ❌ |
| **Communications log** | ❌ |
| **Documents** (view/download/sign) | ❌ |
| **Loyalty** (points/tier/rewards) | ❌ |
| **Household** links | ❌ |
| **Custom fields** edit | ❌ (returned in payload, unused) |
| **Marketing consent** toggle | ❌ |
| **Message guest** | ❌ |
| **Merge** duplicates | ❌ |
| **GDPR** export / erase (admin) | ❌ |
| Edit profile (name/email/phone/notes) | ❌ |

### 2.6 Secondary booking models
| Web area | Mobile status |
|---|---|
| **Classes / timetable** + attendee check-in / no-show / bulk check-in | ❌ |
| **Events** (experience events) + attendee roster / check-in | ❌ |
| **Resources** timeline / resource bookings | ❌ |
| **Tables / floor-plan / table-grid** (restaurant) | 🟡 walk-in only; floor-plan deferred by design |

### 2.7 Reports, availability & admin
| Web area | Mobile status |
|---|---|
| **Reports** (booking summary, no-shows, cancellations, deposits, appointment insights, add-on revenue, client summary, CSV export) | ❌ |
| **Availability / working hours / schedule exceptions** | 🔗 web |
| **Practitioner leave & calendar blocks** (view + create) | ❌ (useful on mobile) |
| **Appointment services / add-ons management** | 🔗 web (read-only context only) |
| **Compliance** (types, records, form links) | 🔗 web (flag surfacing only) |
| **Import**, **referrals**, **collectives**, **billing/plan**, **staff management**, **settings depth**, **linked-calendar admin** | 🔗 web (link out) |
| **Account-links / linked-venue switcher** UI | 🟡 banner only (switcher deferred) |

---

## 3. Guiding cut line (what mobile owns vs. what stays on web)

**Mobile owns the at-the-counter, in-the-moment work:** see the diary, take/modify/move a booking, run the day, look someone up, message them, check guests in, manage the waitlist, glance at today's numbers.

**Web keeps configuration/admin:** services & add-on *management*, availability/working-hours setup, compliance/type config, imports, billing/plan, staff management, floor-plan editing, deep reports authoring. Mobile surfaces these **read-only** or **links out**, and *consumes* their data (e.g. uses add-on definitions when booking, surfaces compliance flags) without rebuilding the editors.

---

## 4. Phased roadmap (R10 → R18)

Each phase is independently shippable to a dev build. Ordering reflects **value at the counter** and **building on existing screens first**, then new surfaces, then secondary models, then reports/admin, then platform polish. R10/R11/R12 are the recommended high-value core; later phases can be re-prioritised.

### R10 — Booking detail: full action set & depth — 🟡 In progress (2026-06-09)
Turn the detail screen from "change status" into the booking command centre.
- ✅ **Status reverts/reopen** (`Mark pending`/`Undo confirm`/`Unseat`/`Reopen`/`Undo No-Show`) in a primary → reschedule → undo → destructive hierarchy (`lib/booking/booking-status-actions.ts`).
- ✅ **Activity timeline** card — ported web formatter, consumes the `events` payload (`lib/booking/booking-timeline.ts`).
- ✅ **Message guest** (email/SMS/both), **Resend confirmation**, **Deposit** (send link / waive / record cash / refund) — a "Manage" card + two Modal sheets (`GuestMessageSheet.tsx`, `DepositSheet.tsx`) + hooks in `useBookingMutations.ts`. Backend routes Bearer-migrated + deployed 2026-06-09.
- ✅ **Edit guest & notes** — `EditBookingSheet.tsx` edits guest first/last/phone/email + special requests/dietary/occasion/internal notes (sends only changed fields), via the existing Bearer PATCH; "Edit" affordance on the Notes card.
- ⏳ **Remaining:** Modify service+variant+add-ons; compliance-flag indicator; admin-vs-staff gating (`api-venue-permissions-matrix`); calendar bottom-sheet "peek" variant; adopt `@gorhom/bottom-sheet` (currently reusing the proven Modal sheet pattern).
- **APIs:** `bookings/[id]` GET/PATCH, `…/message` ✅, `…/resend-confirmation` ✅, `…/deposit` ✅, `…/summary`, `…/validate-appointment-modification`, `…/compliance`.

### R11 — Create wizard: appointment depth — 🟡 In progress (2026-06-09)
- ✅ **Add-ons** — `AddonsStep.tsx` (single/multi groups, min/max enforced); catalog type carries `addon_groups`; confirm shows add-on lines + **total price + added duration + deposit**; create sends `addons:[{addon_id}]`. No backend change (public catalog already returns `addon_groups`; create accepts `addons`).
- ✅ **Wider date picker** — `buildUpcomingDays` now 28 days (was 7).
- ✅ **Deposit awareness** — confirm shows deposit; handles `payment_url` ("deposit link sent").
- ✅ **Variants (2026-06-10):** backend `POST /api/venue/bookings` now accepts `service_variant_id` (validates via `loadActiveVariantForService`, applies overrides to the engine input before slot validation, persists on the row, snapshots variant processing-time) — mirrors public create. App: `VariantStep.tsx` (radio list), wizard inserts an "Option" step when the service has variants, confirm shows variant name + variant-based price/duration/deposit, create sends `service_variant_id`.
- ✅ **Any-available practitioner (2026-06-10):** pooled "Any available" rows in the service picker (`buildAnyAvailableOptions`, sentinel `__any_available__` matching the web constant); `useAnyPractitionerAvailability` merges day slots across candidate practitioners client-side; slot chips show the practitioner name; create targets the slot's real practitioner.
- ✅ **Availability correctness (2026-06-10):** the slot query now passes `variant_id` + `addon_ids`, so the engine reserves the *extended* duration (previously add-ons could make a picked slot 409 at create).
- ⏳ **Still deferred:** full month-grid date picker fed by `appointment-calendar` available-dates (route now Bearer-ready); group & multi-service bookings; in-app card capture.

### R11 (original spec) — Create wizard: appointment depth
Make the wizard book what the web can book.
- **Variant** step (catalog already typed for variants) and **add-on groups** step (single/multi, min/max, price/duration math).
- **Any-available-practitioner** option; **custom date picker** backed by `appointment-calendar` month availability (not just next-7-days).
- **Deposit/payment** awareness (collect-on-web link, record cash, or skip per `payment_requirement`).
- **Walk-in fast path** restyle on the design system.
- **Defer to R11.1:** group & multi-service bookings; processing-time editing; appointment **waitlist join** on no-slots.
- **APIs:** staff catalog with overrides + add-ons (`appointment-services` / `addon-groups` or an enriched catalog), `appointment-calendar`, `appointment-availability`, `bookings` create (+ `create-group`, `create-multi-service` later), `validate-appointment-slot`.

### R12 — Day Sheet — ✅ Built (2026-06-09, pending backend deploy)
- `app/(app)/day-sheet.tsx` + `useDaySheet` + `types/day-sheet.ts`: date navigator (prev/next/today), summary (bookings/covers/arriving-soon), period-grouped booking rows (time, guest, party, status, deposit, dietary flag), tap → booking detail, pull-to-refresh. Reachable via the Settings **Tools** hub.
- Backend `day-sheet` route Bearer-migrated on `C:\reserve-ni` (deploy needed).

### R12 (original spec) — Day Sheet (counter run-sheet)
The single highest-value *new* surface for a busy counter.
- Date-scoped, **period-/time-grouped** list; per-row guest, party/service, time, status, deposit, dietary/notes, tags, table (if any); **inline status actions** + undo.
- Sticky **capacity/covers summary**, dietary band, search/filter, date nav.
- Add as a surface reachable from Calendar/Today (consider a 5th tab or a Calendar header toggle — see §6 decisions).
- **APIs:** `day-sheet`, `bookings/[id]` PATCH, `tables/assignments/bulk-assign` (table venues).

### R13 — Today / Dashboard home — ✅ Built (2026-06-09)
- `app/(app)/today.tsx` (reuses the already-Bearer `useDashboardHome`): KPI tiles (today's appointments/covers, confirmed, arriving-soon, next-up), a 7-day forecast bar chart, alerts, today's bookings list. Pull-to-refresh. Reachable via Settings **Tools** hub. No backend change.

### R13 (original spec) — Today / Dashboard home
Give staff the "at a glance" the web opens on.
- KPI header (today's appointments/covers, confirmed, arriving-soon, next-up), **7-day forecast** mini-chart, alerts, recent-bookings diary, **setup checklist** (admin, dismissible).
- Fold into the Calendar header summary or a compact Today surface (decision §6).
- **APIs:** `dashboard-home`, `setup-status`, `setup-checklist-dismiss`.

### R14 — Guest CRM depth — 🟡 Core built (2026-06-09, pending backend deploy)
- ✅ **Edit profile** (`GuestEditSheet`): name/phone/email/notes + **tags** (comma input) + **marketing consent** toggle, diff-only PATCH `guests/[id]`.
- ✅ **Message guest** (`GuestMessageSheet`): email/SMS/both → POST `guests/[id]/message`.
- ✅ **Activity timeline** card on the client detail (`useGuestTimeline` → `guests/[id]/timeline`).
- Marketing-consent badge on the profile. Edit/Message actions in the client header.
- Backend `guests/[id]` PATCH, `guests/[id]/message`, `guests/[id]/timeline`, `guests/tags` Bearer-migrated (deploy needed).
- ⏳ **Deferred to R14.1:** documents, loyalty, household, custom-fields editor, merge, GDPR export/erase.

### R14 (original spec) — Guest CRM depth
Make Clients a real CRM, not a read-only card.
- **Edit** profile (name/email/phone/notes), **marketing consent** toggle, **custom fields** edit.
- **Tags** add/remove; **timeline/audit**; **communications** log; **message guest**; **documents** (view/download/sign); **loyalty**; **household**.
- **Merge** duplicates and **GDPR** export/erase (admin) → R14.1.
- **APIs:** `guests/[id]` PATCH, `…/timeline`, `…/documents(/*)`, `…/loyalty`, `…/household`, `…/message`, `guests/tags`, `contacts/custom-fields`, `guests/merge`, `gdpr/export-guest`, `gdpr/erase-guest`.

### R15 — Waitlist — ✅ Built (2026-06-09, pending backend deploy)
- `app/(app)/waitlist.tsx` + `useWaitlist`/`useUpdateWaitlistEntry` + `types/waitlist.ts`: Appointments/Tables segmented toggle; entry cards (guest, desired date/time, service/party, status badge, notes); **Offer → Confirm (→ creates booking, navigates) → Cancel** actions; pull-to-refresh. Reachable via Settings **Tools** hub.
- Backend `waitlist` (GET/PATCH/DELETE) + `waitlist/alerts` Bearer-migrated (deploy needed).
- ⏳ Deferred: `waitlist/alerts` UI (open-slot opportunities), TTL countdown timers.

### R16 — Secondary booking models — ❌ OUT OF SCOPE (decision §6, 2026-06-09)
Appointments-only line held. Classes/events/resources/tables deferred indefinitely. (For reference, would have been: class-instance attendee check-in, event rosters.)

### R17 — Reports & availability — ✅ Built (2026-06-10, pending backend deploy)
- ✅ **Reports** (`app/(app)/reports.tsx`, admin-only — Tools row hidden for staff, screen guards too): 7/30/90-day presets; booking summary (+by-status), no-shows & cancellations, deposit revenue, client summary, appointment insights (by practitioner / by service), add-on revenue. CSV export stays on web (footnote links it).
- ✅ **Availability** (`app/(app)/availability.tsx`): next-14-days view of **time blocks** + **leave** with practitioner names; create-block sheet (practitioner chips, date + start/end steppers, reason) and create-leave sheet (date range, annual/sick/other, notes); remove with confirm. Invalidates calendar + slot caches.
- Backend Bearer-migrated: `reports`, `export`, `practitioner-leave`, `practitioner-calendar-blocks` (+`[id]`), `appointment-calendar` (deploy needed).
- ⏳ Deferred: calendar grid blocks **overlay** (`schedule`), CSV share-sheet export.

### R18 — Platform polish & release — 🟡 In progress (2026-06-10)
- ✅ **Notifications centre** (`app/(app)/notifications.tsx`): feed with unread dots, tap-to-mark-read, "Mark all N as read"; `notifications` + `notifications/read` Bearer-migrated (deploy needed). Deep links + `preferences` deferred.
- ✅ **Waitlist offer TTL countdown** ("Offer expires in 2h 10m") on offered entries.
- ✅ **Admin gating:** Reports (Tools row + screen) and Deposit **Refund** are admin-only via `staff/me` role.
- ✅ **Web-dashboard URL** now derives from `EXPO_PUBLIC_API_URL` (was a hardcoded stale domain).
- ⏳ Remaining: linked-venue switcher, `@gorhom/bottom-sheet`/`flash-list`, on-device drag tuning, Sentry, motion, empty-state art, a11y matrix, EAS build & store.

**Production-readiness pass (2026-06-10, second):**
- ✅ **Deps:** `npx expo install --fix` — all 9 outdated packages bumped to SDK 56 pins (`expo` 56.0.9, `expo-router` 56.2.9, `react-native-screens` 4.25.2, etc.); `--check` reports up to date.
- ✅ **Bug — nested `<Screen>` double safe-area inset** on the loading/error branches of Day Sheet, Waitlist, Reports, Availability, Notifications → replaced inner `Screen` with padded `View`.
- ✅ **Bug — stale run-sheet:** realtime booking changes + booking mutations now also invalidate the `daySheet` (and waitlist) caches.
- ✅ **Calendar blocks overlay:** `CalendarDayGrid` renders practitioner blocks (breaks/manual blocks) as grey non-tappable overlays ("Lunch · 12:00–13:00"); calendar screen feeds them from `useCalendarBlocks`, filtered to the visible practitioner+day. Blocked time can no longer be tapped-to-book.
- ✅ **Time prefill:** tapping an empty calendar slot now pre-selects that time in the wizard's slot step (the `time` param was previously ignored).

### R18 (original spec) — Platform polish & release
- **Notifications** centre (in-app) + tap-through deep links (`notifications`, `notifications/read`, `notifications/preferences`).
- **Linked-venue switcher** UI (finish the Phase-10 banner).
- Libraries: `@gorhom/bottom-sheet`, `@shopify/flash-list`, on-device **drag-to-reschedule** tuning (gesture-handler), **Sentry** (needs dev build), screen-transition/FAB **motion**, **empty-state illustrations**.
- **a11y / contrast** audit; light/dark + salon/restaurant + admin/staff + iOS/Android matrix.
- **EAS dev build** (unblocks push, Sentry, on-device verification), icon/splash art, store listing.

---

## 5. Backend dependency — Bearer-auth audit (gating)

Mobile authenticates venue routes with a **Bearer JWT**; web routes must use `createVenueRouteClient(request)` or the app gets 401. Per project notes, only a subset was Bearer-ready on `main` as of 2026-06-06. **Before** each phase, confirm/migrate its endpoints (backend lives on the `staging` branch → merge to `main` + deploy to reach the phone). Build a checklist:

- **R10:** `bookings/[id]` PATCH (rich fields), `…/message`, `…/resend-confirmation`, `…/deposit`, `…/summary`, `…/validate-appointment-modification`, `…/compliance`.
- **R11:** `appointment-calendar`, `appointment-services`/`addon-groups` (or enriched staff catalog), `validate-appointment-slot`, `bookings` create variants.
- **R12:** `day-sheet`, `tables/assignments/bulk-assign`.
- **R13:** `dashboard-home`, `setup-status`, `setup-checklist-dismiss`.
- **R14:** `guests/[id]` PATCH + `timeline`/`documents`/`loyalty`/`household`/`message`, `guests/tags`, `contacts/custom-fields`, `guests/merge`, `gdpr/*`.
- **R15:** `waitlist`(+`/[id]`), `waitlist/alerts`.
- **R16:** `class-instances`(+attendees), `experience-events`(+attendees).
- **R17:** `reports`, `export`, `practitioner-leave`, `practitioner-calendar-blocks`, `schedule`, `opening-hours`.

> Never add a global "401 → signOut" — a venue-route 401 is not an invalid Supabase session (caused a login loop before).

---

## 6. Decisions

**Locked 2026-06-09:**
1. **Priority order** — **start with R10** (booking-detail depth), then R11 → R12.
2. **Secondary models (R16)** — **out of scope. Appointments-only.** Skip classes/events/resources/tables; hold the strict appointments-first line.
3. **New-surface placement** — **add a "More" hub** (keep the 4-tab bar; surface Day Sheet, Today, Waitlist, Reports, etc. from a More/menu screen).

**Locked 2026-06-10 — appointments-plan pivot (R19):**
- The app is built **for appointments-plan venues only**, mirroring the web's plan separation. Restaurant surfaces disabled: **Day Sheet deleted** (screen/hook/type/keys), **Waitlist is appointment-only** (tables tab removed).
- **Tabs renamed to mirror web IA:** Calendar · Appointments · **Contacts** (was Guests/Clients) · **More** (was Settings; ellipsis icon).
- **More = the entry point to everything else** (web sidebar + settings equivalent):
  - *Workspace:* Today, Waitlist, Calendar availability (blocks + leave), Notifications, Reports (admin).
  - *Manage:* **Services** (`manage/services` — list with variants/add-on summary, expandable detail, create + edit name/description/duration/price/deposit/active via partial-safe PATCH that never sends `variants`/`addon_group_links`), **Venue profile** (`manage/venue-profile`, admin edit of name/address/phone/email/website), **Business hours** (`manage/hours`, read-only weekly hours from bootstrap), **Team** (`manage/team`, admin staff list), **Plan & payments** (`manage/plan`, tier + models + Stripe status), Booking page + Communications (web link-outs, admin).
  - *Booking types:* model-gated link-out rows (Classes/Events/Resources/Tables) that **only appear when those models are enabled** on the venue.
- **Backend Bearer batch 5 (NEEDS DEPLOY):** `appointment-services` (GET/POST/PATCH/DELETE), `opening-hours` PATCH, `staff` GET, `billing/status` GET, `venue` PATCH.
- Venue bootstrap type extended with `address/phone/email/website_url/opening_hours/stripe_connected_account_id` (all already returned by GET /api/venue).

**R19.1 — Full settings editors (2026-06-10, second pass):**
- ✅ **Variants editor** (`VariantsEditorSheet`): add/edit/remove service options (name, duration, price, deposit) with accordion rows; saves the **full set** via `useReplaceServiceVariants` (replace-semantics handled deliberately; existing ids preserved). Admin-only button on Services.
- ✅ **Add-on linking** (`AddonLinksSheet` + `useAddonGroups`): checkbox list of the venue's add-on groups (with addon counts/selection type); saves full `addon_group_links` via `useReplaceServiceAddonLinks`. Group/add-on CRUD stays on web.
- ✅ **Business hours editor** (`OpeningHoursEditor` + `useUpdateOpeningHours`): per-day open/closed switch, 1–2 periods with 15-min time steppers, client-side validation (close>open, period order); admin edits, staff read-only.
- ✅ **Communications editor** (`manage/communications.tsx` + `useNotificationSettings`/`useUpdateNotificationSettings`): confirmations (channels + custom SMS), reminders 1/2 (hours-before steppers + channels), update toggles, staff alerts; diff-PUT. (Web `communication-templates` is 410 — notification-settings/policies are the real API.)
- ✅ **Compliance** (`manage/compliance.tsx`): missing-for-bookings, expiring-soon, awaiting-submission (form links with **Resend email/SMS** + **Revoke**); rows deep-link to booking/contact; friendly plan-gate state on 403.
- ✅ **Booking settings** (`manage/booking-settings.tsx`): primary model badge (immutable), secondary-model switches (Classes/Events/Resources/Tables) writing `active_booking_models` (primary kept first), require-sign-in-to-book toggle; handles `BOOKING_MODEL_HAS_FUTURE_BOOKINGS` 409 with a clear message.
- More hub: Booking settings / Communications / Compliance rows added (admin).
- **Backend Bearer batch 6 (NEEDS DEPLOY with batch 5):** `addon-groups` (GET/POST/PUT), `notification-settings` (GET/PUT), `communication-policies` (GET/PUT), `compliance/dashboard`, `compliance/records` (GET/POST), `compliance/form-links` (GET/POST + `[id]/resend` + `[id]/revoke`). Left cookie-only: `addon-groups/[id]`, `compliance/records/[id]`(+void).

**Still to confirm at the relevant phase:**
4. **Payments in-app (R11)** — collect deposits on device (Stripe) vs. always send-a-link / record-cash. In-app card capture is a large lift; recommend link/record-cash for v1.
5. **Verification reality** — web preview is light-only and the Android emulator is blocked; an **EAS dev build + Expo Go on the S23** is needed to verify gestures, push, payments, and many features on device. Schedule the dev build early (R18 item, but pull forward).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Backend endpoints not Bearer-ready | §5 audit per phase; verify on staging before starting the phase |
| Scope creep (web is huge: 40 dashboard pages, ~200 venue routes) | Hold the §3 cut line: mobile = counter ops; web = admin/config |
| Many features unverifiable in web preview | Pull the EAS dev build forward; verify gesture/push/payment on the S23 |
| Bottom-sheet / list / drag library choices | Adopt `@gorhom/bottom-sheet` + `@shopify/flash-list` in R10/R12; SDK-56-aligned versions |
| Permission gating wrong (staff sees admin actions) | Mirror `api-venue-permissions-matrix.md`; gate actions by `staff/me` role |
| In-app payments complexity | Link/record-cash for v1; native Stripe later |

---

## 8. Recommended immediate next step

Start **R10 (Booking detail depth)** — it has the highest ratio of value to effort (reuses an existing screen, adds the actions staff most miss: message, resend, deposit, edit, reverts), and it forces the bottom-sheet primitive that R11/R12 also need. Gate it on the §5 R10 Bearer audit.

---

## 9. Multi-agent parity push — 2026-06-11

A supervised team of agents took every app page through investigate → implement → bug-fix → design-polish → lint. Artifacts: `Docs/PARITY_GAP_REPORT.md` (full 20-page gap report), `Docs/parity/*.md` (per-page briefs), `Docs/DESIGN_REVIEW.md` (the design standard). Final state: **`tsc` 0 errors, `expo lint` 0 errors, Metro bundles clean**.

**Shipped this push:**
- **Keystone:** `components/bookings/BookingDetailSheet.tsx` — full expanded booking detail as a tall scrollable sheet on **Calendar** taps and **Bookings-list** taps (and contact history). `components/ui/Sheet.tsx` gained a `fill` mode.
- **Calendar:** multi-practitioner side-by-side columns, column-visibility, status filters, on-block inline quick actions, block create/edit/delete, deep-link `?date=`.
- **Bookings list:** stats bar, bulk tag/message, realtime live-sync.
- **Contacts (list + detail):** create, advanced filters/segments + identity scope, pagination, custom fields, marketing consent (opt-in/out + timestamp), household, documents (expo-document-picker), GDPR export/erase, merge, message, timeline, inline booking drill-through.
- **Create-booking:** guest dietary/occasion/special fields, post-create confirmation, rebook bootstrap, practitioner step.
- **Today / Waitlist / Notifications / Reports / Availability:** brought up substantially (KPIs/forecast/checklist; offer-confirm-cancel + TTL + alerts; deep-links + prefs; report sections + CSV share; blocks + leave CRUD).
- **Manage:** Services (+ add-on group CRUD, richer variants, staff-permission flags), Venue profile (structured address, slug-availability, logo/cover upload, grace period, validation), Hours (per-day CRUD + copy-to-all), Team (invite/role/password/calendars + My Account), Plan (billing hub + tier change + portal), Booking settings, Communications (diff-PUT), Compliance (dashboard/records/form-links/flags). More hub IA + account screen.
- **Quality:** 15 real runtime bugs fixed (deposit-status guards, 4 setState-in-render→effect, unified-scheduling slot filter that hid all times, unthemed walk-in form); 5 conditional-hook violations in `reports.tsx` (crash risk) fixed; design-system consistency (themed Text everywhere, 44pt targets, haptics, SymbolView icons).

**Still gated (require action outside this app repo / environment):**
- **Backend deploy** — many venue routes must be Bearer-migrated + deployed on `reserve-ni`; app-side wiring is complete and typed but unverifiable end-to-end until then.
- **On-device EAS dev build** — needed to verify gestures, push, payments, nested-modal behaviour, document picker, light/dark on the S23.
- **Deferred app-side backlog:** compliance flag badges onto calendar/list rows (hook + `ComplianceFlagDot`/`ComplianceFlagBadge` exist, need cross-domain wiring), realtime guest-list sync, full merge wizard on contact detail, on-grid drag/resize reschedule, interactive charts (needs a charting lib), multi-service/group/in-app-payment booking (mostly out of the appointments-only cut line).

*Living document — update phase checkboxes and decisions as the build progresses.*
