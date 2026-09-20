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

## Unreleased

Venue collectives on shared services, and the web's staff booking rule (web 2026-09-17). Details in
`Docs/R37_COLLECTIVES_SHARED_SERVICES.md`.

- Staff can move bookings between any calendars at their venue, as admins can.
- Services show what the collective owns: services from the host are read-only apart from the
  calendar switches, and services that are not on the collective page show as parked.
- Dropping a booking on another venue of the collective moves it there in one step.
- Booking forms refresh their services and times when a collective service is updating or parked.
- Joining a collective on shared services sends you to the web; the leave message is accurate.
- Calendar settings only show classes, resources and events when the venue has them switched on,
  and list a collective's parked services apart from the bookable ones.
- A booking on a partner venue with a single calendar can now be dragged onto your calendars.
- Manage Collective, as on the web: under More. Hosts see each
  venue's health, what needs attention, and every service across the venues, and can choose
  calendars in bulk, preview what guests will see, and save; plus the Venues tab (invite, ask to
  host, remove, end the collective) and the History tab with filters and a CSV download. Members
  see what is on the page for them and what is parked.
- The booking page preview shows the logo beside the page name, below the cover, as the real page
  does, instead of over the cover.
- Plan & payments has an "Open Stripe dashboard" button for admins, for payouts, balance and
  transactions, as on the web.
- Venue collectives: "Manage Collective" for hosts on shared services, and the Services tab
  links to Services and Manage Collective.
- Services: badges sit on their own line, so long names are no longer cut short.

Linked accounts and collectives, and the reports the web added (web 2026-09-19). Details in
`Docs/APP_GAP_REPORT_R38_WEB_DELTA.md`.

- Link with a venue in one guided flow: pick the venue, choose the level, start a collective on a
  full link, name it, say which changes you will accept, check and send.
- Review a link request and join the collective in one go, with the same-name, own-service and
  form choices the web asks; joining a collective no longer sends you to the web.
- Hosts finish setting up a new collective in the app: services, calendars, then the address.
- Members answer a host's question about a same-named service; hosts see who still has to answer.
- The banner on the Calendar tab shows every waiting item (requests in, requests out, pending
  changes, setup to finish, a member to wait for) with a button each, and can be dismissed for a day.
- New bookings: a card on Today, and a Reports tab by day, week or month with how each came in.
- Export your data: bookings, clients or services for any dates as CSV, Excel or PDF, with a count
  before the download.
- More: the Linked venues group has three pages. The "Linked calendar" page is gone; linked
  calendars are on the Calendar tab.

The web's owner-flow sweep (web 2026-09-20). Details in `Docs/APP_GAP_REPORT_R39_WEB_DELTA.md`.

- A cancelled booking can be reinstated; the server checks the time is still free first. Cancelled
  and no-show bookings no longer show an outstanding balance.
- Compliance on a booking: "Too recent" and "Awaiting result" say why a record does not count yet;
  a form link already sent shows when it went and offers "Resend link".
- Add-on groups switched to "Pick multiple" drop the single-choice maximum of 1.
- Deleting a service that is on the collective page takes it off the page first, and says what
  happens at the other venues; hiding or showing a service confirms what it did.
- A multi-service visit's row in Appointments names every service.
- Booking prices show what the client was quoted when they booked, not the service's current
  price.
- A booking at a partner venue opened on its own names its service (it read "Service"), and the
  name updates when Modify changes the service.
- Contacts no longer reads "All 0 clients loaded" under the list, and a client's "Last visit" is
  never a date in the future.
- Android: tactile feedback now follows the phone's vibration settings. Taps, toggles and
  confirmations used a raw vibration (classed as media vibration), so they buzzed even with touch
  feedback switched off; they now go through the system's touch-feedback channel, which the
  "Touch interactions" setting and the vibration master switch control. iOS already followed
  System Haptics.

**Play / App Store (draft):** Working in a venue collective is smoother: move a booking to another
venue's calendar in one step, see which services the host manages, and get clearer messages when a
service is updating. Team members can now move bookings between any calendars at their venue.

---

## iOS 1.1.1 / Android 1.1.1 — 2026-09-15

A re-baselining release, and this time a repair as much as housekeeping. Covers
2026-09-03 → 2026-09-12 (`f6bddf1` … `d90dece`), the same commits on both
platforms. The store copy differs by one fix only iPhone and iPad needed.

