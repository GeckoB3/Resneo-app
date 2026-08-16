# Go-live check — Resneo app

## Run 2026-08-16 — the `__root` navigation crash loop, on `main` @ `e2b11d0`

**Scope:** one fix, in four parts, for the iOS crash reported by Sentry on
2026-08-16 (`EXC_BAD_ACCESS ... getNewScreenTimeToDisplay`, preceded by ~100
`Navigation to __root` breadcrumbs ~20ms apart). JavaScript only. Not
device-tested.

**Verdict: clear to ship, and it should ship.** No blockers. The defect it
removes is a hard crash that leaves the app frozen on "Loading session…" before
it dies, and it is reachable by any user who opens a booking notification on a
cold start over a slow connection.

### What the crash was

A closed loop, not a Sentry bug — though the SDK supplied the fatal step:

1. `PushNotificationsProvider` sits **above** the navigator and routed
   notification taps itself. On a cold start its effect ran before
   `getSession()` resolved.
2. `RootLayoutNav` returned `<LoadingState/>` **instead of** the `<Stack>` while
   loading, so there was no navigator below expo-router's internal `__root`
   route.
3. expo-router therefore resolved the push's divergence at the root navigator
   and pushed a **second `__root`** — mounting a fresh copy of the whole
   provider tree, which reset `isLoading` to true and re-read the SAME launch
   response (`getLastNotificationResponseAsync` persists for the process), which
   pushed again. ~50x/second, self-sustaining: the session could never finish
   loading, so step 2 stayed true forever.
4. Sentry's `reactNavigationIntegration` calls native
   `getNewScreenTimeToDisplay()` on **every** navigation — ungated, despite
   `enableTimeToInitialDisplay: false`. iOS `RNSentryTimeToDisplay` keeps one
   resolver ivar and adds a `CADisplayLink` per call without invalidating the
   previous one, so the burst left ~100 live display links firing at a clobbered
   resolver. Backgrounding the app then killed the process.

The loop predates the crash: the navigation integration landed 2026-08-09
(`980c724`) and only made it *visible*. It is a strong candidate for the earlier
unactionable App Hang reports.

### The fix

| Part | Change |
|---|---|
| Cause | Notification taps park in `lib/push/pendingNotificationRoute.ts` (take-once) and are routed by `PendingPushRouteHandler` **inside** the (app) Stack; the launch response is cleared via `clearLastNotificationResponse()` once parked |
| Amplifier | `app/_layout.tsx` and `app/(app)/_layout.tsx` now **cover** the Stack with an opaque overlay instead of replacing it, so a mistimed navigation is a no-op rather than a root clone |
| Fatal step | `lib/observability` stubs the `RNSentry` native `getNewScreenTimeToDisplay` to resolve null before `init` — which is exactly what `enableTimeToInitialDisplay: false` already asks for |

`not_staff` still replaces the (app) Stack deliberately: it is terminal, nothing
navigates out of it, and mounting the tabs behind it would fire a burst of
doomed 401s.

