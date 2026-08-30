# ResNeo App: Customer Mode

**The app-side half of the customer portal.** The ResNeo web side is complete and in production or on `staging`; its 18 customer routes are documented in the web repo at `Docs/MOBILE_API.md`. Nothing here needs a new web *endpoint*, but C3 onward do need existing ones reachable, which is not the same claim; see G1 below.

Written **2026-08-30** against `main` at `a34caf3`. Every claim in "What is actually there" was read from this repo today, not carried over from the web plan's description of it. Where the two disagree, this document is the one that looked.

**Reviewed 2026-08-30 against the full web source**, now available read-only at `_reference/Resneo` on `staging` at `0fcc6265`. The review changed three things and confirmed the rest; see "What the review found" below. Read that section before starting C3.

---

## Decisions taken

| # | Decision | Consequence |
| --- | --- | --- |
| **D1** | **One app, role decided at sign-in.** Staff land on staff tabs, customers on customer tabs, and someone who is both gets a switcher. | Reuses auth, the API client, push, and the design system. The staff gate stops being a wall and becomes a router. |
| **D2** | **Full parity with the web portal.** | Every surface Phases 1 to 4 shipped, not a subset. Sequenced below so the routing model is proved by the first slice rather than assumed for all of them. |
| **D3** | **Call `/api/account/*` directly where no v1 alias exists.** No bulk backfill. | Settles G1. No web-repo work for C3 to C5. **The convention is therefore mixed, deliberately:** use `/api/v1/me/*` for the 18 routes that have it, which is what the app already does for `devices`, and `/api/account/*` for the other 24. Do not rewrite working v1 calls to match, and do not add aliases to make the split tidy. If one route later needs a genuinely pinned shape, it gets an **adapter** at that point, driven by a real problem rather than by symmetry. |
| **D4** | **Adopt `@stripe/stripe-react-native` for native card entry.** | Settles G2. Full parity in one pass over the commerce screens. Costs a native dependency and a rebuild, and the Payment Element is re-provided per venue because each venue is its own connected account. |

**On D2.** Full parity commits to the mode model across every screen. The phase order below therefore front-loads the model itself: C1 ships the routing spine plus one screen and is a genuine decision point. If the model is wrong, it is wrong after C1 at the cost of one screen, not after C5 at the cost of fifteen.

---

## What is actually there

Read today. File anchors are current at `a34caf3`.

**Routing.** `app/_layout.tsx` puts `(app)` behind `<Stack.Protected guard={!!session}>` and `(auth)` behind its inverse. `app/(app)/_layout.tsx` is the staff gate: it renders `<StaffRequired/>` for `not_staff`, and that terminal state **replaces** the Stack.

**The role is already computed, and the customer case is thrown away.** `useStaffMe()` calls `GET /api/venue/staff/me`; the gate reads a 401 as `not_staff` and shows a dead end. In customer mode a 401 means "this person is a customer", which is the same signal put to a different use. This is the part of the web plan's "one `useMemo` and one branch" estimate that holds.

**What that estimate misses is where a customer lands.** `(tabs)` is staff tabs, and `not_staff` currently replaces the navigator precisely so the tabs do not mount and fire "a burst of doomed 401s for a non-staff user". Customer mode needs somewhere else to go, which is a route group, not a branch.

**Two global queries fire for any session, above the gate.** `VenueProvider` sits in `AppProviders` and calls `useVenue()` → `GET /api/venue`, gated only on `isBackendConfigured() && accessToken !== null`. `useStaffMe()` is the same shape. So a customer signing in today issues two doomed venue requests before any gate is consulted. `VenueLiveSyncProvider` is already inert without a `venueId` and needs nothing.

**A live defect, already in production.** `PushNotificationsProvider` registers the device on any session, gated on `userId` alone with no staff check, and **the app sends no `audience` field anywhere** (`grep audience lib/ providers/ components/` returns nothing). The web column therefore defaults to `'staff'`, and `sendStaffPush` selects it. Today that is a non-staff person on `<StaffRequired/>` silently registered as a staff device. Customer mode makes signing in as a non-staff person the normal case, so this is fixed first, in C0, not last.

