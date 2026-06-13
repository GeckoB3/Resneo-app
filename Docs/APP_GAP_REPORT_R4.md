# Resneo App vs Web — Gap Report R4 (+ fixes applied)

**Date:** 2026-06-13 · **Method:** 9 parallel forensic domain audits of *current* app code against the read-only `_reference/Resneo` web app (HEAD `c213455`, verified 0 behind origin), plus 1 dedicated design/UI sweep. Every claim was re-verified against current source — prior reports (R2/R3) were treated as untrusted.

**Auth constraint (governs every gap):** web routes using `createVenueRouteClient(request)` accept `Authorization: Bearer` → **app can call**. Routes using `createClient()` are cookie-only → **web-only**. Each gap is tagged accordingly.

**Out of scope (correctly web-only):** tables/floor-plan/day-sheet, data-import wizard, full booking-page branding editor, linked-accounts.

---

## ✅ BUGS FIXED THIS SESSION (11)

All verified against current code, then fixed; `tsc` 0, `expo lint` 0, Hermes export clean.

1. **Calendar "Walk-in" opened the wizard in Phone mode** *(found by 2 agents)* — the FAB sheet passed `isWalkIn:'1'` but `new.tsx` reads `intent==='walk-in'`, so walk-ins were created as phone bookings with a mandatory phone field. → `app/(app)/(tabs)/index.tsx` now passes `intent:'walk-in'`.
2. **Off-hours drag/resize silently failed (409).** The calendar showed an amber "allowed" badge, fired a success haptic, then snapped back — the reschedule PATCH never sent `allow_outside_hours`, which the server requires. → `useRescheduleBooking`/`useRescheduleBookingById` now send `allow_outside_hours` (drag also sends `allow_manual_overlap`, matching web; the stepper sheet keeps overlap protection).
3. **Cancelled bookings were invisible in Week/Month/Custom list views.** `useBookingsRange` always sent `view=calendar`, which strips Cancelled rows unless `status=Cancelled` is also passed — so the Cancelled filter was permanently empty. → dropped `view=calendar` (web's own range fetch omits it too).
4. **`BlockEditSheet` delete/errors used `Alert.alert`** *(2 agents)* — a no-op on react-native-web, so blocks couldn't be deleted there and save/delete errors were swallowed. → two-step inline confirm + Toast.
5. **`GuestMessageSheet` partial-failure warning used `Alert.alert`** *(2 agents)* — "sent with warnings" was invisible on web. → Toast (`info`/`success`).
6. **"Arrived" toggle shown on table reservations → server 400.** The shared detail surface offered Arrived for table bookings, which have no calendar anchor. → gated on `!isTable`.
7. **Waitlist "Confirm" on appointment offers was a dead button** — appointment entries complete server-side at the offer step, so Confirm always 400'd. → removed (matches web).
8. **Status/cancel/reschedule/modify flashed an empty detail.** `onSuccess` replaced the enriched cached detail with the bare PATCH row (no guest/timeline/add-ons) until the refetch landed. → new `seedDetailFromRow` merges the row onto the enriched detail.
9. **Empty-slot tap time was ~4 min off** on the single-practitioner grid (subtracted a padding offset the coordinate space already excluded; the multi-grid did it right). → removed the offset.
10. **Day time-window filter mis-parsed unpadded times** (`Number("9:")→NaN`). → split on `:`.
11. **Stale code comment** claimed the web PATCH ignores `addons` on modify (it doesn't). → corrected.

## ✅ DESIGN/UI SHIPPED THIS SESSION

- **Sign-in rebuilt with brand identity** — the app's most-seen, least-branded screen now leads with the full-colour RESNEO lockup, centred max-width layout, and themed `Text` primitives throughout (was raw RN `<Text>` + `typography` spreads + `fontWeight`, zero brand). `app/(auth)/sign-in.tsx`.
- **`Screen` gained `keyboardAvoiding`** — fixes "button hidden behind keyboard" on forms; opted-in on sign-in. `components/ui/Screen.tsx`.
- **Empty-state icons** on the three primary tabs (Calendar/Appointments/Contacts) — the `EmptyState.icon` prop existed but was unused.

---

## 🔴 RECOMMENDED NEXT — data-loss bugs (verify field availability, then fix)

Both are silent data loss via REPLACE-semantics save paths; left unfixed only because each needs a 2-minute check that the dashboard GET returns the field (mirror the existing `is_active` cast in `services.tsx`).

- **Variant editor wipes per-variant `processing_time_blocks`.** Opening the Options sheet and tapping Save rebuilds each variant without processing blocks → they're deleted server-side. Round-trip the field through `VariantsEditorSheet` + `VariantWriteInput`. (`components/manage/VariantsEditorSheet.tsx`, `lib/queries/useServicesManage.ts`)
- **Add-on group editor drops `cost_to_business_pence`.** Group save is delete+reinsert; the field is never sent → reset to null. Round-trip it through `AddonGroupEditorSheet` + `AddonItemInput`. (`components/manage/AddonGroupEditorSheet.tsx`, `types/addon-groups.ts`)

---

## 🟡 FUNCTIONALITY GAPS — [App-buildable now], ranked by impact

**Calendar/diary**
- Completed & No-Show appointments don't render on the calendar grid — `calendar-grid` filters to active statuses server-side. Switch `useCalendarGrid` to `bookings/list?view=calendar`+`schedule`, or add a backend include flag. *(M)*
- No status filter / live status counts on the calendar (web has both). *(M)*
- Cross-practitioner drag reassignment (drop on another column → `practitioner_id` in PATCH). *(L)*
- Week view is a day-picker, not a 7-column matrix. *(L)*
- Phone number not shown on appointment bars (reception loses at-a-glance contact). *(S)*
- Compliance flags missing on the multi-practitioner "All" view (wired only on the single grid). *(S)*

**Booking detail / wizard**
- `payment_requirement: full_payment` services show deposit as an *optional* toggle and mislabel the amount (server still forces full charge). Add `payment_requirement` to the catalog type + ConfirmStep. *(S–M)*
- Client-address ("at-home") services collect no address. *(M, verify prevalence)*
- "Rebook" only prefills the guest — the service/practitioner/variant bootstrap (`lib/rebook-bootstrap.ts`) is never written, so the appointment branch is dead code. *(S)*
- Inline deposit actions when no deposit row exists; cancelled-booking refund banner + permanent-delete. *(S–M)*

**Lists & contacts**
- Bookings list: summary/stats bar (Total·Confirmed·Completed·No-show — the component was deleted), Select-all, Date sort + range-wide sort, guest-scoped `?guest=` filter. *(S–M)*
- Contacts: merge wizard missing the custom-fields resolution step (source CF values lost on merge); bulk "Message" uses consent-gated *marketing* semantics (reaches fewer people) instead of the transactional per-guest endpoint; inline tag editor on detail. *(M)*
- Non-enabled booking-model rows leak into the bookings list/stats (no `venueExposesBookingModel` filter). *(S)*

**Services / settings / compliance**
- **Compliance templates create/list is now Bearer** — the app screen still treats it as cookie-only and "discovers" templates from activity (unused templates are invisible) and disables create/library/versions. Wire `GET/POST /compliance/types` etc. *(M)* — single biggest stale assumption.
- Compliance records browser + void (`useVoidComplianceRecord` exists but unsurfaced). *(M)*
- Service editor: `booking_interval_minutes`, per-service compliance requirements, variant-driven duration model; create-service can't set variants/add-ons in one shot. *(S–L)*
- Team: no plan staff-limit gating (invite always shown; fails server-side on limited plans). *(S)*

**Secondary**
- Class per-attendee check-in is **Bearer for class-commerce-plan venues** (`check-in`/`check-in-all`) — app still punts to web. *(M, plan-gated)*
- Reports: table-utilisation card; real Android date-range picker (currently iOS-only `Alert.prompt`, dead on Android). *(S–M)*
- Availability: calendar range picker (stepper-only today). *(M)*
- Today: setup checklist is static 5-step, ignores model-specific catalog-ready flags. *(S)*

---

## ⛔ BACKEND-BLOCKED (needs a Bearer route on `C:\Resneo` first)

- **My Account profile save (`PATCH /api/venue/staff/me`) is cookie-only → silently 401s from the app** (name/email/phone never persist; password change works). One-line backend swap to `createVenueRouteClient`. App-side mitigation until then: hide the profile-edit save or show a clearer message. *(both `manage/account.tsx` and the Team→My Account sheet hit it)*
- Contacts CSV custom-field columns (`contacts/custom-fields` definitions are cookie-only).
- Class/event/resource CRUD; compliance form-builder/versions + venue-wide records list + per-service enforcement; bookable-calendar CRUD/reorder/slug; booking-rules config; live SMS usage meter; class-commerce products; multi-service/group booking create.

---

## Where the app is AHEAD of web (no action)
Contacts custom-fields editor, generic activity timeline, household name-search, merge "which-record-survives" step; waitlist live countdown; Reports History/LTV section.

---

## Remaining design plan (not yet implemented)
From the dedicated design sweep — ranked, all reuse existing tokens/primitives:
1. Wizard "Back" → header chevron + pinned bottom CTA bar (mirror `BookingDetailSheet`). *(M)*
2. Booking-detail action card: demote attendance toggles to a labelled sub-group; one saturated primary. *(S)*
3. Contacts bulk-action bar: 6 cramped buttons → count + "Actions" sheet. *(M)*
4. Sticky date headers + today-anchor on the Appointments list (reuse the Contacts `stickyHeaderIndices` pattern). *(M)*
5. Replace remaining Unicode glyphs (`✓ ✕ ○ ▾ ›`) with `SymbolView` — today checklist, selection checks, manage chevrons. *(S)*
6. Migrate remaining raw `fontWeight` strings to `fonts.*` family (Android weight correctness) — ~8 files. *(S)*
7. Extract a `useArmedConfirm`/`ConfirmButton` primitive (the arm→confirm pattern is reimplemented 3× in `BookingDetailContent`). *(M)*

---

*Prior reports: `Docs/PARITY_GAP_REPORT.md`, `Docs/APP_GAP_REPORT_R2.md`, `Docs/APP_GAP_REPORT_R3.md`. Per-domain detail from the 10 R4 audits available on request.*
