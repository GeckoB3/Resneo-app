# Web bearer auth migration (Phase 0.5)

**Status:** Applied in local reference clone only (`_reference/reserve-ni`).  
**Apply to production:** Copy the same patches into your real `reserve-ni` repository before the mobile app can authenticate against venue API routes.

---

## Problem

The ReserveNI mobile app sends `Authorization: Bearer <supabase_access_token>` on API requests. It does not send Supabase session cookies.

Most `/api/venue/*` route handlers used `createClient()` from `@/lib/supabase/server`, which reads auth from cookies only. Mobile calls to those routes returned `401 Unauthorised` even with a valid JWT.

The web app already had `createRouteHandlerClient(request)` in `src/lib/supabase/server.ts`, which accepts cookies **or** a bearer token. Venue routes needed to use that client instead.

---

## What changed

### 1. New helper — `src/lib/supabase/venue-route-client.ts`

Thin wrapper so venue routes import a dedicated name:

```ts
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function createVenueRouteClient(request: Request) {
  return createRouteHandlerClient(request);
}
```

### 2. P0 route handlers migrated

Each handler now:

1. Accepts `request: Request` (or `NextRequest`, which extends `Request`).
2. Calls `await createVenueRouteClient(request)` instead of `await createClient()`.

| Route | Methods updated |
|-------|-----------------|
| `/api/venue` | GET, PATCH |
| `/api/venue/staff/me` | GET, PATCH |
| `/api/venue/dashboard-home` | GET |
| `/api/venue/bookings/list` | GET |
| `/api/venue/bookings/[id]` | GET, PATCH, DELETE |
| `/api/venue/guests` | GET |
| `/api/venue/guests/[guestId]` | GET, PATCH |
| `/api/venue/appointment-availability` | GET |
| `/api/venue/bookings` | POST |
| `/api/venue/bookings/walk-in` | GET, POST |

### 3. Unchanged

- `createClient()` remains for Server Components, Server Actions, and routes that are web-only (cookie session).
- Mobile app files in this repo were not modified.
- `createRouteHandlerClient` implementation in `server.ts` was already present; no change required there.

---

## How to apply to production `reserve-ni`

1. Ensure `createRouteHandlerClient` exists in `src/lib/supabase/server.ts` (same as reference clone).
2. Add `src/lib/supabase/venue-route-client.ts` (copy from reference).
3. For each route file in the table above, in your production repo:
   - Replace `import { createClient } from '@/lib/supabase/server'` with `import { createVenueRouteClient } from '@/lib/supabase/venue-route-client'`.
   - Add a `request` parameter to handlers that lacked one.
   - Replace `await createClient()` with `await createVenueRouteClient(request)`.
4. Deploy the web app, then verify mobile auth against staging/production.

---

## Verification

After deploying, call any migrated route with a staff access token:

```http
GET /api/venue/staff/me HTTP/1.1
Authorization: Bearer <supabase_access_token>
```

Expect `200` with staff profile JSON. Without the header (and without a web session cookie), expect `401`.

---

## Next phases

Phase 0.5 covers **P0 read paths** plus **P1 booking create paths** needed for walk-in flows. Remaining `/api/venue/*` routes still use `createClient()` and will need the same migration as mobile features expand. See `Docs/MOBILE_BUILD_PLAN.md` for the full rollout order.
