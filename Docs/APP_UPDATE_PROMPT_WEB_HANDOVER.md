# App update prompt: web handover (2026-10-07)

From the app repo (`C:\Resneo-app`), for the web repo (`C:\Resneo`, `staging`). One small, static
file. Nothing to build in the dashboard, no database change, and no route.

## Why

iOS is about to move to **1.2.0** (Tap to Pay on iPhone) while Android stays on **1.1.2**. The app's
over-the-air updates only reach installs on their own runtime, so once `main` says 1.2.0, nothing we
publish reaches iOS 1.1.2 installs again. To tell those users a new version is in the App Store, the
app (from its next 1.1.2 update on) reads a small file from the website and shows "A new version is
available", or "Update required", from it.

The file is the switch. Changing it is a web deploy, not an app release.

## What to add

**`public/app-version.json`**, served at `https://www.resneo.com/app-version.json` (and at the same
path on staging, which the app's preview builds read):

```json
{
  "ios": { "latest": "1.1.2", "minimum": "1.1.0" },
  "android": { "latest": "1.1.2", "minimum": "1.1.0" }
}
```

Ship it with exactly these values. With `latest` equal to what is installed, **nobody sees anything**;
the prompt is dormant until we change it.

| Field | Meaning in the app |
|---|---|
| `latest` | The version in that store now. Installs **below** it get a prompt with **Update** and **Not now**. "Not now" puts it off for three days, per version. |
| `minimum` | The oldest version that still works against the server. Installs **below** it get a full-screen **Update required** with no way past. Leave it at `1.1.0` unless an old build is genuinely broken. |
| `message` | Optional, at most 300 characters, one line under the heading. Omit it unless asked. |

Versions are `1`, `1.2` or `1.2.0` strings. Anything else, a missing file, an HTML error page or a
network failure all mean **no prompt**: the app fails open. A `minimum` above `latest` is treated as a
typo and never blocks anyone.

## Two things to check

1. **Middleware.** `src/middleware.ts`'s matcher excludes `.well-known` and image extensions but not
   `.json`, so it runs on this path. Please confirm an unauthenticated `GET /app-version.json` answers
   **200 with the JSON** and never a redirect to sign-in. If there is any doubt, exclude it in the
   matcher the same way `.well-known` is:
   `'/((?!_next/static|_next/image|favicon.ico|\\.well-known|app-version\\.json|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'`.
2. **Caching.** The app asks with `Cache-Control: no-cache` and re-checks at most hourly, but a CDN
   copy could still hold an old file. A short cache is plenty, for example in `next.config.ts`
   `headers()`:

   ```ts
   {
     source: '/app-version.json',
     headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }],
   },
   ```

   Keep it alongside the catch-all security headers. Next.js merges both, which is fine here.

## When it changes later

Only the app owner changes the values, and only on these occasions:

- **iOS 1.2.0 is released in the App Store:** `"ios": { "latest": "1.2.0", "minimum": "1.1.0" }`,
  optionally with `"message": "Take contactless payments with Tap to Pay on iPhone."` (Apple's name,
  verbatim). Android stays as it is.
- **Each later store release:** raise that platform's `latest` once the store has actually released
  it, never before. A `latest` the store does not have yet sends people to a listing with no update.

## Done when

- `curl -i https://reserve-ni.vercel.app/app-version.json` and
  `curl -i https://www.resneo.com/app-version.json` both answer `200`, `Content-Type:
  application/json`, the body above, and no redirect. Today both answer `404`.

## App side, for reference

Built 2026-10-07 in the app: `lib/app-update/version-policy.ts` (the rules, unit-tested),
`lib/app-update/app-update-runtime.ts` (fetch, installed version, "Not now", store links) and
`components/app-update/AppUpdatePrompt.tsx`, mounted in `app/_layout.tsx`. It reads
`{EXPO_PUBLIC_WEB_URL or EXPO_PUBLIC_API_URL}/app-version.json`.