**Deep links.** `app.json` declares `scheme: 'resneo'`, `ios.bundleIdentifier` and `android.package` both `com.resneo.app`, **`ios.associatedDomains` absent**, and Android `intentFilters` carrying only the `resneo://` scheme. There is no web domain declared, so the association files are not one credential away from working. F7 is necessary and not sufficient.

**Stack.** Expo v56 (`AGENTS.md`: read the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` before writing code). Expo Router, TanStack Query, `apiFetch` with Bearer and transparent token refresh, `expo-secure-store` session storage, Inter, a themed token set in `theme/`, jest via `jest-expo`, 193 test files.

---

## What the review found

Read against `_reference/Resneo` at `0fcc6265`. Three findings change the plan, four confirm it.

### G1. Two thirds of the customer surface has no `/api/v1` alias, and the gap is exactly C3 to C5

`/api/account/*` has 39 routes; `/api/v1/me/*` has 18. The 24 without an alias are not scattered, they are **the entire commerce family** plus most of account management:

`memberships`, `memberships/cancel`, `memberships/checkout`, `memberships/resume`, `credits`, `credits/purchase`, `credits/fulfill`, `courses`, `courses/enroll`, `courses/checkout`, `courses/cancel`, `courses/fulfill`, `class-recurring`, `class-recurring/[id]`, `class-commerce-venues`, `discover-class-venues`, `password`, `marketing-preferences`, `sign-out-everywhere`, `payment-methods`, `payment-methods/setup-intent`, `delete-request`, `delete-request/cancel`.

So this plan's original claim that the contract is settled and the expensive discovery is done **holds for C1 and C2 and is wrong from C3 on**. This is not a defect in the web work: it is the web plan's C7b rule working as designed, which aliases on demand "driven by a real consumer rather than by a sweep". This app is now that consumer.

**Settled by D3: call `/api/account/*` directly.** No web-repo work, and already proven, since `lib/queries/useAccountDeletion.ts` does exactly that today. The web plan's own C7b note observes that "the versioned path is not what makes the app work", and that a re-export "cannot hold a shape stable while the route it forwards to changes, so an alias is a name for a contract rather than the contract itself". A bulk alias would therefore have bought a tidier surface and no real protection.

### G2. Customer card entry needs an SDK this app does not have

Covered under Architecture above. **Settled by D4:** add `@stripe/stripe-react-native`, with the element re-provided per venue rather than configured once at the root.

**Only three routes need it.** The commerce family splits cleanly, and the split is worth knowing because it decides what can ship before the SDK lands if that ever becomes useful:

| Needs card entry | Server-only |
| --- | --- |
| `memberships/checkout` | `memberships/cancel`, `memberships/resume` |
| `credits/purchase` | `courses/enroll`, `courses/cancel` |
| `courses/checkout` | `class-recurring` |

Enrolling on a course with credits already held is server-only, so most of what a customer does with their passes needs no card at all.

On App Store policy, since it is the obvious worry: classes and appointments are real-world services, which Apple exempts from in-app purchase. Stripe is the correct mechanism here, not IAP.

### G3. `GET /api/v1/me/bookings/[id]` exists, returns the shared booking DTO, and is undocumented

The route serves **GET and DELETE**, and unusually it is a real implementation rather than a re-export, because no `/api/account/bookings/[id]/route.ts` exists. Its GET body **is** AD9's shared booking DTO, the same one the web detail page renders, which is the best available payload for C2's detail screen.

**The web's own `MOBILE_API.md` documents only the DELETE on that path.** That gap was introduced in P5-1, on the single route C2 depends on most, and wants fixing in the web repo. It blocks nothing here, since the route works regardless.

### Confirmed, no change needed

- **`claim_user_account()` is already called** on every sign-in, at `providers/AuthProvider.tsx:218` and `app/(auth)/callback.tsx:68`. The web documents this as a client obligation whose absence leaves a signed-in customer looking at an empty portal. It is met, with no work.
- **Every booking action is Bearer-aware.** They route through `runSessionBookingAction`, which builds its client with `createRouteHandlerClient`, which reads `Authorization: Bearer` alongside cookies. C2 is unblocked.
- **`CLIENT_TOO_OLD`, `LIMITED_SESSION` and `STEP_UP_REQUIRED` are reserved but unemitted.** Nothing in the web source raises them. Tolerate them in error handling; do not build flows for them.
- **The `409 { requires_confirmation, message }` shape is shared** between payment-method removal and the venue availability routes, so one handler in the app serves both.

---

## The central risk

**The role is asynchronous, and this app has a crash-loop history from exactly that.**

Two comments in the codebase record the same lesson from different sites. `app/_layout.tsx`: rendering a loading screen *in place of* the navigator left expo-router with nothing under `__root`, so a `router.push()` during the gap pushed a second `__root` and remounted the provider tree, which on **2026-08-16** ran at roughly 50 remounts per second until the app died. `app/(app)/_layout.tsx` repeats it: the transient check **covers** the Stack, and only the terminal state replaces it.

A naive customer mode reintroduces this. `<Stack.Protected guard={role === 'customer'}>` has a guard that is false on first render and true a round trip later, and a guard flipping false to true mounts a navigator mid-flight.

**The rule this plan works under:** role transitions never unmount a mounted navigator. Unknown role covers; only a resolved role routes. Every phase below inherits this, and C1 exists to prove it before anything is built on top.

---

## Architecture

**Role resolution.** One hook, `useRole()`, returning `'loading' | 'staff' | 'customer' | 'unknown'`, derived from `useStaffMe`: data means staff, a 401 means customer, any other error means unknown. It keeps the gate's existing survival tricks, which are load-bearing rather than incidental: `keepPreviousData` across the token-refresh re-key, and the five-second fail-soft. `'unknown'` must resolve somewhere sensible rather than trapping the user, and for a signed-in person with no staff profile the safe default is customer.

**Dual role.** `user_profiles.default_login_destination` already exists on the web (`'account' | 'dashboard' | 'ask'`) and is returned by `GET /api/v1/me/profile`. The app should read that field rather than invent a parallel preference, so a person who sets their landing page on the web gets it on their phone. `'ask'` is what the switcher is for.

**Route groups.** `(app)` stays exactly as it is and stays staff. A sibling `(customer)` group is added under the same session guard. Both mount only with a resolved role; while the role is loading, the existing cover-not-replace pattern holds.

**Providers.** `VenueProvider` and `useStaffMe`'s consumers become role-aware so a customer session stops issuing venue requests. The cheapest correct version gates `useVenue()` on `role === 'staff'` rather than restructuring the tree.

**Payments are native, not a browser handoff, and that has a cost.** All four money routes return a Stripe `client_secret` rather than a hosted Checkout URL: `payment-methods/setup-intent`, `credits/purchase`, `courses/checkout`, and `memberships/checkout`, the last converted by the web's P0-17 precisely because a hosted `success_url` in an app webview resolved no cookie and showed a freshly-charged customer a sign-in page. So there is no browser round trip to design.

The cost is that the app must render a Payment Element, and it has no SDK for one. `@stripe/stripe-terminal-react-native` is Tap to Pay, for staff taking payments; customer card entry needs `@stripe/stripe-react-native`, a new dependency. **And the element is scoped per venue, not per app:** the setup-intent route creates on the venue's connected account and returns `stripe_account_id`, which the web uses as `loadStripe(key, { stripeAccount: accountId })`, cached per account. A customer has several venues, so the provider is re-scoped per venue rather than configured once at the root.

**Copy.** The web repo forbids em-dashes in any string a user or guest can read, and the app is the same product with the same users, so customer-facing strings here follow that rule. Code comments in this repo use em-dashes as local idiom and are left alone.

---

## Phases

Each phase is shippable and independently testable. C0 and C1 carry the routing risk. C2 is screens against a settled contract. **C3 to C5 are screens against a contract that is settled but not versioned** (G1), so each needs its route access decided before it starts, and C3 and C4 additionally need G2's Stripe decision.

### C0. Fix the live defect and lay the plumbing. No customer UI. DONE 2026-08-30.

*(**Done.** `useRole()` is the single answer, lifted out of the staff gate so the gate, push registration and the venue bootstrap read one computation instead of three; the gate now consumes it and behaves identically, since `customer` is what it used to call `not_staff` and still lands on `<StaffRequired/>` until C1. Device registration sends `audience`, and `audienceForRole` returns **null** for an unresolved role so the provider registers nothing rather than falling back to the server's `'staff'` default, which is the defect itself. 18 tests, 7 mutations, all caught.

**Two things were found by doing it rather than by planning it.** The typechecker turned up a second `registerCurrentDeviceForPush` call site in `manage/notification-preferences.tsx`, which is pinned to `'staff'` because it sits behind the staff gate: deriving its audience would only let a degraded venue API refuse an explicit request to turn push on. And `useRole` originally imported `useAuth`, which imports `registerDevice`, which imports `expo-notifications`; that dragged the native push stack into every module touching `useVenue` and **crashed two unrelated test suites outright**. It now reads `useAccessToken()`, which is lighter and is the same source `useStaffMe` keys off, so the two cannot disagree about whether a session exists.

**The `useVenue` gate is `role !== 'customer'`, deliberately not `=== 'staff'`,** and a test pins the difference. Gating on a positive staff answer would put every staff member's venue bootstrap behind their staff/me round trip, where the two run in parallel today, and the tabs render off that data.)*

- Gate push registration on a resolved role, so `<StaffRequired/>` stops registering staff devices for non-staff people.
- Send `audience` on device registration: `'staff'` or `'customer'`. The web column already exists, defaults to `'staff'`, and has a value-domain CHECK.
- Add `useRole()` with its tests.
- Gate `useVenue()` on `role === 'staff'`.
- **Acceptance:** a non-staff sign-in issues zero venue requests and registers zero staff devices, asserted in tests rather than by inspection.
- **Ships alone.** It is a bug fix that stands on its own merits and needs no customer UI to be worth releasing.

### C1. The routing spine, plus the hub. The decision point.

- The `(customer)` group, the role-aware routing, the switcher for dual-role people.
- One screen: the customer hub, against `GET /api/v1/me/home`. The payload is already rich enough to be a real screen: next booking, whether it needs a form, how many later ones do, the upcoming list, outstanding payments, venue history, and credit and membership summaries.
- **Sign-in defaults to the password tab, and most customers have no password.** `app/(auth)/sign-in.tsx:45` opens on `'password'` and its own header calls itself "Staff sign-in". The web creates customer accounts lazily from guest email addresses, so a typical customer has an `auth.users` row with no password set and would fail on the default tab with no hint why. Customer entry defaults to the magic link, and the copy stops saying staff.
- **Acceptance, and it is about the crash rather than the screen:** a cold start with a slow or failing `staff/me` never unmounts a mounted navigator; a role resolving after first paint does not remount the provider tree; a token refresh mid-session does not bounce a customer out of an open screen. These are the three shapes of the 2026-08-16 failure and each gets a test.
- **Stop and review here** before building C2 onward.

### C2. Bookings.

List, detail, cancel, reschedule. `GET /api/v1/me/bookings`, `GET` and `DELETE` on `/bookings/[id]`, plus `reschedule-options`, `reschedule` and `confirm`. This is what push notifications deep-link into, so it precedes anything that sends one.

The detail GET returns AD9's shared booking DTO, the same object the web's own detail page renders, so the app screen is a rendering job against a settled shape rather than a second interpretation of a booking.

### C3. Passes and commerce.

Memberships, credits, courses, recurring. Includes the resume-a-cancelled-membership action the web added in P2-6, which is the only way to clear a pending cancellation outside Stripe.

**Unblocked by D3 and D4.** These routes are called on their `/api/account/*` paths, and the three purchase paths use a per-venue Payment Element. The five server-only routes need no Stripe SDK at all, so they can land first within the phase if the dependency work runs long.

### C4. Profile, preferences, payments.

Profile and the notification matrix (`/api/v1/me/profile`, PATCH merges and never assigns), payment history, saved cards including removal with its membership warning.

**The devices list is deliberately not filtered by audience**, so that sign-out-everywhere still reaches a dual-role person's staff phone. Filtering it in the app to show only customer devices would quietly break that, and it would look like tidying.

Adding a card here is D4's dependency again, so C4 and C3 share it. `password`, `marketing-preferences`, `sign-out-everywhere` and `payment-methods` are all called on `/api/account/*` per D3.

### C5. The rest of parity.

Waitlist view and leave, JSON export, account deletion and cancellation. Deletion already has a client in `lib/queries/useAccountDeletion.ts` calling the un-aliased `/api/account/delete-request` directly.

### C6. Push delivery and deep links.

- Customer channel and category ids matching the web sender's `customer-reminders`, `customer-booking-changes`, `customer-waitlist`.
- Wire the web sender to its call sites, which is deliberately deferred there until a real customer device exists.
- The `resneo://` route map, per the web repo's `Docs/MOBILE_API.md`.
- **Universal links are out of scope until two things land:** F7's Apple Team ID and Play SHA-256, and `associatedDomains` plus Android intent filters in `app.json`. **Order is fixed and non-negotiable:** serve the files, verify 200 with the right content type and no redirect, then restore `app.json`, then ship a build. A failed Android verification stops the app being offered as a handler at all, which is why universal links were removed on 2026-08-09.

---

## Out of scope

- Any new web endpoint. If a screen wants something no route carries, that is a web-repo change and a decision, not a quiet addition here. **Aliasing existing routes is out of scope by D3**, which calls them on their `/api/account/*` paths instead.
- Booking creation. The customer web portal rebooks by handing off to the public booking flow, and matching that is a larger piece of work than parity with the portal's own screens.
- The association files, until C6's two preconditions are both met.

---

## Open questions

1. **What does the switcher look like, and where does it live?** A header control, a tab, or a row in More. Worth answering with a real dual-role account in front of us rather than in the abstract.
2. **What does a customer with no bookings at all see?** The web hub has a first-run state; the app needs its own, and it is the first screen most customers will meet.
3. **Does the venue app's existing audience notice anything?** C0 changes push registration for everyone. The answer should be no, and it should be demonstrated rather than assumed. The web side already argues it cannot: `audience` is optional on the register schema and defaults to `'staff'`, precisely so build 1.0.7 keeps working while sending nothing.
4. **Does the Payment Element need re-mounting or just re-keying when the venue changes?** An implementation question for C3, answerable against the Expo v56 and Stripe RN docs rather than by discussion.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-08-30 | **D3 and D4 taken**, settling G1 and G2. Route access is `/api/account/*` direct with no backfill, which makes the calling convention deliberately mixed. Payments adopt `@stripe/stripe-react-native`. C3 and C4 are unblocked; nothing now waits on a decision. |
| 2026-08-30 | **Reviewed against the full web source** at `_reference/Resneo` `0fcc6265`. Three corrections: G1, two thirds of the customer surface has no v1 alias and the gap is exactly C3 to C5, so "the contract is settled" was true only of C1 and C2; G2, customer card entry needs a new Stripe SDK and a per-venue connected-account element; G3, the single-booking GET exists and returns the shared DTO, and the web's own doc omits it. Four things confirmed, including that `claim_user_account()` is already called and every booking action is Bearer-aware. Also found that sign-in defaults to a password tab most customers cannot use. |
| 2026-08-30 | Written. D1 and D2 taken. Recorded what the web plan's §5D got optimistic about (the gate is a route-group problem, not a branch), the two global queries that fire above the gate, and the push-registration defect that is live in production today. |
