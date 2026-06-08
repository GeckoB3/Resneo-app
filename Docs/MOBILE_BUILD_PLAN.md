> ⚠️ **Superseded by [`RESNEO_REDESIGN_PLAN.md`](./RESNEO_REDESIGN_PLAN.md) (2026-06-06).**
> That document is the active plan for the appointments-first redesign (Calendar + Bookings, new brand).
> This file is retained for historical context and its still-accurate phase/API references.

# ReserveNI Expo App — Full Build Plan

Based on the current repo (Expo SDK 56 tabs template) and `_reference/reserve-ni` (Next.js + Supabase staff dashboard, ~200+ `/api/venue/*` routes).

**Last updated:** May 2026  
**Owner:** Andrew  
**Status:** Living plan — update as phases complete

---

## Executive summary

**What you're building:** A **staff/owner mobile app** — today's diary, quick walk-in bookings, booking detail/actions, client lookup, push alerts. **Not** a customer booking app.

**Primary persona:** Salon/restaurant owner behind the counter (appointments-first, restaurants supported).

**Architecture:** Thin React Native client → ReserveNI backend (Supabase auth + `/api/venue/*` + realtime). Reuse web **logic and API contracts**, not web UI.

**Biggest prerequisite:** Almost all `/api/venue/*` routes use cookie-only auth (`createClient()`). Mobile must send `Authorization: Bearer <access_token>`. The web app already has `createRouteHandlerClient(request)` for `/api/v1/*`, but venue routes need the same treatment before the mobile app can call them reliably.

---

## Current state vs target

| Area | Today | Target |
|------|--------|--------|
| Screens | Auth, Today, Week, Clients, Settings, Booking detail, Client detail, Create booking | Same (MVP complete) |
| Dependencies | Full stack wired | Same |
| `lib/`, `theme/`, `types/` | Present | Expand as needed |
| Backend integration | Bearer + venue APIs + realtime + push registration | Production deploy of Phase 0.5 on staging |
| Release | EAS config present | Store assets + TestFlight |

**Reference docs** (in `_reference/reserve-ni/Docs/`):

- `ReserveNI_User_Accounts_Reference.md` — auth model
- `ReserveNI_Booking_Models_Reference.md` — venue modes
- `reserveni-linked-accounts-spec.md` — linked venues
- `api-venue-permissions-matrix.md` — staff vs admin
- `DESIGN_SYSTEM.md` — visual direction
- `mobile-touch-layout-conventions.md` — 44×44 targets, safe areas

---

## Product scope

### In scope (v1.0)

1. **Auth** — email magic link (+ optional password later); staff-only access
2. **Venue bootstrap** — resolve venue, tier, booking models, terminology, feature flags
3. **Today** — dashboard home stats + today's booking list
4. **Week** — 7-day booking schedule (salon day-columns or restaurant day-sheet per venue type)
5. **Booking detail** — view, status changes, message guest, cancel
6. **New booking** — walk-in / phone flow (appointments + table reservations)
7. **Clients** — search, list, contact detail with history
8. **Settings** — profile, sign out, notification prefs, linked-venue context switch
9. **Realtime** — live updates on Today/Week when bookings change
10. **Push registration** — register device token (delivery can follow on backend)

### Out of scope (v1.0)

- Customer `/account` portal (use web)
- Floor plan / Konva table grid
- Full venue settings (billing, staff admin, linked-account admin, reports)
- Waitlist management, class commerce, memberships
- Stripe Connect onboarding, plan changes
- Platform superuser / support sessions
- Offline-first / full offline mode

### Venue-type branching (implement once)

```
Salon / appointments (light, plus, appointments tiers):
  Today → appointment metrics + practitioner-style list
  Week  → calendar columns (practitioners) or simplified day list
  Create → AppointmentBookingFlow APIs

Restaurant (restaurant, founding tiers):
  Today → covers, in-house, arriving soon
  Week  → day-sheet style periods per day
  Create → walk-in / phone table booking APIs

Mixed venues:
  Branch on venue-mode.ts logic (primary model + enabled_models)
```

