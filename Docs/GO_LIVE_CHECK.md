# Go-live check — Resneo app

## ~~⚠️ BLOCKER — an OTA update to production would brick the live app~~ — RESOLVED 2026-08-05

**Fixed the same day it was found.** All four missing variables were added to the EAS `production` environment and verified byte-for-byte against `eas.json`. The environment now carries every `EXPO_PUBLIC_*` the app reads, so an OTA to production produces a working bundle. The finding is kept in full below, because the failure mode is worth remembering and the rule at the end still governs every future variable.

`EXPO_PUBLIC_*` values are inlined at **bundle** time, and the two build paths read env from **different places**:

| | reads from |
|---|---|
| `eas build` | `eas.json`'s build-profile `env` **plus** the EAS environment (profile wins on conflict) |
| `eas update` | the EAS environment **only** — `eas.json`'s `env` block is not consulted |

So any variable that lives *only* in `eas.json` silently vanishes from every OTA update. It fails quietly, as a missing feature rather than an error.

**Production was exposed on four variables** (all four now added — the ❌ column below is the state as found). `eas.json`'s `production.env` carried them; the EAS `production` environment did not:

| Variable | In EAS `production` env? | Consequence of an OTA today |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ❌ | `getSupabaseUrl()` **throws** — terminal error screen, no sign-in |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ❌ | same |
| `EXPO_PUBLIC_API_URL` | ❌ | every backend call fails |
| `EXPO_PUBLIC_SENTRY_DSN` | ❌ | crash reporting silently off — so you would not even be told |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ (`pk_live_…`) | fine |

The app would render the "Supabase env missing" terminal error screen for every user, and stay there until a corrected update was published. Customers cannot fix it by reinstalling — the update is sticky.

**The fix applied:** all four added to the EAS `production` environment, so the two sources agree. Builds are unaffected — `eas.json`'s `env` takes precedence and the values are identical. None are secret; all four were already committed in `eas.json` in this public repo. Values were read straight from `eas.json` and diffed against `eas env:list production` afterwards rather than transcribed, since a single wrong character in the Supabase URL causes precisely the outage being prevented.

```bash
npx eas-cli env:set --environment production --name EXPO_PUBLIC_API_URL --value "https://www.resneo.com" --visibility plaintext --scope project
```

