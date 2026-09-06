# R25 web handover: two calendar-availability routes for the app (2026-09-06)

The app's Calendar availability screen is being brought to parity with the web's
`/dashboard/calendar-availability` page. Two things that page shows come from routes the
app cannot call, because they build their Supabase client with `createClient()` (cookie
session only) rather than `createVenueRouteClient(request)` (Bearer, falling back to
cookies). The app sends `Authorization: Bearer <access_token>` and gets 401 from both.

## Ask

Swap the client in these two GET handlers, exactly as every other `/api/venue/*` route the
app uses already does (`practitioner-services/route.ts` is a good model):

1. `src/app/api/venue/calendar-entitlement/route.ts` — the plan pill ("3 / 5 on plan",
   "Unlimited calendars"), the "Add calendar" gate and the tier-specific limit copy.
2. `src/app/api/venue/calendar-column-conflicts/route.ts` — the "Conflict" pill and the
   "Resource availability overlap" box on a calendar card.

```ts
import { createVenueRouteClient } from '@/lib/supabase/venue-route-client';
// …
const supabase = await createVenueRouteClient(request);
```

Both handlers already take `request: NextRequest`; nothing else changes, and the web
dashboard's cookie session keeps working through the fallback.

## What the app does meanwhile

The app already reads both routes (`useCalendarEntitlement`, `useCalendarColumnConflicts`).
Until the swap lands, a 401 is treated as "unknown": no pill, no conflict box, and the
"Add calendar" button stays visible with the existing after-the-fact 403 handling. The
moment the routes accept the Bearer, the pill, the gate and the conflicts appear with no
app release.

## Not asked

- No new fields; the response shapes the web reads are the ones the app reads.
- The schedule-period editing (`schedule_periods` on PATCH `/api/venue/practitioners`),
  the service links (`PUT /api/venue/practitioner-services`) and the class, resource and
  event moves are all Bearer-ready already; the app uses them as of this round.
