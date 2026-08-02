# Go-live check — Resneo app

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
