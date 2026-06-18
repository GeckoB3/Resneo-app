## 01. Navigation & Information Architecture

**Parity:** Strong — Nearly every web destination is reachable via native in-app routes; the genuine gaps are one role-gating regression (model links hidden from staff) and three narrow missing surfaces (Refer & Earn, Data Import, Home-as-launch-screen).

Navigation parity is strong for an appointments-first mobile app. The web's flat admin sidebar (Home, Bookings, New Booking, Contacts, model links, Waitlist, Calendar Availability, Compliance, Settings, Support) plus a 12-tab Settings page is re-expressed as a 4-tab bar — Calendar / Bookings / Clients / More — where "More" is a searchable, role-aware index that fans the web's single tabbed Settings page out into ~15 separate `/manage/*` routes grouped as an inset list. That fan-out is a legitimate mobile adaptation, not a deficiency. The one genuine functional regression is that the web shows the primary model links (Events / Classes / Resources) to **all** staff gated only by the venue's enabled booking model, whereas the app gates them behind `isAdmin`, leaving non-admin staff at class/event/resource venues with no in-app path to those screens (note: the Services row *is* shown to staff). Beyond that, Refer & Earn and Contact/Booking Import have no app entry point, the Today/Home dashboard is not the launch screen and is buried in More, and a handful of restaurant-only surfaces (Day Sheet, Table Grid, Floor Plan, Tables, Dining Availability) are intentionally excluded. All six candidate gaps were verified against the app source and confirmed real; none were false positives.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Primary navigation shell | `DashboardSidebar.tsx` (BASE_NAV_ITEMS) | `app/(app)/(tabs)/_layout.tsx` | Strong | Persistent left sidebar → 4-item bottom tab bar (Calendar / Bookings / Clients / More). |
| Home / Today dashboard | `DashboardSidebar.tsx` BASE_NAV_ITEMS[0] (Home, all roles) | `app/(app)/today.tsx` | Partial | Web Home is the landing surface; app `/today` reachable only via More grid tile. |
| Calendar / schedule | `dashboard/calendar/page.tsx` | `app/(app)/(tabs)/index.tsx` | Strong | App promotes the calendar to the default first tab. |
| Bookings list | `dashboard/bookings/page.tsx` | `app/(app)/(tabs)/bookings.tsx` | Strong | Direct tab-to-page map; venue selector moved into the filter sheet per convention. |
| New booking | `dashboard/bookings/new/page.tsx` | `app/(app)/booking/new.tsx` (modal) | Strong | Web has a persistent sidebar entry; app uses a FAB-launched modal. |
| Contacts / Clients | `dashboard/contacts/page.tsx` | `app/(app)/(tabs)/clients.tsx` | Strong | Tab-to-page map; `dashboard/guests` redirect correctly collapsed. |
| Services (appointment-services) | `dashboard/appointment-services/page.tsx` (all roles) | `app/(app)/manage/services.tsx` | Strong | App pushes Services unconditionally (line 212) so staff reach it too. |
| Events / Classes / Resources (model links) | `event-manager`, `class-timetable`, `resource-timeline` (MODEL_NAV_ITEMS, all roles) | `app/(app)/events.tsx`, `classes.tsx`, `resources.tsx` (admin-only) | Partial | Buried in More AND gated behind `isAdmin` — non-admin staff have no path. See gap. |
| Waitlist | `dashboard/waitlist/page.tsx` (capability-gated) | `app/(app)/waitlist.tsx` | Strong | App pushes it unconditionally (line 207); screen degrades to an empty state. |
| Calendar Availability | `dashboard/calendar-availability/page.tsx` (eligibility-gated) | `app/(app)/availability.tsx` | Strong | App pushes it unconditionally (line 208); content parity good. |
| Compliance dashboard | `dashboard/compliance/page.tsx` (tier + flag, staff + admin) | `app/(app)/manage/compliance.tsx` (admin-only) | Strong | App admin-gates it with no flag check; staff lose the web's direct access. See low gap. |
| Settings — Profile / Venue profile | `dashboard/settings` (tab=profile) | `manage/account.tsx` + `manage/venue-profile.tsx` | Strong | Web's combined Profile tab split into Account (all roles) + Venue profile (admin). |
| Settings — Business hours | `dashboard/settings` (tab=business-hours) | `app/(app)/manage/hours.tsx` | Strong | Weekly hours + closures; direct route map (line 216). |
| Settings — Booking Settings | `dashboard/settings` (tab=booking-settings) | `app/(app)/manage/booking-settings.tsx` | Strong | Admin-only on both (line 220). |
| Settings — Booking Page | `dashboard/settings` (tab=booking-page) | `app/(app)/manage/booking-page.tsx` | Strong | Admin-only (line 224); app built in-app CRUD per project memory. |
| Settings — Plan / Billing | `dashboard/settings` (tab=plan + tab=payments) | `app/(app)/manage/plan.tsx` | Strong | App consolidates Plan + Payments into one route (line 223); plan-warning banner mirrored. |
| Settings — Communications | `dashboard/settings` (tab=comms) | `app/(app)/manage/communications.tsx` | Strong | Admin-only (line 221). |
| Settings — Staff / Team | `dashboard/settings` (tab=staff) | `app/(app)/manage/team.tsx` | Strong | Admin-only on both (line 219). |
| Settings — Linked Accounts + collectives | `dashboard/settings` (tab=linked-accounts) + sidebar | `linked-venues/index.tsx` + `collectives/index.tsx` + `linked-venues/calendar.tsx` | Strong | App exceeds web: 3 nav surfaces + tab-level linked columns + incoming-request nudge. |
| Settings — Compliance types | `dashboard/compliance-types/page.tsx` | `app/(app)/manage/compliance-types.tsx` | Strong | Dedicated route, reached from compliance. |
| Push / notification preferences | (web: per-channel comms policy) | `app/(app)/manage/notification-preferences.tsx` | App-only | Device push prefs with no direct web equivalent (line 239). Appropriate. |
| Notifications feed | `NotificationBell.tsx` (footer, linked-venue gated) | `app/(app)/notifications.tsx` + More badge | Strong | App surfaces a feed with unread badge — broader than web. |
| Support | `dashboard/support/page.tsx` (footer) | `app/(app)/support.tsx` | Strong | Direct map (line 238). |
| Sign out | `DashboardSidebar.tsx` handleSignOut | `settings.tsx` sign-out Sheet | Full | App uses a confirm Sheet (Alert.alert is a web no-op). |
| Reports | `dashboard/reports` + settings tab=reports (admin) | `app/(app)/reports.tsx` (admin-only) | Strong | Dedicated screen in the Quick-actions grid (line 205). |
| Refer & Earn | `dashboard/referrals/` + settings tab=refer-earn | absent | Missing | No route, no nav row. See gap. |
| Data Import (contacts/bookings) | `dashboard/import/` (ImportHub) | absent | Missing | No import/CSV affordance. Clients can only be created one at a time. See gap. |
| Day Sheet | `dashboard/day-sheet/` (restaurant) | absent | Missing | Intentional — web itself redirects appointment venues to the calendar. |
| Table Grid / Floor Plan / Tables | `table-grid`, `floor-plan`, `tables` (restaurant) | absent | Missing | Intentional — restaurant-tier only; out of scope. |
| Dining Availability | `dashboard/availability/page.tsx` (restaurant) | absent | Missing | Intentional — restaurant covers config, distinct from appointment Calendar Availability. |
| Onboarding | `dashboard/onboarding/` (redirect when incomplete) | absent (setup checklist on `today.tsx`) | Partial | App has no gated onboarding flow; lighter first-run guidance via SetupChecklistCard. |
| Web dashboard escape hatch | (n/a) | `settings.tsx` "Web dashboard" row (line 240) | App-only | `WebBrowser.openBrowserAsync` bridge for web-only features. Sensible. |

