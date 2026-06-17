# Linked Venues & Shared Booking Pages — Mobile App Implementation Plan

**Status:** Planning — not started
**Authored:** 2026-06-17
**Target:** `C:\Resneo-app` (Expo / React Native staff app)
**Source of truth:** `C:\Resneo-app\_reference\Resneo` (read-only web clone) + live web working copy `C:\Resneo`
**Goal:** Bring the web "Linked Accounts + Venue Collectives (combined/shared booking pages)" feature to the mobile staff app **at full parity**, end-to-end, with a world-class native UI.

This plan was produced from a 16-agent exploration of both codebases. Section 2 (Data Contracts) is the authoritative reference to code against; Sections 5–10 are the build phases. Every endpoint, type, enum, permission rule, and copy string below was extracted from the web reference and should be ported **verbatim** unless this document says otherwise.

---

## 0. TL;DR

- The web feature is a **mature, three-part subsystem**: (A) pairwise **account links** with per-direction negotiated permissions, (B) a **linked calendar** with cross-venue booking CRUD, (C) **venue collectives** that power a shared/combined public booking page. Notifications + audit thread through all three.
- The app today has **only scaffolding**: a `LinkedVenueProvider` context (`ownerVenueId`, in-memory, nothing sets it), `owner_venue_id` threaded through 3 booking hooks, linked-notification **email-pref toggles** that already work, and a notification deep-link that safely lands on the in-app feed. **No management UI, no calendar, no collectives.**
- **The single biggest blocker is auth.** The web routes for `account-links/**`, `linked-calendar/**`, and `collectives/**` authenticate with **cookies only** (`createClient()`); the mobile app is **Bearer-token only**. As written, every one of these calls will 401 from the device. The notifications routes already accept Bearer. **Phase 0 must resolve this on the backend** (recommended: switch those three route families to `createVenueRouteClient`, the same helper `notifications/**` already uses). Nothing else is reachable until this lands.
- The app's **generic calendar, booking-detail, sheet, and query infrastructure is excellent and largely reusable.** The hard net-new work is: the **permission grant-pair editor** (3 coupled dimensions + negotiation state machine), the **collectives catalogue builder + combined-page config editor**, and a thin **linked-calendar adapter** over the existing day grid.
- Recommended delivery: **6 phases**, links → calendar → collectives, each shippable. Rough order-of-magnitude effort below (§14).

---

## 1. Scope

### 1.1 In scope (full parity)
1. **Account links** — list, send request (search/lookup/invite-link/QR), respond (accept / accept-with-changes / reject / cancel), unlink, view permissions.
2. **Permission model** — all three dimensions (calendar visibility / PII / action level), §18 calendar scoping, coherence clamping, zero-way prevention.
3. **Negotiation** — propose / accept / reject / cancel change; unilateral grant (expand) and reduce (immediate, no consent).
4. **Audit log** — per-link paginated viewer (mobile card layout).
5. **Linked calendar** — view another venue's bookings (with `time_only` redaction + lock/read-only states), and create / edit / cancel cross-venue bookings per grant.
6. **Venue collectives** — create, manage (host), accept/decline/leave/configure (member), invite/remove/transfer-host, dissolve.
7. **Combined booking page configuration** — catalogue builder (offerings, cross-venue calendar assignment, pricing display), page-config editor (branding/theme/tabs/about/social/gallery/team profiles), page address (dedicated vs adopt-member), asset uploads.
8. **Notifications** — drill-down from a linked-account notification into the relevant link/audit; incoming-request banner; realtime feed updates. (Email-pref toggles already exist.)
9. **Owner-venue context** — a real switcher driving `LinkedVenueProvider`, persisted across launches.

### 1.2 Explicitly out of scope (web-rendered, by design)
- **Rendering the customer-facing combined booking page** (`/book/c/{slug}`). The staff app *configures* it and *links out / shares* the public URL; the customer page stays server-rendered on the web. (Matches how the app already treats the single-venue booking page editor.)
- **Public slot/availability calculation and the customer booking/confirm flow** — server-side, web-only.
- **CSV export of the audit log** — desktop affordance; mobile is view-only cards (parity-acceptable; see §11).

### 1.3 What "exactly as web" means here
The staff-facing *capabilities, permission semantics, copy, and flows* match the web dashboard 1:1. The *rendering* of the customer page is unchanged (still web). This is the same boundary the web itself draws between "manage in dashboard" and "served at `/book/...`".

---

## 2. Data Contracts (authoritative reference)

> Port these types into `types/linked-venues.ts` and `types/collectives.ts` verbatim from `_reference/Resneo/src/lib/linked-accounts/{types,collectives,catalogue,calendar}.ts`. Do **not** re-derive them — field names and enum values are load-bearing for the API.

### 2.1 Enums & constants (`linked-accounts/types.ts`)
```ts
type LinkStatus = 'pending'|'accepted'|'rejected'|'revoked'|'expired'|'suspended';
type LinkCalendarVisibility = 'none'|'time_only'|'full_details';
type LinkActionLevel = 'none'|'edit_existing'|'create_edit_cancel';
type LinkTerminationReason = 'unlinked'|'subscription_lapsed'|'venue_deleted'|'plan_ineligible'|'request_expired';

LIVE_LINK_STATUSES = ['pending','accepted','suspended'];
PAST_LINK_STATUSES = ['rejected','revoked','expired'];
DEFAULT_LINK_GRANT  = { calendar:'full_details', pii:true, act:'edit_existing' };

MAX_PENDING_OUTGOING_REQUESTS = 10;
REJECTED_REQUEST_COOLDOWN_DAYS = 7;
PENDING_REQUEST_EXPIRY_DAYS    = 30;
SUSPENDED_LINK_EXPIRY_DAYS     = 30;
LINK_COUNT_SOFT_WARNING        = 10;
```

### 2.2 The grant model
```ts
interface LinkGrant {
  calendar: LinkCalendarVisibility;
  pii: boolean;
  act: LinkActionLevel;
  calendarIds?: string[] | null;   // §18 scope; null/empty = ALL of the granting venue's calendars
}
```
**Coherence rules (`normaliseGrant` — port verbatim into `lib/linked/grants.ts`):**
- `calendar === 'none'` → force `pii=false, act='none', calendarIds=null`.
- `calendar === 'time_only'` → force `pii=false, act='none'`; `calendarIds` allowed.
- `calendar === 'full_details'` → `act` clamped to `'none'` unless `pii===true`; `calendarIds` allowed.
- `calendarIds` canonicalised: sorted, de-duplicated, empty → `null`.

