# Staging setup for mobile development

Use this checklist when testing the ReserveNI mobile app against a deployed `reserve-ni` backend (e.g. Vercel preview).

---

## 1. Mobile `.env.local`

```env
EXPO_PUBLIC_SUPABASE_URL=<same as staging web>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<same as staging web>
EXPO_PUBLIC_API_URL=https://your-staging-domain.vercel.app
```

- No trailing slash on `EXPO_PUBLIC_API_URL`.
- Supabase values must match **Vercel environment variables**, not only your local web `.env.local`.
- Restart Expo after changes: `npx expo start --clear`.

See also [ENV.md](./ENV.md).

---

## 2. Vercel Deployment Protection

If incognito visits to `/api/venue/dashboard-home` show a **Vercel login page** (not JSON), mobile API calls will fail with HTML parse errors.

**Fix:** Vercel → project → **Settings → Deployment Protection** → disable for Preview/staging, or restrict protection to Production only.

**Verify:** Incognito should return JSON:

```json
{"error":"Unauthorised"}
```

Not an HTML login page.

---

## 3. Bearer auth on staging (Phase 0.5)

Mobile sends `Authorization: Bearer <jwt>`. Staging must have venue routes migrated per [WEB_BEARER_AUTH_MIGRATION.md](./WEB_BEARER_AUTH_MIGRATION.md).

**P0 (read paths):** venue, staff/me, dashboard-home, bookings list/detail, guests list/detail.

**P1 (create paths):** appointment-availability, POST bookings, POST bookings/walk-in.

Copy patches from `_reference/reserve-ni` into your production repo and redeploy.

---

## 4. Quick API smoke tests

While logged into staging in a browser:

| URL | Expect |
|-----|--------|
| `/api/venue/staff/me` | JSON staff profile |
| `/api/venue/dashboard-home` | JSON dashboard payload |

Incognito (no cookies):

| URL | Expect |
|-----|--------|
| `/api/venue/dashboard-home` | JSON `401` — **not** HTML |

With Bearer token (PowerShell):

```powershell
curl.exe -H "Authorization: Bearer YOUR_TOKEN" https://your-staging.vercel.app/api/venue/dashboard-home
```

Expect dashboard JSON.

---

## 5. Expo Go vs development build

| Feature | Expo Go | Dev build (`npx expo run:android`) |
|---------|---------|-------------------------------------|
| Core app + API | Yes | Yes |
| Push notifications | No (SDK 53+) | Yes |
| SDK 56 | May need special Expo Go build | Yes |

For day-to-day API testing, Expo Go is fine once staging is configured correctly.

---

## 6. Common errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Failed to connect to localhost:3000` | Phone cannot reach PC localhost | Use staging URL or PC LAN IP |
| `Expected JSON but received HTML` | Vercel protection or wrong URL | Disable protection; check URL |
| `401` on all venue routes | Bearer auth not deployed | Apply Phase 0.5 patches |
| Sign-in works, Today empty/errors | Supabase mismatch mobile vs Vercel | Align env vars |
