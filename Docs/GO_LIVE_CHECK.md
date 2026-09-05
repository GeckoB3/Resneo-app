# Go-live check — Resneo app

## Run 2026-09-05: OTA to production, 1.1.0, "ResNeo R24 Web Parity"

**Scope:** the eight commits since the R23 OTA (`8c318f3`…`af21ac9`): the card-hold flag
retirement (`8c318f3`), the R24 audit docs (`a7ade45`), and six R24 builds: staff booking for a
venue collective (`2d70a06`), contact Records (`5831bf9`), combined-page links and the Booking page
notice (`0c67ce2`), a linked booking's compliance read through the link (`145b1e8`), the
working-today calendar filter (`b24b438`) and past schedule changes (`af21ac9`). Report:
`Docs/APP_GAP_REPORT_R24_WEB_DELTA.md`. JavaScript only. Not device-tested as a set: the owner's
device pass is pending.

**Verdict: cleared to OTA**, and published by the owner the same day as group
`556bbef3-df9c-473c-b0d8-4ff672f096f2` on the `production` branch, runtime 1.1.0, Android and iOS.

### 1. Version and reach: the OTA lands on the 1.1.0 installs

| Check | Result |
|---|---|
| iOS version | **1.1.0** (`app.json` `version`) |
| Android version | **1.1.0** (`app.json` `android.version`) |
| `runtimeVersion.policy` | `appVersion`, so runtime version **1.1.0** |
| Live iOS production build | runtime **1.1.0**, EAS build `0173cf91`, 31 Aug 2026 |
| Live Android production build | runtime **1.1.0**, EAS build `3b8e5207`, 31 Aug 2026 |
| `production` channel before | branch `production`, latest group R23 (`3ac5e157`) on runtime **1.1.0** |

The second update on the 1.1.0 runtime. **Do not bump the version**: under the `appVersion`
policy that moves the runtime and strands every 1.1.0 install.

### 2. OTA eligibility: nothing native moved

`git diff 20bab97..af21ac9 -- app.json app.config.js eas.json package.json package-lock.json
patches ios android` is **empty**. The Records card imports expo-document-picker,
expo-image-picker, expo-web-browser, expo-image and expo-symbols, all of which the 1.1.0
binaries already contain (`package.json` is unchanged since the `ce1d85c` builds); no new native
module was added, and `react-native-webview` was deliberately not used.

### 3. Production environment: verified against EAS, not `eas.json`

`eas env:list --environment production --format long`: all five app variables carry **PUBLIC**
visibility, so an update can read them.

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://www.resneo.com` |
| `EXPO_PUBLIC_SUPABASE_URL` | `njualfobtudvlugqkqho.supabase.co` (live) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | live |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DE ingest |
| `GOOGLE_SERVICES_JSON`, `SENTRY_AUTH_TOKEN` | secrets, build-time only; n/a for an update |

Absent by design, each with its safe default: `EXPO_PUBLIC_TERMINAL_SIMULATED` (real readers),
`EXPO_PUBLIC_ALLOW_SCREENSHOTS` (FLAG_SECURE stays on), `EXPO_PUBLIC_WEB_URL` (falls back to the
API URL), `EXPO_PUBLIC_ANALYTICS_KEY` (off). The only local env file is
`.env.development.local` (staging values), which a production-mode export never loads.

### 4. The bundle, checked before publishing

`eas env:exec production "npx expo export --clear --platform all"` was run first and both Hermes
bundles searched:

| String | iOS | Android |
|---|---|---|
| live Supabase host `njualfobtudvlugqkqho` | present | present |
| staging Supabase host `zkppmyyvkjvbsvemakbb` | absent | absent |
| `www.resneo.com` | present | present |
| `pk_live_` | present | present |
| `pk_test_` | absent | absent |

The one staging string still present is the `https://reserve-ni.vercel.app` fallback in
`webDashboardUrl()` (`app/(app)/(tabs)/settings.tsx`), unreachable in production because
`getWebUrl()` resolves first; recorded on 2026-08-25 as worth deleting, still not deleted.

### 5. Verified healthy

- `tsc --noEmit`: clean; `eslint`: 0 errors on every touched file.
- `jest`: **231 suites / 2,385 tests pass** at `af21ac9`.
- `eas.json` `requireCommit: true`: the tree was clean at `af21ac9`, pushed to `origin/main`
  (that push also carried the ten R23 commits that had never left the machine).
- `eas-cli` 23.0.0 via `npx`, logged in as `resneo` (Owner).

### 6. Publishing

