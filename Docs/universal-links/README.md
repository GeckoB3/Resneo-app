# Universal / App Links — hosting deliverables

## F7 credentials: OBTAINED 2026-08-31

The two values this document sends you hunting for are now known. All three are
public by design: a Team ID and a signing-certificate fingerprint are published
in the very files below, on the open web.

| Value | |
| --- | --- |
| **Apple Team ID** | `4V8S56N4XX` (Jar 26 Ltd), read from the ad-hoc provisioning profile and cross-checked against its `application-identifier` `4V8S56N4XX.com.resneo.app` |
| **Play app-signing SHA-256** | `F5:5C:F0:06:D9:67:4B:49:CC:67:85:D3:C5:FC:57:C1:C4:5A:DB:8E:A5:8C:FD:5D:EC:15:62:DD:9A:9E:D4:F5` |
| **EAS upload-key SHA-256** | `7A:A6:B8:E3:2F:65:35:B5:42:DD:91:38:C1:D6:99:A1:22:37:29:51:BE:BA:BF:B4:57:90:D1:90:48:8B:CE:AF` |
| **Domain** | `www.resneo.com` |

**Both fingerprints belong in `sha256_cert_fingerprints`, not one.** The first is
what Google re-signs Play installs with; the second signs the internal
distribution APKs used for testing. Listing only the first means App Links fail
on exactly the builds you test with, and the association files get blamed for
it. Verified distinct, which is itself the proof that Play App Signing is
active. The `preview` and `production` profiles share one keystore
(`8xaSIRS85a (Default)`), so the upload key is a single entry rather than two.

**The domain is `www.resneo.com`**, not the `reserve-ni.vercel.app` still
written throughout the rest of this document. That is the fallback base URL for
every link the web emails and the app's production API host. The apex
`resneo.com` currently 307s to www, and neither platform follows redirects when
verifying, so declaring the apex would additionally require it to serve these
files directly.

## DONE 2026-08-31. All three steps complete.

1. **The web serves both files**, verified on production: 200,
   `Content-Type: application/json`, no `location` header, and the BODIES
   checked rather than only the headers, since a 200 serving the wrong JSON
   passes a header check and fails verification silently. Correct Team ID, both
   fingerprints, right package, and the exclusion present.
2. **`app.json` restored**: `ios.associatedDomains: ["applinks:www.resneo.com"]`
   and an `autoVerify` https intent filter for the same host. The `resneo://`
   filter is a SEPARATE entry and untouched, so magic-link sign-in is unaffected.
3. **A build is what remains.** Native config cannot ship over the air.

**The Android filter is path-restricted**, to `/account/bookings`,
`/account/passes`, `/account/profile` and `/account`. Without that it would
claim every page on `www.resneo.com`, so a tap on the marketing site or the
venue dashboard would open the customer app.

**The apex is deliberately not claimed.** `resneo.com` still 307s to www, and
neither platform follows a redirect when verifying.

**Android's matching is coarser than Apple's**, which needed handling.
`pathPrefix: '/account/bookings'` also matches `/account/bookingsXYZ`, and
Android has no equivalent of the AASA's `exclude`, so a claimed-but-unroutable
path can reach the app. `webUrlToAppRoute` therefore sends anything else under
`/account` to the customer hub rather than passing it through to a not-found.

## Superseded: what used to block this

**The app cannot yet serve the paths these files would claim.** The web portal
lives at `/account/bookings`, `/account/bookings/{id}`, `/account/passes` and
`/account/profile`; the app's routes are `/bookings`, `/booking/[id]`,
`/passes` and `/profile`. A universal link to a web URL therefore arrives as a
path Expo Router cannot resolve, and the tap opens the app on a not-found:
worse than opening the browser, which would at least have shown the booking.

Reconciling the two URL shapes is C6's work. Filling these files in before that
would publish claims the app cannot honour, which is the same class of mistake
as restoring `app.json` before the files are served.



> **STATUS (2026-08-09): the app side has been REMOVED — this doc describes a
> future state, not the current build.**
>
> `ios.associatedDomains` and the Android `https` intent filter (with
> `autoVerify: true`) were deleted from `app.json`, because neither association
> file was ever served: `https://www.resneo.com/.well-known/assetlinks.json` and
> `.../apple-app-site-association` both return **404**, and the apex only 307s to
> www — which Android does not follow when verifying. A FAILED verification is
> worse than none on Android 12+: the app is not offered as a handler at all, so
> the links opened Chrome regardless.
>
> Nothing depends on this today. Invite receiving is deliberately manual-paste,
> and the `resneo://` custom scheme (which auth and notification taps use) is
> untouched and still works.
>
> The two files below are still the correct deliverables. To turn the feature on:
> serve them as real 200s on **both** www and apex (no redirect), with the
> production signing cert's SHA-256 fingerprint, then restore the app.json config.
> Note the host below is the old **staging** domain and would need updating too.

