## 14. Settings, Account, Venue Profile, Plan/Billing & Team

**Parity:** Strong — nearly every web Settings tab has a full-featured in-app equivalent over Bearer-reachable endpoints; the shortfalls are a missing self-serve venue-deletion danger zone, an unenforced staff seat cap, two absent growth/embed surfaces, and three phone fields that skip E.164 normalization.

This is arguably the best-covered domain in the app. The web ships a single tabbed Settings page (Profile / Business hours / Booking Settings / Booking Page / Plan / Payments / Communications / Compliance / Staff / Reports / Refer & Earn / Linked Accounts); the app reorganises this into a searchable "More" hub (`app/(app)/(tabs)/settings.tsx`) that routes each concern to a dedicated `/manage/*` screen, role-gating admin-only rows via `useStaffMe`. Personal account, venue profile, plan & billing, Stripe Connect/Portal, team management, and booking settings all have full equivalents — several with app-side UX improvements (a searchable IANA timezone picker, live usage meters, a Portal fallback). The notable absences are a "Delete this venue" flow, plan-seat enforcement on invites, a Refer & Earn surface, and an in-app booking-widget/QR embed. Three settings phone fields also save with only `.trim()` despite a normalizer already living at `lib/phone/normalize.ts` (wired only into the booking wizard).

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Settings hub / index | `settings/SettingsView.tsx` (12-tab TabBar) | `app/(app)/(tabs)/settings.tsx` (searchable "More" hub) | Strong | Covers almost all web tabs as `/manage/*` routes + app-only items; only web tab with no destination is Refer & Earn |
| Personal account & security | `sections/StaffPersonalSettingsSection.tsx` | `app/(app)/manage/account.tsx`; `components/manage/MyAccountSheet.tsx` | Strong | Same fields & endpoints; app has two parallel surfaces; web normalizes phone to E.164, app does not |
| Venue profile & contact | `sections/VenueProfileSection.tsx` | `app/(app)/manage/venue-profile.tsx` | Strong | Field-for-field match incl. slug availability check; app's timezone picker is better UX; explicit Save vs web autosave |
| Booking Page (URL, branding, widget/QR) | `sections/BookingPageSection.tsx` + `widget/WidgetSection.tsx` | `app/(app)/manage/booking-page.tsx` | Partial | Slug/URL has parity; web's Website-Widget + QR-code embed section has no app equivalent |
| Plan & subscription | `SettingsView.tsx` PlanSection | `app/(app)/manage/plan.tsx`; `components/plan/{PlanChangeSection,UsageMeter}.tsx` | Strong | Excellent; tier/status/meters/proration all present; web TrialBreakdownBanner + complimentary-access copy not reproduced |
| Billing administration (Stripe Portal) | `openManageBilling()` → `/api/billing/portal-session` | `plan.tsx handleManageBilling()` | Full | Both open the Stripe Customer Portal; app adds a graceful "Open billing on web" fallback |
| Payments / Stripe Connect | `sections/StripeConnectSection.tsx` | `components/plan/StripeConnectCard.tsx` (in `plan.tsx`) | Strong | Connect status + onboarding redirect present; folded into Plan screen; non-admins get web link |
| Team / staff management | `sections/StaffSection.tsx` | `app/(app)/manage/team.tsx`; `components/manage/{InviteStaffSheet,StaffMemberSheet,SessionSettingsSheet}.tsx` | Strong | Invite/role/calendar-assign/reset/resend/remove/session-timeout all match; GAP: no plan seat-cap guard |
| Booking settings (models, login, flags) | `sections/{BookingTypesSection,RequireAccountLoginSection,FeatureFlagsSection}.tsx` | `app/(app)/manage/booking-settings.tsx` | Strong | Active models, require-login, appointments feature flags all mirrored; explicit Save vs web autosave |
| Delete venue (danger zone) | `sections/DeleteVenueSection.tsx` | absent | Missing | No venue-deletion UI or API calls anywhere in the app |
| Refer & Earn (referrals) | `refer-earn` tab → `ReferralsDashboardContent` | absent | Missing | No referrals surface in shipping app code |
| Compliance settings | `sections/ComplianceSettingsSection.tsx` | `app/(app)/manage/compliance.tsx` | Partial | Reachable from hub; depth-of-parity owned by the Compliance-domain auditor |
| Privacy & security (app lock) | none | `settings.tsx` AppLock toggle (`providers/AppLockProvider`) | App-only | Opt-in Face ID / fingerprint lock; intentional native-only feature |
| Sign out | dashboard shell | `settings.tsx` (Sign out row + confirm Sheet) | Full | Confirm-sheet sign-out; functionally equivalent |