### Verified healthy

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | **167 suites / 1,723 tests pass** (was 165/1,713; +2 suites, +10 tests, all new regression cover) |
| `eslint .` | **15 errors** — the same 15 as every prior run, all in `scripts/` + `jest.setup.js`; 0 in shipped code |
| `expo export --platform web` | exit 0 |
| Native surface | **unchanged** — no `package.json`, `package-lock.json`, `app.json`, `app.config.js` or `eas.json` diff |
| Version | untouched, so unchanged from the last run |
| New dependencies | none |
| `console.log` added | none (two `console.warn` on failure paths, matching the file's existing pattern) |
| Secrets in the diff | none |

### 3. The author's calls, not defects

1. **OTA-eligible.** Nothing native changed, so this ships as an `eas update` to
   `production`. The Sentry part is a JS-side stub of a native method, not a
   native change. The standing rule still governs: verify `eas env:list
   production` before publishing.
2. **The sign-in screen now mounts briefly on every launch**, behind the opaque
   session cover, because the Stack stays mounted and `session` is null until
   `getSession()` resolves. It has no mount effects — only submit handlers — so
   it is inert. This is the deliberate cost of never unmounting the navigator.

### 4. Not covered

Static checks and the web export. **No device pass**, and that matters more than
usual here: the crash is an iOS-native one, and the race that triggers it is won
only when `getSession()` is slow. The check that would actually confirm the fix
is a dev build, cold-started from a booking notification tap on a throttled
connection — the app should land on the booking instead of freezing on "Loading
session…".

The web preview could not be used: this ran from a git worktree, which has no
local `node_modules` (hoisted to the repo root), so Metro serves the entry
bundle from outside the project root and the browser 404s on it. An environment
limit, not a symptom.

The open Realtime column-grant risk (§4 of the 2026-08-15 run) is untouched by
this work and still wants its five-minute check.

---

## Run 2026-08-15 — R13–R16 web-parity batch, on `main` @ `4e0d881`

**Scope:** everything since the 1.0.6 release (`e131d98`) — the R13, R14, R15 and
R16 web-parity batches. JavaScript only. Not device-tested.

**Verdict: clear to ship, and the R14/R15 shipping gate is now provably lifted.**
No blockers. One tooling defect found and fixed here. One open risk (§4) is not a
regression in this batch but is now live in production and unverified.

### The gate that was blocking R14/R15 is open — verified against the live host

R14 and R15 were built against web's `staging` and carried an explicit
instruction not to ship before web released. That release has happened, and this
was checked against the running production API rather than inferred from git:

| Probe (`PATCH`, unauthenticated) | Response | Means |
|---|---|---|
| `/api/venue/visits/{gid}/schedule` | **401** | route exists, auth-gated |
| `/api/venue/visits/{gid}/services` | **401** | route exists, auth-gated |
| `/api/venue/bookings/{id}/summary` | 405 | control — route exists, no PATCH handler |

A 404 would have meant the endpoint was still staging-only. Both visit endpoints
answer, so the app's multi-service visit work will function against
`www.resneo.com`. The duration floor of 5 (R14-1) rides the same release.

### Fixed in this pass — local `jest` and `eslint` were double-counting

`jest.config.js` and `eslint.config.js` both excluded `_reference/**` (the web
clone) but neither excluded `.claude/**`. The Claude Code harness creates git
worktrees at `.claude/worktrees/<name>/`, **inside the repo**, and each is a full
second checkout — so with a worktree present:

| | reported | actual |
|---|---|---|
| `npx jest` | 330 suites / 3,426 tests | 165 / 1,713 |
| `npx eslint .` | 30 errors | 15 (the standing baseline) |

The inflated numbers are the harmless half. The dangerous half is that **a
failure in a stale worktree reads as a failure on the branch you are on**, and
that a doubled error count makes the 15-error baseline — which is how every run
of this check distinguishes a new error from an old one — unreadable. Both
configs now exclude `.claude/**`.

This is not a build risk: the worktree is untracked and listed in
`.git/info/exclude`, so `git archive` (which EAS uses under
`cli.requireCommit: true`) never uploaded it.

### Verified healthy

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | **165 suites / 1,713 tests pass** (post-fix figure) |
| `eslint .` | **15 errors** — the same 15 as every prior run, all in `scripts/` + `jest.setup.js`; 0 in shipped code |
| `expo export --platform web` | exit 0 |
| Native surface | **unchanged since 1.0.6** — no `package.json`, `app.json`, `app.config.js` or `eas.json` diff since `e131d98` |
| Version | root **1.0.6**, `android.version` **1.0.6** — unchanged, see §3 |
| Staging host in prod config | none — `reserve-ni.vercel.app` absent from `app.json` (dropped in `8079198`, which predates the 1.0.6 release) |
| Production `env` | the four `EXPO_PUBLIC_*` only; no dev-only flag leaks (`TERMINAL_SIMULATED`, `ALLOW_SCREENSHOTS`, `SENTRY_DISABLE_AUTO_UPLOAD` all absent) |
| `console.log` in app code | all four `__DEV__`-gated (calendar schedule-block skip, analytics ×2, observability) |
| Secrets since `e131d98` | none — the only pattern hit is the phrase `service_role` in R16 report prose |
| R16's new backend dependency | none new: `linked_calendar_ids` on `/api/venue/staff/me` is long-standing and already load-bearing in `availability`, `manage/services` and `ClassTypesManagerSheet` |

### 3. The author's calls, not defects

1. **This batch is OTA-eligible.** Nothing native changed since 1.0.6, so it can
   ship as an `eas update` to the `production` channel rather than a store
   build. The version is deliberately left at 1.0.6 — bumping it moves each
   platform's runtime version and strands existing installs from the update
   (§2.1 of the 2026-08-01 run). **Bump only if you intend a store build.**
2. **If you OTA, check the EAS environment first.** `eas update` reads
   `EXPO_PUBLIC_*` from the EAS environment **only**, never from `eas.json`.
   All five were added to `production` on 2026-08-05, but the standing rule from
   that run still governs: verify with `eas env:list production` before
   publishing. Not checkable from here — it needs EAS auth.

### 4. The open risk — not from this batch, but now live

**W1 from the R16 audit is unverified and is no longer hypothetical.** Web's
`20270112120000_bookings_column_grants.sql` revokes `authenticated`'s
table-level SELECT on `bookings` down to nine columns. The migration's own header
states that **Realtime delivery under column grants is unverified** and names a
pre-production gate that has not been reported as run. The visit endpoints
answering 401 above means that web release is deployed, so those grants are
almost certainly already applied to the production database.

Eight app subscription sites ride `bookings` Realtime. The columns themselves are
fine — every site filters on `venue_id`, which is granted, and no consumer reads
the payload. But **the app's failure mode is worse than web's**:
`useVenueLiveSync` starts polling only while the channel is *not* `SUBSCRIBED`,
so a channel that subscribes successfully and then never fires clears the poll,
leaves `liveState` reading `'live'`, and every one of those screens goes silently
stale behind a live indicator.

**This is a five-minute check and it should happen before the next release, not
after:** open the app on Calendar against production, change a booking from
another session, and confirm the grid reacts. If it does not, the fix is web's
own A6 — drop the subscription and poll — and it is needed in the app too.

### 5. Not covered

Static checks, the live endpoint probes above, and nothing else. **No device
pass on this batch.** Specifically untested on hardware: the R16 cross-column
drag refusal and the Modify save (both gesture-level), the R15 visit drag and
resize, and — unchanged from every prior run — sign-in, a real booking write,
push delivery and one live card payment against the production backend.

---

## Run 2026-08-10 — 1.0.6, both platforms

**Scope:** a JavaScript-only correctness and layout release (guest-notification
prompt on Modify, six unscrollable sheets, bottom safe area on pushed screens).
Device-tested by the author on an iPhone XS before this run.

**Verdict: clear to build.** No blockers found. Two decisions are the author's,
not defects.

### Verified healthy

| Check | Result |
|---|---|
| `expo lint` | exit 0 (145 warnings, the standing baseline; **0 errors**) |
| `jest` | 155 suites / 1,558 tests pass |
| `expo export --platform web` | exit 0 |
| `tsc --noEmit` | clean |
| Version | root **1.0.6**, `android.version` **1.0.6** — both bumped from 1.0.5 |
| Build numbers | EAS remote + `autoIncrement: true` — nothing to set by hand |
| `ios.entitlements` | absent — provisioning cannot fail on the proximity-reader key |
| `TAP_TO_PAY_IOS_ENABLED` | `false` |
| Staging host in prod config | none — `reserve-ni.vercel.app` no longer declared |
| Production `env` | the four `EXPO_PUBLIC_*` only; no dev-only flag leaks (`TERMINAL_SIMULATED`, `ALLOW_SCREENSHOTS`, `SENTRY_DISABLE_AUTO_UPLOAD` all absent) |
| `console.log` in app code | all `__DEV__`-gated |
| Native surface | **unchanged since 1.0.5** — no dependency, native module or `app.json` native-config diff |

### Backend

**No merge required for this release.** The one server-side contract it depends
on — `defer_modification_guest_notification` on the appointment-modify branch of
`PATCH /api/venue/bookings/[id]`, plus the `guest-modification-notify` route —
was verified present on the backend's **`main`** (not merely on `staging`), and
the notify route is Bearer-capable. Production tracks `main`, so the prompt will
behave in production exactly as it does on staging.

Separately: the backend's `staging` is **6 commits ahead of `main`**. That is the
standing item from the 2026-08-05 run (§5) and is unrelated to this release, but
it still wants merging.

### The author's calls, not defects

1. **This release did not have to be a build.** Nothing native changed since
   1.0.5, so it was OTA-eligible. Bumping both versions moves each platform's
   runtime version (§2.1), which forecloses that — an update published now cannot
   reach anyone still on 1.0.5. Chosen deliberately.
2. **Android `production` emits an AAB**, which cannot be sideloaded. Use
   `production-apk` for a device rehearsal; it carries identical live
   credentials.

### Not covered

Static checks plus the author's device pass on a **preview/dev** build. Untested
against the **production** backend: sign-in, a real booking write, push delivery,
and one live card payment (unchanged from the 2026-08-05 run).

---

## Run 2026-08-05 — iOS production readiness, Bluetooth-reader card payments

**Scope:** shipping in-person card payments on iOS via a **connected BBPOS WisePad 3 only**. Tap to Pay on iPhone is deliberately deferred (Apple has granted the entitlement for Development distribution only — see `Docs/TAP_TO_PAY.md`).

**Verdict: the code is ready; the build sequence is not.** One step must not be skipped, one config item is fixed here, and three operational facts can only be confirmed by a human against the live Stripe account.

### 1. Do a `preview` build first — do not go straight to production

The last working preview build (`1.0.4`, build 16) **predates both `expo-location` and `bluetooth-central`.** So:

- The **iOS location permission flow has never run on a device.** It sits directly in the reader path (`prepare()` calls it before discovery) and a refused or mishandled prompt breaks card payments outright.
- **We never isolated whether `bluetooth-central` was the fix** for the `discoverReaders` SIGABRT. Three changes landed together — location, background mode, verbose SDK logging — and the build then worked. It may have been the cause, or it may be carrying App Store review surface for nothing.

Going straight to production puts an untested permission flow in the payment path onto the App Store. A preview build costs ~20 minutes.

### 2. Fixed in this pass

**Dropped `applinks:reserve-ni.vercel.app` from `ios.associatedDomains`** — a staging host declared in the production build, flagged on 2026-08-01 and still present. The production app should not claim to handle links for the staging site. (The same host remains in `android.intentFilters`; inert until the next Android build, worth removing then.)

### 3. Verified healthy

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | 136 suites / 1,388 tests pass |
| `eslint .` | 15 errors — **the same 15** as every prior run, all pre-existing |
| `ios.entitlements` | **absent** — no proximity-reader entitlement, so provisioning cannot fail on it |
| `TAP_TO_PAY_IOS_ENABLED` | `false` — the tap-on-phone option is hidden on iOS |
| Version | **1.0.4**, above the live **1.0.3 (build 16)**; `autoIncrement` yields build 17 |
| Sentry | DSN + `SENTRY_AUTH_TOKEN` present, `SENTRY_DISABLE_AUTO_UPLOAD` unset → source maps upload |
| Production `EXPO_PUBLIC_*` | all five present in the EAS environment (fixed earlier today, see below) |
| `ios.simulator` | unset → device build |

**The "How to Tap" overlay is NOT required for this submission.** It is a Tap to Pay on iPhone obligation; with no ProximityReader use and no entitlement it is off the critical path. It returns when Tap to Pay ships.

### 4. Only a human can confirm these

1. **The WisePad must be registered in LIVE mode.** All testing ran against `pk_test_` on staging. A reader paired to a test-mode Location is **not** available in live mode — it must be registered to a Location on the live connected account. This is the most likely cause of a failed go-live day.
2. **The live venue needs `in_person_payments_enabled = true`** and the **`card_present` capability** on its live Stripe connected account.
3. **Stripe must have approved the account for Terminal in live mode.**

### 5. Known, accepted for this release

- **Backend charge-route improvements are on `staging`, not `main`.** Production points at `www.resneo.com`, which tracks main, so the live app gets the old route: silent clamp, `Invalid request` on the £1,000 cap, bare `{ success: true }` on cash. Not blocking — the app blocks over-payment client-side and mirrors the cap — but merge before or soon after go-live.
- **`bluetooth-central` needs a review note.** Apple scrutinises background modes. The justification is sound (the app holds a connection to a Bluetooth card reader, which can otherwise drop when the phone locks mid-transaction) — put it in the review notes rather than waiting to be asked.
- **Deep links still cannot verify.** No `apple-app-site-association` is served on either declared domain, so Universal Links will not route. The `resneo://` scheme works. Unchanged since 2026-08-01.

### 6. Suggested order

1. `eas build --profile preview --platform ios` → test the reader, confirm the location prompt behaves
2. Merge backend `staging` → `main`, deploy
3. Confirm the live reader registration, venue flag and Stripe capability
4. `eas build --profile production --platform ios` → submit with a review note covering `bluetooth-central`

---

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