Reference: `_reference/reserve-ni/src/lib/venue-mode.ts`, `schedule-calendar-eligibility.ts`

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  reserveni-app (Expo)                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Expo Router │→ │ TanStack     │→ │ apiClient     │ │
│  │ screens     │  │ Query        │  │ (Bearer JWT)  │ │
│  └─────────────┘  └──────────────┘  └───────┬───────┘ │
│  ┌─────────────┐  ┌──────────────┐          │         │
│  │ AuthProvider│  │ VenueContext │          │         │
│  │ SecureStore │  │ LinkedVenue  │          │         │
│  └──────┬──────┘  └──────────────┘          │         │
│         └──────── Supabase client ──────────┼─────────┤
└─────────────────────────────────────────────┼─────────┘
                                              ▼
┌─────────────────────────────────────────────────────────┐
│  reserve-ni (Next.js backend)                           │
│  /api/venue/*  ·  /api/v1/*  ·  Supabase Postgres/RT    │
└─────────────────────────────────────────────────────────┘
```

### Key decisions

1. **Auth:** `@supabase/supabase-js` with custom storage → `expo-secure-store`
2. **API calls:** Central `lib/api/client.ts` attaching `Authorization: Bearer ${session.access_token}` to `{API_URL}/api/venue/...`
3. **Server state:** TanStack Query hooks in `lib/queries/` (not SWR — better RN support)
4. **Validation:** Zod schemas mirroring web payloads (copy/adapt from reference types)
5. **Realtime:** Supabase `postgres_changes` on `bookings` for venue_id (same pattern as `useVenueLiveSync.ts`)
6. **Linked "accounts":** Venue context via `owner_venue_id` query param (linked venues spec), not login switching

---

## Phase 0 — Foundation (Week 1)

**Goal:** Runnable dev environment and project skeleton.

### Tasks

- [x] Install dependencies: `@supabase/supabase-js`, `expo-secure-store`, `@tanstack/react-query`, `zod`, `date-fns`, `expo-notifications`, `expo-image`, `expo-device`
- [x] Add `.env.example` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`
- [x] Create `theme/index.ts` (colors, spacing 4–48, typography) — align with `_reference/reserve-ni/Docs/DESIGN_SYSTEM.md` where practical
- [x] Create folder structure from `.cursorrules`
- [x] Build primitive UI: `Button`, `Card`, `Input`, `Screen`, `LoadingState`, `ErrorState`, `EmptyState`
- [x] Remove Expo template screens (`EditScreenInfo`, placeholder tabs)
- [x] Add `eas.json` (development + preview profiles)
- [x] Add `README.md` with setup steps

### Deliverable

App launches to a styled placeholder with providers wired (no auth yet).

---

## Phase 0.5 — Backend prerequisite (parallel, reserve-ni)

**Goal:** Mobile can authenticate against venue APIs.

**Problem:** Venue routes use `createClient()` (cookies only). Example from `_reference/reserve-ni/src/app/api/venue/dashboard-home/route.ts`:

```typescript
const supabase = await createClient();
const staff = await getVenueStaff(supabase);
```

`getVenueStaff(supabase)` works if `supabase.auth.getUser()` sees the JWT — but `createClient()` never reads the Bearer header.

### Recommended approach

Incrementally migrate **P0 routes** to `createRouteHandlerClient(request)`:

| Priority | Routes |
|----------|--------|
| P0 | `GET /api/venue`, `GET /api/venue/staff/me`, `GET /api/venue/dashboard-home` |
| P0 | `GET /api/venue/bookings/list`, `GET/PATCH/DELETE /api/venue/bookings/[id]` |
| P0 | `POST /api/venue/bookings`, `GET/POST /api/venue/bookings/walk-in` |
| P0 | `GET /api/venue/day-sheet`, `GET /api/venue/guests`, `GET /api/venue/guests/[id]` |
| P1 | Appointment: `appointment-catalog`, `appointment-calendar`, `appointment-availability`, `practitioners`, `appointment-services`, `schedule` |
| P1 | `GET /api/venue/linked-calendar`, device registration via `/api/v1/me/devices` |
| P2 | Tables: `areas`, `tables`, `tables/assignments`, `combinations/suggest` |

**Pattern change (web repo):**

```typescript
// Before
export async function GET() {
  const supabase = await createClient();

// After
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient(request);
```

Add a shared helper `createVenueRouteClient(request)` to avoid duplication.

### Deliverable

Postman/curl with Bearer token returns 200 on P0 + P1 create routes. See `Docs/WEB_BEARER_AUTH_MIGRATION.md` and `Docs/STAGING_SETUP.md`.

**Reference clone status:** P0 + P1 booking routes patched in `_reference/reserve-ni`. Copy to production `reserve-ni` and deploy.

---

## Phase 1 — Auth & session (Week 2)

**Goal:** Staff can sign in and reach the app shell.

### Reference files

- `_reference/reserve-ni/src/lib/post-login-destination.ts`
- `_reference/reserve-ni/src/lib/venue-auth.ts`
- `_reference/reserve-ni/src/app/login/` (UX reference)
- `_reference/reserve-ni/Docs/ReserveNI_User_Accounts_Reference.md` §4

### Mobile screens

```
app/(auth)/sign-in.tsx       # email input → request magic link
app/(auth)/callback.tsx      # deep link handler (reserveniapp://)
app/(auth)/choose-destination.tsx  # if user is both staff + customer (rare on mobile)
```

### Implementation

- [x] `lib/supabase.ts` — Supabase client + SecureStore adapter
- [x] `providers/AuthProvider.tsx` — session state, auto-refresh
- [x] `lib/api/client.ts` — fetch wrapper with Bearer + base URL + error normalization
- [x] Magic link flow (Option A — Supabase `signInWithOtp` directly)
- [x] Deep linking in `app.json`: `reserveniapp://auth/callback`
- [x] Post-login gate in `app/_layout.tsx`:
  - No session → `(auth)`
  - Session → call `GET /api/venue/staff/me`
  - Not staff → error screen ("This app is for venue staff")
  - Multi-venue staff (web rejects today) → error + "Use web to resolve" (v1.1: venue picker)

### Edge cases

- Dual-role user (staff + customer): default to dashboard for mobile
- Session expiry: redirect to sign-in with message
- Subscription past-due: show banner from venue bootstrap (web blocks mutations)

### Deliverable

Sign in → land on empty authenticated shell with staff name in header.

---

## Phase 2 — Venue bootstrap & navigation (Week 2–3)

**Goal:** Tab navigation with venue-aware shell.

### Reference files

- `_reference/reserve-ni/src/app/dashboard/layout.tsx`
- `_reference/reserve-ni/src/lib/venue-mode.ts`
- `_reference/reserve-ni/src/lib/feature-flags/resolve.ts`
- `_reference/reserve-ni/src/lib/tier-enforcement.ts`

### Providers

- [x] `VenueProvider` — caches `GET /api/venue` response (name, slug, models, tier, flags, terminology)
- [x] `LinkedVenueProvider` — active `owner_venue_id` for linked-account context (passes through booking create; switcher UI deferred)

### Navigation

```
app/(app)/_layout.tsx          # auth guard
app/(app)/(tabs)/_layout.tsx   # 4 tabs
app/(app)/(tabs)/index.tsx     # Today
app/(app)/(tabs)/week.tsx      # Week
app/(app)/(tabs)/clients.tsx   # Clients
app/(app)/(tabs)/settings.tsx  # Settings
app/(app)/booking/[id].tsx     # stack screen
app/(app)/booking/new.tsx      # create booking modal/stack
```

### Types to port (copy → `types/`)

From `_reference/reserve-ni/src/types/`:

- `booking-models.ts`
- `contacts.ts`
- `plan-tier.ts`
- Dashboard payload types from `lib/dashboard/dashboard-home-payload.ts`

### Deliverable

Authenticated 4-tab app with venue name, correct tab labels (e.g. "Reservations" vs "Appointments" from terminology).

---

## Phase 3 — Today view (Week 3–4)

**Goal:** Primary "glance at the counter" screen.

### Reference files

- `_reference/reserve-ni/src/app/dashboard/DashboardHomeClient.tsx`
- `_reference/reserve-ni/src/lib/dashboard/dashboard-home-payload.ts`

### API

- `GET /api/venue/dashboard-home`
- `GET /api/venue/bookings/list?date=YYYY-MM-DD` (for fuller list if needed)

### UI components

- [x] `components/bookings/TodayStatsRow.tsx` — covers/bookings/pending/in-house (restaurant) OR appointment counts (salon)
- [x] `components/bookings/BookingListItem.tsx` — time, guest, status, service/table label
- [x] `components/bookings/TodayBookingList.tsx` — FlatList of `recent_bookings` + full day list
- [x] Pull-to-refresh
- [x] FAB: "New booking" → `/booking/new`
- [x] Tap row → `/booking/[id]`

### Query hooks

- [x] `lib/queries/useDashboardHome.ts`
- [x] `lib/queries/useBookingsList.ts` with `date` param

### Deliverable

Today screen shows real data for a test venue (use web seed scripts: `seed:dev-restaurant1`, etc.).

---

## Phase 4 — Booking detail & actions (Week 4–5)

**Goal:** View and manage a single booking.

### Reference files

- `_reference/reserve-ni/src/app/dashboard/bookings/BookingDetailPanel.tsx`
- `_reference/reserve-ni/src/app/dashboard/bookings/ExpandedBookingContent.tsx`

### API

| Action | Route |
|--------|-------|
| Load detail | `GET /api/venue/bookings/[id]` (prefetch `.../summary`) |
| Update status | `PATCH /api/venue/bookings/[id]` |
| Cancel | `DELETE /api/venue/bookings/[id]` |
| Message guest | `POST /api/venue/bookings/[id]/message` |
| Deposit actions | `POST /api/venue/bookings/[id]/deposit` |
| Resend confirmation | `POST /api/venue/bookings/[id]/resend-confirmation` |

### UI

- [x] Guest info, date/time, party size, status badge, deposit status
- [x] Status action buttons (Confirm, Seated — Complete/No-show deferred to v1.1)
- [x] Notes / dietary / special requests (read-only v1; edit v1.1)
- [ ] "Message guest" sheet (SMS/email/both) — deferred to v1.1
- [ ] Admin vs staff: hide admin-only actions per `api-venue-permissions-matrix.md` — deferred to v1.1
- [ ] Calendar-scoped staff: disable actions outside `linked_calendar_ids` — deferred to v1.1

### Deliverable

Full booking lifecycle for appointment + table booking from mobile.

---

## Phase 5 — Create booking (Week 5–7)

**Goal:** Walk-in / phone booking in under 30 seconds.

### 5A — Appointments (salon) — priority

**Reference:** `_reference/reserve-ni/src/components/booking/AppointmentBookingFlow.tsx`

**Flow:**

1. Pick service → `GET /api/booking/appointment-catalog?venue_id=`
2. Pick practitioner (or "any available" if flag on)
3. Pick date → `GET /api/venue/appointment-calendar?...`
4. Pick slot → `GET /api/venue/appointment-availability?...`
5. Guest details (name, phone — optional email)
6. `POST /api/venue/bookings` with `source: 'walk-in'`

**Mobile UX:** Multi-step wizard with large touch targets (44×44 minimum).

### 5B — Restaurant walk-in

**Reference:** `_reference/reserve-ni/src/app/dashboard/bookings/WalkInModal.tsx`

**Flow:**

1. Party size + optional name/phone
2. Optional table pick → `GET /api/venue/tables`
3. `POST /api/venue/bookings/walk-in` (creates seated booking)

### 5C — Restaurant phone booking (simplified)

**Reference:** `_reference/reserve-ni/src/components/booking/UnifiedBookingForm.tsx`

Use `POST /api/venue/bookings` with `source: 'phone'` — defer table assignment complexity to v1.1 if needed.

### Shared

- [ ] Guest search/autocomplete inside the wizard (search list works on Clients tab; in-wizard search v1.1)
- [x] `lib/validation/walk-in-guest.ts` — Zod schema for create payloads
- [x] Success → navigate to booking detail

### Deliverable

Create appointment and restaurant walk-in on dev venue.

---

## Phase 6 — Week view (Week 7–8)

**Goal:** See the next 7 days at a glance.

### Salon path

**Reference:** `_reference/reserve-ni/src/app/dashboard/practitioner-calendar/PractitionerCalendarView.tsx` (simplify to mobile)

**API:**

- `GET /api/venue/bookings/list?view=calendar&from=&to=`
- `GET /api/venue/practitioners?roster=1`
- `GET /api/venue/schedule?from=&to=` (blocks)

**Mobile UX:** Horizontal day picker + vertical booking list per day (avoid full grid v1). v1.1: practitioner columns.

### Restaurant path

**Reference:** `_reference/reserve-ni/src/app/dashboard/day-sheet/DaySheetView.tsx`

**API:** `GET /api/venue/day-sheet?date=` for each selected day

**Mobile UX:** Day tabs + period-grouped lists (Lunch, Dinner, etc.)

### Deliverable

Week tab works for both primary venue types.

---

## Phase 7 — Clients (Week 8–9)

**Goal:** Find a client quickly behind the counter.

### Reference

- `_reference/reserve-ni/src/app/dashboard/contacts/ContactsDashboard.tsx`
- `_reference/reserve-ni/src/components/dashboard/toolbar-guest-search/useGuestToolbarSearch.ts`

### API

- `GET /api/venue/guests?search=&page=&limit=&sort=`
- `GET /api/venue/guests/[guestId]?booking_history_limit=80`
- `PATCH /api/venue/guests/[guestId]` (basic edits v1.1)

### UI

- [x] Search bar (debounce 280ms, min 2 chars — match web)
- [x] FlatList with name, phone, tags, next booking
- [x] Client detail: stats + booking history
- [x] "New booking for this client" shortcut (pre-fill guest)

### Deliverable

Search "Smith" → tap → see history → create booking.

---

## Phase 8 — Realtime (Week 9)

**Goal:** Today/Week update when bookings change (another staff member, online booking).

### Reference

- `_reference/reserve-ni/src/lib/realtime/useVenueLiveSync.ts`
- `_reference/reserve-ni/src/lib/realtime/useVenuePostgresLiveSync.ts`

### Implementation

- [x] Subscribe to `bookings` changes filtered by `venue_id` via `VenueLiveSyncProvider` (single app-wide channel)
- [x] On event → invalidate TanStack Query keys (`['bookings']`, `['dashboard']`)
- [x] Fallback: 30s polling when subscription disconnects (match web)
- [ ] Optional: linked venue channel if `LinkedVenueProvider` active — deferred to v1.1

### Deliverable

Create booking on web → appears on mobile Today within ~1s.

---

## Phase 9 — Push notifications (Week 10)

**Goal:** Register for push; ready when backend sends.

### Reference

- `_reference/reserve-ni/src/app/api/account/devices/route.ts`
- `_reference/reserve-ni/Docs/ReserveNI_User_Accounts_Reference.md` §2.1

### Mobile

- [x] Request permissions (`expo-notifications`)
- [x] Get Expo push token
- [x] `POST /api/v1/me/devices` with `{ platform, push_token, app_version, os_version, device_name }`
- [x] Re-register on access-token change (covers session refresh)
- [x] Notification tap → deep link to `/booking/[id]` via `booking_id`/`bookingId` payload

### Backend gap (reserve-ni, later)

No FCM/APNs sender exists yet — registration only. Plan backend work separately (Expo push API or direct APNs/FCM).

### Deliverable

Device row in `user_devices` when app launches on physical device.

---

## Phase 10 — Settings & linked venue context (Week 10–11)

### Settings screen

- [x] Staff profile: `GET /api/venue/staff/me`
- [x] Sign out: Supabase `signOut` + clear SecureStore
- [x] Re-register push notifications button
- [x] App version, venue name, plan tier, primary booking model
- [x] Link to web dashboard for admin tasks ("Manage billing & settings on web")

### Linked venue context

**Reference:** `_reference/reserve-ni/Docs/reserveni-linked-accounts-spec.md`

For chair-rental / linked salons:

- [ ] Show linked venues user can act on (from linked-calendar permissions) — v1.1
- [x] Switch `owner_venue_id` in context → booking create payload includes it
- [x] Visual banner when linked context active (`LinkedVenueBanner`) — full name + switcher v1.1

**Not in v1:** Creating/editing linked account relationships (web only).

---

## Phase 11 — Polish & quality (Week 11–12)

### UX polish

- [x] Loading + error + empty primitives wired on every screen (no skeletons yet — spinner-only)
- [x] Retry buttons on error states via `ErrorState`
- [x] Empty states on Today, Week, Clients, Client detail
- [ ] Haptic feedback on key actions — deferred
- [x] Safe areas + 44×44 touch targets (theme `minTouchTarget`, `SafeAreaView` in `Screen`)

### Error handling

- [ ] Network offline banner — needs `@react-native-community/netinfo` (defer)
- [x] 401 → sign out (global handler in `lib/queries/queryClient.ts`)
- [x] 403 → permission / billing messages (`getApiErrorMessage` with `VENUE_PAST_DUE` codes)
- [ ] Venue past-due → read-only mode banner — deferred to v1.1

### Testing

- [ ] Unit tests: Zod schemas, date helpers, API client
- [ ] Manual test matrix: salon venue + restaurant venue + staff vs admin
- [ ] Test on iOS + Android physical devices

### Observability

- [ ] Sentry for crashes (match web's `@sentry/nextjs` pattern)
- [ ] Basic analytics events (screen views, booking created) — optional

### Staging & ops docs

- [x] `Docs/ENV.md` — mobile env vars
- [x] `Docs/STAGING_SETUP.md` — Vercel protection, Bearer auth, smoke tests
- [x] `Docs/WEB_BEARER_AUTH_MIGRATION.md` — web route migration guide

---

## Phase 12 — Release (Week 12+)

- [ ] App icons + splash (ReserveNI branding — splash uses brand `#4E6B78`; replace default Expo icon assets)
- [x] `app.json`: bundle IDs `com.reserveni.app`, iOS notification permission string
- [x] EAS Build: development, preview, production profiles (`eas.json`)
- [ ] TestFlight + Google Play internal testing
- [ ] Privacy policy URL (web `/privacy`)
- [ ] App Store screenshots + description

---

## Screen → API mapping (quick reference)

| Screen | Primary APIs |
|--------|----------------|
| Sign in | Supabase OTP or `/api/v1/auth/magic-link/*` |
| Today | `/api/venue/dashboard-home`, `/api/venue/bookings/list?date=` |
| Week | `/api/venue/bookings/list?from&to`, `/api/venue/day-sheet`, `/api/venue/schedule` |
| Booking detail | `/api/venue/bookings/[id]`, PATCH/DELETE/message |
| New booking (salon) | appointment-catalog, appointment-calendar, appointment-availability, POST bookings |
| New booking (restaurant) | walk-in, tables, POST bookings |
| Clients | `/api/venue/guests`, `/api/venue/guests/[id]` |
| Settings | `/api/venue/staff/me`, `/api/v1/me/devices`, Supabase signOut |

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Venue APIs cookie-only | Mobile blocked | Phase 0.5 Bearer migration (P0 routes first) |
| Multi-venue staff unsupported on web | Some users can't log in | Clear error v1; venue picker v1.1 + web API |
| Linked accounts complexity | Wrong venue data | Global `LinkedVenueProvider` + banner |
| Practitioner calendar too complex for mobile | Week view overload | Simplified list-first UX v1 |
| No push sender on backend | Alerts don't deliver | Register tokens now; backend phase 2 |
| 200+ venue API routes | Scope creep | Strict v1 boundary; web for admin |

---

## Build order (critical path)

```
Phase 0 (foundation)
    ↓
Phase 0.5 (web: Bearer on P0 venue routes)  ← parallel
    ↓
Phase 1 (auth) → Phase 2 (nav + venue bootstrap)
    ↓
Phase 3 (Today) → Phase 4 (detail) → Phase 5 (create)
    ↓
Phase 6 (Week) + Phase 7 (Clients)  ← can parallelize
    ↓
Phase 8 (realtime) → Phase 9 (push) → Phase 10 (settings)
    ↓
Phase 11 (polish) → Phase 12 (release)
```

### Milestones

| Milestone | Phases | Outcome |
|-----------|--------|---------|
| **MVP** | 0–5 | Sign in, see today, open booking, create walk-in appointment |
| **Beta** | 6–8 | Week view, clients, live updates |
| **Ship candidate** | 9–12 | Push, settings, polish, store release |

---

## What to build first (this week)

Fastest proof of value:

1. **Phase 0** — dependencies + `lib/supabase.ts` + theme + UI primitives
2. **Phase 0.5** — migrate 3 web routes: `staff/me`, `dashboard-home`, `bookings/list`
3. **Phase 1** — magic link sign-in with SecureStore
4. **Phase 3** — Today screen with real bookings

That gets **sign in → see today's diary** on a phone.

---

## Progress tracker

Update checkboxes above as work completes. Link PRs/commits here if helpful.

| Phase | Status | Notes |
|-------|--------|-------|
| 0 | Complete | Foundation: deps, theme, UI, tabs, providers |
| 0.5 | Reference + docs | P0 + P1 patched in `_reference/reserve-ni`; deploy to production staging required |
| 1 | Complete | Magic-link + password sign-in, SecureStore, staff gate |
| 2 | Complete | VenueProvider + LinkedVenueProvider, tabs shell |
| 3 | Complete | Today: dashboard stats, bookings list, FAB, pull-to-refresh |
| 4 | Complete | Booking detail: confirm/seated/cancel; message guest v1.1 |
| 5 | Complete | 5A appointment wizard + 5B restaurant walk-in; 5C phone-create v1.1 |
| 6 | Complete | Week: 7-day picker + per-day list |
| 7 | Complete | Clients search + client/[id] detail + new booking shortcut |
| 8 | Complete | `VenueLiveSyncProvider` — single postgres subscription + polling fallback |
| 9 | Complete | Push registration (Expo Go skipped); dev build for real push |
| 10 | Partial | Settings complete; linked-venue switcher UI v1.1 |
| 11 | Partial | 401/403 handling, linked banner; offline banner + Sentry pending |
| 12 | Partial | EAS + bundle IDs + splash colour; custom icons + store listing pending |

### Next up (recommended order)

1. **Deploy Phase 0.5** to staging/production `reserve-ni` ([STAGING_SETUP.md](./STAGING_SETUP.md))
2. **Phase 12** — ReserveNI icon/splash assets, TestFlight internal build
3. **Phase 4 v1.1** — message guest sheet
4. **Phase 10 v1.1** — linked venue picker + banner with venue name
5. **Phase 11** — `@react-native-community/netinfo` offline banner (optional dep)