**Rank helpers (for increase/reduce validation):**
```ts
CALENDAR_RANK = { none:0, time_only:1, full_details:2 };
ACTION_RANK   = { none:0, edit_existing:1, create_edit_cancel:2 };
// isIncreaseOnly(current,next): every dimension >= current (calendar rank up, pii false→true ok, act rank up, calendarIds widen or equal)
// isReductionOnly(current,next): every dimension <= current
```
**Invariants enforced by the DB (must be respected client-side to avoid 4xx):**
- A link must grant `calendar !== 'none'` in **at least one** direction (`account_links_not_zero_way`). Reducing to zero-way → `422` ("use Unlink instead").
- Per-direction coherence CHECK mirrors `normaliseGrant`.

### 2.3 `AccountLinkView` (the perspective-resolved object returned by every link endpoint)
```ts
interface AccountLinkView {
  id: string;
  status: LinkStatus;
  otherVenue: { id: string; name: string; slug: string };
  initiatedByMe: boolean;
  iCan: LinkGrant;        // what I may do to THEIR data
  theyCan: LinkGrant;     // what THEY may do to MY data
  requestMessage: string | null;
  pendingChange: {
    proposedByMe: boolean;
    iCan: LinkGrant;      // proposed end-state, my side
    theyCan: LinkGrant;   // proposed end-state, their side
    proposedAt: string;
  } | null;
  createdAt: string;
  respondedAt: string | null;
  terminatedAt: string | null;
  terminationReason: LinkTerminationReason | null;
}
```
> **Grant framing (critical):** in request bodies, `grants.mine` = what **my** venue exposes to them; `grants.theirs` = what **they** expose to me. In responses, `iCan`/`theyCan` are already framed for "me". Keep this consistent in the editor.

### 2.4 Account-links API (cookie-auth on web today → must be Bearer after Phase 0; **admin-only** except `my-calendars`)
| METHOD | PATH | Body | Success | Notable errors |
|---|---|---|---|---|
| GET | `/api/venue/account-links` | — | `{ eligibility, venue:{id,name,slug}, links:AccountLinkView[], outgoingPendingCount, maxOutgoingPending:10 }` | 401; 403 `!feature`; 500 |
| POST | `/api/venue/account-links` | `createLinkSchema` | `201 { link }` | 400 invalid/zero-way/self/target-ineligible; 404 slug; 409 already-linked; 429 over-max / 7-day cooldown |
| GET | `…/incoming` | — | `{ incomingRequests:[{id,otherVenueName,createdAt}], pendingChanges:[{id,otherVenueName}] }` (never hard-errors) | — |
| GET | `…/lookup?slug=` | — | `{found:false}` or `{found:true,eligible,name,slug,reason}` | 400; 403 |
| GET | `…/search?q=` (≥2 chars) | — | `{ results:[{name,slug,eligible,reason}], truncated }` (≤8) | 403 |
| POST | `…/invite` | — | `{ url, qrDataUrl:string\|null, expiresAt, venueName }` (30-day token) | 403; 500 secret-missing |
| GET | `…/invite?token=` | — | `{valid:false,reason}` or `{valid:true,self,venueName,venueSlug,eligible,reason}` | 403 |
| GET | `…/my-calendars` | — | `{ calendars:[{id,name}] }` — **any staff role** | 401 |
| PATCH | `…/[id]` | `respondLinkSchema` | `{ link }` | 400; 403 wrong actor; 404; 409 wrong status. **Rate-limited 30/60s** |
| DELETE | `…/[id]` | — | `{ ok:true }` | 404; 409 (not accepted/suspended) |
| POST | `…/[id]/grant` | `{ grant:LinkGrant }` | `{ link }` (increase-only; clears pending_change) | 400 not-increase; 409. RL 30/60s |
| POST | `…/[id]/reduce` | `{ grant:LinkGrant }` | `{ link }` (reduce-only) | 400; **422 zero-way**; 409. RL 30/60s |
| GET | `…/[id]/audit?page&pageSize&action&from&to&actingUserId&format=csv` | — | `{ entries:AuditEntry[], users:[{id,name}], page, pageSize, total }` | 404; 400 bad-filter |

```ts
grantSchema      = { calendar, pii, act, calendarIds?: uuid[]≤200|null }
grantPairSchema  = { mine: grantSchema, theirs: grantSchema }
createLinkSchema = { targetSlug: str(1..120), requestMessage?: str≤1000, grants: grantPairSchema }
respondLinkSchema= { action: 'accept'|'accept_with_changes'|'reject'|'cancel'|'propose_change'|'accept_change'|'reject_change'|'cancel_change', grants?: grantPairSchema }
```
**PATCH action semantics:** `accept`/`accept_with_changes`/`reject` only on `pending`, only by non-requester; `cancel` only on `pending` by requester; `propose_change`/`accept_change`/`reject_change`/`cancel_change` operate on `pending_change` of an `accepted` link (`accept`/`reject` by non-proposer, `cancel` by proposer). `accept_with_changes` & `propose_change` require `grants`.

`AuditEntry = { id, createdAt, actionType, actionLabel, actingVenue, owningVenue, actingUser:string|null, resourceType, resourceId, beforeState, afterState }`. Action types: `viewed_calendar, viewed_booking, created_booking, edited_booking, cancelled_booking, deleted_booking`.

### 2.5 Linked-calendar API (cookie-auth today → Bearer after Phase 0; **any staff role**)
| METHOD | PATH | Query / Body | Success |
|---|---|---|---|
| GET | `/api/venue/linked-calendar` | `?date=YYYY-MM-DD` or `?from&to` | `{ date, from, to, venues: LinkedVenueCalendar[] }` |
| POST | `…/booking` | `linkedBookingCreateSchema` | `{ booking }` (RPC `linked_apply_booking_insert`) |
| PATCH | `…/booking` | `linkedBookingChangeSchema` | `{ booking }` (RPC `linked_apply_booking_update`) |
| POST | `…/booking/view` | `{ bookingId }` | `{ ok:true }` (audit ping; 5-min debounce server-side) |
| GET | `…/guests?venueId&q` | — | `{ guests:[{id,name,email}] }` (≤20; needs `create_edit_cancel`+`pii`) |
| GET | `…/venue-profile?venueId` | — | `{ venue_name, venue:VenuePublic, booking_model, enabled_models, currency }` (needs `create_edit_cancel`) |
| GET | `…/event?eventId&ownerVenueId` | — | `{ grant, ownerVenueId, ownerVenueName, ownerVenueTimezone, currency, event }` |

