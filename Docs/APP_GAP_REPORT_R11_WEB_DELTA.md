# App Gap Report R11 — Web delta audit (resneo `9439f7ad..38a7f64f`)

**Date:** 2026-08-08
**Scope:** every web commit since the app's last recorded parity point (`9439f7ad`, the 2026-08-03 web-parity batch): staging squashes #122, #124, #127, plus #125, #126, #128.
**Verdict:** the app is in materially good shape against this delta. The bulk of #127 is a security-remediation batch (see the web's `Docs/Resneo_Remediation_Register.md`) whose fixes are server-side and reach the app automatically, plus an em-dash copy sweep. Two real gaps, two hygiene items.

---

## 1. Already covered — no action

| Web change | Why the app is fine |
| --- | --- |
| #125/#128 in-person payment cancel (`action: 'cancel'` + `payment_intent_id` on the charge route) | App commit `3d26122` (same day) speaks exactly this contract — `lib/queries/useTakePayment.ts:73` |
| #126 walk-in on linked calendar columns | App commit `2134484`, explicit parity. App linked columns also correctly offer no "Block time", matching the web's deliberate omission |
| #124 (pricing calculator, solutions SEO page, welcome email) | Website/marketing surface — lives in `C:\Resneo`, out of app scope |
| Q-17 stale staff calendar: `/api/venue/appointment-calendar` cache went `private, max-age=45, swr=120` → `private, no-store` | Server-side; the app fetches the same route and RN's HTTP stacks (OkHttp/NSURLSession) honour Cache-Control, so the app had the same ≤165 s staleness window and is now fixed for free |
| P-04 + feed hardening: linked-calendar feed and `bookings/[id]` now null `special_requests`/`internal_notes`/guest contact/communication `recipient` for linked viewers without the PII grant | `LinkedBookingDetailSheet` truthy-gates both note fields (lines 343–358) and never renders communications; own-venue detail is untouched (`redactPii` is false for own venue) |
| P-03 linked guest enumeration: `linked-calendar/guests` now requires `q` ≥ 2 chars, email matches prefix-only | No live app surface calls it — cross-venue booking goes through the app's own wizard (`/booking/new` scoped to `ownerVenueId` → `/api/venue/bookings`); only the unconsumed `useLinkedGuests` hook references the route (see §3) |
| C-07 guest merge dropping the customer's account link (`merge_guests_into` RPC rewritten) | App merges via the same `/api/venue/guests/merge` route → fixed server-side |
| G11c magic-link throttling (429s on `/api/auth/send-magic-link`) | The app never calls that route — `AuthProvider.signInWithEmail` sends OTP directly via `supabase.auth.signInWithOtp`, which sits behind Supabase's own limiter |
| #122 Google-review toggle refusal bug (user-scoped read came back empty → "add your link first") | Server-side fix in `/api/venue` PATCH; benefits the app's enable toggle. The related web UI state-sync bug (typed vs stored link) doesn't exist in the app — `manage/communications.tsx` normalises client-side with the shared `normaliseGoogleReviewUrl` and resyncs from the venue query |
| `guests.name` column dropped (migration `20260810120000`; routes stopped selecting it) | App never reads or writes `name` on guest objects — first/last throughout |
| Em-dash copy sweep across API error strings, emails, push bodies | Error strings and email/push copy are server-composed; the app surfaces API `error` text directly, so it inherits |
| Delivery-health reconciliation (`lib/communications/delivery-health.ts`) | Surfaces only in `/super/comms` (platform admin) — not a venue-staff surface |
| Web login/redirect hardening (S-02 `safe-auth-redirect`), magic form UX, `choose-destination` | Web-only auth surfaces |
| Customer portal changes (account pages, courses checkout), import hub, floor plan, table combinations, onboarding step | Existing deliberate app exclusions (portal is customer-facing; import/tables/onboarding deferred by decision) |

## 2. Gaps — app work items

### R11-1 · Booking-page photo framing (web #122) — **Medium** — **BUILT 2026-08-08**
The web booking-page editor gained pan/zoom framing (`BookingPageImageFraming`) in three places the app didn't have:
- **Per-service photos** — `booking_page.service_photo_crops` (keyed by service id), edited via the new draggable `BookingPageDraggableImage`.
- **Team member photos** — `team_profiles[id].photo_crop` (framed inside the fixed circle).
- **Collective pages** — item photo framing kept on the combined page config keyed by item id. Stays web-only: the app's `CombinedPageConfigEditor` covers collective branding (logo/cover) but has never managed offering photos, a pre-existing scope decision, not a regression.

