# Resneo App — Redesign Scaffold & Build Plan

**Status:** Active plan (supersedes `MOBILE_BUILD_PLAN.md`)
**Created:** 2026-06-06
**Owner:** Andrew
**Reference:** `_reference/reserve-ni` (read-only clone of the Resneo **web** app — the source of truth for features, API contracts, brand, and data model)

> ⚠️ **Before writing any app code**, read the versioned Expo docs at
> https://docs.expo.dev/versions/v56.0.0/ (per `AGENTS.md`). This repo is Expo SDK **56**.

---

## 1. Vision & guiding principles

Build a **world-class, appointments-first staff app** for Resneo that mirrors the web dashboard's two headline surfaces — a **Bookings list** and a **Calendar grid** — and lets staff do as much of the web's day-to-day work from their phone as is sensible behind a busy counter.

**Persona:** salon/clinic owner or staff member at the counter. They need to: see the diary at a glance, take/change a booking in seconds, look someone up, and get alerted when things change.

**Design principles**

1. **Appointments-first.** The practitioner calendar and the appointment booking flow get the most polish. Restaurant/table features ride along but take a back seat.
2. **Mirror the web's IA, not its layout.** Same destinations and terminology (`Bookings`/`Appointments`, `Calendar`, `Contacts`/`Clients`), reimagined for touch.
3. **Modern mobile feel.** Native gestures, fluid motion (Reanimated), haptics, depth/elevation, skeleton loaders, large 44×44+ targets, safe-area aware, light/dark.
4. **Fast at the counter.** Optimistic updates, realtime sync, offline-tolerant reads, one-tap actions, a always-reachable "+" to create a booking.
5. **Reuse the proven plumbing.** The data/auth/realtime layer already works against the web's `/api/venue/*` contracts — we rebuild the *experience*, not the engine.

---

## 2. Scope decisions (locked 2026-06-06)

| Decision | Choice |
|---|---|
| Foundation | **Keep the plumbing, rebuild the UX.** Reuse data/auth/realtime/push/types; rebuild nav, screens, design system. |
| Navigation | **4 tabs: Calendar · Bookings · Clients · Settings**, with **New Booking** as a prominent "+" action. Replaces the old Today/Week split. |
| Headline features | **Bookings list view** + **Calendar grid view** (mirrors web `/dashboard/bookings` and `/dashboard/calendar`). |
| Focus | **Appointments plan features.** Restaurant/table bookings: minimal, deferred. |
| Brand | **Adopt the web brand** — ResNeo Night navy `#003B6F` + Neo Teal `#00C2C7`, Inter typeface. |

---

## 3. Keep vs. rebuild (precise inventory)

### ✅ Keep as-is (the invisible engine)
- **Auth:** `lib/supabase.ts` (SecureStore adapter), `providers/AuthProvider.tsx`, `lib/auth/*`.
- **API client:** `lib/api/client.ts` (Bearer JWT, error normalization, HTML-redirect detection).
- **Server state:** `lib/queries/*` (TanStack Query hooks + `queryClient.ts` + `keys.ts`), `@tanstack/react-query`.
- **Venue context:** `providers/VenueProvider.tsx`, `providers/LinkedVenueProvider.tsx`.
- **Realtime + push:** `providers/VenueLiveSyncProvider.tsx`, `lib/realtime/*`, `lib/push/*`, `providers/PushNotificationsProvider.tsx`.
- **Types:** `types/*` (API payload shapes), `lib/validation/*` (Zod), `lib/dates/venue-dates.ts`, `lib/venue/venue-experience.ts`, `lib/booking/*` helpers.
- **Env/config:** `lib/env.ts`, `.env.example`, `eas.json`.

### ♻️ Rebuild (the experience)
- **Navigation:** swap `(tabs)` from Today/Week/Clients/Settings → **Calendar/Bookings/Clients/Settings**; add stack routes.
- **Design system:** new `theme/` (brand palette, Inter, elevation/motion tokens) + a fresh `components/ui` primitive set.
- **Screens & domain components:** Calendar grid, Bookings list + filters, redesigned booking detail, redesigned create-appointment wizard, redesigned Clients.
- **Brand assets:** app icon, splash, colours; rename `reserveni` → `resneo` identifiers (see §11).

