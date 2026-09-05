# Handover: the app no longer reads `card_hold_deposits`, so the compatibility key can go

**For:** an agent working in the ResNeo **web** repo (`C:\Resneo`). The retirement and the shim
shipped to `main` as `100bc729 "Staging (#176)"` on 2026-09-05, so the shim is in production.
**Trigger:** the web retired the `card_hold_deposits` venue feature flag on 2026-09-05 and
kept serving `feature_flags.resolved.card_hold_deposits: true` on staff venue payloads
purely for the mobile app. The app has now dropped every read of that key, so once the
app build carrying this change is the one in use, the compatibility shim has no reader.
**Size:** one function, one constant, one type, three call sites, one test, one doc row.
No migration, no schema change.

---

## 1. What changed in the app (this repo)

- The four entity editors (appointment services, class types, events, resources) always
  list Card hold next to deposit and full payment. The "Card hold is disabled for this
  venue" notes are gone.
- The staff "Card hold" toggle in the booking wizard (single, multi-service and group
  flows, plus the class/event/resource confirm step) keys on the entity's
  `payment_requirement === 'card_hold'` and a positive fee only. The
  `resolveStaffEntityCardHold` helper in `lib/booking/card-hold.ts` lost its
  `cardHoldFlagEnabled` argument, matching the web's `staff-card-hold.ts`.
- The Booking settings screen no longer renders a "Card hold deposits" toggle, so the
  app never sends the key on `PATCH /api/venue/feature-flags`.
- `'card_hold_deposits'` is out of `AppointmentsFeatureFlagKey` in `types/venue.ts`.
  Extra keys on `resolved` are ignored, so the shim is harmless while it stays.

## 2. What to delete on the web

All in `src/lib/feature-flags/resolve.ts` unless noted:

- `RETIRED_FLAGS_SERVED_AS_ON`, `ResolvedAppointmentsFeatureFlagsForApi` and
  `resolvedAppointmentsFeatureFlagsForApi`.
- The re-export in `src/lib/feature-flags/index.ts`.
- The three call sites, which should serve `resolveAppointmentsFeatureFlags(...)` directly:
  `src/app/api/venue/route.ts` (the `resolved:` line of the venue payload) and
  `src/app/api/venue/feature-flags/route.ts` (the GET and the PATCH response).
- The test "keeps serving the retired card_hold_deposits key as true for the mobile app"
  in `resolve.test.ts`. Keep "drops the retired card_hold_deposits key from storage".
- The **API compatibility** sentence in the Retired flags row of `Docs/FEATURE_FLAGS.md`,
  and the matching sentence in the card-hold paragraph of `Docs/MOBILE_API.md`.

## 3. When

Not before the app version that carries this change is the minimum version in use.

An older app build still gates its editors and the staff toggle on the key. If the key
disappears from `GET /api/venue` while such a build is running, `Boolean(undefined)` is
`false` there, so that build hides the Card hold option and the staff "Card hold" toggle
and shows the old "Card hold is disabled for this venue" note. Bookings and holds keep
working server-side; only the staff UI on that build degrades. So: ship the app change
(OTA on the current runtime is enough, it is JavaScript only), wait for adoption, then
delete the shim.