App state before the build: `lib/booking/bookingPageConfig.ts` had `logo_crop` + `cover_crop_box` only; `ServicePhotosSheet`/`TeamProfilesSheet` offered no framing. (`BookingPagePreview` mocks only the header — cover/logo/brand — so it never rendered service/team photos and needed no change; the framing shows on the sheets' own thumbnails instead.)

Not a data-safety issue: the web PATCH merge-patches config, so app saves never clobbered web-set crops (and `service_photos: null` correctly cascades the crops away).

**Built as:** `service_photo_crops` + `photo_crop` types and `framingTransform`/`servicePhotoCropsForSave` helpers in `bookingPageConfig.ts`; the logo framing editor extracted to a shared `ImageFramingEditor` (circle/square frames) reused by `LogoFramingSheet` and embedded as an in-sheet mode step by `ServicePhotosSheet` ("Adjust" → PATCH the pruned crop map) and `TeamProfilesSheet` ("Adjust" → draft `photo_crop`, published with "Save team profiles") — a mode step, not a second Sheet, per the iOS no-stacked-modals rule. Replacing or removing a photo drops its framing in the same PATCH, matching the web ("a new photo starts centred"). Thumbnails in both sheets render with the framing applied.

### R11-2 · Account-deletion pending state + cancel — **Low/Medium** — **BUILT 2026-08-08**
Deletion is now genuinely cancellable: migration `20270103121000` deferred anonymisation from request time to the hard-delete cron, which is what made the long-standing `/api/account/delete-request/cancel` route (and the "you can cancel" email) honest. The web `account/security` page offers a "Cancel deletion request" button (blindly — it has no status read at all).

App state before the build: `DeleteAccountSheet` requested + pointed at the emailed cancel link, then signed out (correct — the server revokes the session). But a user who signed back in during the 30-day grace saw nothing and had no in-app cancel.

**Built as:** the Account screen now shows a pending-deletion banner (scheduled date + "Cancel deletion request") whenever the signed-in user is inside the grace window, and hides the delete CTA while one is scheduled. Status comes from reading the user's own `user_profiles.deleted_at` through the Supabase client — owner-readable under RLS (`user_profiles_select_own`), so no backend route was needed and the app actually does better than the web page's blind buttons. Cancel POSTs `/api/account/delete-request/cancel` (Bearer-capable, same `createRouteHandlerClient` as the request route) and invalidates the status query so the banner clears. The stale `useAccountDeletion.ts` doc-comment (claiming request-time anonymisation) is fixed as part of this.

## 3. Hygiene

- `lib/queries/useAccountDeletion.ts` doc-comment is now wrong: it says the route "immediately anonymises the user's linked guest PII" — since `20270103121000` it marks intent only; the cron anonymises at hard-delete time. Update the comment (behaviour is unchanged from the app's perspective).
- ~~`lib/queries/useLinkedCalendar.ts` `useLinkedGuests`: the comment claims "we gate on `enabled` so an empty/too-short query doesn't fire", but `enabled` has no length check.~~ **Fixed 2026-08-08 (R11-3).** Added `LINKED_GUEST_MIN_QUERY_LENGTH = 2` and the missing `enabled` check, matching the route's `MIN_QUERY_LENGTH`. Fixing the gate exposed a second defect: `placeholderData: (prev) => prev` carries data across query-key changes, so backspacing "sam" → "s" left the previous matches rendered under a query the gate now refuses to run — the placeholder is now only applied while the gate is open. The hook (plus `useCreateLinkedBooking`/`useLinkedVenueProfile`) remains dormant, which the doc-comment now says outright. A future consumer must still add the web's "Type at least 2 characters to search." affordance and its error surfacing (the web no longer hides failures behind "No clients found").
- Optional cosmetic: the web swept em-dashes out of user-facing copy (labels now use `.`/`,`/`:`/`·`). App screens that mirrored web strings verbatim now diverge slightly (e.g. collectives panel copy, service-form helper text). Adopt opportunistically — and never via PowerShell `Get-Content`/`Set-Content` (see the encoding-trap memory); the app's own copy style is otherwise its own call.

## 4. Method note

#127 is a squash; its granular commits (`b2c70c3f`, `48185536`, `a07a0813`, …) exist only in the register's narrative. Findings above were verified against the squashed diff (`6a2574cf~1..6a2574cf`) and the app working tree at `3d26122`.
