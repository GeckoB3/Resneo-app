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

## iOS 1.1.0 / Android 1.1.0 — unreleased

The customer side of the app. Until now this was the venue app only: anybody who
signed in without a staff profile hit a dead end, and the customer portal lived
on the web.

**Native code changed, which the last few releases did not.** Two modules were
added, `@stripe/stripe-react-native` and its `react-native-webview` peer, so this
CANNOT ship as an OTA update on the 1.0.7 runtime. The minor bump is doing real
work here rather than being cosmetic: the shipped 1.0.7 binaries do not contain
the Stripe module, and the customer screens import it, so an update published to
them would fail at require time. Moving to 1.1.0 moves the runtime with it and
keeps the two apart.

**Staff should notice nothing.** The routing now decides between a staff side and
a customer side, but a staff profile resolves to the staff side exactly as
before, and the venue tabs are untouched.

**One fix that was already live in production.** Push registration was gated on
having a session and nothing else, and the app sent no audience, so somebody who
signed in without a staff profile was still registered as a STAFF device and
received a venue's booking alerts, which carry a client's name and service. That
is fixed here regardless of the customer work.

**Ask ResNeo.** The help assistant the web dashboard gained is in the app, at the
top of **More** where the settings search field used to be. It answers how-to
questions from the ResNeo help centre, made specific with this venue's plan and
settings and the person's role, and it knows it is answering somebody on the app,
so the steps it gives are the app's steps and it says when a job can only be done
on the web. It cannot change anything, and a question it cannot answer can be
handed to Support with the conversation attached. The settings search went to
make room for it. The assistant is switched on server-side, so until it is turned
on for a venue the row says so and points at the Support form.

**Store copy: not yet written.** This entry exists for the preview build.

---

## iOS 1.0.7 / Android 1.0.7 — 2026-08-25

A re-baselining release. Covers 2026-08-11 → 2026-08-25 on both platforms; the
same commits ship to each, so the store copy is identical.

**Almost all of it is already live.** Seven OTA updates went out on the 1.0.6
runtime between 11 and 25 August, so most users are running this code already.
The build exists to move the EMBEDDED bundle forward: a new install was starting
24 commits behind and running that stale code for its whole first session
(expo-updates fetches in the background and applies on the next launch), and a
rollback could only fall back to that same stale bundle.

**Nothing native changed.** `package.json`, `package-lock.json`, `patches/`,
`eas.json` and the native config in `app.json` are byte-identical to what the
1.0.6 build shipped — same `expo@~56.0.16`, same `react-native@0.85.3`. The only
delta is JavaScript that has been running in production via OTA. This is the
lowest-risk build shape available.

As always, bumping both versions moves each platform's runtime version, so this
cannot be delivered as an update to anyone still on 1.0.6 (see the 2026-08-25
run, §2, in `Docs/GO_LIVE_CHECK.md`). The final 1.0.6-runtime update stays
served to stragglers.

Requires no backend change.

### Play Store — "What's new" (490/500)

```
The calendar now shows closures, staff leave and amended hours, so the diary matches what the booking engine allows.

A multi-service visit is one bar you can drag and resize as a whole, not one bar per service.

Status buttons on a booking respond instantly.

Staff can take a booking without collecting payment first, and set the amount on a group booking.

Fixed: a tapped notification could crash the app, the opening-hours editors saved incorrectly, and content sat under the home bar.
```

### App Store — "What's new" (1,309/4,000)

```
A calendar that tells the truth

Venue closures, staff leave and amended opening hours are drawn on
the diary. They were always enforced when taking a booking, but were
invisible on the one screen staff use to find space.

Visits, as one thing

Several services booked back to back for one guest now render as a
single bar spanning the whole visit, and drag and resize as one. The
booking detail reads and edits them as one visit too, and staff can
change which services a visit is made of.

Status buttons that answer

Arrived, Start and Complete now update the bar the moment you press
them, instead of after a round trip. On a multi-service booking the
whole visit moves together.

Money decisions belong to staff

A booking can be taken without collecting payment first, and the
amount on a group booking or a chain of services is yours to set.
Bookings whose deposit failed are marked as such, and the app no
longer offers deposit actions the server would refuse.

Fixed

Tapping a notification could clone the app's root screen and crash
it. The opening-hours editors did not save correctly and left out
resources. Reports, contacts, services and other pages ran their last
row under the home bar. Availability now says when it could not check
every staff member rather than quietly showing fewer slots.
```

### Added

- Venue closures, amended hours and staff leave are drawn on the calendar; the
  grid feed carries none of them, so the app resolves and renders them itself.
- Multi-service visits: one bar per visit, dragged and resized through the visit
  endpoint, read and edited as one booking, with its service list editable.
- Staff money controls on group bookings and service chains, and the ability to
  accept a booking without taking payment first.
- Linked-venue and compliance parity work from the R13–R22 web-delta audits.

### Fixed

- A tapped notification could clone the navigation root and crash the app.
- Calendar quick actions (Arrived / Start / Complete) left a spinner running
  forever where the buttons belong, then — once that was fixed — took seconds to
  settle and could visibly revert. All three causes are addressed: the shared
  mutation's per-call callbacks, the per-segment invalidation storm, and a read
  already in flight overwriting the optimistic update.
- The opening-hours editors saved incorrectly and omitted resources.
- Empty bars at the bottom of the booking and settings pages.
- Availability now reports when a pooled search could not check every member,
  instead of silently returning fewer slots.
