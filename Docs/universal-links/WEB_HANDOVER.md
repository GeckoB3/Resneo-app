# Association files: what the web repo must serve

Everything on the app side is ready. This is the request to the web repo, and
it is the FIRST of three steps that must happen in order.

## The order, and why it is not negotiable

1. **Web serves both files** (this document).
2. **Verify** each returns 200, `application/json`, and no redirect.
3. **Only then** the app restores `ios.associatedDomains` and the Android
   `https` intent filter, and ships a build.

Doing 3 before 1 is what caused these files to be removed on 2026-08-09. On
Android 12+ a FAILED verification is worse than none: the app stops being
offered as a handler at all, so every link opens Chrome regardless, and the
symptom looks like the deep links "not working" rather than like a hosting gap.

## The two files

Serve verbatim from `Docs/universal-links/` in the app repo. Both are filled in
with real values; there are no placeholders left.

| Path | Content-Type |
| --- | --- |
| `https://www.resneo.com/.well-known/apple-app-site-association` | `application/json` |
| `https://www.resneo.com/.well-known/assetlinks.json` | `application/json` |

**As route handlers returning `NextResponse.json(...)`, not static files under
`public/`.** That is the web repo's own C12 constraint.

Constraints both platforms enforce strictly:

- **No redirect.** Neither Apple nor Android follows a 3xx when verifying.
- **The AASA has no `.json` extension** and must not be signed. Plain JSON is
  correct on modern iOS. It needs `application/json` set explicitly, since there
  is no extension to infer it from.
- **HTTPS, on the exact host declared in the app** (`www.resneo.com`).

## The middleware runs on these paths

`src/middleware.ts`'s matcher excludes `_next/static`, `_next/image`,
`favicon.ico`, `api/webhooks`, `api/cron` and image extensions. It does **not**
exclude `/.well-known/`, so it runs on both files.

Today that is harmless: production returns a clean 404 on both paths with no
`location` header, which shows the middleware passes them through rather than
redirecting. But that is an accident of the current logic, not a guarantee, and
**any middleware change that returns a 3xx on these paths breaks verification
silently.** The symptom would be deep links quietly opening the browser, weeks
later, with nothing pointing at the middleware.

Worth adding `.well-known` to the matcher's exclusion list while you are in
there. It costs one string and removes a whole class of future accident.

## The domain, and the apex

`www.resneo.com` only. That is the fallback base URL for every link the web
emails and the app's production API host.

`resneo.com` currently **307s to www**, which is fine as long as the app does
not declare the apex, and it will not. If the apex is ever added, it must serve
these files DIRECTLY rather than redirecting, or Android verification fails.

## What the AASA claims, and why the exclusion matters

The app now translates web URLs to its own routes in `app/+native-intent.tsx`,
so the file claims the WEB's paths:

| Claimed | Opens in the app as |
| --- | --- |
| `/account/bookings/*` | `/booking/{id}` |
| `/account/bookings` | `/bookings` |
| `/account/passes*` | `/passes` |
| `/account/profile` | `/profile` |
| `/account` | the customer hub |

Everything else under `/account/*` is explicitly **excluded**. That is
deliberate: the app has no screen for it, and opening the app on a not-found is
worse than opening the page that exists. If the portal gains a route the app
also gains, both this file and the translation need updating together.

## Verifying, after deploy

```sh
curl -sI https://www.resneo.com/.well-known/apple-app-site-association
curl -sI https://www.resneo.com/.well-known/assetlinks.json
```

Expect `200`, `content-type: application/json`, and **no** `location` header on
either. Android can additionally be checked with Google's Digital Asset Links
tester, or the Play Console Deep links page once a build declaring the domain
has been uploaded.

## Not part of this request

One thing in the app repo remains, and it waits on step 2: restoring
`ios.associatedDomains` and the Android intent filter in `app.json`.

---

# Part two: wiring `sendCustomerPush`

Separate work, and independent of everything above: push uses the `resneo://`
scheme and the notification payload, not universal links. Nothing here blocks
or is blocked by the association files.

## The app side is ready

- **The three channels exist**, created on every device at push registration:
  `customer-reminders`, `customer-booking-changes`, `customer-waitlist`. Their
  ids are pinned by a test on both sides.
- **A tap routes to the booking.** The payload's `data.booking_id` is parked and
  drained inside whichever navigator is mounted, and the customer stack now
  carries that handler as the staff stack always has.
- **Devices register with `audience: 'customer'`**, so `sendCustomerPush`'s
  filter has something true to select on.

## Where the three calls go

`sendCustomerPush` already exists in
`src/lib/communications/customer-push-notification.ts` and takes
`{ bookingId, guestId?, event, body }`. Its three events map to three places
that already send the customer an email, and the pattern to follow is
`sendStaffPush`, which is called from the same functions:

| Event | Call site |
| --- | --- |
| `reminder` | `src/app/api/cron/send-communications/route.ts`, where `pre_visit_reminder` is dispatched |
| `booking_changed` | `sendBookingModificationNotification` and `sendCancellationNotification` in `src/lib/communications/send-templated.ts` |
| `waitlist_offer` | `notifyAppointmentWaitlistOfferForEntry` in `src/lib/booking/notify-appointment-waitlist-offer.ts` |

## Four things it does NOT need

1. **No preference check.** `sendCustomerPush` consults P4-3's matrix itself,
   through `customerAllowsMessageOnChannel`. Checking again outside would be a
   second copy of a rule that can change.
2. **No try/catch.** It fails soft in every direction and returns a result
   rather than throwing. A push is a courtesy on top of an email that has
   already gone, and nothing here is worth failing a booking flow over.
3. **No device lookup.** It resolves booking to guest to user to devices itself,
   filtered to `audience = 'customer'`. Passing `guestId` when the caller
   already has it saves one query and is the only optimisation worth making.
4. **No confirmations.** The customer push events are deliberately these three.
   Confirmations and deposit requests have no controllable preference pair, so
   pushing them would be a message the customer cannot switch off.

## Ordering, and the body

**Send the email first, then the push.** `sendCustomerPush` cannot throw, so
this is habit rather than necessity, but it keeps the guarantee that the
message a customer relies on is never at the mercy of a courtesy.

The `body` is what shows on a lock screen. Keep it short, say what happened,
and name the venue rather than the service: the venue is what makes it
recognisable at a glance, and a service name on a lock screen is more detail
than a passer-by needs. No em-dashes, per the house copy rule.

Something like:

- reminder: `Your appointment at The Studio is tomorrow at 10:00.`
- booking_changed: `The Studio has changed your booking. Tap to see the new time.`
- waitlist_offer: `A place has come up at The Studio.`

## It will reach nobody at first, and that is expected

Every `user_devices` row today is `audience = 'staff'`, because the shipped
build sends no audience and the column defaults. Until a customer installs a
build that registers as one, `sendCustomerPush` returns `{ sent: false, reason:
'no_tokens' }` and does nothing. Wiring it now is what makes the app side a
client change rather than a change on both sides at once, so **do not treat
silence as a fault**.

## How to tell it works

`sendCustomerPush` returns a `reason` on every non-send: `no_guest`,
`no_account`, `suppressed`, `no_tokens`, `not_sent`, `send_error`. Logging that
at the call site is the cheapest way to distinguish "nobody has a customer
device yet" from "we are suppressing these by mistake", and the two look
identical from the outside.