**Settings hub.** Web is one tabbed page; the app makes it a searchable hub with a quick-actions grid and grouped inset lists, routing each concern to its own screen. Functionally the navigation covers almost every web tab plus app-only items (Today, Waitlist, Push notifications, Web-dashboard link, biometric app-lock). The only web tab with no app destination is Refer & Earn.

**Personal account & security.** Both edit display name, sign-in email, phone, and password (min 8, confirm) against identical endpoints (`PATCH /api/venue/staff/me`, `POST /api/venue/staff/change-password`). On email change, `account.tsx:139` calls `getSupabase().auth.refreshSession()` so the new claim loads. The app has two surfaces for this same edit (the dedicated screen + `MyAccountSheet` from Team), a slight redundancy. The web phone field uses `PhoneWithCountryField` with E.164 normalization; the app uses a plain phone-pad `Input` with only `.trim()`.

**Venue profile & contact.** App matches every web field: name, 4-part address, phone, email, website (URL validation + domain-only acceptance), debounced slug availability check, no-show grace (10–60), restaurant-only cuisine/price-band/kitchen-email hidden on appointments plans, and logo + cover upload. The app's searchable IANA timezone picker is better UX than the web free-text field. Web autosaves on debounce; the app uses an explicit "Save changes" button (acceptable on mobile). The app casts `no_show_grace_minutes`, `logo_url`, `cover_photo_url`, `cuisine_type`, `price_band`, and `kitchen_email` via a local `VenueBootstrapExtended` interface because `types/venue.ts` lacks them.

**Plan & subscription.** Excellent parity. The app shows tier, status badge, est. next invoice, coupon/discount lines, current period, next-billing/access-until, a calendar usage meter, a live SMS usage meter (`useSmsUsage`) with overage box, a trial countdown banner, and past-due/cancelling/cancelled/expired banners with resume & resubscribe actions. The Change-Appointments-plan card (`PlanChangeSection`) renders live proration previews with inline confirm, mirroring web. The app re-fetches on app-foreground (mirrors web focus/visibility sync). Web-only extras not reproduced: `TrialBreakdownBanner` (referral-bonus trial-day breakdown) and `isFreeAccess`/superuser-complimentary-access messaging.

**Team / staff management.** Near-complete: invite (email/name/role/calendar-ids), per-staff role change, per-staff calendar assignment (All/None with inactive-calendar warning), reset password, resend invite, remove member (with self-protection), and session-timeout config — all matching web endpoints. The app presents these as a list + per-member tabbed sheet vs web's inline icon buttons. The one functional gap is the missing plan-seat cap guard (see below).

### Gaps & deficiencies

#### Critical

- **No self-serve "Delete this venue" danger zone** — _function · critical_
  - **Web:** On Settings → Plan an admin sees a Danger-zone card (`DeleteVenueSection`) to schedule a 30-day venue deletion: type the venue name to confirm, `POST /api/venue/delete-request` schedules it (and cancels the subscription at period end), `GET /api/venue/delete-request` shows the scheduled date, and `POST /api/venue/delete-request/cancel` reverses it before the grace period ends.
  - **App:** Absent — no venue-deletion UI or calls anywhere. A grep for `delete-request` / `deletion_scheduled` / "Delete venue" / `DeleteVenue` across the entire repo (`app/`, `components/`, `lib/`, even `Docs/`) returns zero hits.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/sections/DeleteVenueSection.tsx` (present, 6.6 KB), rendered at `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:1611`. App: no match anywhere.
  - **Fix:** Add `components/manage/DeleteVenueSheet.tsx` (type-to-confirm venue name) surfaced from `app/(app)/manage/plan.tsx` (admin-only, below `StripeConnectCard`), mirroring `DeleteVenueSection`'s three states (loading / scheduled / request-form). Add a new `lib/queries/useVenueDeletion.ts` using `apiFetch` against `GET`+`POST /api/venue/delete-request` and `POST /api/venue/delete-request/cancel` (same Bearer pattern as `lib/queries/useBillingStatus.ts`). Reuse the inline two-step confirm pattern from `components/manage/StaffMemberSheet.tsx` rather than `Alert.alert`.

#### High

- **Staff invite ignores the plan seat cap** — _function · high_
  - **Web:** `StaffSection` computes `staffCap = planStaffLimit(pricingTier)` (Light=1, Plus=5, Pro=∞). When `staff.length >= cap` it hides "Add User" and shows an amber upgrade nudge linking to Settings → Plan, preventing an over-limit invite.
  - **App:** `team.tsx` always renders the invite FAB for admins and `InviteStaffSheet` never checks the cap, so an admin can fill in and submit an invite the server rejects — discovered only via a raw API-error toast.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/sections/StaffSection.tsx:6` (import `planStaffLimit`), `:114-115` (`staffCap`/`staffPlanLimitReached`), `:576-596` (hidden Add User + banner); `_reference/Resneo/src/lib/plan-limits.ts` present. App `app/(app)/manage/team.tsx:234` (FAB rendered on `isAdmin` alone); `components/manage/InviteStaffSheet.tsx` (no cap logic).
  - **Fix:** Add `planStaffLimit()` to `components/plan/planConstants.ts` (light→1, plus→5, appointments→∞, mirroring `_reference/Resneo/src/lib/plan-limits.ts`). In `app/(app)/manage/team.tsx` compute `staffPlanLimitReached` from `members.length` vs the cap (`venue.pricing_tier` from `useVenueContext`), hide the FAB when reached, and render an upgrade nudge card (link to `/manage/plan`) like the web amber banner.