These two files make `https://reserve-ni.vercel.app/booking/<id>` open **in the
Resneo app** (iOS Universal Links / Android App Links) instead of the browser,
matching the in-app notification-tap routing to `/booking/{id}`.

**CORRECTION (2026-08-31): the app side is NOT configured.** The two entries
below were deleted on 2026-08-09, as the status block above says, and restoring
them is the LAST step rather than a done one. What they should read when they
come back is the production host, not the staging one:

- **iOS** — `ios.associatedDomains: ["applinks:reserve-ni.vercel.app"]`.
- **Android** — a verified `https` intent filter for host `reserve-ni.vercel.app`
  with `autoVerify: true` (action `VIEW`, categories `BROWSABLE` + `DEFAULT`).

The remaining work is **hosting** — and that lives on the website, not in this
repo.

## What the web team must host

Serve each file at its well-known path on the apex domain users actually tap,
with **no redirect** and the correct `Content-Type`:

| File                                          | URL                                                                 | Content-Type        |
| --------------------------------------------- | ------------------------------------------------------------------- | ------------------- |
| `apple-app-site-association` (no extension)   | `https://reserve-ni.vercel.app/.well-known/apple-app-site-association` | `application/json`  |
| `assetlinks.json`                             | `https://reserve-ni.vercel.app/.well-known/assetlinks.json`           | `application/json`  |

Requirements (both platforms validate these strictly):

- **HTTPS only**, served from the **same domain** declared in `app.json`
  (`reserve-ni.vercel.app`).
- **No redirects** — Apple fetches the AASA without following 3xx. A
  `www`→apex (or http→https) redirect will silently break Universal Links.
- The AASA file has **no `.json` extension** and must **not** be signed (plain
  JSON is correct on modern iOS).
- `Content-Type: application/json` on both (Vercel serves `.json` as JSON;
  the extension-less AASA needs an explicit header — see below).

### Vercel hosting notes

Put both files under the site's `public/.well-known/` directory. Because the
AASA file has no extension, add an explicit header in `vercel.json` so it is
served as JSON:

```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ]
}
```

`assetlinks.json` already gets `application/json` from its extension. Do not add
a catch-all rewrite that swallows `/.well-known/*` (e.g. an SPA fallback to
`index.html`) — exclude that path from any rewrite.

## Placeholders to fill before shipping

Both files contain `TODO` placeholders that **must** be replaced with the real
release-signing values, or verification fails silently:

### iOS — `<APPLE_TEAM_ID>` in `apple-app-site-association`

The 10-character Apple Developer **Team ID**. Find it via either:

- App Store Connect → **Membership** (top-right), or
- `eas credentials` → select the iOS app → the Team ID is shown with the
  distribution certificate.

Final `appIDs` entry looks like `ABCDE12345.com.resneo.app`.

### Android — `<SHA256_FROM_EAS_CREDENTIALS>` in `assetlinks.json`

The **SHA-256 fingerprint of the signing certificate** the shipped APK/AAB is
signed with. Get it via:

```sh
eas credentials
# → Android → (select profile) → Keystore → "SHA-256 Fingerprint"
```

Use the colon-separated upper-case hex string verbatim, e.g.
`AA:BB:CC:DD:...`.

> **Both values are already recorded at the top of this document**, so the
> instructions above are history rather than work.
>
> The console path they name has moved TWICE since: App integrity became
> **Protected with Play**, and signing now sits behind
> *Protected with Play → Play Store protection → Protection → Manage Play App
> Signing*. Expect it to move again. The route that does not rot is the **Digital
> Asset Links JSON** block on the Deep links page
> (`play.google.com/console/about/deeplinks`), which emits the whole file with
> the app-signing fingerprint already in it, or downloading
> `deployment_cert.der` and running
> `openssl x509 -inform DER -in deployment_cert.der -noout -fingerprint -sha256`.
>
> The distinction the original note draws is the important part and still holds:
> Google re-signs Play installs with its OWN key, so the upload key alone is the
> wrong answer.

## Verifying after deploy

- iOS: `curl -i https://reserve-ni.vercel.app/.well-known/apple-app-site-association`
  → expect `200`, `Content-Type: application/json`, no redirect.
- Android: Google's verification can be checked with
  `https://developers.google.com/digital-asset-links/tools/generator` or the
  Play Console's Deep Links section after a build with the real fingerprint is
  uploaded.
- On device, a fresh install + tapping a `https://reserve-ni.vercel.app/booking/<id>`
  link should open the app on the booking detail screen.
