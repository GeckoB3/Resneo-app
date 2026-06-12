# Resneo App vs Web — Gap Report R3

**Date:** 2026-06-12 · **Method:** forensic per-domain comparison of current app code against the read-only `_reference/Resneo` web app (6 parallel reviews).
**Scope note:** appointments-first. Table/floor-plan/day-sheet, the data-import wizard, and the full booking-page branding editor are **deliberately out of scope** (keep web link-outs). Verified against *current* code (post the 2026-06 parity + UX passes), not old reports.

## The one constraint that governs everything

Web API routes split into two auth styles:
- **`createVenueRouteClient(request)`** → reads `Authorization: Bearer`, falls back to cookies → **the app can reach it.**
- **`createClient()`** → cookies only → **web-only; the app cannot call it.**

So every gap below is tagged **[App-buildable now]** (Bearer-ready) or **[Backend-blocked]** (needs a Bearer route added on the `C:\Resneo` backend first).

---

## ⚠️ 0. Verify first — possible silent save failure

**Working Hours + Breaks editors depend on `PATCH /api/venue/practitioners`, which is `createClient()` (cookie-only) in the read-only reference.** Either the live backend has been migrated to Bearer (memory notes a "Bearer migration round 2" that migrated `practitioners POST/PATCH/DELETE` on the `C:\Resneo` **staging** branch, pending deploy) — or these editors **silently fail to save from the app**. **Action:** confirm that migration is deployed to `main`/prod before trusting Hours/Breaks. Same caveat applies to any future calendar CRUD/reorder/slug.

---

## 1. App-buildable now (Bearer-ready) — ranked by impact

### Quick, high-value fixes
1. **Notification → calendar deep-link drops the date.** `parseNotificationRoute` extracts `?date=`, and the calendar already accepts a `date` param, but `notifications.tsx:233` navigates to the bare calendar tab → tapping "new booking on 14 Jun" lands you on *today*. Pass the date through. *(High, ~5-line fix.)*
2. **Any-available practitioner priority ordering — silent data-loss bug.** `booking-settings.tsx:350` always writes `calendar_order: []`, discarding the saved order; there's no reorder UI. The API already returns `calendars[]` + `calendar_order`. Add an up/down reorder list when mode = priority, and send the real array. *(High, self-contained.)*
3. **Calendar status filter + live counts.** The day diary has no status filter or "X booked / Y confirmed" summary (web has both). Pure client-side over the grid payload.

### Booking detail — deposit/payment depth
4. **Inline deposit actions when no deposit row exists.** Send-payment-link / Record-cash / Waive currently only appear once `hasDeposit` is true (`BookingDetailContent.tsx:984`). Web shows them whenever the booking can take a deposit.
5. **Cancelled-booking refund banner** (deposit status + cancellation-deadline cue) and **"Remove from diary" permanent delete** for cancelled bookings — neither exists in the app (`lib/booking/booking-status-actions.ts` only does transitions). Web has both.
6. **Created / confirmation-sent audit line** on detail (`created_at` is already on the type).
7. **Add-on editing in `ModifyBookingSheet`** (it changes service/variant/staff/date/time/duration but never add-ons).

### Services editor depth (all Bearer-ready; app currently says "manage on web", `services.tsx:1074`)
8. **Processing-time blocks editor** (client-facing + gap segments; per-variant too) — unlocks back-to-back/gap booking economics.
9. **Service location / online-meeting fields** (`business_venue`/`client_address`/`online` + meeting URL/info) — emails can't reflect location until set on web.
10. **Custom availability rules** editor (per-weekday windows; defer the live preview).
11. **Per-variant depth audit** (processing-time / active / deposit override parity in `VariantsEditorSheet`).

### Compliance (the already-built `ComplianceRecordSheet` is orphaned)
12. **Per-guest compliance records + audit list** on the contact detail and the Compliance screen — reuse the existing sheet + Bearer `useGuestCompliance`. Add the **compliance accordion to contact detail** (feature-flag gated).
13. **Drawn signature capture** in `ComplianceCaptureSheet` (currently a typed-name field; record POST is Bearer).

