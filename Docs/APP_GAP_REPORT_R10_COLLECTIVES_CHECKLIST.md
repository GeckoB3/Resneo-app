# App gap report R10 — PRs #104, #105, #106

**Date:** 2026-07-23
**Web baseline:** `main @ a729a322` ("Staging (#106)", 2026-07-23) in `_reference/Resneo`
**Previous parity point:** web `main @ 569d18b3` (the R9 card-hold pass)

## Scope

Reviewed the three PRs merged since the R9 parity work:

- **#104** (`569d18b3`) — Google Play badge on the web homepage + welcome email.
  Marketing only, no staff-dashboard surface. **Nothing to port.**
- **#105** (`a9e18fdd`) — cancellation copy correction, combined-page host contact
  inheritance, bulk service add, setup-checklist suggestions + confirm-on-dismiss.
- **#106** (`a729a322`) — batched calendar assignments, combined page inherits the
  host's Any-available flag.

## Implemented

| # | Change | App work |
|---|--------|----------|
| 1 | **Subscription cancellation copy** (#105) | `SUBSCRIPTION_CANCELLATION_PUBLIC_NOTICE` in [planConstants.ts](../components/plan/planConstants.ts) had shipped a **factually wrong** claim ("Cancel anytime by giving 30 days' notice"). There is no notice period. Replaced with the corrected web wording verbatim (end of current billing period, no further charges, free trial = no charge). The web also refreshed both Terms pages, so the app copy had been contradicting the published terms. |
| 2 | **Checklist confirm-on-dismiss** (#105) | The Today checklist's ✕ called `dismiss.mutate()` immediately, so one stray tap permanently hid it. Now opens a confirmation Sheet (`Alert.alert` is a no-op on react-native-web) with "Dismiss setup steps" / "Keep showing", mirroring the web Dialog copy. |
| 3 | **Post-onboarding suggestion prompts** (#105) | Added `POST_ONBOARDING_SETUP_STEPS` to [setup-checklist-steps.ts](../components/today/setup-checklist-steps.ts): customise booking page, review communications, import bookings/customers. Shown only after onboarding, complete on tap-through, and counted toward the total (per #105's follow-up commit). New `isStepComplete(status, step, clickedStepKeys)` mirrors the web. |
| 4 | **Tap-through persistence** (#105) | New [useClickedSetupSteps.ts](../lib/queries/useClickedSetupSteps.ts). The web reads `localStorage` synchronously via `useSyncExternalStore`; RN has no sync storage, so this hydrates once from **`expo-secure-store`** (the app's storage of record — NOT AsyncStorage, per the F5 mandate) into a shared module-level set so every mounted card updates together. Best-effort: a storage failure just means the prompt reappears. |
| 5 | **Bulk service add** (#105) | [CollectiveCatalogueBuilder.tsx](../components/linked/CollectiveCatalogueBuilder.tsx) replaced the per-row "Add" (one `create_item` request each) with checkboxes, global + per-venue select-all, and a single **"Add selected (n)"** posting the new `create_items` action. Ported `groupServicesForBulkAdd` + its 5 tests. `create_item` stays for custom offerings (matching web). |
| 6 | **Batched calendar assignments** (#106) | Calendar toggles now stage locally (instant) and commit together via the new `set_providers` batch on **"Save and close (n)"**. Previously every tick fired a full PATCH, and each of those can duplicate a service into a member venue, notify it, and reload the whole catalogue — a multi-second delay per tap, worse on mobile. Only genuine diffs vs server state become ops. |
| 7 | Types | `CatalogueAction` gains `create_items` + `set_providers`; `CatalogueActionPayload` gains `services` / `ops` matching the web zod schemas (1-50 services, 1-200 ops). |

## No app work needed

- **Combined page inherits host address/phone/website (#105)** and **host's
  `any_available_practitioner` flag (#106)** — both live in server modules that
  build the synthetic public venue. The public combined booking page is served by
  the web, so app users inherit these automatically. Verified the app's
  `BookingPagePreview` mock does not render the Any-available option, so it
  cannot drift out of sync.
- **Terms pages, signup trial copy, onboarding Stripe step (#105)** — web-only surfaces.
- **#104** in full.

## Notes / deferred

- The import prompt links out to the web hub (`/dashboard/import`) rather than an
  in-app route, since the app has no import tool. It reuses the existing web
  link-out convention (the More tab's "Import contacts" destination) via a
  `webPath` field, kept distinct from expo-router's typed `Href`.
- The web's picker also shows a spinner on "Add selected"; the app's `Button`
  `loading` prop covers this.
- On-device smoke test of the bulk-add and Save-and-close flows still outstanding
  (web preview cannot reach the authed API).

## Verification

- `npx tsc --noEmit` clean; `npm run lint` 0 errors.
- Jest: **106/106 suites, 935/935 tests**, including the ported
  `group-services-for-bulk-add` tests and two new Today-checklist tests (prompts
  counted in the total; ✕ confirms before dismissing).
