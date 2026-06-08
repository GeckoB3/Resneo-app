# Environment variables

ReserveNI mobile reads **public** configuration from `.env.local` at dev/build time. Expo embeds `EXPO_PUBLIC_*` values into the JavaScript bundle — treat them like the web app’s `NEXT_PUBLIC_*` vars (safe for anon keys, not for secrets).

The mobile app uses the **same Supabase project and Postgres database** as [reserve-ni](https://github.com/GeckoB3/reserve-ni). Staff sign in against the same auth users; RLS and venue data are shared.

---

## Required variables

| Mobile (`.env.local`) | Web equivalent (`.env.local`) | Purpose |
|----------------------|-------------------------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Settings → API → Project URL) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon / publishable key (Settings → API) |
| `EXPO_PUBLIC_API_URL` | *(no direct equivalent)* | Base URL of the reserve-ni Next.js app |

Copy Supabase values **verbatim** from your web `.env.local` — only the prefix changes (`NEXT_PUBLIC_` → `EXPO_PUBLIC_`).

The mobile app also accepts `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as an alias for the anon key (see `lib/env.ts`).

### `EXPO_PUBLIC_API_URL`

Base URL for the reserve-ni **web backend** (Next.js). The mobile client calls `{EXPO_PUBLIC_API_URL}/api/venue/...` and `/api/v1/...` with a Supabase Bearer token — it does not talk to Postgres directly for venue APIs.

| Environment | Example value |
|-------------|---------------|
| Local dev (web on default port) | `http://localhost:3000` |
| LAN testing (phone + dev machine) | `http://192.168.x.x:3000` (your PC’s IP; web must listen on `0.0.0.0`) |
| Staging / production | `https://your-reserve-ni-domain.com` |

On a physical device, `localhost` points at the phone, not your PC — use your machine’s LAN IP or a deployed URL.

---

## Optional (future)

Not required for Phase 0–1 local dev. Add when you wire up builds or error reporting.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Expo Application Services project ID (from [expo.dev](https://expo.dev) after `eas init`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for client crash reporting |
| `SENTRY_AUTH_TOKEN` | Sentry upload token for EAS build source maps (CI / EAS secrets, not in the app bundle) |

Server-only web secrets (`SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, etc.) **must not** be copied into the mobile app.

---

## Windows setup

1. **Install dependencies** (once):

   ```powershell
   cd C:\path\to\ReserveNI-app
   npm install
   ```

2. **Create `.env.local`** from the template:

   ```powershell
   Copy-Item .env.example .env.local
   notepad .env.local
   ```

   Or in File Explorer: copy `.env.example`, rename the copy to `.env.local`, then edit.

3. **Fill in values** from your reserve-ni web repo’s `.env.local`:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=<same as NEXT_PUBLIC_SUPABASE_URL>
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<same as NEXT_PUBLIC_SUPABASE_ANON_KEY>
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```

4. **Restart Expo** after changing env vars (`npm start`). Metro reads `.env.local` on startup.

5. **Verify** (optional):

   ```powershell
   npm run typecheck
   npm run lint
   ```

`.env.local` is gitignored (see `.gitignore`). Never commit real keys.

---

## Reference

- Template: [`.env.example`](../.env.example)
- Runtime accessors: [`lib/env.ts`](../lib/env.ts)
- Web app clone for API/types: [`README.md`](../README.md#reference-web-app)