```ts
LinkedVenueCalendar = {
  venueId; venueName; venueTimezone?; linkId;
  visibility:'none'|'time_only'|'full_details'; action:LinkActionLevel; pii:boolean;
  practitioners:LinkedPractitioner[]; services:LinkedService[]; resources:LinkedResource[];
  bookings:LinkedBooking[]; scheduleBlocks?:ScheduleBlockDTO[];
}
LinkedBooking (base) = { id, practitionerId:string|null, bookingDate, bookingTime, bookingEndTime:string|null,
  status, guestName:string|null, serviceName:string|null, editable:boolean }
  // full_details adds: partySize, guestId, guestEmail?(pii), guestPhone?(pii), appointmentServiceId,
  //   calendarId, specialRequests, internalNotes, deposit*, …; time_only returns base only.
linkedBookingCreateSchema = { ownerVenueId:uuid, guestId:uuid, practitionerId?:uuid|null,
  appointmentServiceId?:uuid|null, bookingDate:/YYYY-MM-DD/, bookingTime:/HH:MM(:SS)/, bookingEndTime?,
  partySize?:1..99, specialRequests?:≤2000 }
linkedBookingChangeSchema = { bookingId:uuid, changes:{ booking_date?, booking_time?, booking_end_time?,
  practitioner_id?:uuid|null, appointment_service_id?:uuid|null,
  status?:'Pending'|'Booked'|'Confirmed'|'Seated'|'Completed'|'No-Show'|'Cancelled',
  special_requests?:≤2000, dietary_notes?:≤2000 } (≥1 key) }
```
**Permission gates (UI + server):** `time_only` → busy blocks only, not clickable, lock styling; `full_details`+`act='none'` → read-only detail; `edit_existing` → edit but **cannot** cancel; `create_edit_cancel` → create + edit + cancel; cancel = setting `status:'Cancelled'`; guest search needs `create_edit_cancel`+`pii`. §18: bookings filtered to in-scope calendars; out-of-scope target → 403.

### 2.6 Collectives API (cookie-auth today → Bearer after Phase 0; **admin-only**)
| METHOD | PATH | Body | Success |
|---|---|---|---|
| GET | `/api/venue/collectives` | — | `{ collectives: CollectiveView[] }` (empty if `!feature`) |
| POST | `/api/venue/collectives` | `createCollectiveSchema` | `201 { collective }` |
| GET | `…/slug-available?slug=` | — | `{ available, reason }` |
| PATCH | `…/[id]` | `updateCollectiveSchema` | `{ collective }` |
| DELETE | `…/[id]` | — | `{ ok:true }` (dissolve; tombstones slug) |
| PATCH | `…/[id]/members` | `collectiveMemberActionSchema` | `{ collective }` |
| GET | `…/[id]/catalogue` | — | `{ catalogue:CatalogueManagementView, importSources }` |
| PATCH | `…/[id]/catalogue` | `catalogueActionSchema` | `{ catalogue }` (RL 60/60s) |
| POST | `…/[id]/page-asset?kind=logo\|cover\|gallery\|offering\|team` | `multipart/form-data` ≤5MB | `{ url }` (RL 30/60s) |
| DELETE | `…/[id]/page-asset?kind=` | `{ url }` | `{ ok:true }` |

`CollectiveView`, `CatalogueManagementView`, `CatalogueItemView`, `CatalogueProviderView`, `CatalogueMemberSource` and all collective enums (`CollectiveStatus`, `CollectiveMemberStatus`, `ServiceGrouping`, `PageMode`, `SlugStrategy`, `SoloPageBehavior`, `ItemStatus`, `ProviderApprovalStatus`, `ProviderStatus`, `PricingDisplay`) are reproduced in full in **Appendix B** — port verbatim from `collectives.ts` / `catalogue.ts`.

**Key collective rules:**
- **Eligibility to create/invite/accept** (`checkCombinedEligibility`): every member pair must hold **full mutual** `full_details` + `create_edit_cancel`, **unscoped** (`calendarIds == null`), in **both** directions, and share a single timezone.
- **Auto-reconciliation** (`reconcileCollective`, fires on member action *and* link change): members losing a qualifying link are `removed`; `<2` survivors → collective dissolves (slug freed); host removed → transfers to longest-tenured survivor; providers suspend/resume with member write-eligibility.
- **`page_mode`** is effectively always `unified_catalog` (directory retired).
- **`add_provider`** to a calendar whose venue lacks a same-named service **auto-duplicates** a real service into that venue. Surface this ("adds '{X}' to {venue}").
- `approval_status` (member consent) and `status` (system bookability) are independent.

### 2.7 Notifications & prefs API (**already Bearer** via `createVenueRouteClient` — reachable today)
| METHOD | PATH | Body | Success |
|---|---|---|---|
| GET | `/api/venue/notifications?limit` | — | `{ notifications:LinkNotificationView[], unreadCount, venueId }` |
| POST | `/api/venue/notifications/read` | `{ids:uuid[]}` or `{all:true}` | `{ ok:true }` |
| GET | `/api/venue/notifications/preferences` | — | `{ prefs:{cancel,reschedule,create,notes} }` |
| PATCH | `/api/venue/notifications/preferences` | subset of prefs | `{ prefs }` (admin-only) |

`LinkNotificationView = { id, type, category, title, body, href, actorVenueName:string|null, read, createdAt }`. Types: `cross_venue_booking_created|_edited|_cancelled` + lifecycle types carrying preset `title`/`body`. `href` deep-links to web routes → **must be remapped** (see §8). Email-pref categories `cancel|reschedule|create|notes` default `false`; they gate **email only** (in-app row is always written by a DB trigger).

### 2.8 Backend constraints the client must honour (RLS / data model)
- **All link/collective writes are `service_role`-only.** Staff JWTs may only `SELECT` (and `UPDATE account_link_notifications.read_at`). **The app must call the REST routes for every mutation — never PostgREST/`supabase.from(...)` writes.** Direct writes either fail RLS or skip the audit/notification trigger.
- **Reading another venue's bookings:** the dedicated `linked-calendar` route already returns the correctly redacted shape (`bookings` for full_details, `bookings_linked_anonymised` for time_only with all PII NULL). Use it — do not assemble cross-venue reads client-side.
- **Realtime:** `account_link_notifications` is in the realtime publication (`REPLICA IDENTITY FULL`); subscribe filtered by own `venue_id`.
- **Rate limits** (429 + `Retry-After`): link mutations 30/60s; catalogue 60/60s; collective upload 30/60s; audit CSV 10/5min.

---

## 3. Critical prerequisite — backend auth (Phase 0 gate)

**Problem.** `_reference/Resneo/src/lib/supabase/server.ts` exposes two route-client constructors:
- `createClient()` → **cookies only**. Used by **all** `account-links/**`, `linked-calendar/**`, `collectives/**`.
- `createVenueRouteClient()` → **Bearer + cookies**. Used by `notifications/**`.

The mobile app sends a Supabase **Bearer** token (`apiFetch` → `Authorization: Bearer …`) and has **no cookie session**. Therefore every linked-venue/collective/calendar route returns **401** from the device today. (This is why the existing app stubs only wired the *notifications* prefs — those routes already accept Bearer.)

**Recommended fix (web repo `C:\Resneo`, mirror to `_reference`):** switch the three route families to `createVenueRouteClient` (or wrap them in the same `resolveLinkAdmin`/`getVenueStaff` helpers but with the Bearer-aware client). The underlying identity resolver (`resolveAuthIdentity` → `getClaims()/getUser()`) is **already token-source agnostic**, so this is a low-risk, mechanical change — the route logic, role gates, and eligibility checks are unchanged. Web (cookie) sessions keep working because `createVenueRouteClient` also reads cookies.

