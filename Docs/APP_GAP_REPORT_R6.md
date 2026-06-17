# App Gap Report R6 — World-Class Review

_Generated 2026-06-16. Method: 9 parallel read-only audit agents, one per surface + two cross-cutting (design/UX, reliability/perf), each comparing the Expo app (`C:\Resneo-app`) against the web reference (`_reference/Resneo`, `main`=production) across four lenses — **functionality, UI, ease-of-use, bugs**. Every finding is source-verified with `file:line`. Scope: appointments-plan only (restaurant/tables ignored)._

---

## Verdict

The app is **mature, disciplined, and world-class on its marquee surfaces** — the booking detail, calendar diary, create-booking wizard, contacts list, plan/billing, and the design-token system all match or beat the web. The gap to a uniformly world-class bar is **not feature breadth**; it's a concentrated set of:

1. **Correctness / data-integrity bugs** — a calendar drag that can silently double-book, a few status-action guards missing on one path but present on another, and three "replace-the-whole-thing" save paths that can drop data (resource multi-range hours, list bulk-merge, `full_payment` × £0 variant).
2. **Systemic polish leaks** — reduce-motion not gated at the primitive layer, screen-capture protection wired to only 2 of N PII screens, the keystone accordion pops without animation, and a few primitives re-implemented locally.
3. **Ease-of-use papercuts** — the wizard's "today" default lands on an empty day, no "book another", no skeleton-free list paging, and a display-only setup checklist.

None are catastrophic; all are fixable. This doc is the **prioritized fix plan**.

## Already world-class (don't regress)
- **Booking detail** IA (hero + quick-action rail + lazy accordions) — richer than the web.
- **Calendar diary**: true-range lane-packing, hold-to-arm drag move/resize with live conflict tinting, multi-practitioner columns, scroll-to-now, realtime.
- **Create-booking wizard**: keyed step-machine (no stranded steps), complete availability query keys (variant/add-on/duration), correct `source`/deposit handling.
- **Contacts**: A–Z rail, infinite scroll, prefetch-on-press-in, realtime, chunked CSV; the detail-screen merge wizard + GDPR flow beat the web.
- **Reliability spine**: `apiFetch` timeout/abort, user-id cache scoping (`keys.test.ts`), NetInfo↔onlineManager, no-signout-on-401, realtime channel-collision fix, Sentry seam, Hermes OTEL patch.
- **Design system**: real token layer (AA-tuned), themed primitives, Toast-not-Alert, ≥44pt hit-slop hygiene, AppLock.

---

## The fix plan

Severity: **P1** = correctness/data/privacy or high-value UX · **P2** = polish. Effort: **S** ≤~1hr · **M** ≤~half-day · **L** larger. Source citations are the audit's; verify before editing.

### Wave A — Correctness & data integrity — ✅ SHIPPED (2026-06-16)
_All 13 items implemented (4 parallel agents + main loop), **tsc 0 · lint 0 · 311 tests · Hermes OK**, and passed an independent adversarial review (verdict: safe to ship, no regressions). Note: A4 intentionally **preserves** split-shift ranges rather than collapsing them like the web (an improvement, not strict parity). Uncommitted, ready for review._