```
npx eas-cli update --channel production --environment production --clear-cache --message "ResNeo R24 Web Parity"
```

### 7. Not covered

- The device pass on this batch, above all the collective booking path (a venue in a live
  collective: New, Walk-in, an own-column slot, a partner-column slot, a member-only service, a
  visit, a group), then the Records card (photos, files, the viewer), the linked booking's
  compliance section, the Working today chip and the past-changes toggle.
- R24-6 (bookings nested in a processing gap) waits on the web adding the processing snapshot to
  the calendar-grid rows: `Docs/R24-6_WEB_HANDOVER.md`. Web `main` moved to `cff80edb` (#177) the
  same day with a refinement of that nesting rule; nothing in it reaches the app yet.
- The web's card-hold compatibility key can be deleted once this update is the minimum in use:
  `Docs/CARD_HOLD_FLAG_RETIREMENT_WEB_HANDOVER.md`.

---


## Run 2026-09-03 — OTA to production, 1.1.0, "ResNeo R23 Web Parity"

**Scope:** the nine commits since the 1.1.0 store builds (`ce1d85c`, both platforms,
2026-08-31): the whole R23 web-parity batch (`f6bddf1`…`8c302a1`) plus two device fixes
(`7a76148` add-requirement sheet scroll, `54058d8` catalog Bearer for linked venues).
JavaScript only. Not device-tested as a set: the owner's device pass is pending.

**Verdict: cleared to OTA** with the command below. Nothing native changed since the
binaries, the version is correctly left at 1.1.0, the EAS `production` environment carries
every variable the bundle needs, and a cleared-cache export bakes the live hosts in.

### 1. Version and reach — the OTA will land

| Check | Result |
|---|---|
| iOS version | **1.1.0** (`app.json` `version`) |
| Android version | **1.1.0** (`app.json` `android.version`) |
| `runtimeVersion.policy` | `appVersion` → runtime version **1.1.0** |
| Live iOS production build | appVersion **1.1.0**, build 22, commit `ce1d85c`, 2026-08-31 |
| Live Android production build | appVersion **1.1.0**, build 16, commit `ce1d85c`, 2026-08-31 |
| `production` channel today | branch `production`, latest group on runtime **1.0.6** |

This is the **first update on the 1.1.0 runtime**. It reaches only installs running the
1.1.0 binaries; anyone still on 1.0.6 keeps the last 1.0.6 group, and 1.0.7 installs never
had an update (none was published on that runtime). **Do not bump the version** — under the
`appVersion` policy that moves the runtime and strands every 1.1.0 install.

### 2. OTA eligibility — nothing native moved

`git diff ce1d85c..HEAD -- app.json app.config.js eas.json package.json package-lock.json
patches ios android` is **empty**, and no import of an `expo-*`, Stripe or
`react-native-*` module was added in the range. The `associatedDomains` / https intent
filter change (`89816b0`) predates the builds and is in the shipped binaries.

### 3. Production environment — verified against EAS, not `eas.json`

`eas env:list --environment production`:

| Variable | Value | Matches `eas.json` production? |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://www.resneo.com` | ✅ |
| `EXPO_PUBLIC_SUPABASE_URL` | `njualfobtudvlugqkqho.supabase.co` (live) | ✅ |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_faW-…` (live) | ✅ |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DE ingest | ✅ |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **`pk_live_…`** | EAS-only, correctly |
| `GOOGLE_SERVICES_JSON`, `SENTRY_AUTH_TOKEN` | secrets, build-time only | n/a for an update |

Absent by design, each with its safe default as before: `EXPO_PUBLIC_TERMINAL_SIMULATED`
(real readers), `EXPO_PUBLIC_ALLOW_SCREENSHOTS` (FLAG_SECURE stays on),
`EXPO_PUBLIC_WEB_URL` (falls back to the API URL), `EXPO_PUBLIC_ANALYTICS_KEY` (off).

### 4. The cache trap, demonstrated

A local `expo export` with production values in the environment but **without clearing
Metro's cache** produced bundles containing the dev Supabase host
(`zkppmyyvkjvbsvemakbb`) and NOT the live one — the cache still held a bundle keyed on the
`.env.development.local` values. The same export with `--clear` carried the live host on
both platforms and no dev host. **`--clear-cache` is not optional**, and it is in the
command below. The only staging string left in a clean bundle is the
`https://reserve-ni.vercel.app` fallback in `webDashboardUrl()`
(`app/(app)/(tabs)/settings.tsx`), unreachable in production because `getWebUrl()`
resolves first — recorded on the 2026-08-25 run as worth deleting, still not deleted.

### 5. Verified healthy

- `tsc --noEmit` — clean; `eslint` — 0 errors on every touched file.
- `jest` — **225 suites / 2,347 tests pass** (full run at `8c302a1`; `54058d8` is one line).
- `expo export --clear` — Android and iOS both complete (11 MB Hermes bundles each).
- `eas.json` `requireCommit: true` — the tree is clean at the publishing commit.

### 6. Publishing

```
npx eas-cli update --channel production --environment production --clear-cache --message "ResNeo R23 Web Parity"
```

### 7. Not covered

- The device pass on this batch. What it should look at is listed in the R23 report's
  closing section; the linked-calendar "New booking" fix also needs web `main` @
  `09a7174a` (#173) deployed.
- Multi-service attendees in a group booking — deliberately not built (one service per
  person still).

---

## Run 2026-08-25 — 1.0.7, both platforms, on `main` @ `2db7f7f`

**Scope:** a re-baselining store build. 24 commits since the 1.0.6 build, of
which seven OTA groups are already live on the 1.0.6 runtime. JavaScript only.
The calendar quick-action work in this batch has been device-tested by the owner
after the final OTA; the rest has been live for up to two weeks.

**Verdict: clear to build.** No blockers. Two pre-existing issues are recorded in
§4 — neither is introduced by this release and neither is fixable inside it.

### 1. Why a build at all, when the code is already live

The OTAs moved the running JavaScript but not the EMBEDDED bundle. A new install
therefore started 24 commits behind and ran that stale code for its whole first
session — `expo-updates` fetches in the background and applies on the NEXT
launch — which covers install, sign-in and the first look at the calendar. A
rollback could also only fall back to that same stale bundle. This build makes
the embedded bundle current again.

### 2. Version and reach

- `version` 1.0.6 → **1.0.7** (iOS) and `android.version` 1.0.6 → **1.0.7**.
  Both were bumped; the two are kept in step deliberately.
- `runtimeVersion` is `{policy: "appVersion"}`, so each platform's runtime moves
  to **1.0.7**. **An OTA published from this commit reaches nobody until the
  1.0.7 binaries are on devices.** Publish nothing to `production` between the
  bump and the store release. The final 1.0.6-runtime update stays served to
  anyone who has not taken the store update.
- Build numbers are EAS-remote with `autoIncrement`, so nothing is set by hand.
  Android's last store `versionCode` was 14.

### 3. Build eligibility — nothing native moved

`package.json`, `package-lock.json`, `patches/`, `eas.json` and the native config
in `app.json` are **byte-identical to what the 1.0.6 build shipped** — same
`expo@~56.0.16`, same `react-native@0.85.3`. The only delta is JavaScript that
has already run in production. This is the lowest-risk build shape available:
the native layer is exactly the one currently working in both stores.

### 4. Production environment — verified against EAS, not `eas.json`

`eas.json`'s `production` profile carries an `env` block AND
`"environment": "production"`. The two were reconciled key by key rather than
assumed, because the `env` block takes precedence and does not list every value:

| Variable | Source | Value |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | both, agreeing | `https://www.resneo.com` |
| `EXPO_PUBLIC_SUPABASE_URL` | both, agreeing | live project `njualfobtudvlugqkqho` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | both, agreeing | live |
| `EXPO_PUBLIC_SENTRY_DSN` | both, agreeing | live |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **EAS only** | `pk_live_…` |
| `GOOGLE_SERVICES_JSON` | EAS only (file secret) | required by `app.config.js` |
| `SENTRY_AUTH_TOKEN` | EAS only (sensitive) | sourcemap upload |

Absent-by-design in production, each with a safe default:

- `EXPO_PUBLIC_WEB_URL` — `getWebUrl()` falls back to `EXPO_PUBLIC_API_URL`.
- `EXPO_PUBLIC_TERMINAL_SIMULATED` — unset falls back to `__DEV__`, false in a
  production build, so **real card readers**.
- `EXPO_PUBLIC_ALLOW_SCREENSHOTS` — unset means `FLAG_SECURE` stays on.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — falls back to the publishable key.
- `EXPO_PUBLIC_ANALYTICS_KEY` — unset means analytics off.

No staging host is declared anywhere in the production path. The local
`.env.development.local` (staging web app, dev Supabase) is **not** read by a
production export — proven by exporting and grepping the bundle: the dev Supabase
host is absent. `getApiUrl()` also throws on a missing URL, so a bundle built
without env vars fails loudly rather than pointing somewhere wrong.

One cosmetic exception, not a defect here: `webDashboardUrl()` in
`app/(app)/(tabs)/settings.tsx` hardcodes `https://reserve-ni.vercel.app` as a
fallback. It is unreachable in production because `getWebUrl()` resolves first,
but a staging URL in shipped code on a path that leads to billing is worth
deleting.

### 5. Verified healthy

- `tsc --noEmit` — clean.
- `expo lint` — **0 errors**, 202 warnings (all pre-existing test-file style).
- `jest` — **190 suites / 1,968 tests pass**.
- `expo export` — Android and web both complete cleanly.

### 6. Pre-existing issues, NOT from this batch

**`expo-doctor` reports 20/22.** Both failures predate this release and are
carried by the live 1.0.6 build too.

1. **Hermes V1 memory regression.** `expo@56.0.16` bundles Hermes V1
   `250829098.0.10`; the fix first appears in `250829098.0.16`, which requires
   React Native 0.86.2 / **Expo SDK 57**. This build is no worse than what is
   already in both stores, but it is a memory regression and the fix is an SDK
   major upgrade. Plan it as its own piece of work with its own device testing —
   NOT as part of a version bump.
2. **19 packages behind their SDK 56 patch targets** (`expo` 56.0.16 vs 56.0.20,
   `react-native-screens` 4.25.2 vs 4.26.0, and 17 others). Deliberately NOT
   upgraded here: they change native code, and the point of this build is that
   its native layer is identical to the one already working in production.
   Upgrade on a build whose purpose is the upgrade.

### 7. Not covered

- No device pass on 1.0.7 itself. The calendar quick-action changes were
  device-confirmed by the owner on the final 1.0.6 OTA, which is the same
  JavaScript; the build adds no JS on top of it.
- The R22-1 communications default (`deposit_payment_reminder` → email + SMS) has
  not been eyeballed on the settings screen. It only renders for a venue whose
  stored policy blob lacks that key, which the server fills in for everyone else.
- Store review outcome, and Apple's treatment of a release whose content largely
  shipped as OTA. Nothing here changes the app's purpose or permissions.

---


## Run 2026-08-16 (second) — R17-2 / R17-3, the break-override pair, on `main` @ `05041d6`

**Scope:** the app half of web's SA-H3 / SA-H5 — staff may place an appointment
over a break or a closure. JavaScript only. Not device-tested. Also carries two
documents (the R17 audit report and the R17-4 web handover), which ship no code.

**Verdict: clear to ship, with one honest limit.** No blockers. The change is
correct and complete on the app side, but **it only takes effect for SINGLE
bookings until web lands R17-4** — the two visit save routes still do not accept
`allow_during_breaks`, so a visit dragged over a break is still refused by the
server. That is a web-side gap, written up and handed over; nothing here is
waiting on it, and nothing here breaks because of it.

### What changed, and why it is two changes

Web's own lesson from this batch is that the rule change alone *"changed nothing
a user could do"* because a second layer was still enforcing. Both layers are
done here:

| Layer | Change |
|---|---|
| The app's own drag rule | `lib/calendar/occupying-blocks.ts` — `break`, `closed` and amended-hours blocks stop being hard conflicts. `manual`, `class_session` and **any unrecognised type** still occupy. Applied in `CalendarDayGrid` and `AllCalendarsDayGrid`; `WeekGrid` has no drag |
| The server gate | `allow_during_breaks: true` at all eight send sites, plus both `useVisitMutations` payload types |

Two decisions worth recording. The rule accepts **both vocabularies** — the app's
grid returns `calendar_blocks.block_type` raw (`break` / `closed` /
`amended_hours`) while web's diary computes its own (`venue_closed` /
`venue_amended_hours` / `practitioner_closed`) — so it keeps working if that
endpoint ever moves. And the amber note is produced by cutting non-working
blocks out of the working ranges (`narrowWorkingRanges`), which meant **no change
to the Reanimated drag worklet**.

### Verified healthy

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | **168 suites / 1,750 tests pass** (was 167/1,723; +1 suite, +27 tests) |
| `eslint .` | **15 errors** — the same 15 as every prior run, all in `scripts/` + `jest.setup.js`; 0 in shipped code |
| `expo export --platform web` | exit 0 |
| Native surface | **unchanged** — no `package.json`, `package-lock.json`, `app.json`, `app.config.js` or `eas.json` diff |
| New dependencies | none |
| `console.log` added | none (new files scanned too, not just the tracked diff) |
| Secrets | none |

### 3. The author's calls, not defects

1. **OTA-eligible.** Nothing native changed.
2. **Leave is not drawn on the app's diary at all**, so making `closed`
   non-occupying cannot unlock it — the grid feed reads `calendar_blocks` and
   leave lives in `practitioner_leave_periods`. The server refuses it regardless
   (full-day leave survives even `allowOutsideHours`, SA-M3). Worth knowing
   rather than discovering: a staff member can now drop onto a leave day with no
   client-side warning and get a server refusal.

### 4. Not covered

Static checks and the web export. **No device pass, and this change is a
gesture.** What wants exercising on hardware: drag an appointment onto a break
and confirm it lands with the amber note rather than a red refusal; confirm a
drag onto a class/event or a hand-made manual block is still refused; and
confirm the same for a resize. The visit equivalents will still refuse until
R17-4 lands on web — that is expected, not a regression.

The Realtime column-grant verification carried from R16 is still open.

---

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

## Run 2026-08-19 — OTA to production, 1.0.6

**Scope:** the 17 commits since the 1.0.6 release (`e131d98`) — R17 through R20,
the hours editors, the bottom-inset layout fixes, the staff custom duration, and
the fail-closed readiness work.

**Verdict: cleared to OTA.** Nothing native changed, the version is correctly
left at 1.0.6, and the EAS `production` environment carries every variable the
bundle needs.

### 1. Version and reach — the OTA will land

| Check | Result |
|---|---|
| iOS version | **1.0.6** (`app.json:5`) |
| Android version | **1.0.6** (`app.json:32`, `android.version`) |
| `runtimeVersion.policy` | `appVersion` → runtime version **1.0.6** |
| Live iOS production build | appVersion **1.0.6**, runtime **1.0.6**, channel `production`, commit `e131d98` |
| Live Android production build | appVersion **1.0.6**, runtime **1.0.6**, channel `production`, commit `e131d98` |

Both platforms share one runtime id (`019feda9-…`), so a single update serves
them. **Do not bump the version** — under the `appVersion` policy that moves the
runtime version and strands every existing install, which is the whole point of
leaving it alone.

### 2. OTA eligibility — nothing native moved

`git diff e131d98..HEAD -- package.json package-lock.json app.json app.config.js eas.json`
is **empty**. No dependency, native module or config change since the build that
is live, so the JS bundle is the only thing shipping.

### 3. Production environment — verified against EAS, not `eas.json`

`eas update` reads `EXPO_PUBLIC_*` from the **EAS environment only**, never from
`eas.json`. Run `eas env:list production`:

| Variable | Value | Matches `eas.json` production? |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://www.resneo.com` | ✅ |
| `EXPO_PUBLIC_SUPABASE_URL` | `njualfobtudvlugqkqho.supabase.co` | ✅ |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_faW-…` | ✅ |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DE ingest | ✅ |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **`pk_live_…`** | n/a — not in `eas.json` production, correctly EAS-only |

No staging host anywhere in the production path: `reserve-ni.vercel.app` appears
only under the `preview` build profile.

**Three variables are absent from the environment, and all three are correct:**

- `EXPO_PUBLIC_TERMINAL_SIMULATED` — `shouldSimulateCardReaders()` falls back to
  `__DEV__` (`lib/env.ts:87`), which is `false` in a production bundle, so
  readers are **real**. Checked rather than assumed, because the failure would be
  simulated card payments in production.
- `EXPO_PUBLIC_ALLOW_SCREENSHOTS` — must stay unset; it lifts `FLAG_SECURE` on
  the compliance screen and is a dev-only opt-in.
- `EXPO_PUBLIC_WEB_URL` — falls back to `EXPO_PUBLIC_API_URL`
  (`booking-settings.tsx:911`), which is the production host.

`EXPO_PUBLIC_ANALYTICS_KEY` is likewise unset, which leaves analytics off — the
existing intent, not a regression.

### 4. Publishing

```
npx eas-cli update --channel production --environment production --clear-cache
```

**`--clear-cache` is not optional.** Metro does not re-key its cache on
`EXPO_PUBLIC_*` changes, so an OTA can otherwise ship a stale bundle carrying the
wrong (or missing) backend URLs. `eas.json` also sets `requireCommit: true`, so
the tree must be clean before publishing.

### 5. What this release finally delivers

R20-3 among other things: until this reaches installs, a failed month-availability
read still shows staff a permissive calendar with no notice. Web has already
shipped the server half that makes those reads fail closed, so this OTA is what
closes the loop.

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