**Primary navigation shell.** The web renders a persistent left sidebar (`DashboardSidebar.tsx` BASE_NAV_ITEMS, lines 46-54) listing every top-level destination flatly, role- and tier-filtered. The app collapses this into a 4-item bottom tab bar (`_layout.tsx` lines 175-180): Calendar (`name="index"`), Bookings, Clients, More (`settings`). Bookings/Contacts/New-Booking(FAB) map cleanly; everything else folds into the More tab. Tab labels are terminology-driven (`bookingsScreenTitle`/`clientsScreenTitle`, lines 147-157). Sound mobile IA, but flattening ~10 sidebar items plus 12 settings tabs into one More tab increases depth.

**Home / Today dashboard.** Web "Home" is the first sidebar item, shown to all roles and the post-login landing route. The app's `/today` is a rich screen but is reached **only** via the More tab's Quick-actions grid (`settings.tsx` line 203, `featured:true`) — confirmed there is no `/today` link from the Calendar tab (`index.tsx` has `router.push` calls but none target `/today`). The app's default landing tab is Calendar (`_layout.tsx` line 176). Comparable content, lower discoverability, not the launch screen.

**Model links (Events / Classes / Resources).** Web merges these via `mergeModelNavEntries(MODEL_NAV_ITEMS, …)` (`DashboardSidebar.tsx` line 309) with **no** `isAdmin` gate — they are primary sidebar links for staff and admin alike, gated only by the enabled booking model. The app defines them in `SECONDARY_MODEL_ROWS` (`settings.tsx` lines 98-111) and renders the loop only inside `if (isAdmin)` (line 230). Grep confirms `/classes`, `/events`, `/resources` are referenced **only** inside that admin-gated loop — there is no tab, FAB, or component-level `router.push` fallback. See the high-severity gap.

