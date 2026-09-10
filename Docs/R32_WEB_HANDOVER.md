# R32 web handover: the staff change-password route cannot serve a Bearer caller (2026-09-10)

From the app repo (`C:\Resneo-app`), for the web repo (`C:\Resneo`, `main` at `d2038097`, #190).
Nothing here blocks the app: it has already moved off the route. This is a one-route fix so the
web does not keep a path that silently fails for every non-cookie caller.

## What happened

A staff member opened their profile from the Team page in the app, typed a new password twice and
pressed Update password. The app answered with "Auth session missing" (reported as "Auth session
not active in app"). The same change works on the web.

The app was posting to `POST /api/venue/staff/change-password`
(`C:\Resneo\src\app\api\venue\staff\change-password\route.ts`). That route calls
`supabase.auth.updateUser({ password, data })` on the client from `createVenueRouteClient(request)`.
`updateUser` reads the session from cookie storage, and a Bearer request carries no cookie
session, so GoTrue refuses and the password never changes. The route's own `getUser()` check
passes (it reads the Bearer), which is why the failure only shows at the update.

You fixed exactly this on `POST /api/account/password` (`src/app/api/account/password/route.ts`,
P0-12): it takes the caller's token with `getCallerAccessToken(request, supabase)` and updates
through `updateAuthUserAsCaller(accessToken, { password, data: { has_set_password: true } })`
(`src/lib/auth/caller-auth.ts:36, :59`), which works for cookie and Bearer callers alike.

## What the app did

App commit `f243ff1` (2026-09-10): `useChangeOwnPassword` (`lib/queries/useTeamMutations.ts`) now
posts `{ password }` to `/api/account/password` with the Bearer. Both places that change the
user's own password in the app share that hook: the My account sheet on the Team page and the
first-run set-password screen. A hook test pins the route and the body. No web change is needed
for the app to work; the route is live and answers `{ ok: true }`.

## The ask: give the staff route the same treatment

In `src/app/api/venue/staff/change-password/route.ts`, replace the `supabase.auth.updateUser(...)`
call with the caller-auth pair the account route uses:

```ts
const accessToken = await getCallerAccessToken(request, supabase);
if (!accessToken) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
const { error: updateErr } = await updateAuthUserAsCaller(accessToken, {
  password: parsed.data.new_password,
  data: { has_set_password: true },
});
```

Two details to keep:

- The staff route spreads the existing `user.user_metadata` into `data`. GoTrue shallow-merges
  `data` into `user_metadata`, so `{ has_set_password: true }` alone is enough, as the account
  route already relies on (its comment says so). Drop the spread or keep it; both are correct.
- Keep the `same_password` mapping to the 400 "New password must be different from the current
  one".

Or, if you would rather not keep two routes that do the same thing, retire the staff route and
point `StaffPersonalSettingsSection.tsx:149` and `StaffSection.tsx` at `/api/account/password`
(body `{ password }`, answer `{ ok: true }`). The app no longer calls the staff route either way.

A test in the shape of `src/app/api/mobile-401-contract.test.ts` that posts with a Bearer and no
cookie would have caught this; the account route's fix commit may already have one to copy.

## When

At your convenience. Nothing in the app waits on it. If the staff route is retired, say so and
the app will drop its comment that still names it.
