# Universal / App Links — hosting deliverables

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

The **app side is already configured** in `app.json`:

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

> If **Play App Signing** is enabled (it is, for new Play uploads), Google
> re-signs the app with its own key. The fingerprint that must appear here is
> then the **app-signing certificate** SHA-256 from Play Console →
> *Setup → App integrity → App signing*, **not** the upload key. When in doubt,
> list **both** the upload and Play app-signing fingerprints in
> `sha256_cert_fingerprints` so verification passes regardless of which key
> signs the binary the user installs.

## Verifying after deploy

- iOS: `curl -i https://reserve-ni.vercel.app/.well-known/apple-app-site-association`
  → expect `200`, `Content-Type: application/json`, no redirect.
- Android: Google's verification can be checked with
  `https://developers.google.com/digital-asset-links/tools/generator` or the
  Play Console's Deep Links section after a build with the real fingerprint is
  uploaded.
- On device, a fresh install + tapping a `https://reserve-ni.vercel.app/booking/<id>`
  link should open the app on the booking detail screen.