**Verification gate (do this first, before any app screen work):** from a logged-in device build, call `GET /api/venue/account-links` with a Bearer token and confirm a `200`. Until this passes, the rest of the plan is blocked.

**Decision needed (see §13):** confirm this backend change is in scope for this effort (it spans the web repo). There is no viable app-only workaround — the app cannot obtain a cookie session for the API origin.

---

## 4. Architecture overview

### 4.1 How it slots into the app
```
providers/LinkedVenueProvider.tsx   ← extend: roster + active ownerVenueId + SecureStore persistence
lib/linked/grants.ts                ← NEW: port normaliseGrant + rank/increase/reduce helpers (pure, unit-tested)
types/linked-venues.ts              ← NEW: link/grant/audit/calendar types
types/collectives.ts                ← NEW: collective/catalogue types
lib/queries/keys.ts                 ← extend: linkedVenues, linkedCalendar, collectives namespaces
lib/queries/useLinkedVenues.ts      ← NEW: list/search/lookup/invite/send/respond/unlink/grant/reduce
lib/queries/useLinkedVenueAudit.ts  ← NEW
lib/queries/useLinkedCalendar.ts    ← NEW: fetch + booking create/edit + guests + venue-profile
lib/queries/useCollectives.ts       ← NEW: list/create/update/members/catalogue/slug/assets
lib/api/client.ts                   ← extend: FormData (multipart) support for page-asset upload
lib/notifications/parseNotificationRoute.ts ← extend: remap linked hrefs → in-app destinations

app/(app)/_layout.tsx               ← register new Stack screens
app/(app)/(tabs)/settings.tsx       ← add "Linked Venues" group/rows (admin-gated)
app/(app)/linked-venues/index.tsx   ← NEW hub (active/pending/incoming + entry points)
app/(app)/linked-venues/[id].tsx    ← NEW link detail (permissions, negotiation, audit, unlink)
app/(app)/collectives/index.tsx     ← NEW collectives list
app/(app)/collectives/[id].tsx      ← NEW collective manager (Page / Services / Members tabs)

components/linked/*                  ← NEW feature components (editors, sheets, calendar adapter, builders)
```

### 4.2 The three subsystems and their app surfaces
| Subsystem | Backend | App surface | Reuse |
|---|---|---|---|
| **A. Account links** | `account-links/**` (admin) | `linked-venues/index` + `[id]`, request/respond/permission sheets | `Card`, `Sheet`, `ConfirmSheet`, `Segmented`, `MoreRow`, mutation pattern |
| **B. Linked calendar** | `linked-calendar/**` (any staff) | `LinkedVenueCalendarGrid` adapter + linked booking detail/edit/create sheets, reached via owner-venue context switch | `CalendarDayGrid`, `DraggableAppointmentBlock` (data-agnostic), `BookingDetailContent` shell |
| **C. Collectives** | `collectives/**` (admin) | `collectives/index` + `[id]` (Page/Services/Members), catalogue builder, combined-page config editor | `manage/booking-page.tsx` editor patterns, `Sheet`, `Segmented`, multi-select |
| Notifications/audit | `notifications/**` (Bearer ✓) + `…/[id]/audit` | drill-down + banner + realtime | `useNotifications` (exists), `notifications.tsx` (exists) |

### 4.3 Owner-venue context model (the spine of the linked calendar)
- `LinkedVenueProvider` gains: `roster: LinkedVenueSummary[]` (derived from accepted links the caller can act on), `ownerVenueId`, `setOwnerVenueId`, persisted in `expo-secure-store`.
- When `ownerVenueId` is set, the **Calendar** and **Bookings** tabs render the linked venue's data via the **dedicated `linked-calendar` endpoint** (not the native bookings endpoints — see §13 decision 2), the `LinkedVenueBanner` shows the active context + "Use primary venue", and cross-venue booking actions route to `linked-calendar/booking`.
- `useEffectiveVenueScope()` exposes the active `ownerVenueId` to hooks; primary-venue behaviour is the `null` default and is unchanged.

> **Note on existing `owner_venue_id` threading.** `usePractitioners`, `useAppointmentAvailability`, and `useCreateBooking` already accept `owner_venue_id`. This was speculative scaffolding against the *native* endpoints, which is **not** how the web implements cross-venue access. To match web exactly and inherit server-side redaction/scope/audit, build on the **dedicated linked-calendar endpoints** instead. Treat the native `owner_venue_id` path as deprecated unless §13/decision-2 proves the backend supports it identically.

---

## 5. Phase 0 — Foundations (auth + types + helpers + context)

**Goal:** make linked-venue endpoints reachable and lay the shared substrate. No user-visible feature yet.

**Backend (gating):** §3 auth switch + verification.

**App work:**
1. `types/linked-venues.ts`, `types/collectives.ts` — port all types/enums from §2 / Appendix B.
2. `lib/linked/grants.ts` — port `normaliseGrant`, `CALENDAR_RANK`/`ACTION_RANK`, `isIncreaseOnly`, `isReductionOnly`, `describeGrant` (human bullet copy), `grantsEqual`, plus the negotiation classifier `classifyGrantChange(current, next)` → `{ canApplyMineIncrease, canApplyMineReduction, needsNegotiation }`. **Pure functions — unit test against the web logic.**
3. `lib/queries/keys.ts` — add namespaces:
```ts
linkedVenues: { all, list(token), detail(token,id), audit(token,id,filtersKey), search(token,q),
  incoming(token), myCalendars(token) },
linkedCalendar: { all, range(token, ownerScopeKey, from, to) },
collectives: { all, list(token), detail(token,id), catalogue(token,id), slug(token,slug) },
```
4. `providers/LinkedVenueProvider.tsx` — add roster state + `expo-secure-store` persistence (key `linked.ownerVenueId`); hydrate on boot; clear on sign-out (hook into `AuthProvider`).
5. `lib/queries/useEffectiveVenueScope.ts` — returns active `ownerVenueId`.
6. `lib/api/client.ts` — allow `body: FormData` (skip the JSON `Content-Type` header so the platform sets the multipart boundary) for `page-asset` uploads.

**Acceptance:** device build authenticates `GET /api/venue/account-links` (200); `grants.ts` unit tests green; `ownerVenueId` survives an app restart.

---

## 6. Phase 1 — Link lifecycle: list, respond, unlink

**Goal:** an admin can see all links, review and accept/reject incoming requests, cancel their own pending, and unlink — the smallest end-to-end slice. (Sending a *new* request and editing permissions come in Phase 2.)