#### Medium

- **Refer & Earn (referrals) surface entirely missing** — _function · medium_
  - **Web:** Admins get a Refer & Earn tab (`ReferralsDashboardContent`) to share a referral code and track earned subscription credit when referred venues subscribe; gated by `referralProgrammeEnabled()`.
  - **App:** Absent — no referrals screen or navigation entry in shipping code.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:1664-1669` + `../referrals/ReferralsDashboardContent`. App: grep `referral` returns only `Docs/*` (no `app/components/lib` code).
  - **Fix:** If in scope, add `app/(app)/referrals.tsx` backed by a `useReferralsDashboard` hook (GET the same endpoint `loadReferralsDashboardForVenue` uses) and an admin-gated "Refer & Earn" destination in `app/(app)/(tabs)/settings.tsx`'s destinations list. Otherwise document as an intentional exclusion.

- **No in-app booking-widget / QR-code embed** — _function · medium_
  - **Web:** The Booking Page tab includes `WidgetSection`: a copyable `<iframe>` embed snippet, an embed accent-colour control, and a downloadable QR code that opens the public booking page.
  - **App:** The venue-profile screen links to `/manage/booking-page` for branding but exposes no widget snippet, accent-colour control, or QR download. Grep for `WidgetSection`/`iframe`/`qrcode`/`embed_accent` in app code finds nothing relevant (the only iframe/QR-adjacent hit is `components/linked/InviteLinkSheet.tsx`, an unrelated linked-venue flow).
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/widget/WidgetSection.tsx` (present, 13.6 KB), rendered at `SettingsView.tsx:1580`. App `app/(app)/manage/venue-profile.tsx:848-855` only offers "Edit booking page branding".
  - **Fix:** Add a "Share & embed" card to `app/(app)/manage/booking-page.tsx`: a copy-to-clipboard iframe snippet (`expo-clipboard`), an accent-colour field PATCHing `venues.embed_accent_colour` via `useUpdateVenue` (`lib/queries/useVenueSettings.ts`), and a QR generator (e.g. `react-native-qrcode-svg`) plus a share/save action. Mirror `WidgetSection`'s snippet format and `publicBaseUrl` handling.

- **Phone fields not normalized to E.164 (no country picker)** — _function · medium_
  - **Web:** Both `StaffPersonalSettingsSection` and `VenueProfileSection` use `PhoneWithCountryField` + `normalizeToE164(value, 'GB')`; a non-normalizable number is rejected client-side and the saved value is canonical E.164.
  - **App:** `account.tsx`, `MyAccountSheet.tsx`, and `venue-profile.tsx` send phone after only `.trim()` — no normalization, no validation, no country selector — so a national-format number can be saved and may break SMS. A best-effort normalizer **already exists** at `lib/phone/normalize.ts` (`normalizePhone`), but it is imported ONLY by the booking-wizard flows (`ResourceBookingFlow`/`EventBookingFlow`/`ClassBookingFlow`/`ConfirmStep`), never these three settings surfaces.
  - **Evidence:** Web `_reference/Resneo/src/lib/phone/e164.ts` present; `StaffPersonalSettingsSection.tsx` + `VenueProfileSection.tsx` use `normalizeToE164`. App `app/(app)/manage/account.tsx:128`, `components/manage/MyAccountSheet.tsx:80-81`, `app/(app)/manage/venue-profile.tsx:452` all do plain `.trim()`; `lib/phone/normalize.ts:1-10` docstring confirms it is the booking-wizard normaliser; grep confirms `normalizePhone` / `lib/phone` is not imported in `app/(app)/manage/` or `components/manage/`.
  - **Fix:** Reuse the existing `lib/phone/normalize.ts normalizePhone()` (or port the fuller `_reference/Resneo/src/lib/phone/e164.ts`). Either build a `PhoneInput` primitive (country code + normalize-on-blur) or normalize+validate inside the three save handlers (`account.tsx buildProfilePatch`, `MyAccountSheet handleSaveProfile`, `venue-profile.tsx handleSave`), surfacing an inline error like the web.

#### Low

- **Trial-breakdown detail and complimentary-access messaging absent on Plan screen** — _content · low_
  - **Web:** `PlanSection` renders `TrialBreakdownBanner` (standard signup trial days + referral-bonus days = total, first-charge date) and special `isSuperuserFreeBillingAccess` copy ("complimentary ResNeo access", no charges) when applicable.
  - **App:** Shows only a generic "Free trial — N days remaining (ends …)" banner with no complimentary/free-access branch.
  - **Evidence:** Web `_reference/Resneo/src/app/dashboard/settings/SettingsView.tsx:34,374,715-727` (`isSuperuserFreeBillingAccess` + complimentary copy). App `app/(app)/manage/plan.tsx:401-406` (single generic trial banner); `lib/queries/useBillingStatus.ts` has no `billing_access_source` / trial-breakdown fields.
  - **Fix:** Extend `lib/queries/useBillingStatus.ts BillingStatus` with `billing_access_source` and (if available) trial-breakdown fields, then in `app/(app)/manage/plan.tsx` add a referral/standard trial-days breakdown line and a complimentary-access branch mirroring web copy. Affects a minority of venues.

- **Two parallel personal-account surfaces risk drift** — _design · low_
  - **Web:** One canonical `StaffPersonalSettingsSection` for personal profile + password.
  - **App:** Ships two implementations of the same edit (name/email/phone/password): standalone `app/(app)/manage/account.tsx` (raw `apiFetch` + `getSupabase().auth.refreshSession`) and `components/manage/MyAccountSheet.tsx` (`useTeamMutations` hooks). They have slightly different validation/messaging and can diverge.
  - **Evidence:** App `app/(app)/manage/account.tsx:74,103,139` (`apiFetch` to `/api/venue/staff/me` + change-password, `getSupabase().auth.refreshSession`) vs `components/manage/MyAccountSheet.tsx:76-81` (`usePatchStaffMe` hook). Duplicated profile+password logic across the two files.
  - **Fix:** Pick one source of truth: have `account.tsx` render `MyAccountSheet`'s underlying logic, or extract a shared `useStaffAccountForm` hook in `lib/queries/` so both the dedicated screen and the Team sheet share validation, the email-change session refresh, and copy.

### Investigated — not a gap

None — all eight candidate gaps held up against the app codebase after verification.

### Recommended work (ordered)

1. **Build the venue-deletion danger zone** (critical). New `components/manage/DeleteVenueSheet.tsx` + `lib/queries/useVenueDeletion.ts` (`apiFetch` against `/api/venue/delete-request` GET/POST and `.../cancel`), surfaced admin-only in `app/(app)/manage/plan.tsx` below `StripeConnectCard`, with the three states (loading / scheduled / request-form) and a type-to-confirm step.
2. **Enforce the staff seat cap on invites** (high). Add `planStaffLimit()` to `components/plan/planConstants.ts`; in `app/(app)/manage/team.tsx` compute `staffPlanLimitReached` from `members.length` vs the cap (`venue.pricing_tier`), hide the invite FAB (`team.tsx:234`) when reached, and show an upgrade nudge linking to `/manage/plan`.
3. **Wire E.164 normalization into the three settings phone fields** (medium). Import the existing `lib/phone/normalize.ts normalizePhone()` into `account.tsx` (`buildProfilePatch`), `MyAccountSheet.tsx` (`handleSaveProfile`), and `venue-profile.tsx` (`handleSave`) — ideally behind a shared `PhoneInput` primitive with normalize-on-blur and inline validation.
4. **Add the booking-widget / QR embed surface** (medium). New "Share & embed" card in `app/(app)/manage/booking-page.tsx`: copy-to-clipboard iframe snippet (`expo-clipboard`), `embed_accent_colour` field via `useUpdateVenue`, and a QR generator with share/save — mirroring `WidgetSection`.
5. **Decide on Refer & Earn** (medium). Either build `app/(app)/referrals.tsx` + `useReferralsDashboard` and add an admin-gated destination in `settings.tsx`, or formally document referrals as an intentional app exclusion.
6. **Consolidate the two personal-account surfaces** (low). Extract a shared `useStaffAccountForm` hook so `account.tsx` and `MyAccountSheet.tsx` share validation, the email-change session refresh, and copy.
7. **Enrich the Plan trial messaging** (low). Add `billing_access_source` / trial-breakdown fields to `useBillingStatus.ts` and render a trial-days breakdown line + complimentary-access branch in `plan.tsx`.