- The deposit-payment reminder defaulted to SMS only, which meant venues without
  the SMS entitlement sent no reminder at all before a booking was released.

---

## iOS 1.0.6 / Android 1.0.6 — 2026-08-10

A correctness and layout release. Covers 2026-08-09 → 2026-08-10 on both
platforms; the same commits ship to each, so the store copy is identical.

**OTA-eligible in principle** — no dependency, native module or `app.json`
native config changed since 1.0.5, so every change here is JavaScript. Shipped
as a build by choice, not necessity. Note that bumping both versions moves each
platform's runtime version, so this release cannot be delivered as an update to
anyone still on 1.0.5 (see `Docs/GO_LIVE_CHECK.md` §2.1).

Requires no backend change — the guest-notification deferral uses
`defer_modification_guest_notification`, which the modify branch of
`PATCH /api/venue/bookings/[id]` already honours.

### Play Store — "What's new" (445/500)

```
Changing a booking's time from the Modify form now asks before emailing the guest, with notify, don't notify and undo — the same choice the calendar already gave you.

Fixed: the edit-contact form could not be scrolled and its Save button was out of reach. Six more forms had the same fault.

Fixed: content sitting under the home bar on reports, contacts, services, add-ons, booking page and team.

Also: the start time steps in 5-minute marks.
```

### App Store — "What's new" (771/4,000)

```
Changing a booking's time

Moving a booking from the Modify form used to email the guest the
instant you saved. It now asks first — notify, don't notify, or undo
the change — which is the same choice the calendar has always given
you for a dragged booking. Undo restores the whole edit, not just
the time.

Forms you couldn't finish

The edit-contact form could not be scrolled and its Save button sat
below the bottom of the screen. Six other forms had the same fault
and are fixed with it.

Room at the bottom

Reports, contact detail, services, add-ons, the booking page editor
and the team page all ran their last row of content under the home
bar. So did the Modify booking form.

Also in this release

The by-hand start time steps in 5-minute marks rather than one.
```

### Fixed

- Modifying a booking's start time emailed the guest immediately, with no
  confirmation and no way back.
- Saving the Modify form on a service with add-ons could clear the booking's
  add-ons: the form latched "already seeded" before it knew the service, so it
  sent an empty add-on list, which the server treats as "replace with none".
- The edit-contact form, and six other sheets, sized their body to their content
  — so they could not scroll and their pinned buttons were pushed off the bottom.
- Sheets opened from inside another sheet (Modify, from booking detail) lost the
  bottom safe area entirely and sat on the home indicator.
- Pushed screens never reserved the bottom safe area, so their last row of
  content ran under the home indicator.

### Changed

- The Modify form's by-hand start steps in 5 minutes and snaps to the
  `:00/:05/:10` grid; its label drops the "(by hand)" qualifier.

---

## iOS 1.0.5 / Android 1.0.5 — 2026-08-09

The two version lines converge here: Android moves 1.0.1 → 1.0.5 to sit alongside
iOS. See `Docs/GO_LIVE_CHECK.md` §183 — `android.version` remains a deliberate
override, not drift.

Covers 2026-08-06 → 2026-08-09 on iOS, and 2026-08-03 → 2026-08-09 on Android,
which was cut earlier. **Android additionally gains the refund work** iOS shipped
in 1.0.4, so the Play copy differs.

**Not OTA-eligible** — carries a native dependency (`expo-image-picker`) and the
Sentry navigation/profiling integration. Both need this build.

Requires the backend at `resneo@06d5491c` or later: multi-service calendar bars
and recorded service names read fields added there.

### Play Store — "What's new" (447/500)

```
Multi-service visits now show as one appointment on the calendar, not one bar per service.

New: staff-first booking. Guests choose a team member first, then that person's services - on your booking page and when you take a booking yourself.

New to Android: refund a payment from the booking.

Also: crop booking-page photos, cancel a card payment at the reader, close a day that already has bookings, and accuracy fixes to deposits and payments.
```

### App Store — "What's new" (819/4,000)

```
Multi-service visits

A booking with several services now shows as one appointment on the
calendar, spanning the whole visit, instead of one bar per service.

Staff-first booking

A new setting that asks who the booking is with before which service.
It applies to your public booking page and to bookings you take
yourself. Off by default — turn it on in booking settings.

Photos

Pick images from your photo library (they were previously unreachable
on iPhone), and crop and position service and team photos for your
booking page.

Also in this release

Cancel a card payment at the reader. Close a day that already has
bookings. Cancel a scheduled account deletion. Plus accuracy fixes to
deposit amounts on classes and events, cash payment records, clearing
a contact's details, and saving a resource with no price.
```

### Fixed

- Deposits on classes and events quoted the per-person figure while the server
  charged per attendee.
- A declined card was matched to its ledger row by amount and timing, which the
  app's own retry flow could defeat and silently hide a double-charge warning.
- Cash payments reported the client's stale balance, and a timeout was reported
  as a definite failure on a write with no idempotency key.
- Booking a slot did not mark availability stale, so the picker could offer a
  slot that had just gone.
- Clearing a contact field, or saving a resource with no price, was rejected.
- Push notifications kept arriving after sign-out, and Android showed full client
  detail on the lock screen.
- The app lock did not cover open sheets — the surfaces holding the most client
  data.
- Saved calendar preferences were wiped when the app opened offline.

### Removed

- Universal Links / Android App Links config. Neither association file was ever
  served, and a failed verification is worse than no claim on Android 12+. The
  `resneo://` scheme is unaffected. See `Docs/universal-links`.

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