**Hooks (`useLinkedVenues.ts`):** `useLinkedVenues()` (GET list), `useIncomingLinks()` (GET incoming), `useRespondLink()` (PATCH: accept/reject/cancel), `useUnlinkVenue()` (DELETE). Follow the optimistic→seed→invalidate→rollback pattern from `useBookingMutations.ts`; **do not** optimistically apply *negotiated* actions (spinner + invalidate-on-settle); list removal on unlink may be optimistic.

**Screens / components:**
- `app/(app)/linked-venues/index.tsx` — sections: **Incoming requests** (review CTA), **Active** (status pill + grant summary + chevron → detail), **Sent by you (n/10)** (cancel), **Past**. Onboarding explainer card on first run (dismissible). Soft-warning info card at ≥10 active+pending. Empty/loading/error states per §9.
- `components/linked/IncomingRequestSheet.tsx` — title "{Venue} wants to link with you"; renders `describeGrant(theyCan)` / `describeGrant(iCan)` bullets + the controller-to-controller data-sharing notice; buttons **Reject** / **Accept** (and **Accept with changes** → opens the Phase-2 editor; for Phase 1 ship accept/reject and gate the editor behind Phase 2).
- `app/(app)/linked-venues/[id].tsx` — link detail: status, `GrantSummary` (You can / {Venue} can), suspended banner copy, audit entry point (Phase 3), **Unlink** (danger, `ConfirmSheet`).
- `app/(app)/(tabs)/settings.tsx` — add admin-gated group **"Linked Venues"** with a row → `/linked-venues` (icon `link`, tile teal/indigo). Register screens in `app/(app)/_layout.tsx` (push presentation, native header).

**Notifications drill-down (small, high-value):** update `parseNotificationRoute.ts` so a linked notification with a link/audit reference resolves to `{ type:'linked-venue', id }` → push `/linked-venues/[id]`; booking-reference notifications continue to the calendar.

**Acceptance:** accept/reject/cancel/unlink all round-trip and reflect on both the list and (for the partner) via realtime/refetch; copy matches web (§9); admin-gated; non-admin never sees the entry.

---

## 7. Phase 2 — Send request + permission editor + invite/QR

**Goal:** create links and author permissions — the hardest net-new UI.

**Hooks:** `useVenueSearch(q)` (debounced ≥2 chars), `useVenueLookup(slug)`, `useSendLink()` (POST), `useCreateInvite()` (POST invite), `useVerifyInvite(token)` (GET invite). Surface `429`/cooldown/`409` errors as inline messages + toasts with web copy.

**Components:**
- `components/linked/VenuePickerSheet.tsx` — search combobox (debounced, ≤8 results, eligible/ineligible affordance), or paste a booking-page slug → lookup confirm. (No combobox primitive exists — build from `Input` + a results list; see §10.)
- `components/linked/GrantEditor.tsx` — one direction: calendar `Segmented` (No access / Time blocks only / Full booking detail), PII `Switch` (only when full_details), action `Segmented` (View only / Edit existing / Full management — only when full_details+pii), and a **calendar-scope** picker (All vs Choose specific, via `my-calendars`) inside a `CollapsibleCard`. Apply `normaliseGrant` on every change so the UI can't express an incoherent grant.
- `components/linked/GrantPairEditor.tsx` — two `GrantEditor`s: "What {Venue} can do with your data" (= `grants.mine`/`theyCan`) and "What you can do with {Venue}'s data" (= `grants.theirs`/`iCan`), with the two-column preview and the zero-way validation message.
- `components/linked/LinkRequestSheet.tsx` — venue picker → optional note (≤1000) → `GrantPairEditor` (defaults = `DEFAULT_LINK_GRANT`) → **Send request**.
- `components/linked/InviteLinkSheet.tsx` — calls invite, renders the server `qrDataUrl` as an `<Image>` (no QR dependency), a read-only URL field, **Copy** (clipboard) + native **Share**, and the 30-day expiry note.
- **Deep link:** handle `?invite=<token>` (verify → prefill `LinkRequestSheet` with the initiating venue, with the self/expired/ineligible toasts from web). Universal-links wiring is optional for v1 (see §13/decision 5).

**Acceptance:** can send a request that appears in the partner's incoming list; grant editor cannot produce an incoherent or zero-way grant; invite link opens and prefills; all copy/states match web Flows 1/2/8 (§9).

---

## 8. Phase 3 — Negotiation, unilateral grant/reduce, audit

**Goal:** complete the permission lifecycle on an active link.

**Hooks:** extend `useRespondLink()` with `propose_change`/`accept_change`/`reject_change`/`cancel_change`; add `useGrantAccess()` (POST grant) and `useReduceAccess()` (POST reduce); `useLinkedVenueAudit(linkId, filters)` (paginated; no CSV).

**UI (on `linked-venues/[id]`):**
- **Edit permissions** opens `GrantPairEditor`; on submit, `classifyGrantChange` decides the action and the **button label**: `canApplyMineIncrease` → "Expand access now" → `/grant`; `canApplyMineReduction` → "Reduce access now" → `/reduce`; else → "Propose change" → PATCH `propose_change`. Mirror the web descriptions exactly (immediate vs negotiated).
- **Reduce access now** shortcut sheet (reduction-locked single `GrantEditor`).
- **Pending change** panel: if `proposedByMe` → "You proposed… awaiting their response" + **Withdraw change**; else → preview + **Accept change** / **Decline change** (`ConfirmSheet`).
- **Audit viewer** `components/linked/LinkAuditView.tsx` — `SectionList` of cards (action label, acting user/venue, timestamp, before→after summary), action/date filters, paginated; no CSV (view-only).

**Acceptance:** all 8 PATCH actions + grant/reduce behave per the state machine (§2.4); immediate vs deferred branching matches web; pending-change collisions are blocked with the right copy; audit paginates and filters.

---

## 9. Phase 4 — Linked calendar + cross-venue bookings

**Goal:** view a linked venue's calendar and create/edit/cancel its bookings per grant — faithful to the web `LinkedCalendarView`.

**Hooks (`useLinkedCalendar.ts`):** `useLinkedCalendar({from,to})` (GET; returns `LinkedVenueCalendar[]`), `useCreateLinkedBooking()` (POST), `useUpdateLinkedBooking()` (PATCH; covers edit + cancel), `useLinkedGuests(venueId,q)` (debounced 250ms), `useLinkedVenueProfile(venueId)`, plus a fire-and-forget `pingLinkedBookingView(bookingId)`.