### 🗑️ Delete
- `app/(app)/(tabs)/index.tsx` (Today), `app/(app)/(tabs)/week.tsx`, `components/week/*`, `components/bookings/TodayStatsRow.tsx`, `components/bookings/TodayBookingList.tsx`, `components/PlaceholderTab.tsx`, and other Today/Week-specific pieces once replaced.

---

## 4. Information architecture & navigation

### Web → App destination map
| Web page | App destination |
|---|---|
| `/dashboard` (home stats) | Folded into **Calendar** header summary (no separate Home tab) |
| `/dashboard/calendar` (practitioner calendar) | **Calendar** tab (grid — day/week/month) |
| `/dashboard/bookings` | **Bookings** tab (filterable list) + detail |
| `/dashboard/bookings/new` | **New Booking** "+" flow (modal stack) |
| `/dashboard/contacts` | **Clients** tab + client detail |
| `/dashboard/appointment-services` | Read-only reference in v1; manage on web (link out). Editing → later phase |
| `/dashboard/settings` | **Settings** tab (+ "manage on web" deep links for admin tasks) |

### Route tree (target)
```
app/
  _layout.tsx                      # providers + auth gate (KEEP, light edits)
  (auth)/                          # KEEP
    _layout.tsx
    sign-in.tsx
    callback.tsx
  (app)/
    _layout.tsx                    # staff gate (KEEP)
    staff-required.tsx             # KEEP
    (tabs)/
      _layout.tsx                  # REBUILD → Calendar/Bookings/Clients/Settings
      calendar.tsx                 # NEW — headline grid
      bookings.tsx                 # NEW — filterable list
      clients.tsx                  # REBUILD UI (keep data hooks)
      settings.tsx                 # REBUILD UI (keep data hooks)
    booking/
      [id].tsx                     # REBUILD — booking detail
      new.tsx                      # REBUILD — create flow (modal presentation)
    client/
      [id].tsx                     # REBUILD UI
```

**Navigation patterns**
- Tab bar: 4 icons + labels, brand active tint, blurred/elevated bar.
- **New Booking "+":** a floating action button on Calendar & Bookings, plus a header action — opens `booking/new` as a modal stack (`presentation: 'modal'`).
- Booking detail & client detail: push as cards; consider a bottom-sheet detail for quick peeks from the calendar (long-press → preview).

---

## 5. Design system (new `theme/`)

### 5.1 Colour — adopt web brand
```
Brand (ResNeo Night)        Accent (Neo Teal)
brand50  #E8EFF6            accent50  #E6FBFB
brand100 #C6D8E9            accent100 #C2F4F5
brand200 #9DBBD7            accent200 #8FEAEB
brand300 #6E9AC2            accent300 #54DCDE
brand400 #3D72A0            accent400 #22CDD1
brand500 #1A5587            accent500 #00C2C7   ← accent
brand600 #003B6F  ← brand   accent600 #00A0A4
brand700 #00305C  hover     accent700 #007E81
brand800 #00264A            accent800 #005F61
brand900 #001B36            accent900 #004244

Semantic                    Neutral (slate)
success #059669 / #D1FAE5   text      #0F172A
warning #D97706 / #FEF3C7   text2     #475569
danger  #DC2626 / #FEE2E2   muted     #94A3B8
                            surface   #FFFFFF
                            sunken    #F4F6F9
                            border    #E2E8F0
```
Plus a full **dark theme** mapping (deepen surfaces, lift text, keep brand/accent legible).
Per-appointment **service colours** come from the API (`service.colour`) and tint calendar cards — the theme must accommodate arbitrary hex with readable text overlays.

### 5.2 Typography — Inter
Adopt **Inter** (web parity) via `@expo-google-fonts/inter` (new dep — justified: brand match). Scale:
`xs 12 · sm 14 · base 16 · lg 18 · xl 20 · 2xl 24 · 3xl 30`. Headings: weight 700–800, brand navy, tight tracking. Body: 16px baseline for tap legibility.

