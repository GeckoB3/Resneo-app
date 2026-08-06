# Changelog

Notable changes to the Resneo staff app, newest first.

Versions are **per platform** — iOS takes the root `version` in `app.json`, Android
takes `android.version`, and the two legitimately differ because the stores were
seeded at different points. Build numbers (`versionCode` / `buildNumber`) are
managed remotely by EAS, so they aren't listed here.

The **Play / App Store** block under each release is the copy for the store's
"What's new" field, which Google caps at **500 characters** and Apple at
**4,000** — keep it inside that or the upload is rejected. The two platforms
need **separate copy**: a feature present on one is not automatically present
on the other, and iOS 1.0.4 is the worked example.

---

## iOS 1.0.4 — 2026-08-06

App Store build 17, superseding the live **1.0.3 (build 16)**. Covers
2026-07-01 → 2026-08-05.

The feature body is the **Android 1.0.1** entry below — the two releases share
almost all of their work. This entry records the App Store copy and the ways
iOS differs.

### App Store — "What's new" (1,312/4,000)

```
In-person card payments

Take payment at the appointment with a BBPOS WisePad 3 card reader
paired to your phone. Cash and other payment types are recorded too,
refunds included, and money settles directly into your own Stripe
account — Resneo takes no cut. Every attempt is listed on the booking,
so you can see what settled and what didn't.

Card holds

Protect against no-shows by authorising a fee when the booking is
made. Switch it on under booking settings.

Compliance

Client records, patch tests and per-service requirements, with
requirement markers on the bookings that need them.

Calendar

A compact day view for busy days, wider columns on iPad, and booking
bars that are exactly as tall as the appointment is long — so
back-to-back short appointments no longer overlap.

Also new
• Fixed start times per service, instead of only an interval grid
• The appointment's location shown on the booking
• Ask for a Google review in the post-visit email
• Dismiss optional setup steps with "Not now"
• Refund a payment from any line of a multi-service visit, then take
  payment again afterwards

Fixed
• Group bookings keep attendees off each other's time
• Saving a service no longer fails with a bare "Invalid request"
• Linked-calendar slots are labelled by service when the client's
  name is hidden
```

### How iOS differs from Android 1.0.1

- **No Tap to Pay on iPhone.** Apple granted the entitlement for Development
  distribution only (Case-ID 21181959), so iOS ships the **BBPOS WisePad 3**
  Bluetooth path alone and `TAP_TO_PAY_IOS_ENABLED` is `false`. The App Store
  copy must not promise tapping a card or phone against the device — the Play
  copy below leads with exactly that, correctly for Android. Reusing it on iOS
  would advertise a feature the build cannot perform. See `Docs/TAP_TO_PAY.md`.
- **Push notifications are not new here.** They shipped on iOS in June; the
  Android entry lists them because Android was the platform catching up.
- **iOS-only reader work**, none of which Android needed: the Terminal SDK never
  requested **location** on iOS (Stripe disables card-present without it), and
  `bluetooth-central` was added to hold the reader connection when the phone
  locks mid-transaction.

### Landed after the Android build was cut

- Booking detail shows **where the appointment actually is**.
- Services can offer **fixed start times**, not just an interval grid.
- The setup checklist accepts **"Not now"** on optional steps.
- The post-visit email can **ask for a Google review**.
- **Refund a payment** sits beside the ledger on booking detail, and a refunded
  booking can be **paid again**.

### Notes for this release

- **The review notes must justify `bluetooth-central`.** Apple scrutinises
  background modes. The app holds a connection to a Bluetooth card reader that
  would otherwise drop when the phone locks mid-transaction — volunteer that
  rather than waiting to be asked.
- The **Compliance** paragraph assumes live build 16 was cut from the 1.0.3
  version bump (`2964b1b`, 2026-07-01) rather than a later commit. The compliance
  dashboard landed on 2026-07-01/02, straddling that boundary. If build 16 came
  off a later commit, compliance is already on the store and the paragraph goes.
- In-person payments additionally need the live-mode setup in
  `Docs/GO_LIVE_CHECK.md` §4: the WisePad registered to a Location on the **live**
  connected account, `in_person_payments_enabled`, and the `card_present`
  capability.
- The **"How to Tap" overlay is not required** for this submission. It is a Tap to
  Pay on iPhone obligation and returns when Tap to Pay does.

---

## Android 1.0.1 — 2026-08-02

Android build 11. Covers 2026-06-28 → 2026-08-02.

Most of this shipped on iOS too, as **1.0.4** above — but not all of it, and not
with the same card-payment story. Read the iOS entry before reusing any of this
copy.

### Play Store — "What's new" (467/500)

```
Take card payments in person: tap the client's card or phone, or pair a Bluetooth card reader. Money goes straight to your own Stripe account.

Also new
• Card holds to protect against no-shows
• Compliance records, patch tests and requirement tracking
• Compact day view on the calendar
• Push notifications on Android

Fixed
• Short appointments now show at their true length and stay resizable
• Service edits save reliably
• Card readers connect more consistently
```

### In-person card payments

The headline of this release.

- **Tap to Pay on Android**, and support for the **BBPOS WisePad 3** Bluetooth reader.
- Take payment from any appointment with an outstanding balance; cash and
  external payments are recorded too.
- Refunds, including refunding a visit payment from **any line** of a
  multi-service visit.
- Payment history on the booking, with `pending` and `failed` attempts visible.
- A collection covers the **whole visit**, and the sheet says so.
- Venue admins can switch in-person payments on **from the app** — previously
  web-dashboard only.
- Money settles **directly to the venue's own Stripe account**; ResNeo takes no cut.

Taking a payment is always the team's choice, appointment by appointment — an
appointment can still be completed with a balance outstanding.

### Card holds

Take a no-show fee authorisation at booking time, with the deposit toggle in
booking settings. Web parity across booking detail, the booking wizard, editors,
roster and reports.

### Compliance

Records, patch tests and requirement tracking, mirroring the web dashboard:
compliance settings navigation, per-service requirements, and requirement
markers on bookings.

### Calendar

- **Compact day mode**, including on linked venues.
- Booking bars match the web layout, with wider columns on tablets.
- Take payment surfaced in the toolbar; settled bookings badged.

### Notifications

Android push wired up. The Firebase client config is supplied at build time as an
EAS file secret and is never committed.

### Fixes

- Booking bars are **exactly as tall as their duration**, so back-to-back short
  appointments no longer overlap.
- The duration grip stays available on short appointments.
- Appointments can be as short as **5 minutes**, matching what services already
  allowed. (Pairs with a backend change.)
- Saving a service no longer fails with a bare "Invalid request", and validation
  errors now name the offending field. (Pairs with a backend change.)
- Card readers: fixed a connection hang, a phantom "payment still going through",
  concurrent-call failures, the Android permission check, and switching between
  Tap to Pay and a Bluetooth reader.
- Group bookings keep attendees off each other's time.
- Screenshots are allowed everywhere except the compliance screen.

### Notes for this release

- The 5-minute appointment floor and the service-save fix depend on backend
  changes deployed to `www.resneo.com`. Confirm that deploy has landed before
  publishing, or those two lines will be inaccurate for users.
- In-person payments additionally require the venue to have a Stripe connected
  account with the **card-present capability enabled in live mode** — the app's
  toggle alone is not sufficient.