**Components:**
- `components/linked/LinkedVenueCalendarGrid.tsx` — a thin adapter that maps `LinkedBooking[]` → the `CalendarGridBooking` shape consumed by the existing `CalendarDayGrid`, computes `busyRanges`/working ranges, and **gates interaction by grant**: `time_only` → non-interactive busy blocks ("{venue} — busy"), `full_details`+read-only → tap opens read-only detail with lock styling, `edit_existing`/`create_edit_cancel` → editable; **drag/resize disabled** on time_only and read-only columns. Reuse `DraggableAppointmentBlock` unchanged where editing is allowed.
- Linked booking **detail** (read-only) and **edit** sheets — mirror the web `LinkedBookingDetailModal` / `EditLinkedBookingModal`: date, time, status `Segmented`/picker, notes; **Cancel booking** only when `create_edit_cancel`. Reuse the `BookingDetailContent` shell where practical but drive it from `LinkedBooking` (PII hidden unless granted).
- Linked **create** sheet — mirror the web `CreateLinkedBookingModal`: guest search (linked-venue guests), calendar picker, service picker (from `LinkedVenueCalendar.services`), date + start/end times, notes → POST. **This is a manual form, not the availability wizard** (matches web — the web cross-venue create does not run slot availability).
- Entry: when `ownerVenueId` is set (via the switcher / a link-detail "View calendar" action), the **Calendar** tab renders `LinkedVenueCalendarGrid` and the **Bookings** tab renders the linked venue's bookings; `LinkedVenueBanner` shows context + exit. Fire `…/booking/view` on detail open.

