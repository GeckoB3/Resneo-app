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

Two things in the app repo remain, and both wait on step 2:

- Restoring `ios.associatedDomains` and the Android intent filter in `app.json`.
- Wiring the web's `sendCustomerPush` to its call sites. That is web work too,
  but it is independent of these files: push uses the `resneo://` scheme and the
  notification payload, not universal links.