`preview` was fixed the same way (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_TERMINAL_SIMULATED`).

**How this was found:** an OTA to `preview` on 2026-08-05 silently removed the card-payment option from the payment sheet. `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` lived only in `eas.json`'s `preview.env`, so `getStripePublishableKey()` returned null in the update bundle and `cardAvailable` went false. Cash and external were unaffected, which is exactly why it read as a feature regression rather than a configuration fault. Fixed for `preview` by adding that key and `EXPO_PUBLIC_TERMINAL_SIMULATED` to the EAS `preview` environment.

**Rule going forward:** every `EXPO_PUBLIC_*` the app reads must exist in the EAS environment for any channel you intend to OTA, not only in `eas.json`. Verify with `eas env:list <environment>` before publishing, and treat a variable present in only one of the two places as a defect.

---

## Run 2026-08-03 — web-parity batch (`6992f46`)

Four features tracking the web update at `resneo@9439f7ad`: the booking location callout, per-service fixed start times, setup-checklist snoozing, and Google review requests. **No blockers found; nothing below changes the 2026-08-01 verdict**, whose two build-configuration items still stand unchanged.

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | 134 suites / 1,364 tests pass |
| `eslint .` | 15 errors — **the same 15** as the last run (see §3), none introduced here |
| Secrets in the diff | none |
| `console.log` outside `__DEV__` | none |
| `package.json` / `app.json` / `eas.json` / `app.config.js` | **untouched** |

**These changes are OTA-eligible.** No dependency, native module or config change: the only new native surface is `TimePickerField`, which wraps `@react-native-community/datetimepicker` — already a dependency and already used by five other screens. JS-only, so this ships as an update rather than a store build.

### Backend dependency — the thing worth checking before shipping

All four features consume web API surface added in the same web release, so **the app must not ship ahead of the backend**. Verified `POST /api/venue/setup-checklist-snooze` on `https://www.resneo.com` returns **401, not 404** — the route exists in production, so that web release is deployed. (`POST /api/venue` returns 405 as a control: route present, no POST handler.)

The other three are field additions on existing routes plus DB migrations, which cannot be checked unauthenticated. They rode the same deploy as the route above, so they are almost certainly live — but if any of them is not, the failure modes are all soft:

| Field / route | If the backend lacks it |
|---|---|
| `setup_checklist_snoozed_keys`, `POST …/setup-checklist-snooze` | verified present |
| `online_meeting_url` / `online_meeting_info` on `GET …/bookings/[id]` | online bookings show "No meeting link is set" instead of a join link |
| `booking_start_times` on `…/appointment-services` | zod strips the unknown key; the editor offers fixed times that never persist |
| `google_review_url` / `review_request_enabled` on `/api/venue` | the toggle saves nothing and reads back off |

None of them crash, and none affect a venue that does not use the feature.

### Not covered

Static checks plus the one live endpoint probe. Three of the four features are auth-gated behind API calls the web preview cannot reach (CORS), so the booking location callout, checklist snooze and review-request card have **not been exercised against a real backend** — only against unit and component tests. The fixed-start-times editor was driven end to end in the web preview. Dark mode is unverified throughout: the Expo web preview renders light-only.

Still wanted on a real device against the production backend: an off-site/online booking opened from the calendar, a service saved with fixed start times, and one review-request save.

---

## Run 2026-08-01 (previous)

**Run:** 2026-08-01, against `main` @ `1587f76`.
**Verdict:** the codebase is release-quality — 1,244 tests pass, zero TypeScript errors, no secrets committed, crash reporting fully wired. **Two items must be settled before a store submission**, both build-configuration rather than code, and neither visible from a dev or preview build.

> **Correction (2026-08-01):** §2.1 originally reported the iOS/Android version split as a defect and advised removing `android.version`. That was wrong — the split is deliberate per-platform marketing versioning and the OTA claim was incorrect too. The section is struck through below with the reasoning. Nothing else in this report changed.

Re-run the mechanical parts with:

```bash
npx tsc --noEmit && npx jest --silent && npx eslint .
```

---

## 1. Blockers

### ~~1.1 The production build has no Stripe publishable key~~ — RESOLVED 2026-08-01

A live key (`pk_live_…`) now sits in the **EAS `production` environment**, not in `eas.json` — the right home for a live credential in a public repo, and it loads automatically for any profile pointing at that environment. Verified by resolving the profile through EAS, not just by reading config. The original finding is kept below because the failure mode is worth remembering.

---

### 1.1 (original) The production build has no Stripe publishable key — in-person payments cannot work

`eas.json`'s `production` profile sets `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SENTRY_DSN` — but **not `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`**. The EAS `production` environment doesn't supply it either (it holds only `GOOGLE_SERVICES_JSON` and `SENTRY_AUTH_TOKEN`). The `preview` profile does have it, which is why Tap to Pay and the WisePad worked on the preview APK.

Without it, `TerminalProvider` never mounts the Stripe provider (`enabled` requires `getStripePublishableKey()`), so the whole Terminal layer is inert in production.

**Fixed defensively in this pass:** `TakePaymentSheet` now requires the key for the card option, matching exactly what the provider requires. Previously the option was offered and every collect died on *"Could not start the card reader"* — a build-config problem wearing a hardware fault's clothes. Cash and refunds are unaffected.

That makes the failure honest; it does **not** make the feature work.

**To do:** add the key to the `production` profile (or the EAS `production` environment). It must be the **live** key (`pk_live_…`) if the production backend holds live Stripe secrets — a `pk_test_` key against a live server fails when minting a connection token.

### 1.2 Confirm the Apple Tap to Pay entitlement has been granted

`app.json` declares `com.apple.developer.proximity-reader.payment.acceptance`. **Signing with an entitlement the Apple account has not been granted fails provisioning**, so the iOS production build will not sign until Apple approves it.

If approval hasn't landed and you want to ship now, the WisePad 3 path needs no Apple entitlement — but shipping Bluetooth-only means removing the `ios.entitlements` block *and* the plugin's `tapToPayCheck` first. Android Tap to Pay is unaffected either way.

---

## 2. Should fix

### ~~2.1 Android ships a different version number than iOS~~ — WITHDRAWN, this is deliberate

The first version of this check called the root `version: "1.0.4"` / `android.version: "1.0.1"` split a bug and advised deleting the override. **That was wrong — do not delete it.**

The split is intentional per-platform marketing versioning, set in `df789ed` and `9626564`: iOS had already shipped 1.0.1 while Android was still submitting its first release, so the two store listings legitimately sit at different numbers. `android.version` overriding the root is the documented mechanism for exactly that.

The OTA half of the original finding was **right**, though — I withdrew it on wrong reasoning. The docs say the `appVersion` policy takes the runtime version from the root `version`, but the 1.0.1 production build resolved **`runtimeVersion: 1.0.1`**, i.e. from `android.version`. Verified on the real artifact:

| | value | source |
|---|---|---|
| `versionName` (in the AAB manifest) | `1.0.1` | `android.version` |
| `versionCode` | `11` | EAS remote, auto-incremented |
| `runtimeVersion` | `1.0.1` | resolved per-platform |
| EAS `appVersion` field | `1.0.4` | root `version` — bookkeeping only, not in the binary |

So the runtime version **is** per-platform: Android on `1.0.1`, iOS on `1.0.4`. That is self-consistent rather than broken — updates are matched per platform, so each platform's builds and its updates agree. The thing to hold onto is that **each platform's OTA compatibility key is its own marketing version**: bumping `android.version` moves Android's runtime and strands older Android builds, and bumping the root moves iOS's. Bump deliberately, not as a reflex.

Build numbers are handled independently per platform by EAS (`cli.appVersionSource: "remote"` + `autoIncrement: true`).

### 2.2 Deep links are declared but cannot verify

Neither association file is served on any declared domain:

| Domain | `/.well-known/assetlinks.json` | `/.well-known/apple-app-site-association` |
|---|---|---|
| `www.resneo.com` | 404 | 404 |
| `reserve-ni.vercel.app` | 404 | 404 |

So Android App Links (`autoVerify: true`) will fail verification and iOS Universal Links won't route — `https://` links open the browser instead of the app. The `resneo://` custom scheme still works, so this matches the known "tap-to-open deep links deferred, needs domain association" state; it's listed because the manifest currently claims otherwise.

Also note `reserve-ni.vercel.app` — a **staging** host — is in the production `associatedDomains` and Android `intentFilters`. Worth dropping from the production build regardless.

---

## 3. Informational

- **No product analytics in production.** `lib/analytics/index.ts` `track()` / `trackScreen()` only `console.log` under `__DEV__`; no backend is wired. Crash/error reporting via Sentry is separate and *is* live.
- **15 pre-existing eslint errors**, none introduced here and none in shipped code: `Buffer is not defined` across `scripts/generate-*.mjs` (build-time Node scripts) and `jest is not defined` in `jest.setup.js`. The one in app code — `AuthProvider.tsx:66`, setState synchronously in an effect — is on the "Supabase env missing" path, which renders a terminal error screen; harmless in a configured build.

---

## 4. Verified healthy

- **Tests & types:** 127 suites / 1,244 tests pass; `tsc --noEmit` clean.
- **Crash reporting:** `@sentry/react-native` installed, config plugin registered, DSN set for production, `SENTRY_AUTH_TOKEN` present in the EAS production environment so source maps upload (`SENTRY_DISABLE_AUTO_UPLOAD` is preview-only).
- **Secrets:** nothing sensitive tracked. `.env*.local` and `google-services.json` are gitignored; the latter reaches builds through the `GOOGLE_SERVICES_JSON` EAS file secret via `app.config.js`.
- **Dev-only flags don't leak.** Production sets neither `EXPO_PUBLIC_TERMINAL_SIMULATED` (falls back to `__DEV__` → real readers) nor `EXPO_PUBLIC_ALLOW_SCREENSHOTS` (→ screen-capture protection stays on for the compliance screen).
- **Logging:** every `console.log` in app code is `__DEV__`-gated.
- **Store compliance:** in-app account deletion present (Apple 5.1.1(v)); subscription purchases and plan changes routed to the web dashboard (3.1.1); `FLAG_SECURE` retained on the compliance screen.
- **Android:** `minSdkVersion 26` (the Terminal SDK floor) via `expo-build-properties`; `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` in `blockedPermissions` so the store listing doesn't ask for storage.
- **iOS:** `ITSAppUsesNonExemptEncryption: false` set (skips the export-compliance prompt each submission); Face ID and notification usage strings present.

---

## 5. Build profiles — which one produces what

`production` sets no `android.buildType`, and **EAS defaults Android to an AAB, which cannot be installed on a device**. That is correct for a Play submission and useless for testing real cards on a phone, so there are two profiles:

| Profile | Output | Credentials | versionCode |
|---|---|---|---|
| `production-apk` | APK, sideloadable | live (inherited via `extends`) | pinned — `autoIncrement: false`, so test builds don't burn numbers |
| `production` | AAB, for Play | live | auto-increments |

Test on the APK, submit the AAB. Both carry identical live credentials, so the APK is a faithful rehearsal of the store build — the only difference is the packaging.

## 6. Not covered here

Static checks only. Still needs a pass on a real device against the **production** backend: sign-in, a real booking write, push delivery, the biometric app-lock resume path, and — once §1.1 is settled — one live card payment.
