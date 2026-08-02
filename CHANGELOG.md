# Changelog

Notable changes to the Resneo staff app, newest first.

Versions are **per platform** — iOS takes the root `version` in `app.json`, Android
takes `android.version`, and the two legitimately differ because the stores were
seeded at different points. Build numbers (`versionCode` / `buildNumber`) are
managed remotely by EAS, so they aren't listed here.

The **Play / App Store** block under each release is the copy for the store's
"What's new" field, which Google caps at **500 characters** — keep it inside that
or the upload is rejected.

---

## Android 1.0.1 · iOS 1.0.4 — 2026-08-02

Android build 11. Covers 2026-06-28 → 2026-08-02.

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