**Settings — Linked Accounts + collectives.** The app actively exceeds the web here: separate Linked venues (line 225), Venue collectives (line 226), and a Linked calendar route (line 217), plus tab-level linked-venue calendar columns and the `LinkedVenueBanner` incoming-requests nudge. The web keeps it as one settings tab plus combined-page sidebar links.

**Notifications feed.** The app surfaces an in-app feed with an unread badge on the More tab (`_layout.tsx` lines 159-169) and a hero bell — broader than the web, where the bell appears only for venues with accepted links.

### Gaps & deficiencies

#### High

- **Model links (Events/Classes/Resources) hidden from non-admin staff** — _function · high_
  - **Web:** `DashboardSidebar.tsx` merges `MODEL_NAV_ITEMS` (Services/Events/Classes/Resources) via `mergeModelNavEntries(MODEL_NAV_ITEMS, navPrimaryBookingModel, enabledModels)` at line 309 with **no** `isAdmin` gate — the only gate is the venue's enabled booking model. A non-admin staff member at a class/event/resource venue sees Classes/Events/Resources directly in the sidebar.
  - **App:** `app/(app)/(tabs)/settings.tsx` wraps the entire `SECONDARY_MODEL_ROWS` loop in `if (isAdmin)` (line 230), so the Classes/Events/Resources rows are never rendered for staff. Grep confirms `/classes`, `/events`, `/resources` are referenced **only** inside that admin-gated loop — there is no tab, FAB, or component-level `router.push` fallback, so a non-admin staff member has **no** route to those screens. (For contrast, the Services row *is* shown to staff — it is pushed unconditionally at line 212 — so this gap is specifically Events/Classes/Resources.)
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lines 57-69 (MODEL_NAV_ITEMS), 309-327 (mergeModelNavEntries, no role check); APP `app/(app)/(tabs)/settings.tsx` line 230 (`if (isAdmin) { for (const row of SECONDARY_MODEL_ROWS) … }`), line 212 (Services pushed unconditionally), lines 98-111 (SECONDARY_MODEL_ROWS definition).
  - **Fix:** In `app/(app)/(tabs)/settings.tsx`, move the `SECONDARY_MODEL_ROWS` loop **out** of the `if (isAdmin)` block so Classes/Events/Resources render for staff whenever the model is in `enabledModels` (mirror the web's model-driven, role-agnostic gating). Keep the web-only "Tables" row as-is (line 110 — it points to web setup with no `appRoute`). Optionally set `featured:true` for the venue's primary model so the daily-driver screen sits in the Quick-actions grid rather than two taps deep.

#### Medium

- **No Refer & Earn surface in the app** — _function · medium_
  - **Web:** Admins with the referral programme enabled get a "Refer & Earn" settings tab and a `/dashboard/referrals` route to view their code, share it, and track earned subscription credit.
  - **App:** Absent — no referrals route under `app/`, no nav row in `settings.tsx`. Grep for `refer|referral` across `app/` yields only substring noise (preferences, prefers-color-scheme, self-referential).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/referrals/` directory confirmed present, settings refer-earn tab; APP no referrals file (Grep `refer|referral` over `app/` returns `settings.tsx`/`notifications.tsx`/`clients.tsx` only as unrelated substring matches).
  - **Fix:** Add `app/(app)/manage/referrals.tsx` and a Destination row in `settings.tsx` (`group:'manage'`, `isAdmin`-gated) mirroring the web `ReferralsDashboardContent`, reusing the existing `apiFetch` client against the same referrals dashboard endpoint. If a full screen is out of scope, at minimum add an `isAdmin`-gated row that opens `/dashboard/settings?tab=refer-earn` via the existing `openWeb()` helper (`settings.tsx` lines 158-166, 240) so admins can reach it without hunting for the generic "Web dashboard" link.

- **No contact / booking data import in the app** — _function · medium_
  - **Web:** Admins can run a guided CSV import (upload → map → validate → references → review → importing) for contacts and bookings via `/dashboard/import` (ImportHub), linked from a Settings section.
  - **App:** Absent — `components/clients/*` (CreateContactSheet, BulkActionSheets, etc.) contain no import/CSV/upload entry; the Clients tab can only create contacts one at a time.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/import/` directory confirmed present (ImportHub + step routes); APP Grep for `import|csv|upload` over `components/clients` returns only top-of-file ES `import` statements — no import affordance.
  - **Fix:** A full multi-step importer is heavy for mobile; as a pragmatic blueprint add an `isAdmin`-gated "Import contacts" row in the Clients header overflow or the More "Manage" group that opens `/dashboard/import` through the existing `settings.tsx` `openWeb()` helper, so the capability is at least discoverable from the app. A native importer keyed off the same import-session API would be a larger follow-up.

- **Today/Home is not the launch screen and is buried in More** — _ui · medium_
  - **Web:** "Home" (`/dashboard`) is the first sidebar item (BASE_NAV_ITEMS[0], line 47), shown to all roles, and the default post-login landing surface — KPIs/overview are one persistent click away at all times.
  - **App:** The rich `/today` screen is reached **only** via the More tab's Quick-actions grid (`settings.tsx` line 203, `featured:true`); the app's default landing tab is Calendar (`name="index"`). There is no persistent one-tap path to the Today dashboard from the tab bar or the Calendar header.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` BASE_NAV_ITEMS[0] (Home, line 47); APP `app/(app)/today.tsx` reached via `settings.tsx` destination id `today` (line 203); `app/(app)/(tabs)/_layout.tsx` default tab is index/Calendar (line 176); `index.tsx` has `router.push` calls but none to `/today` (all "today" references are the current date).
  - **Fix:** Either (a) add a quick path to `/today` from the Calendar tab header (an `IconButton` in the `app/(app)/(tabs)/index.tsx` toolbar), or (b) reconsider the 4-tab set to include a Home/Today tab. Lowest-effort: keep the grid entry but also add a "Today" header action on the Calendar tab so the KPI overview is reachable without opening More.

#### Low

- **Web's single Settings page is fragmented into ~15 separate routes with no unified Settings hub** — _design · low_
  - **Web:** All venue configuration lives in **one** `/dashboard/settings` page with a horizontal TabBar (Profile, Business hours, Booking Settings, Booking Page, Plan, Payments, Communications, Compliance, Staff, Reports, Refer & Earn, Linked Accounts), so users build a mental model of "everything is under Settings".
  - **App:** `settings.tsx` (the More tab) scatters the same concerns across "Manage", "Booking types", and "App" inset groups plus standalone `/manage/*` routes and Quick-actions tiles; there is no single destination literally named "Settings", and the tab is named "More". The grouped index is searchable (SearchBar) but the filter matches only label/hint text (lines 254-259), not web tab synonyms.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx` TABS array; APP `app/(app)/(tabs)/settings.tsx` LIST_GROUPS (lines 88-92) + destinations array (lines 190-243), search filter lines 254-259.
  - **Fix:** This is a legitimate mobile adaptation (a 12-tab horizontal bar is poor on phones) — keep the grouped index. To tighten the mental model, extend the search to index web tab synonyms — e.g. add hidden keywords like `settings`, `payments`, `stripe`, `SMS`, `templates` to the relevant `Destination.hint` strings (or a separate `keywords` field) so a user searching "settings" or "payments" lands on the right row. No structural change required.

- **Waitlist/Compliance nav visibility rules diverge from web eligibility gating** — _function · low_
  - **Web:** The sidebar applies precise eligibility — Waitlist via `shouldShowWaitlistNav(resolveWaitlistVenueCapabilities, appointmentWaitlistEnabled)` (lines 264-272); Compliance only when `isAppointmentPlanTier && complianceRecordsEnabled`, shown to staff **and** admin (line 330, not in ADMIN_ONLY_HREFS); Calendar Availability via `shouldShowAppointmentAvailabilitySettings` (lines 261-281).
  - **App:** `settings.tsx` pushes Waitlist (line 207) and Calendar availability (line 208) to everyone **unconditionally** in Quick actions with no model/flag gate, and Compliance (line 222) to any admin with **no** `complianceRecordsEnabled` feature-flag check — so the app surfaces destinations the web would hide for that venue's tier/flags, and conversely hides Compliance from non-admin staff the web would show it to. (Services is correctly shown to all in the app, matching the web's all-roles intent, so it is not part of this divergence.)
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lines 261-281 (waitlist/availability gates), 330 (compliance gate); APP `app/(app)/(tabs)/settings.tsx` lines 207-208 (waitlist/availability pushed unconditionally), line 222 (compliance pushed for any admin, no flag). The venue `feature_flags` incl. `compliance_records_enabled` IS available (`types/venue.ts` lines 27/77, VenueProvider exposes `featureFlags` at line 63), so the gate could be applied.
  - **Fix:** Mirror the web gates in the `settings.tsx` destinations builder: gate the Compliance row on `venue.feature_flags.compliance_records_enabled` (already surfaced by VenueProvider) and consider showing it to staff (not just admin) to match the web; gate Waitlist/Calendar-availability using the same model-eligibility helpers the calendar uses. Low severity because each target screen degrades gracefully to an empty state, but matching the web avoids showing irrelevant tools and avoids hiding Compliance from staff.

### Investigated — not a gap

- **Day Sheet** — Restaurant/table-reservation operational view; for appointment/unified venues the web itself redirects to `/dashboard/calendar`, which the app's Calendar tab covers. No action needed for an appointments-first app.
- **Table Grid / Floor Plan / Tables** — Appear only for restaurant tier + `table_reservation` + `table_management_enabled`. Out of scope; the `SECONDARY_MODEL_ROWS` "Tables" row already points to web-only setup (`settings.tsx` line 110).
- **Dining Availability** — Restaurant-SKU covers/availability config, distinct from the appointment Calendar Availability the app *does* have. Web gates it on `isTableReservation && isRestaurantPlanTier && isAdmin`. Not relevant to appointments-first scope.

### Recommended work (ordered)

1. **[High] Un-gate model links for staff.** In `app/(app)/(tabs)/settings.tsx`, lift the `SECONDARY_MODEL_ROWS` loop out of the `if (isAdmin)` block (line 230) so Classes/Events/Resources render whenever `enabledModels.has(row.model)`, regardless of role — matching the web's `mergeModelNavEntries` (no role gate). Leave the "Tables" row (no `appRoute`) web-only. Verify a non-admin staff session at a class/event/resource venue can now reach those screens.
2. **[Medium] Surface Today from the Calendar tab.** Add a "Today" `IconButton` to the `app/(app)/(tabs)/index.tsx` header toolbar routing to `/today` (and/or evaluate a Home tab), so the KPI overview is one tap away instead of buried in the More grid.
3. **[Medium] Add a Refer & Earn entry point.** Minimum: an `isAdmin`-gated Destination row in `settings.tsx` ("manage" group) that calls `openWeb('/dashboard/settings?tab=refer-earn')`. Better: a native `app/(app)/manage/referrals.tsx` mirroring `ReferralsDashboardContent` via the existing `apiFetch` client.
4. **[Medium] Add a contact-import entry point.** An `isAdmin`-gated "Import contacts" row (Clients header overflow or More "Manage") that opens `/dashboard/import` via `openWeb()`. Native importer against the import-session API is a larger follow-up.
5. **[Low] Apply web eligibility gates to nav rows.** In the `settings.tsx` destinations builder, gate Compliance on `venue.feature_flags.compliance_records_enabled` (surfaced by VenueProvider, `types/venue.ts` lines 27/77) and show it to staff as the web does; gate Waitlist/Calendar-availability with the calendar's model-eligibility helpers.
6. **[Low] Improve Settings search coverage.** Extend the `settings.tsx` search filter (lines 254-259) to index web tab synonyms — add a `keywords` field (or augment `hint`) with terms like `settings`, `payments`, `stripe`, `SMS`, `templates` so users searching web vocabulary land on the right `/manage/*` row.