| # | P | Area | Finding | Fix | Eff |
|---|---|---|---|---|---|
| A1 | P1 | Calendar | Drag-conflict uses the **status-filtered** booking set + ignores class/event/resource blocks → silent double-book (`index.tsx:951`, `CalendarDayGrid.tsx:325`) | Build `busyRanges` from **unfiltered** `day.bookings` + `sessions` + `scheduleBlocks`; keep filter visual-only | M |
| A2 | P1 | Calendar | No status gate on drag/resize — a Completed/No-Show/resource booking can be moved (`index.tsx:716,747`) | Early-return when status ∉ {Pending,Booked,Confirmed,Started} or `resource_id`; disable the gesture on those blocks | S |
| A3 | P1 | Bookings | Swipe **No-show** has no grace guard (detail does) → flip-then-rollback flicker (`BookingSwipeRow.tsx:67`) | Reuse `canMarkNoShowForSlot`; hide/disable the swipe action until grace elapsed | S |
| A4 | P1 | Resources | Weekly-hours + date-exception editors are single-range → a web-configured **split shift silently loses range #2** on app save (`ResourceWeekHoursEditor.tsx:46`, `ResourceExceptionsEditor.tsx:47`) | Detect >1 range on seed; preserve untouched extra ranges through the round-trip (or render read-only w/ "edit on web" note) | M |
| A5 | P1 | Contacts | List **bulk-merge drops source custom-fields/notes/marketing** (no `source_overlay`/`field_map`) — an app-only path riskier than web, which has none (`BulkActionSheets.tsx:263`) | Remove list bulk-merge (route to the detail merge wizard) **or** build a proper `source_overlay` payload | S |
| A6 | P1 | Services | `full_payment` not cross-validated vs variant prices (separate sheets) → a £0 variant can offer a £0 online charge (`services.tsx:931`, `VariantsEditorSheet.tsx:146`) | Thread `payment_requirement` into the variants sheet; block active £0 variant under full_payment | M |
| A7 | P1 | Services | Non-admin editing a service sees **all** active calendars in "Offered by" and can re-link ones they don't manage (`services.tsx:1462`) | Filter to admin/managed calendars, or gate the whole Edit action behind `isAdmin` (Create already is) | S |
| A8 | P1 | Reliability | `useBookingDetail` summary prefetch shares the full-detail key → a mutation merge can land on a partial base (`useBookingDetail.ts:18`) | Prefetch under a distinct `…'summary'` key | S |
| A9 | P1 | Reliability | `useGuestDocuments` signed-upload PUT is a **raw fetch with no timeout** → stalled upload spins forever (`useGuestDocuments.ts:87`) | Wrap in `AbortController` + (size-aware) timeout | S |
| A10 | P2 | Contacts | Bulk `selectedIds` persist across filter/search/sort changes → bulk action can hit the wrong people (`clients.tsx:963`) | Clear `selectedIds` in the same effect that resets pagination on params change | S |
| A11 | P2 | Contacts | `CustomFieldsSection` seeds on `guestId` only → can re-save a **stale snapshot**, reverting a merge/edit (`CustomFieldsSection.tsx:38`) | Add a content-hash of `currentValues` to the seed dep | S |
| A12 | P2 | Reliability | Push registration sets the dedupe ref **before** the async resolves → a failed first attempt never retries that session (`PushNotificationsProvider.tsx:127`) | Set the ref only in `.then()`; reset on `.catch()` | S |
| A13 | P2 | Reliability | `invalidateBookingCaches` misses `schedule.all()` + `waitlist.all()` → stale waitlist/class/event-derived caches after a detail status change (`useBookingMutations.ts:8`) | Add both keys to the shared invalidator | S |

