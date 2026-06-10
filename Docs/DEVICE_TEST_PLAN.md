# Resneo App — Device Test Plan (S23 dev build)

**Purpose:** the verification that only a physical device can give. Run this with the EAS
development build (not Expo Go — push and some native behavior differ). Latest JS loads
over Metro: `npx expo start --dev-client`.

**Prerequisites**
- Backend Bearer batches **5–7 deployed** (staging → main) — otherwise Services editors,
  Compliance, Communications, Team, Booking settings, blocks overlay and bulk/merge 401.
- Dev build installed (rebuild only if native deps changed since the last build).

---

## 1. Smoke pass (15 min)
| # | Check | Expect |
|---|---|---|
| 1 | Sign in → lands on Calendar | No flicker, correct venue name |
| 2 | All four tabs | Calendar · Appointments · Contacts · More, More badge shows unread count |
| 3 | Dark mode (system toggle) | Every screen + every bottom sheet readable; scrim correct |
| 4 | Kill app → reopen | Session restored, no re-login |

## 2. Booking lifecycle (the money path)
1. **Create:** + → service with variants & add-ons → pick option → add-ons (min/max enforced) → month picker (dots = available) → duration preset → slot → guest search prefill → Confirm: totals right, **Phone** default → create.
2. Verify it appears on Calendar + Appointments instantly (realtime).
3. Detail: add-ons + total render; Confirm attendance / Mark arrived; message guest (check the email/SMS actually arrives); deposit send-link; edit notes; reschedule → **Undo snackbar** reverts it; status reverts; guest history accordion.
4. Walk-in toggle: book outside opening hours succeeds; Phone outside hours is rejected.
5. No-slots day → **Join waitlist** → entry appears in More → Waitlist → Offer → Confirm creates a booking.

## 3. Calendar interactions (gesture tuning session)
- Tap block → **peek sheet**; "Open full details" navigates. Tap empty slot → wizard with date+time prefilled. Long-press → reschedule sheet.
- Blocked time (manual block + recurring break) renders grey and is NOT tappable-to-book.
- Scroll feel: the grid scroll vs tap layer shouldn't fight; now-line position correct for the venue TZ.
- **Drag-to-reschedule is intentionally NOT implemented yet** — decide here whether long-press → drag should replace or complement the sheet. Tuning notes for the implementation session: gesture-handler `LongPressGestureHandler` → `PanGestureHandler` on `AppointmentBlock`, 15-min snap via `grid-layout.ts` px↔minute math, haptic on lift + snap, drop = existing `useRescheduleBooking` + Undo snackbar, cancel on grid-edge scroll. Keep the long-press sheet as fallback until drag feels right.

## 4. More surfaces (each needs the deploy)
Today (KPIs + checklist + dismiss) · Waitlist · Calendar availability (create block → appears on grid; leave) · Notifications (tap marks read; badge updates) · Reports (admin; staff sees gate) · Services (edit, options editor — confirm options DON'T get wiped when editing basics, add-on linking) · Venue profile · Business hours editor (save, then check booking page slots respect it) · Team · Plan · Booking settings (toggle a model; FUTURE_BOOKINGS error path) · Communications (toggle reminder; verify a reminder actually sends) · Compliance (or its plan-gate message).

## 5. Contacts
Search · sort chips · tag filter · **long-press → bulk select** → Tag / Message (consent respected) / Merge (pick keeper; history moves) · Export CSV share sheet · contact detail edit + message + timeline.

## 6. Push (dev build only)
- Fresh install → permission prompt → token registers (More → re-register if needed).
- Booking-change push arrives; **tap with app warm** → opens booking; **tap with app killed** → cold-start opens booking.

## 7. Matrix
Run §2 + §3 in each: light/dark × admin/staff login × portrait (landscape: known not-yet-optimised). Note anything broken in a list — fix pass follows.

---
*Output of this session: a punch list + the drag-tuning decision. File issues against `Docs/RESNEO_EXCELLENCE_PLAN.md` §Progress.*