### 5.3 Other tokens
- **Spacing:** 4·8·12·16·20·24·32·48 (keep existing scale).
- **Radius:** card 16, surface 20, pill 9999 (match web's softer corners; current app uses 8/12/16 — bump up).
- **Elevation:** 2 shadow tiers (card, elevated) mirroring web `--ds-shadow-*`.
- **Motion:** durations fast 150 / normal 200; standard easing; Reanimated for sheets, FAB, tab transitions.
- **Haptics:** `expo-haptics` (new dep) on status changes, drag-drop commit, create success.

### 5.4 Component library (`components/ui/`)
Rebuild/expand primitives, each theme-aware, light/dark, with loading/disabled states:
`Button`, `IconButton`, `Card`, `Input`, `Field` (label+error), `Select`, `Chip`/`FilterPill`, `Badge`/`StatusPill`, `Avatar`, `Sheet` (bottom sheet), `Segmented` (day/week/month toggle), `Screen` (safe-area + scroll), `Skeleton`, `LoadingState`, `ErrorState`, `EmptyState`, `Toast`. (New deps to evaluate: `@gorhom/bottom-sheet` for sheets; otherwise build on Reanimated.)

---

## 6. Headline experience #1 — Calendar grid

Mirrors web `src/app/dashboard/practitioner-calendar/PractitionerCalendarView.tsx` and friends (`MonthScheduleGrid.tsx`, `ScheduleFeedColumn.tsx`, `BookingCard.tsx`, `PractitionerCalendarToolbar.tsx`).

### Views
- **Day (primary):** vertical time axis (configurable open→close, 15-min rows) × **practitioner columns**. Appointment blocks positioned by start/duration, tinted by `service.colour`, showing guest, time, service, status stripe, add-on count. A live "now" line.
- **Week:** horizontal day strip header + a condensed grid or per-day agenda (validate which reads best on a phone).
- **Month:** overview grid with per-day booking-count dots (appointments/events/classes), tap a day → Day view.

### Mobile rendering strategy (key design challenge — prototype first)
A phone is too narrow for many practitioner columns. Approach:
- **Default:** show **one practitioner column at a time**, full-width, with a horizontally swipeable practitioner pager + a practitioner filter chip row. Multi-column **horizontal scroll** as an option for tablets/landscape.
- Time grid in a vertical `ScrollView`; blocks absolutely positioned (minute → px). Build custom (no off-the-shelf RN library matches the practitioner-grid model well). Use existing **Reanimated**; add **`react-native-gesture-handler`** (verify it's installed) for:
  - **Tap empty slot** → prefilled New Booking (date/time/practitioner).
  - **Tap block** → booking detail (bottom-sheet peek, then full screen).
  - **Long-press + drag block** → reschedule, validated on drop.
- **Reschedule validation:** call availability/modify endpoints before committing; optimistic move with rollback on failure.

### Toolbar
Date picker (jump to date / today), day·week·month segmented control, practitioner filter, guest search, status filter pills, "+" New Booking.

### APIs (web contracts)
- `GET /api/venue/calendar-grid?calendar_ids=&start_date=&end_date=` — bookings + blocks grouped by calendar/date.
- `GET /api/venue/practitioners?roster=1` — columns.
- `GET /api/venue/schedule` / `practitioner-calendar-blocks` — breaks/closures.
- `PATCH /api/venue/bookings/[id]` — reschedule.

---

## 7. Headline experience #2 — Bookings list

Mirrors web `src/app/dashboard/bookings/AppointmentBookingsDashboard.tsx` + `BookingDetailPanel.tsx`.

### List
- `FlashList`/`FlatList` of bookings; each row: time, guest (+visit-count badge), service/treatment, practitioner, status pill, add-ons "+N", price/deposit indicator.
- **Filters:** date scope (day/week/month/custom range), status (Pending/Booked/Confirmed/Seated/Completed/Cancelled/No-show), practitioner, guest search. Sticky filter bar with chips.
- Pull-to-refresh; realtime invalidation; empty/skeleton states.

### Detail (redesigned)
- Guest profile (name, contact, visit history, tags), booking summary (date/time/duration/service/variant/add-ons/practitioner/price/deposit), special requests/notes, status timeline.
- **Actions:** Confirm, Seated/Start, Complete, No-show, Cancel, Reschedule, Message guest (v1.1), Resend confirmation. Respect admin-vs-staff permissions (see web `api-venue-permissions-matrix.md`).
- Present as full screen from list; as bottom-sheet peek from calendar.

### APIs
`GET /api/venue/bookings/list` (filters), `GET /api/venue/bookings/[id]`, `PATCH`/`DELETE /api/venue/bookings/[id]`, `POST .../check-in`, `.../deposit`, `.../message` (v1.1).

---

## 8. Appointments domain (the focus)

Faithfully model the web's appointment system (ref: agent map of `appointment_services`, `practitioners`, availability engine):

- **Services** → variants → add-on groups/add-ons; duration, buffer, price/deposit, payment requirement, colour, booking-window rules.
- **Practitioners** → working hours, breaks (general + by-day), days off, `parallel_clients`, per-service overrides.
- **Availability engine** → call the web endpoints rather than reimplementing:
  - `GET /api/venue/appointment-calendar` (month: available dates).
  - `GET /api/venue/appointment-availability` (day: slots, honouring hours/breaks/buffers/booking-window/processing-time).
- **Processing-time blocks**, **"any available practitioner" pooling**, **group/multi-service** bookings: surface in UI where present, but treat as **v1.1** unless trivial — keep v1 create flow lean.

### Create-appointment wizard (redesigned, mobile-native)
Steps (large targets, progress indicator, back/skip): **Service** → (Variant) → (Add-ons) → **Practitioner** (or Any-available) → **Date** → **Time slot** (+staff duration/price overrides if permitted) → **Guest details** (with in-wizard guest search) → **Review & confirm** → `POST /api/venue/bookings`. Walk-in fast-path (`source: 'walk-in'`, same-day). Ref: web `src/components/booking/AppointmentBookingFlow.tsx`.

---

## 9. Restaurant / tables (back seat)
Keep the existing walk-in path working (`POST /api/venue/bookings/walk-in`, party size + optional table) and let venue-type branching (`lib/venue/venue-experience.ts`) hide appointment-only UI for restaurant venues. **No** new table-grid/floor-plan work in this redesign.

---

## 10. Backend prerequisite (carryover from old Phase 0.5)
The calendar/appointment endpoints must accept **Bearer** auth (`createRouteHandlerClient(request)`), like the booking routes already patched in the reference. Confirm these are Bearer-ready on staging/production before R3–R5:
`calendar-grid`, `appointment-calendar`, `appointment-availability`, `practitioners`, `schedule`/`practitioner-calendar-blocks`.
(See `Docs/WEB_BEARER_AUTH_MIGRATION.md`, `Docs/STAGING_SETUP.md`.)

---

## 11. Rebrand housekeeping (reserveni → resneo)
Track but sequence carefully (deep-link/bundle changes affect Supabase + web redirect config):
- `app.json`: `name`, `slug`, `scheme` (`reserveniapp://` → `resneo://`), iOS/Android bundle IDs (`com.reserveni.app` → `com.resneo.app`).
- Update magic-link redirect allow-list on the web/Supabase side **in lockstep** with the scheme change, or auth callbacks break.
- Fix stale `theme/index.ts` brand comment; update `README`, headers, default `headerTitle` fallback (`'ReserveNI'` → `'Resneo'`).
- App icon + splash with new brand.

---

## 12. Phased build plan

Each phase is independently shippable to a dev build. Reference files are in `_reference/reserve-ni`.

### Phase R0 — Design system & brand foundation — ✅ Complete (2026-06-06)
- ✅ New `theme/index.ts`: brand (navy) + accent (teal) ramps, semantic colours, full **dark theme**, radius/elevation/motion tokens, Inter typography scale. All legacy colour keys preserved so existing screens keep compiling.
- ✅ **Inter** loaded at startup (`@expo-google-fonts/inter` in `app/_layout.tsx`, replacing SpaceMono); **expo-haptics** added with a `lib/haptics.ts` wrapper.
- ✅ Primitives in `components/ui/`: `Text`, `Button` (variants/sizes/loading/icon/haptic), `Card` (elevation tiers + pressable), `Input` (focus/error/helper), `Chip`, `Badge`/`StatusPill`, `Segmented`, `Avatar`, `Skeleton` (Reanimated pulse) + barrel `index.ts`. Existing `Screen`/`LoadingState`/`ErrorState`/`EmptyState` adopt the new tokens automatically.
- ✅ Kitchen-sink gallery at `app/design-system.tsx` (dev-only route; reachable via a `__DEV__` link on the sign-in screen).
- ✅ `npm run typecheck` and `npm run lint` both green (0 errors).
- ✅ Rendered the gallery via Expo web (`.claude/launch.json` → `expo-web`, port 8081) and screenshot-verified **light and dark** themes: brand/accent ramps, Inter type scale, buttons, inputs, badges/status pills, chips, segmented, avatars, skeletons, empty state. Clean bundle (1798 modules), no console errors.
- ⏳ Deferred to the phases that use them: `@gorhom/bottom-sheet`, `@shopify/flash-list`, `react-native-gesture-handler` (R2–R4).
- **Note:** `components/useColorScheme.web.ts` hard-codes `light` (Expo template SSR default), so **web is always light**; native devices honour the system setting (dark verified by temporarily forcing the web stub). On-device render still pending (emulator blocked — see below).
- **Emulator blocked locally:** no virtualization (`HypervisorPresent: False`); enabling WHPX/AEHD needs admin + reboot. Legacy `sdkmanager` also broken on modern JDK (JAXB removed). Use Expo Go on a physical device, or enable virtualization, to run natively.

### Phase R1 — Navigation re-scaffold — ✅ Complete (2026-06-06)
- ✅ `(tabs)/_layout.tsx` rebuilt → **Calendar · Bookings · Clients · Settings** with new icons (calendar/list/people/gear), `headerShadowVisible: false`, and Inter tab labels.
- ✅ **Calendar is the `index` route** (guaranteed default tab — Expo Router doc doesn't confirm `initialRouteName` without an index, so Calendar = `index.tsx` rather than a separate `calendar.tsx`). New `bookings.tsx`. Both are polished placeholders (Calendar has a Day/Week/Month `Segmented` toolbar) pending R2/R3.
- ✅ Venue-aware labels via `bookingsScreenTitle()`/`clientsScreenTitle()` + `isAppointmentFromVenue()` (e.g. "Appointments"/"Guests").
- ✅ New reusable `Fab` primitive (extended pill, self-positioning, haptic) on Calendar + Bookings → opens `booking/new`, now presented as a **modal**.
- ✅ Deleted: Today (`index.tsx` old), `week.tsx`, `components/week/*`, `TodayBookingList`, `TodayStatsRow`, `PlaceholderTab`.
- ✅ `typecheck` + `lint` green (0 problems — the last stray warning lived in the deleted Today view). Verified on Expo web: clean boot to sign-in; tab shell + FAB + tab navigation screenshot-confirmed (via a temporary, reverted auth-guard bypass since tabs sit behind the staff gate).

### Phase R2 — Bookings list view — ✅ Complete (2026-06-06)
- ✅ `bookings.tsx` rebuilt: a **sticky filter bar** (Day/Week/Month `Segmented` + date navigator with prev/next/today + guest search + horizontally-scrolling **status chips with live counts**) above a `SectionList` grouped by day (sticky day headers in week/month).
- ✅ New `BookingRow` component (time-led, `StatusPill`, deposit indicator) + a `BookingRowSkeleton`-style loading state, `EmptyState`, `ErrorState` w/ retry, and **pull-to-refresh**. Realtime comes free via `VenueLiveSyncProvider` invalidating the bookings query keys.
- ✅ Data: Day → `useBookingsList` (all statuses); Week/Month → `useBookingsRange`. Status + search filtered client-side; tap row → `booking/[id]`.
- ✅ Date helpers added to `lib/dates/venue-dates.ts` (`addMonthsToDateStr`, `getMonthRangeFromDate`, `formatMonthLabel`, `formatRangeLabel`).
- ✅ `typecheck` + `lint` green. Verified on Expo web (temporary mock rows + guard bypass, both reverted): the populated list, color-coded status pills, live chip counts, and **status filtering** all confirmed.
- ⏳ **Deferred:** practitioner filter (the `bookings/list` row payload has no practitioner field — needs a backend param/richer payload). Note: week/month uses `view=calendar`, which may omit cancelled bookings (Day view shows all statuses).

### Phase R3 — Calendar grid: Day view (headline) — ✅ Complete (2026-06-06)
- ✅ Custom **day grid** (`components/calendar/CalendarDayGrid.tsx`): time axis + hour lines, derived bounds (from working hours + bookings, fallback 8–20), a **now-line** (mobile addition — web has none), service/practitioner-coloured **appointment blocks** (`AppointmentBlock.tsx`), tap-block → `booking/[id]`, and a full-bleed background **tap-to-create** layer (snaps to 15 min → opens `booking/new` prefilled with date/practitioner/time).
- ✅ Positioning math in `grid-layout.ts` (2px/min; `top = minutesFromStart × px`, `height = max(duration × px, min)`), DOM-verified pixel-exact.
- ✅ **Practitioner chip selector** (single column at a time); per-practitioner colour tint via `hexToRgba`.
- ✅ Contracts mirrored from the real endpoints: `types/calendar-grid.ts`, `types/practitioner.ts`; hooks `useCalendarGrid` (`GET /api/venue/calendar-grid`) + `usePractitioners` (`GET /api/venue/practitioners?roster=1`); query keys added.
- ✅ States: loading / error+retry / "no practitioners" empty; Week & Month show an R4 placeholder.
- ✅ `typecheck` + `lint` green. Verified via temporary mock + guard bypass (both reverted): grid rendered with practitioner chips, 09:00–18:00 axis, and 5 blocks whose **heights and offsets exactly match their durations/start times**. (PNG capture timed out on the tall scroll canvas — a preview-tool limit; geometry confirmed via DOM.)
- ⏳ **Deferred to R4:** week/month views, **drag-to-reschedule**, and wiring `VenueLiveSyncProvider` to also invalidate the `calendar` query key (today it only invalidates `bookings`, so the grid won't auto-refresh on realtime booking changes yet).

### Phase R4 — Calendar Week/Month + reschedule — ✅ Complete (2026-06-06)
- ✅ **Week view** (`WeekStrip.tsx`): Monday-aligned 7-day strip with per-day booking counts → reuses the day grid for the selected day; nav steps by week.
- ✅ **Month view** (`MonthGrid.tsx`): 6×7 overview with per-day count pills; tap a day → drills into Day view; nav steps by month.
- ✅ Scope-aware Calendar screen: one `useCalendarGrid` fetch sized to day/week/month; counts derived across all calendars; week helper `getCalendarWeekFromDate`.
- ✅ **Reschedule** (`RescheduleSheet.tsx` + `useRescheduleBooking`): long-press a block → bottom-sheet `Modal` with Date/Time steppers → PATCH `booking_date`/`booking_time` with cache+calendar invalidation.
- ✅ **Calendar realtime**: `VenueLiveSyncProvider` + booking mutations now invalidate the `calendar` key, so the grid refreshes on booking changes.
- ✅ `typecheck` + `lint` green. Verified via temporary mock + guard bypass (reverted): Week strip (Mon-aligned, "1 Jun – 7 Jun"), Month grid (**42 cells**, "June 2026"), and the reschedule sheet (steppers move time 09:30→10:00). **Verification caught & fixed a real crash** — the sheet rendered with an uninitialised date (`Invalid time value`) before its state was seeded; now gated on `seededId`.
- **Reschedule is a long-press sheet, not literal finger-drag.** Drag-on-a-scrolling-grid needs on-device gesture tuning (gesture-handler is present but unconfigured) and can't be verified in the web preview — it's the ideal thing to build/tune on the S23 Ultra later, reusing this same commit path. (Note: screenshots time out on Modal-containing screens — an RN-web/html2canvas quirk, not an app issue; verified via DOM.)

### Phase R5 — Create-appointment wizard (redesign) — ✅ Complete (2026-06-06)
- ✅ All five steps rebuilt on the design system (Service · Date · Time · Guest · Confirm) + a new **segmented step indicator** ("Step 2 of 5 · Date").
- ✅ **Service step**: practitioner filter chips (Anyone + each) and service cards with price; defaults to the calendar-tapped practitioner.
- ✅ **Calendar prefill wired**: `booking/new` now consumes `date` + `practitionerId` from the calendar empty-slot tap (date preselected, services filtered to that practitioner).
- ✅ **In-wizard guest search** in the Guest step (`useGuests`, debounced) — tap a result to prefill name/phone/email, or enter new details; the guest step self-scrolls for the keyboard.
- ✅ Confirm step restyled (service header + summary card) with a success haptic; reuses `useCreateBooking` (POST `/api/venue/bookings`).
- ✅ `typecheck` + `lint` green. Verified on Expo web (temp catalog mock + guard bypass, reverted): walked Service (practitioner filter + `p1` prefill showed only Sarah's services) → Date (7-day strip, `date` prefill enabled Continue) → Time (empty state) → Guest (search + divider + 4 fields). No mount errors.
- ⏳ **Deferred (kept lean):** service variants, add-on groups, and "any-available practitioner" pooling. Restaurant walk-in fast-path (`RestaurantWalkInForm`) retained as the non-appointment fallback (not restyled — back-seat).
- Backend note: create/availability routes (`POST /api/venue/bookings`, `appointment-availability`) are Bearer-ready on `main`; the actual create + live slots need a real venue + staff session to exercise (device).

### Phase R6 — Booking detail (redesign) — ✅ Complete (2026-06-06)
- ✅ `BookingDetailContent` rebuilt on the design system: **Avatar + name + StatusPill** header, contact + visit count, a prominent "when" (day · time–time), a details card (party / service / type / area / table / deposit), and a notes card.
- ✅ Full **action set** driven by `bookingDetailActions` (Confirm → Seat/Start → Complete, No-show, Cancel) **plus a new Reschedule** action that reuses the R4 `RescheduleSheet` (shown for non-terminal statuses).
- ✅ Reachable from **both** the Bookings list (tap row) and the Calendar (tap block) → `booking/[id]`.
- ✅ `typecheck` + `lint` green. Verified on Expo web (temp mock booking + guard bypass, reverted): rendered the Avatar/Confirmed pill/when/details/notes and the **Seat · No-show · Cancel · Reschedule** buttons; the Reschedule button opened the sheet seeded with the booking's date/time.
- ✅ **Backend:** `/api/venue/bookings/[id]` GET/PATCH/DELETE are already Bearer-ready on `main` — no migration needed.
- ⏳ **Deferred:** status-timeline (the `events` payload is untyped), the calendar **bottom-sheet peek** variant (full-screen detail used for now), fine-grained admin-vs-staff gating, and message-guest / resend-confirmation actions.

### Phase R7 — Clients (redesign) — ✅ Complete (2026-06-06)
- ✅ **Clients list** rebuilt: Avatar-led rows (initials) + name + "phone · N visits" + next-booking line; debounced search; skeleton/empty/error states. In-screen title dropped (the tab's native header already shows "Guests"/the client term).
- ✅ **Client detail** rebuilt: Avatar header + contact, **tags as Badges**, a 2×2 stat-tile grid (bookings / no-shows / cancellations / deposits), notes card, **"New booking for this client"** shortcut (prefills the wizard via `guestId`), and booking-history rows with `StatusPill`.
- ✅ Removed now-dead code: `BookingListItem.tsx` + `BookingStatusBadge.tsx` (the pre-R2 row + badge, replaced by `BookingRow`/`StatusPill`). `components/bookings/` is now just `BookingDetailContent` + `BookingRow`.
- ✅ `typecheck` + `lint` green. Verified on Expo web (temp mocks + guard bypass, reverted): list rows (AB/LO/PP avatars, meta, next-booking) and the detail (avatar, VIP/Regular tag badges, notes, new-booking button, Confirmed/Completed history pills).
- ✅ `/api/venue/guests` + `guests/[id]` already Bearer-ready on `main`.
- ✅ **Settings restyle (2026-06-06):** the 4th tab rebuilt on the design system — Avatar profile header + role **Badge**, "VENUE" section with label/value rows, Notifications (re-register push), App (version + "manage on web"), and Sign out. Verified on web. **All four tabs (Calendar · Bookings · Clients · Settings) are now redesigned.**

### Phase R8 — Polish & quality — 🟡 Partial (2026-06-06)
**Done this pass:**
- ✅ **Skeleton loaders** (`components/ui/Skeletons.tsx`: `ListSkeleton`, `DetailSkeleton`) replace spinners on the Clients list and the booking + client detail screens (Bookings list already had skeletons from R2). Built on the Reanimated `Skeleton` pulse.
- ✅ **Offline banner** (`OfflineBanner` via `@react-native-community/netinfo`) in the tab shell — warns when the device has no connection.
- ✅ **Haptics** extended to booking-detail status actions (success on forward progress, warning on cancel/no-show); already wired on Button/Chip/Segmented/Fab/Reschedule/Confirm.
- ✅ Verified on web: ListSkeleton renders (36 pulsing blocks), OfflineBanner renders + sits atop the shell. `typecheck` + `lint` green.

**Deferred (best done with a dev build / on device):**
- ⏳ **Sentry** crash reporting — needs a DSN + a dev/EAS build (not Expo Go); native config.
- ⏳ **Screen-transition / FAB entrance motion** — Reanimated layout animations; can't verify in the web preview (and the preview screenshot can't capture continuously-animating screens), so tune on-device.
- ⏳ **Empty-state illustrations** — needs art assets.
- ⏳ Full **a11y/contrast** audit + manual matrix (salon vs restaurant, admin vs staff, iOS vs Android).

### Phase R9 — Rebrand & release — 🟡 Rebrand done; build/store = your actions (2026-06-06)
**Done (code/config):**
- ✅ `app.json`: name **Resneo**, slug `resneo-app`, scheme **`resneo`**, iOS/Android bundle **`com.resneo.app`**, notification permission string, splash `backgroundColor` + notification colour → brand navy `#003B6F`, adaptive-icon bg → `#E8EFF6`.
- ✅ `package.json` name → `resneo-app`. Visible UI strings ("Resneo Staff", staff-required copy), env error, scheme comments, README, `.env.example`, `.cursorrules` → Resneo.
- ✅ `typecheck` + `lint` green.

**Deliberately left (flagged):**
- `lib/supabase.ts` `SECURE_STORE_KEY_PREFIX = 'reserveni.supabase.'` — kept; changing it logs out current sessions for no user benefit (internal key).
- `lib/queries/keys.ts` root key `['reserveNI']` — internal in-memory cache key; left.
- `settings.tsx` `WEB_DASHBOARD_URL = https://reserveni.com/dashboard` — **verify the real domain** (resneo.com? the vercel host?) before relying on it.

**Your actions (outward-facing — not done by the agent):**
- 🎨 **Icon + splash artwork** — `assets/images/{icon,splash-icon,android-icon-*}.png` are still the old ReserveNI art. Drop in Resneo art (icon 1024², a light/white splash logo that reads on the navy splash).
- 📦 **EAS build:** `npx eas-cli login` → `eas init` (adds `extra.eas.projectId`) → `eas build --profile development --platform android` for a dev client (also unlocks push + lets us add Sentry / tune motion).
- 🔐 **Supabase redirect:** when enabling magic-link on a dev build, add `resneo://callback` to the Supabase redirect allow-list (password login is unaffected).
- 🚀 TestFlight / Play internal + store listing.

### Critical path
```
R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9
            (R2 and R3 can overlap once R1 lands)
Backend Bearer check (§10) must precede R3–R5.
```

---

## 13. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Practitioner-column grid hard on small screens | Single-column pager default; prototype R3 early; multi-column only landscape/tablet |
| Drag-to-reschedule complexity | Ship read/create first (R3/R5); add drag in R4 behind validation |
| Appointment endpoints not Bearer-ready | Verify §10 on staging before R3 |
| Scope creep (web has 200+ routes, deep appointment features) | Strict v1 line: processing-time/group/pooling → v1.1; admin config stays on web |
| Rebrand breaks auth deep links | Change scheme/bundle in lockstep with Supabase/web redirect allow-list (R9) |
| New deps (Inter, gesture-handler, bottom-sheet, flash-list) | Justify each; prefer Expo-SDK-aligned versions; verify on SDK 56 |

---

## 14. Decisions to validate early
1. **Calendar rendering** — build a throwaway R3 prototype of the day grid on a real phone before committing the interaction model (pager vs horizontal multi-column).
2. **Bottom sheets** — `@gorhom/bottom-sheet` vs hand-rolled Reanimated sheet.
3. **List engine** — `@shopify/flash-list` vs `FlatList` for large bookings lists.
4. **Week view** — condensed grid vs per-day agenda (test legibility).

---

*Living document — update phase checkboxes and decisions as the build progresses.*