### Wave B — Ease-of-use & functionality — ✅ SHIPPED (2026-06-16)
_All 12 items implemented (6 parallel agents + main loop), **tsc 0 · lint 0 · 311 tests · Hermes OK**, adversarially reviewed. Two P1 wizard regressions the review caught were fixed (B1 month-browse no longer clobbers the user's date pick; B2 "Book another" no longer re-seeds a deep-linked guest). B5: no linked-venues data source exists, so the notification was retargeted to the in-app notifications feed (no dead-end) rather than building an empty screen._

| # | P | Area | Finding | Fix | Eff |
|---|---|---|---|---|---|
| B1 | P1 | Wizard | "Today" default selects today even when it has **no availability** → Continue lands on an empty "no times" screen (`MonthDatePicker.tsx:163`, `new.tsx:135`) | Gate Continue on `selectedDate ∈ availableDates`; auto-advance to first bookable date | M |
| B2 | P1 | Wizard | No **"Book another"** — every booking unmounts the wizard; web offers it (`ConfirmStep.tsx:147`) | Add a "Book another" CTA on confirmation that resets wizard state to step `service` | M |
| B3 | P1 | Bookings | Reverts (Undo confirm/Undo start/Reopen/Undo no-show) force a 2-tap confirm; web applies them **instantly** (`BookingDetailContent.tsx:1142`) | Pass `destructive:false` for reverts so they apply on first tap | S |
| B4 | P1 | Admin | Today **setup checklist is display-only** ("complete on web") though in-app screens now exist (`today.tsx:79`) | Make each incomplete step route to its in-app screen (Stripe→plan, profile, hours, first booking) | M |
| B5 | P1 | Admin | Linked-account notification deep-links to a **non-existent** `/more/linked-accounts` → dead-ends on the More hub (`notifications.tsx:237`) | Build a minimal linked-accounts screen or retarget the notification | M |
| B6 | P1 | Perf | Day/week/month + calendar stepping flashes a full skeleton (no `keepPreviousData`) (`useBookingsList.ts:46`, `useBookingsRange.ts:33`, `useCalendarGrid.ts:38`) | Add `placeholderData: keepPreviousData` to all three | S |
| B7 | P2 | Calendar | No **arbitrary date jump** — only chevrons/Today (`index.tsx:1149`) | Make the header date label open a `MonthGrid` Sheet that sets the anchor | M |
| B8 | P2 | Admin | Compliance/venue web hand-offs use raw `Linking.openURL` + hard-coded prod origin (full app-exit) (`compliance.tsx:611`, `venue-profile.tsx:730`) | Route through the `WebBrowser`+`getWebUrl()` helper used elsewhere | S |
| B9 | P2 | Calendar | Month-grid day badge counts **No-Show** bookings (web excludes) (`index.tsx:558`) | Exclude `status==='No-Show'` from the count | S |
| B10 | P2 | CER | Classes empty-state has no "Manage" action button (events/resources do) (`classes.tsx:189`) | Add `actionLabel`/`onAction` → open the manager | S |
| B11 | P2 | Wizard | Guest search shows no loading spinner while fetching (`GuestDetailsStep.tsx:74`) | Render a spinner row while `isFetching && len≥2` | S |
| B12 | P2 | CER | Deactivating an event makes its roster **unreachable** in-app (read screen sources only active) (`useExperienceEvents.ts:102`) | Source the read list from `useManagedEvents`, or add a roster path in the manager | M |

### Wave C — Systemic design / consistency polish — ✅ SHIPPED (2026-06-16)
_All 13 items implemented, **tsc 0 · lint 0 · 311 tests · Hermes OK**, adversarially reviewed (verdict: the shared `Sheet` restructure is safe — `fill` + content-sized layouts, keyboard avoidance, and gesture scoping all preserved). C7: a reusable `ConfirmSheet` primitive was created; mass-migration of the two confirm idioms is a follow-up. Remaining cosmetic P2s noted: 1-frame Sheet shimmer on reopen-after-drag, CollapsibleCard `FadeIn` only replays on first expand, `MOVABLE_STATUSES` duplicated (identical) in two calendar files._

| # | P | Area | Finding | Fix | Eff |
|---|---|---|---|---|---|
| C1 | P1 | Motion | `Skeleton` pulse (the universal loader) ignores **Reduce Motion** (`Skeleton.tsx:26`) | Gate on `useReduceMotion()` → static block | S |
| C2 | P1 | Privacy | Screen-capture protection wired to only 2 screens; **booking detail + high-PII lists unprotected** (`booking/[id].tsx`, `BookingDetailSheet.tsx`) | Call `useScreenCaptureProtection` on the detail route + gate the sheet | S |
| C3 | P1 | Motion | `CollapsibleCard` discloses with instant `display:none` — the keystone detail accordions **pop** (`CollapsibleCard.tsx:69`) | Reduce-motion-gated `LinearTransition`/height+fade | S |
| C4 | P1 | UI | Primitive **drift**: local byte-copies of `MetaChip`/`QuickAction` in `BookingDetailContent.tsx:136`; re-implemented avatars/`initials` (`MoreHero.tsx`); dead `Snackbar` | Delete local copies + dead `Snackbar`; import from `@/components/ui` | S |
| C5 | P2 | Motion | Reduce-motion not gated at the **primitive layer** — Segmented/Input/Button/Fab springs + `Sheet` slide all animate unconditionally | Thread `useReduceMotion()` into shared primitives | M |
| C6 | P2 | A11y | No `adjustable` semantics — `Stepper`/`Segmented` don't announce value or support swipe-adjust | Add `accessibilityRole="adjustable"` + `accessibilityValue` + inc/dec actions | S |
| C7 | P2 | UX | Two destructive-confirm idioms (inline arm vs Sheet) used inconsistently | Pick one default (`ConfirmSheet`); document when inline arm is OK | M |
| C8 | P2 | Contacts | Detail screen is a very long unconditional scroll + **no realtime** (web uses accordions) (`client/[id].tsx:445`) | Collapsible sections (one-line summaries) + a `useVenueLiveSync` keyed on `guestId` | M |
| C9 | P2 | Services | Service editor is a ~260-line flat scroll w/ one Save (`services.tsx:1313`) | Collapse advanced blocks (interval/processing/custom-availability/staff-perms) behind expanders | M |
| C10 | P2 | CER | Dead `useClassRoster` + factually-wrong "cookie-only" comments (`useClassSchedule.ts:38,185`) | Delete the dead hook; correct the comments (attendees route IS Bearer) | S |
| C11 | P2 | A11y | Sub-44pt auth/dismiss text links; `Button`/`IconButton` disabled = blanket opacity (contrast risk) (`sign-in.tsx:145`, `Button.tsx:158`) | Add `hitSlop`/`minTouchTarget`; use explicit disabled tokens | S |
| C12 | P2 | UI | `Sheet` renders a drag handle but has **no drag-to-dismiss** (affordance lies) (`Sheet.tsx`) | Add pan-to-dismiss, or remove the handle | M |
| C13 | P2 | Admin | Timezone is a free-text `Input` driving slot times — a typo breaks scheduling (`venue-profile.tsx:686`) | Replace with a picker / validate against IANA list | M |

### Wave D — Larger functionality (needs a product call)
| # | Area | Finding | Note |
|---|---|---|---|
| D1 | Wizard | No **client-address capture** for `location_type==='client_address'` services → mobile/home-service venues can't record location (`GuestDetailsStep`, catalog types lack `location_type`) | Real venue-category gap; M–L |
| D2 | Services | **Non-admin staff service management** absent (per-calendar allocation toggle + override modal) | Decide: build for multi-staff parity, or document as web-only; L |
| D3 | Calendar | Drag/resize only in single-practitioner day view; week + multi-cal are read-only for time moves | Deliberate touch simplification vs web; L if pursued |
| D4 | Calendar | No From/Until **time-window override** (auto-fit only) | M |
| D5 | Bookings | Bulk send is **serial** + offers channels a guest may lack; no "Select all on screen" | Parallelize + channel-filter + select-all; M |
| D6 | Design | **i18n is sample-only** (`t()` in 1 file); dates hand-rolled in `GreetingHeader` | Strategic: migrate incrementally or remove scaffolding; L |
| D7 | Booking page | Logo framing / cover crop / live preview remain web-only | Heavy RN gesture/crop work, low mobile value; keep deferred |

---

## Per-surface scorecard
| Surface | Verdict | Top priority |
|---|---|---|
| **Calendar & diary** | Mature; drag-conflict edges can double-book | A1 (unfiltered+blocks conflict set) |
| **Bookings list + detail** | Near-web-parity; detail beats web | A3 (swipe no-show guard) |
| **Create-booking wizard** | Strong architecture; friction at the edges | B1 (today-default trap) |
| **Contacts / CRM** | Beats web on list+merge; one risky app-only path | A5 (bulk-merge data-loss) |
| **Classes / Events / Resources** | Remarkably complete; short correctness tail | A4 (resource multi-range loss) |
| **Booking setup & catalog** | Impressive port; split-sheet validation hole | A6 (full_payment×£0 variant) |
| **Admin / workspace / nav** | Near-full parity; a few dead-ends | B4 (actionable setup checklist) |
| **Design system & UX** | Marquee = world-class; systemic leaks | C1–C4 (motion/privacy/dedup) |
| **Reliability / perf** | Well-defended; small staleness/perf gaps | B6 (keepPreviousData) |

## Cross-cutting themes (fix once, benefit everywhere)
- **Reduce-motion at the primitive layer** (C1, C3, C5) — gate Skeleton + springs + Sheet + CollapsibleCard centrally.
- **Long flat editors → collapsible sections** (C8 contacts, C9 services; resource editor too) — the data is already sectioned.
- **Web hand-off consistency** (B8) — one `WebBrowser`+`getWebUrl()` helper; kill hard-coded prod origins.
- **Replace-whole-thing save paths** (A4, A5, A6) — each can drop data; prefer deltas / preserve-untouched / cross-sheet validation.
- **Status-transition guards** (A1, A2, A3) — one shared `canTransitionBookingStatus` + grace check across calendar/list/detail.

---

## Status & tracking
This R6 review supersedes the open items in `RESNEO_WORLD_CLASS_PLAN.md` for current state. R5 (`APP_GAP_REPORT_R5.md`) — the booking-page + classes/events/resources CRUD — is **shipped** (Waves 1–3). **Waves A, B, and C are now all shipped & verified** (2026-06-16) — every implementable R6 finding is done (tsc/lint/311 tests/Hermes green, each wave adversarially reviewed). **Only Wave D remains** — it needs product triage, not engineering: client-address capture for home-service venues, non-admin staff service management, calendar week-view drag + time-window override, and the i18n migrate-or-remove decision. On-device QA (EAS build) remains the only authed-runtime verification path. Everything is uncommitted.