**All of it is already live.** Twelve OTA updates went out on the 1.1.0 runtime
between 3 and 12 September, so every 1.1.0 install that has relaunched since runs
this code. What the build moves is the EMBEDDED bundle, and the 1.1.0 one had
stopped working against the server: it predates the visit schedule contract (web
#186–#187, R29-1) and the service-link confirmation (web #194, R35-1), so a new
install's first session could not move or modify a multi-service visit or untick
a calendar from a service, and `eas update:roll-back-to-embedded` would have put
every user back on that bundle. It also still reads the retired
`card_hold_deposits` flag, which is why the web keeps its compatibility shim.

**Nothing native changed.** Against the `ce1d85c` binaries, `app.json` differs by
its two version strings; `app.config.js`, `eas.json` and `patches/` are
unchanged; and `package.json` / `package-lock.json` add one pure-JavaScript
dependency, `libphonenumber-js`. Same `expo@56.0.16`, same `react-native@0.85.3`.

**The runtime moves to 1.1.1.** `appVersion` stays the policy (pinning the runtime
string at 1.1.0 was considered and declined). An update published from this
commit on reaches nobody until 1.1.1 is installed from a store, and the last
1.1.0 update ("ResNeo Linked venue action buttons", group `347b2217`, at
`d90dece`) stays served to 1.1.0 installs. See the 2026-09-15 run in
`Docs/GO_LIVE_CHECK.md`.

Requires no backend change.

### Play Store — "What's new" (473/500)

```
New: Ask ResNeo, a help assistant at the top of More.

Visits with several services: choose every service first, then a time the whole visit fits. Each service has its own calendar bar with its own Start and Complete, and a booking opens with a summary of each service, the total and what is still owed.

Plan a calendar's hours ahead, and change one day's hours from the calendar.

Also: a Revenue report, optional phone numbers with a country code picker, and many fixes.
```

### App Store — "What's new" (3,176/4,000)

Paragraphs are unwrapped so the block pastes straight into App Store Connect. The
first item under **Fixed** is iOS-only: iOS drops a second sheet opened over an
open one (R29-6 in `Docs/APP_GAP_REPORT_R29_WEB_DELTA.md`), which is why the Play
copy leaves it out.

```
Ask ResNeo

A help assistant at the top of More. Ask how to do something and it answers with the steps for the app, using your venue's plan and settings, and tells you when a job can only be done on the web. It can't change anything, and a question it can't answer can go to Support with the conversation attached.

Visits with several services

Choose every service first, then pick from the times when the whole visit fits. On the calendar each service now has its own bar, marked 1/2, 2/2 and so on, in its own status colour, and you start, complete, move and resize each one separately. A visit's services can be on different days or calendars. A booking opens with a summary of every service, with its time, status and price, then the total and what is still owed. The Modify form edits each service on its own.

Hours

The availability screen is organised into tabs: Calendars, Availability, Breaks, and Closures & amended hours. Plan a calendar's hours ahead from a date you choose, give a calendar different hours on particular days, and look back at past changes. The clock button on the calendar takes you straight to changing a day's hours. The calendar follows each calendar's planned and amended hours, and closures and leave are drawn in their own colours with the label you chose.

Bookings and services

A phone number is optional on staff bookings, and the phone field has a country code picker. Tick Override availability to book outside a calendar's availability on purpose. Processing time can carry on after a service ends, and services are grouped under your categories. When a booking is missing a compliance requirement, the app says which items are required and which are only advised. A calendar can stop offering a service and keep its bookings, or move them to another calendar. Card hold is an option for every venue.

Contacts and reports

A contact's Documents are now Records, with photo thumbnails, a viewer and several files uploaded at once. When the contacts list is hiding guests who have no contact details, it says so and lets you show them. Reports gain a Revenue tab and a client list.

Venues that work together

In a collective you can book for the whole collective wherever you take a booking, and linked partners' calendars sit beside your own as columns. Drop a booking on another account's calendar and the app offers to rebook it there.

Signing in

If you have more than one account, such as staff and customer, the app asks where you would like to go. Password fields have a show and hide button.

iPad

Sheets open as a card in the middle of the screen instead of stretching edge to edge, the tiles on More and Today sit three or four across, and the month picker fits in landscape.

Fixed

Saving hours could fail without a word when the change needed a "Save anyway?" confirmation. The Modify form's availability check now works while you edit. Changing your password from the app no longer fails. Bulk messages to contacts count only what was really sent, and respect each guest's marketing permission. A booking no longer counts itself as a previous visit, and the + button starts a booking on the day you are looking at.
```

**Ask ResNeo.** The help assistant the web dashboard gained is in the app, at the
top of **More** where the settings search field used to be. It answers how-to
questions from the ResNeo help centre, made specific with this venue's plan and
settings and the person's role, and it knows it is answering somebody on the app,
so the steps it gives are the app's steps and it says when a job can only be done
on the web. It cannot change anything, and a question it cannot answer can be
handed to Support with the conversation attached. The settings search went to
make room for it. The assistant is switched on server-side, so until it is turned
on for a venue the row says so and points at the Support form.

**Tablets.** Ask ResNeo answered in a phone-width column on a tablet, with the
"Was this helpful?" row and "Send this to support" hidden behind the answer. An
answer bubble was sized by its own content, and a numbered step contributes
nothing to that, so with room to spare the bubble collapsed to the longest plain
line it happened to hold — and having been measured at one width and drawn at
another, the text ran over the row underneath. The answer now fills a column of
its own, capped so a line stays readable rather than running the full width of
the window, and Support does the same. Sheets stop at a card in the middle of a
tablet instead of stretching edge to edge, and the tile grids on More and Today
lay out three or four across where there is room for them rather than two.

### Added

- **Visits across services, days and calendars.** One calendar bar per service,
  chipped "1/2", each in its own status colour and started, completed, dragged
  and resized on its own; a visit's services may sit on different days and
  calendars; the Modify sheet edits each service separately; a partner's visit
  shows every service with the same per-service actions.
- **Every service first.** The staff wizard takes all the services before a time,
  and offers only times where the whole visit fits.
- **The visit at the top of the booking panel.** Each service's time, length,
  status and price, the total, and what is owed.
- **Hours.** The availability screen as the web's four tabs; a calendar's hours
  planned ahead (schedule periods); amended hours for particular days, edited
  beside closures; past schedule changes behind a toggle; the clock button on
  every calendar view; calendars that follow their rotas and their planned and
  amended hours; closure and leave stripes in the web's colours, carrying their
  label; advice after a save when calendar and business hours disagree.
- **Bookings.** A phone is optional on every staff booking, with a country-code
  picker; "Override availability" on the staff wizard; processing time that runs
  past the end of a service; bookings nested inside a processing gap.
- **Services.** Grouped under the venue's categories in booking-page order, with a
  Categories manager; a calendar can stop offering a service and keep its
  bookings, with a per-group move to another calendar.
- **Contacts and reports.** Documents became Records (thumbnails, a viewer,
  several files at once); the contacts list says when its filter hides guests and
  offers to show them; how each booking was made, on the guest history; Revenue
  and Clients tabs in Reports, with ticket tiers, resource and table utilisation
  and the web's CSVs.
- **Collectives and linked venues.** Staff booking for a collective from every
  entry point; a partner's columns named after its calendars, and working like
  your own under a full-details-and-edit grant; a linked booking's compliance,
  guest history and Records; a drop on another account's calendar offers a rebook
  and then a cancel of the original; collective service sync and an About section
  in the combined-page manager; the Booking page screen opens on the combined
  page.
- **Sign-in.** An account chooser for a person with staff and customer (or
  superuser) accounts; a show / hide toggle on every password field.
- **Messaging.** The composer's length hint and the guest's marketing permission.

### Changed

- One bar per service replaces 1.0.7's one bar per visit, as on the web.
- Compliance never blocks staff: each unmet requirement shows as required or
  advisory, and the "Book anyway" override is gone because nothing refuses.
- Card hold is a standard payment option for every venue (the
  `card_hold_deposits` flag is retired), and the staff card-hold toggle starts
  off.
- Bulk messages from contacts go out guest by guest, respect marketing
  permission, and are branded again (email) and venue-prefixed (SMS).
- The booking wizard counts three phases instead of a growing step total; "Plan
  hours ahead" starts at the coming Monday; every two-tap confirm stays armed for
  eight seconds.

### Fixed

- iOS: saving hours that needed "Save anyway?" did nothing, because the question
  opened as a second sheet over the hours sheet and iOS dropped it.
- The Modify form's live availability check 400'd on every ordinary edit, so it
  had never worked.
- Changing your own password failed at the last step, because the staff route
  cannot serve the app's Bearer token; it now goes through `/api/account/password`.
- The contacts bulk message counted guests with no contact details, and failed
  deliveries, as sent.
- The booking confirmation never showed its deposit notice.
- A booking counted itself as a previous visit; linked bookings were missing from
  the list, week and month counts; the money block could show half a total
  mid-refresh; a partner's booking had no service name in the panel.
- "+" started a booking on today instead of the day on screen.
- Lengthening a service without touching its processing periods reverted the
  length on save.
- The guest-details fields sat under the keyboard, and the month picker overflowed
  a tablet in landscape.

---

## iOS 1.1.0 / Android 1.1.0 — 2026-08-31

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

Built 2026-08-31 at `ce1d85c` (iOS build 22, Android build 16); its store copy
was not recorded here. Ask ResNeo and the tablet layout work were once listed
under this entry, but they reached users by OTA after these builds, so they now
sit under 1.1.1.

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
