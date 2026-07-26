# Maestro end-to-end flows (W4.3)

Real device/emulator UI flows for the Resneo app's critical path, written for
[Maestro](https://maestro.mobile.dev). These drive the **actual app** through
sign-in, calendar, the booking wizard, and a booking cancellation — they are not
unit tests and do **not** run under Jest.

- **App id:** `com.resneo.app` (iOS bundle id + Android package, see `app.json`).
- **Status:** authored against the real on-screen labels, **not yet wired into
  CI** — CI has no device/emulator attached, so these are run manually for now.

## What you need

1. **A dev build of the app installed on a device or emulator.** Expo Go will
   **not** work — the app uses native modules (reanimated/worklets, gesture
   handler, secure-store, symbols, etc.). Build and install one of:
   ```sh
   # Android emulator / device
   npx expo run:android
   # iOS simulator / device
   npx expo run:ios
   ```
   Leave the Metro bundler running (or use a release dev-client build).
2. **Maestro installed** — see https://maestro.mobile.dev/getting-started/installing-maestro
   ```sh
   maestro --version
   ```
3. **A staff test account** on the environment the build points at, plus a venue
   with at least one practitioner + bookable service (the wizard needs a service
   to pick).

## Running

Credentials and the test guest are passed as env vars so no secrets live in the
repo:

```sh
# Whole critical path: login → calendar → create booking → open detail → cancel
maestro test \
  --env EMAIL=you@salon.com \
  --env PASSWORD='your-password' \
  --env GUEST_FIRST=Maestro \
  --env GUEST_LAST=Smoke \
  --env GUEST_PHONE=+447700900123 \
  .maestro/smoke.yaml
```

Run an individual flow the same way (each declares the env vars it needs):

```sh
maestro test --env EMAIL=… --env PASSWORD=… .maestro/login.yaml
```

`maestro studio` is handy for inspecting the live view hierarchy and refining
selectors against a running build.

## Flows

| File | Path covered |
| --- | --- |
| `login.yaml` | Staff password sign-in → lands on the Calendar tab. |
| `create-booking.yaml` | Calendar FAB → booking wizard (service → date → time → guest → confirm) → "Booking confirmed". Assumes already signed in. |
| `booking-action-cancel.yaml` | Booking detail → two-step "Cancel booking" → "Tap to confirm" → Cancelled. Assumes a detail screen is open. |
| `smoke.yaml` | Chains all of the above end to end. |

## Selectors & the `# TODO: add testID` notes

Where the app already exposes a stable, meaningful **accessibility label** or a
unique piece of **visible text**, the flows select on that (e.g. the "Sign in"
button, the "Continue" / "Create booking" / "Cancel booking" buttons, step
headings like "Choose a service" / "Guest details" / "Review & confirm").

Some targets only have venue-data or positional identity today (the first
service row, the first time slot). For those the flow uses an optional
`id:` regex with a positional fallback and leaves a `# TODO: add testID` comment
naming the component. **Adding those testIDs to the screens is intentionally out
of scope for this batch** — do it in a follow-up so the flows can drop the
positional fallbacks and become fully deterministic. Candidates:

- ~~`components/ui/Fab.tsx` → `testID="calendar-fab"`~~ — **done.** The FAB's
  visible label is venue terminology ("New booking" on an appointment venue,
  "New reservation" on a table venue, or whatever the venue set), so selecting
  on text broke as soon as the wording changed.
- `components/booking-wizard/ServicePickerStep.tsx` → `testID="service-option-0"`
- `components/booking-wizard/TimeSlotStep.tsx` → `testID="time-slot-0"`
- `components/booking-wizard/GuestDetailsStep.tsx` → `testID` on the
  first-name / surname / phone inputs
- `app/(auth)/sign-in.tsx` → `testID` on the email / password inputs

## Notes on app behaviour these flows rely on

- **Cancel is a two-step confirm.** `Alert.alert` is a no-op on RN-web, so the
  app arms the destructive button instead: tapping "Cancel booking" flips the
  label to "Tap to confirm" for ~4s; a second tap commits. The flow asserts the
  intermediate "Tap to confirm" state.
- **Calendar is the default tab** and the FAB is the create entry point, so the
  flows do not navigate tabs to start a booking.