### Classes / Events / Resources (where Bearer allows)
14. **`checked_in_at` on class roster + native CSV/share export** for class & event rosters (data already in `bookings/list`).
15. **Live sync (`useVenueLiveSync`) on the Classes & Events screens** (Resources already has it).
16. **In-app resource booking creation** via the existing wizard targeting a resource (booking-create is Bearer).
17. *(Interim)* **Status-only class check-in** via the booking PATCH — works for status/roster but leaves `checked_in_at` null and skips course-credit sync; a clean fix needs Bearer check-in routes (see §2).

### Lists & filters
18. **Bookings list: custom date range** (UI-only; range endpoint ready), **booking-model type filter**, **day time-window filter**, **"clear all filters"**.
19. **Contacts: per-page size + persistence, wider CSV export** (split name, no-shows, bookings, deposits, marketing + custom fields), **custom-fields choice in the merge wizard**, **native date-picker** in the filter sheet.
20. **Availability blocks:** `reduced_capacity` **yield-override fields** + **per-service scope** + a **calendar range picker** (route is Bearer).
21. **Reports:** **table-utilisation card** (data already in the Bearer payload) and a **real Android date-picker** for custom range (currently iOS-only `Alert.prompt`).

### Calendar interaction polish
22. **Cross-practitioner drag** (reassign by dropping on another column in the "All" day view), **week as a real 7-column grid** (currently a day-picker), **scroll-to-now button**, **swipe to change day**, **inline No-show** on the grid block.

---

## 2. Backend-blocked (need a Bearer route on `C:\Resneo` first)

These can't ship in the app until the backend exposes Bearer equivalents:

- **Classes/Events keystone:** Bearer `class_instances` + `experience_events` **list** endpoints. Today the schedule feed is built purely from `bookings` rows, so **class sessions / events with zero bookings are invisible in the app.** This is the single biggest classes/events gap.
- **Class check-in / no-show / check-in-all** Bearer routes (or extend `PATCH bookings/[id]` to set `checked_in_at` + mirror `class_course_session_enrollments`).
- **Resource CRUD** and **resource-availability exceptions** (even read-only display needs a Bearer route).
- **Compliance:** create-template + form-field **builder/versions**, venue-wide **records list**, service **requirements/enforcement** editor.
- **Booking rules & availability config** routes.
- **Bookable-calendar CRUD / reorder / slug / service-class-resource assignment.**
- **Live SMS usage** meter (`/api/venue/sms-usage-display`) — Reports banner + Plan screen.
- **Multi-service & group booking create** (the app can *display* these read-only but not create them) — confirm whether the create endpoints are Bearer.
- **Class commerce products** (credits/courses/memberships).

---

## 3. Intentionally out of scope (correct to keep web-only)

- Tables / floor-plan editor / day-sheet covers / table assignment.
- **Data import wizard** (multipart upload + multi-step session state) — keep the external link.
- **Full booking-page branding editor** (theme/fonts/gallery/positioning) — keep the link; the app already does logo/cover/slug.
- Linked-accounts cross-venue sharing (niche).

---

## 4. Where the app is already AHEAD of web (no action)

- **Contacts:** custom-fields editor, generic activity timeline, and household-by-name search are all live in the app but **orphaned/not wired in the web** panel.
- **Waitlist:** live "expires in 2h 10m" countdown (web shows absolute time).
- **Reports:** History/LTV section the web lacks.
- **Merge wizard:** app adds a "choose which record survives" step the web doesn't have.

---

## 5. Cross-cutting polish

- Standardise the **sticky save bar** across long manage forms (communications has it; services/venue-profile/hours/booking-settings use inline buttons).
- Replace the booking-detail/per-action **two-step "Tap to confirm"** timers with a single shared confirm-sheet primitive.
- Soften the **Classes empty-state** copy ("Sessions with bookings appear here") until the instances feed lands.
- Remove the now-stale "manage on web" caption in `services.tsx:1074` once the service-editor items land.
- Add small **"Manage on the web dashboard"** link cards where capabilities are web-only (bookable calendars, booking rules, requirements editor, template builder) so admins know they exist.

---

*Generated from 6 domain reviews; per-domain detail available on request. Prior reports: `Docs/PARITY_GAP_REPORT.md`, `Docs/APP_GAP_REPORT_R2.md`.*