**Realtime/poll:** keep the existing 60s poll for the linked calendar; rely on `account_link_notifications` realtime for cross-venue write activity (don't add a second `postgres_changes` channel in v1 — see §13/decision 8).

**Acceptance:** `time_only` shows only redacted busy blocks; PII appears only with `pii`; edit respects `edit_existing` (no cancel) vs `create_edit_cancel`; §18 scope hides out-of-scope calendars; cross-venue writes produce audit + notify the owner; out-of-scope/insufficient-grant attempts surface the server 403 copy.

---

## 10. Phase 5 — Venue collectives & combined booking page

**Goal:** full collective management + combined-page configuration. Largest surface; depends on full-mutual write links existing (Phases 1–3).

**Hooks (`useCollectives.ts`):** `useCollectives()` (GET list), `useCreateCollective()`, `useUpdateCollective()` (PATCH: name/branding/slugStrategy/adoptedVenueId/bookingPageConfig/logoUrl/coverPhotoUrl), `useDissolveCollective()` (DELETE), `useCollectiveMembers()` mutation (PATCH members: invite/accept/decline/leave/remove/configure/transfer_host), `useCollectiveCatalogue(id)` (GET) + `useCatalogueAction()` (PATCH: create_item/update_item/archive_item/add_provider/remove_provider), `useSlugAvailable(slug)` (debounced 400ms), `useUploadPageAsset()` (multipart) + `useDeletePageAsset()`.

**Screens / components:**
- `app/(app)/collectives/index.tsx` — list with role/status pills (Host / Member / Invitation pending / Active / Dissolved); invited members get **Accept / Decline**; active members get **Leave**; **Create venue collective** (disabled w/ explainer if no eligible full-mutual links); each active collective links to detail + **View combined booking page** (link-out to `getWebUrl()/book/c/{slug}`).
- `components/linked/CreateCollectiveSheet.tsx` — name, slug (prefix `/book/c/`, debounced availability), eligible-venue checkboxes (≥1).
- `app/(app)/collectives/[id].tsx` — host view = `Segmented` tabs **Page / Services & calendars / Members**; member view = read-only explainer.
  - **Page tab:** page-name inline-save; address radio (Dedicated vs adopt a member's slug + warning); the combined-page config editor.
  - **Services & calendars tab:** `CollectiveCatalogueBuilder.tsx` — "Add services from any venue" list (per member, **Add**/On-page), offerings list with inline name edit, per-offering **calendar assignment matrix** (member × calendar checkboxes; price/duration shown; "adds '{X}' to {venue}" duplication hint; suspended badge), custom-offering form, archive.
  - **Members tab:** members list (Make host / Remove with confirms), invite dropdown (eligible non-members), **Dissolve collective** (danger confirm).
- `components/linked/CombinedPageConfigEditor.tsx` — parity with the single-venue editor `app/(app)/manage/booking-page.tsx` (reuse its patterns): brand primary/accent colour, font preset, logo + cover (upload/crop/full-width), about (≤2000), announcement (≤300), social links, gallery (≤50 via `page-asset?kind=gallery`), tab toggles, per-calendar team profiles (bio/photo/specialties/hidden). Saves merge non-destructively (omit unset fields like `cover_photo_url`).

**Asset uploads:** use the Phase-0 `FormData` support; pick images via `expo-image-picker`; respect 5MB + `kind` query.

**Acceptance:** create→invite→accept→active→manage→dissolve all work; catalogue add/assign/override/archive reflect on the live web page; combined-page config edits round-trip and render on `/book/c/{slug}`; eligibility gating and auto-reconciliation behave; member vs host capabilities enforced; all copy matches web Flows 10–12 (§9).

---

## 11. World-class UI specification

The bar is "indistinguishable from a first-party native feature." Concretely:

- **Design language:** reuse the navy `#003B6F` (brand) + teal `#00C2C7` (accent) ramps and the `theme/index.ts` tokens (spacing multiples of 4, radii, Inter typography scale, elevation). No bespoke colours; map web's slate/rose/amber/emerald/sky semantics onto `colors.{text,textMuted,danger,warning,success,brand}`.
- **Status pills (port web semantics exactly):** Active=success+dot, Pending/Suspended=warning, Declined/Unlinked/Expired=neutral; collective Host=brand, Member=neutral, Invitation pending=warning. Use the existing `Badge`/`StatusPill`.
- **Motion:** `PressableScale` for list rows; `Sheet` for every modal (drag-to-dismiss, keyboard-aware via OS events — never `KeyboardAvoidingView`); `Segmented` spring thumb for tab/permission toggles; `CollapsibleCard` `LinearTransition` for scope pickers and audit detail; honour `useReduceMotion()`.
- **States for every screen:** skeleton (`Skeleton`/`ListSkeleton`/`DetailSkeleton`) on load; `EmptyState` with the exact web empty copy; `ErrorState` with retry; inline `role="alert"`-equivalent banners for action errors; explicit pending spinners on negotiated actions.
- **Copy:** port the **entire copy deck verbatim** (Appendix A) — titles, button labels, toasts, the data-sharing notice, suspended/termination/eligibility messages, soft-warning. This is what makes it feel like the same product.
- **Haptics:** `hapticSelect()` on segmented/permission changes; success/error haptics on mutations (match existing booking flows).
- **Accessibility:** `minTouchTarget: 44`; `maxFontSizeMultiplier` caps as elsewhere; the permission editor exposes each dimension as a labelled adjustable; screen-capture protection on any sheet showing guest PII (as `BookingDetailSheet` does).
- **Iconography:** `SymbolView` **object form** `{ ios, android, web }` only (platform-specific names) — never a bare string.
- **Platform notes (from project memory):** never `setState` in `Input` `onFocus`/`onBlur` (kills Android focus on Fabric — use the existing shared-value pattern); web preview is light-only and can't reach the authed API — verify on device/emulator.

---

## 12. New design-system primitives to build

Most screens compose existing primitives. The genuinely missing pieces:

| Primitive | Purpose | Build from |
|---|---|---|
| `PickerSheet` / combobox | Venue search, member/calendar/service selection | `Sheet` + `Input` + results list + `PressableScale` rows |
| `MultiSelectList` | Calendar-scope picker, catalogue assignment matrix, visible practitioners/services | `CollapsibleCard` + checkbox rows (RN `Switch`/custom check) |
| `GrantEditor` / `GrantPairEditor` | The permission model UI (§7) | `Segmented` + `Switch` + `CollapsibleCard` + `grants.ts` |
| `ColorField` + preset swatches | Combined-page brand colours | `Input` (hex) + swatch row; optional `@react-native-community/...`-free wheel later |
| `ShareRow` (copy + native share + QR `<Image>`) | Invite link, combined-page URL | `IconButton` + `expo-clipboard` + `Share` + `<Image>` |
| `LinkedVenueCalendarGrid` | Grant-gated adapter over the day grid (§9) | wraps `CalendarDayGrid`/`DraggableAppointmentBlock` |

No fork of `CalendarDayGrid` or `DraggableAppointmentBlock` — they are data-agnostic; adapt via props only.

---

## 13. Decisions required (with recommendations)

1. **Backend auth switch (gating).** Confirm switching `account-links/**`, `linked-calendar/**`, `collectives/**` to `createVenueRouteClient` (Bearer) in the web repo is in scope. **Recommend: yes** — it's the only way the app can reach these routes, and it's a low-risk mechanical change.
2. **Linked-calendar source.** **Recommend: the dedicated `/api/venue/linked-calendar` endpoints** (encode redaction/§18/audit, match web) over the speculative native `owner_venue_id` threading. Verify whether the native endpoints even honour `owner_venue_id` server-side; if not, retire that path.
3. **Collectives in v1?** The brief says full parity, so **included** (Phase 5). Flagging that it is ~half the surface area and could be a fast-follow if a date forces a cut.
4. **Admin gating.** Mirror web: links + collectives **admin-only**; linked **calendar any staff**. **Recommend: yes.**
5. **Invite deep link (`?invite=`).** **Recommend: support the in-app prefill**; defer universal-/app-links domain setup unless desired now (copy/share + manual paste covers v1).
6. **`ownerVenueId` persistence.** **Recommend: `expo-secure-store`**; on switch, the linked calendar uses the dedicated endpoint so no `useVenue()` re-bootstrap is required.
7. **Audit CSV export.** **Recommend: drop on mobile** (view-only cards). Parity-acceptable.
8. **Realtime depth.** **Recommend: 60s poll for the linked calendar + `account_link_notifications` realtime** for activity; revisit a second channel only if needed.

---

## 14. Effort, sequencing, milestones

Rough order-of-magnitude (one engineer; excludes the web auth change, which is small):

| Phase | Scope | Est. |
|---|---|---|
| 0 | Auth gate + types + `grants.ts` + keys + provider/persistence + FormData | S–M |
| 1 | Link list / respond / unlink + settings entry + notif drill-down | M |
| 2 | Send request + GrantPairEditor + invite/QR + deep link | L (editor is the cost) |
| 3 | Negotiation + grant/reduce + audit viewer | M |
| 4 | Linked calendar adapter + cross-venue booking CRUD + guest search | L |
| 5 | Collectives + catalogue builder + combined-page config + assets | XL |

**Critical path:** Phase 0 (auth) → 1 → 2 → 3; Phase 4 needs accepted links (after 1); Phase 5 needs full-mutual `create_edit_cancel` links (after 1–3). Ship each phase behind the admin gate; the feature is usefully partial after Phase 1, operationally valuable after Phase 4, and complete after Phase 5.

---

## 15. Testing & verification

- **Unit:** `lib/linked/grants.ts` — exhaustive tests for `normaliseGrant`, increase/reduce, zero-way, classifier branches (this is the riskiest logic and is pure). Use the existing `jest.setup.js`.
- **Hook tests:** query/mutation hooks with a mocked `apiFetch` (key shape, `owner_venue_id`/scope threading, optimistic rollback).
- **Manual device matrix** (web preview can't reach the authed API): two real venues with an accepted link; walk every flow in Appendix A; verify partner-side reflection (realtime + refetch), `time_only` redaction, edit vs cancel grant gating, §18 scope, rate-limit `429` toast, suspended/expired states, collective create→manage→dissolve, combined page renders at `/book/c/{slug}`.
- **Security checks:** confirm **no** direct PostgREST writes to link/collective tables (every mutation goes through a REST route); PII never rendered without `pii`; screen-capture protection on PII sheets; admin gate holds for non-admins.

---

## 16. Risks & mitigations
1. **Auth mismatch (highest).** → §3 backend switch + Phase-0 verification gate; nothing proceeds until a Bearer call returns 200.
2. **RLS forbids client writes.** → always call REST routes, never PostgREST; cross-venue writes go through the RPC-backed routes so the audit trigger fires.
3. **Permission editor complexity.** → port `normaliseGrant`/rank/classifier verbatim; mirror web button-label logic; heavy unit tests.
4. **Calendar reuse.** → thin `LinkedVenueCalendarGrid` adapter; never fork the grid; disable drag on time_only/read-only.
5. **Optimistic desync on negotiated actions.** → optimistic only for self-contained local state; spinners + invalidate-on-settle for negotiation; surface `429 Retry-After`; don't queue link mutations offline.
6. **Customer page is web-rendered.** → "View combined booking page" link-out; app provides config + share, not an in-app preview.
7. **Collectives reconciliation is implicit.** → always re-fetch `CollectiveView` after any member/link change rather than mutating cache locally (the server may have auto-removed members / transferred host / dissolved).

---

## Appendix A — Copy deck (port verbatim)
Full strings for all 13 web flows (send/receive/manage/edit/reduce/negotiate/unlink/invite/pending/collective-create/manage/member/linked-calendar), every status & termination label, the data-sharing notice, suspended/eligibility/soft-warning copy, and toast strings are captured in the exploration report `09-web-ux-copy`. Reproduce them exactly in the corresponding sheets. Source files: `linked-accounts/permissions.ts`, `components/linked-accounts/linked-accounts-ui.tsx`, `LinkedAccountsSection.tsx`, `CombinedPageManager.tsx`, `VenueCollectivesPanel.tsx`, `linked-accounts-marketing-copy.ts`.

## Appendix B — Collective type reference (port verbatim from `collectives.ts` / `catalogue.ts`)
```ts
CollectiveView = { id, slug, name, status:'active'|'dissolved',
  branding:{logo_url?,primary_colour?,description?}, serviceGrouping:'by_practitioner'|'by_service_type',
  allowAnyPractitioner, pageMode:'directory'|'unified_catalog', slugStrategy:'dedicated'|'adopt_member',
  adoptedVenueId:string|null, timezone:string|null, bookingPageConfig:object|null,
  isHost, hostVenueId, myVenueId, myMembershipStatus:'invited'|'active'|'left'|'removed'|null,
  myConfig:{visiblePractitionerIds[],visibleServiceIds[],allowAnyPractitionerSubstitution,displayOrder,soloPageBehavior}|null,
  members:[{venueId,venueName,status,displayOrder,soloPageBehavior}], activeMemberCount }

CatalogueManagementView = { collectiveId, pageMode, items:CatalogueItemView[], memberSources:CatalogueMemberSource[] }
CatalogueItemView = { id,name,description,category,imageUrl,displayOrder,defaultDurationMinutes,
  defaultPricePence,pricingDisplay:'from'|'fixed'|'per_provider',allowAnyAvailable,status:'active'|'archived',providers:CatalogueProviderView[] }
CatalogueProviderView = { id,itemId,venueId,venueName,sourceServiceId,sourceServiceName,practitionerId,
  practitionerName,effectivePricePence,effectiveDurationMinutes,status:'active'|'suspended'|'removed',sourceLive }
CatalogueMemberSource = { venueId,venueName,services:[{id,name,durationMinutes,pricePence}],
  practitioners:[{id,name,services:[{id,name}]}] }

createCollectiveSchema = { name:2..120, slug:/^[a-z0-9]+(?:-[a-z0-9]+)*$/ 3..60, branding?, serviceGrouping?, allowAnyPractitioner?, inviteVenueIds:uuid[1..20] }
updateCollectiveSchema = { name?, branding?, serviceGrouping?, allowAnyPractitioner?, slugStrategy?, adoptedVenueId?:uuid|null, bookingPageConfig?, logoUrl?:''|url|null, coverPhotoUrl?:''|url|null }
collectiveMemberActionSchema = { action:'invite'|'accept'|'decline'|'leave'|'remove'|'configure'|'transfer_host', venueId?, visiblePractitionerIds?, visibleServiceIds?, allowAnyPractitionerSubstitution?, displayOrder?:0..999, soloPageBehavior?:'keep_live'|'redirect' }
catalogueActionSchema = { action:'create_item'|'update_item'|'archive_item'|'add_provider'|'remove_provider', itemId?, name?:1..160, description?:≤2000|null, category?:≤120|null, displayOrder?:0..9999, defaultDurationMinutes?:0..1440|null, defaultPricePence?:0..1_000_000|null, pricingDisplay?, allowAnyAvailable?, imageUrl?:''|url|null, sourceServiceIds?:[{venueId,sourceServiceId}]≤50, providerId?, venueId?, sourceServiceId?, practitionerId?:uuid|null }
// collectiveBookingPageConfigSchema (.strip()): brand_primary, brand_accent (hex6|null), font_preset(str≤40),
//   logo_crop{x,y,zoom}, cover_crop_box{x,y,w,h,ar}, about(≤2000), announcement(≤300), cover_photo_url(''|url),
//   cover_full_width, show_services_tab, show_team_tab, show_about_tab (bool),
//   social_links{instagram,facebook,tiktok,x}, gallery:string[]≤50, team_profiles:record<uuid,{bio,photo,specialties,hidden}>
```

## Appendix C — Source-of-truth file map (for porting)
- Lifecycle/eligibility/validation: `linked-accounts/{eligibility,validation,route-helpers,types,permissions,invite-token}.ts`; routes `api/venue/account-links/**`.
- Permissions/negotiation: `linked-accounts/{permissions,validation}.ts`; `api/venue/account-links/[id]/{route,grant,reduce}.ts`; UI `components/linked-accounts/linked-accounts-ui.tsx`, `LinkedAccountsSection.tsx`.
- Linked calendar: `linked-accounts/{calendar,linked-booking-patch,queries,audit}.ts`; `lib/booking/staff-booking-access.ts`; routes `api/venue/linked-calendar/**`; UI `components/linked-accounts/LinkedCalendarView.tsx`, `PractitionerCalendarView.tsx`.
- Collectives/combined page: `linked-accounts/{collectives,catalogue,collective-venue,collective-page-config}.ts`; routes `api/venue/collectives/**`; UI `components/linked-accounts/{VenueCollectivesPanel,CombinedPageManager}.tsx`; public `app/book/c/[slug]/collective-page-view.tsx`; `lib/booking/booking-page-theme.ts`.
- Notifications/audit: `linked-accounts/{notification-center,notifications,notification-prefs,audit,incoming-banner-events}.ts`; `emails/templates/linked-account-emails.ts`; routes `api/venue/notifications/**`, `account-links/[id]/audit`; UI `NotificationBell.tsx`, `NotificationPrefsCard.tsx`, `LinkedAccountAuditModal.tsx`, `LinkedAccountBanner.tsx`.
- Data model/RLS/RPCs/cron: `supabase/migrations/*linked*|*collective*|*anonymised*|*addons*`; `api/cron/account-link-maintenance/route.ts`.

## Appendix D — App files: new vs modified
**New** — `types/linked-venues.ts`, `types/collectives.ts`, `lib/linked/grants.ts`, `lib/queries/{useLinkedVenues,useLinkedVenueAudit,useLinkedCalendar,useCollectives,useEffectiveVenueScope}.ts`, `app/(app)/linked-venues/{index,[id]}.tsx`, `app/(app)/collectives/{index,[id]}.tsx`, `components/linked/{GrantEditor,GrantPairEditor,LinkRequestSheet,IncomingRequestSheet,VenuePickerSheet,InviteLinkSheet,LinkAuditView,LinkedVenueCalendarGrid,LinkedBookingDetailSheet,LinkedBookingEditSheet,LinkedBookingCreateSheet,CreateCollectiveSheet,CollectiveCatalogueBuilder,CombinedPageConfigEditor,ShareRow,PickerSheet,MultiSelectList,ColorField}.tsx`.
**Modified** — `providers/LinkedVenueProvider.tsx` (roster + persistence), `lib/queries/keys.ts` (namespaces), `lib/api/client.ts` (FormData), `lib/notifications/parseNotificationRoute.ts` (remap hrefs), `app/(app)/_layout.tsx` (register screens), `app/(app)/(tabs)/settings.tsx` (admin group/rows), `app/(app)/(tabs)/{index,bookings}.tsx` (render linked layout when `ownerVenueId` set), `components/ui/LinkedVenueBanner.tsx` (switcher + incoming).
**Reusable as-is** — `BookingDetailSheet`, `BookingDetailContent`, `CalendarDayGrid`, `DraggableAppointmentBlock`, `Sheet`, `ConfirmSheet`, `Segmented`, `Card`, `CollapsibleCard`, `Button`, `IconButton`, `Input`, `Badge`/`StatusPill`, `Chip`, `EmptyState`/`ErrorState`/`LoadingState`, `Skeleton`, `MoreRow`; `useNotifications` + linked email-pref hooks; `types/notifications.ts`.
