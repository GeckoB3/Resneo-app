# Plan & payments — parity ~8%

## App files
- app/(app)/manage/plan.tsx
- providers/VenueProvider.tsx
- types/venue.ts
- lib/env.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/settings/page.tsx
- _reference/Resneo/src/app/dashboard/settings/SettingsView.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/StripeConnectSection.tsx
- _reference/Resneo/src/app/api/venue/stripe-connect/route.ts
- _reference/Resneo/src/app/api/venue/billing/status/route.ts
- _reference/Resneo/src/app/api/billing/portal-session/route.ts
- _reference/Resneo/src/app/api/venue/appointments-plan/status/route.ts
- _reference/Resneo/src/app/api/venue/appointments-plan/change/route.ts
- _reference/Resneo/src/app/api/venue/appointments-plan/preview/route.ts
- _reference/Resneo/src/app/api/venue/change-plan/route.ts

## Summary
The app's plan.tsx renders two static read-only cards: (1) a Plan card showing tier, booking types, and currency drawn from the cached VenueBootstrap, plus a web link-out button; (2) a Payments card showing a Stripe-connected badge and another web link-out button. There is zero interactivity beyond the two Linking.openURL calls. The web page (Settings > Plan tab + Settings > Payments tab) is a comprehensive billing management hub with live Stripe polling, plan-change actions, a Stripe Customer Portal link, trial countdown, subscription status banners, SMS and calendar usage meters, inline upgrade/downgrade flows with proration previews, resubscribe checkout, subscription resumption, and a two-step Stripe Connect onboarding wizard with granular step indicators — none of which exist in the app.

## Recommendation
The Plan & payments screen is almost entirely a placeholder: it reads three static fields from the cached VenueBootstrap and offers nothing but two web link-outs, giving it roughly 8% functional parity with the web. Prioritise in this order. (1) Fix the critical bug where getApiUrl() points to the API server instead of the dashboard — add a EXPO_PUBLIC_WEB_URL env var and use it for both link-out buttons with correct ?tab= params. (2) Add a useBillingStatus hook calling GET /api/venue/billing/status and GET /api/venue/appointments-plan/status to get live plan_status, period dates, billing_quote, and calendar_count; replace the static VenueBootstrap read with this. (3) Implement the 'Manage Billing' button (POST /api/billing/portal-session + Linking.openURL) and refetch on AppState return — this single action unblocks card updates, invoice history, and cancellation for admins. (4) Fix the Stripe Connect status by fetching GET /api/venue/stripe-connect to distinguish not_connected / step1_pending / step2_pending / active states and render contextual banners and CTAs per the web's StripeConnectSection logic. (5) Add subscription status banners (cancelling, past_due, expired) with inline resume/resubscribe actions via POST /api/venue/change-plan. (6) Add SMS and calendar usage meters using data from the billing status response. (7) Add the Appointments plan change flow (POST /api/venue/appointments-plan/preview + POST /api/venue/appointments-plan/change) with a bottom-sheet confirmation showing proration amounts. All these backend routes already exist and require only Bearer-JWT auth that the app already handles.

## Gaps (14)

### [CRITICAL] Live billing status polling from Stripe — missing
- Backend: GET /api/venue/billing/status, GET /api/venue/appointments-plan/status
- Web behaviour: On mount the web fetches GET /api/venue/billing/status (no-cache). Response includes pricing_tier, plan_status, stripe_subscription_id, period start/end, billing_quote (next_charge.formatted, discount_summaries, coupon_titles), has_default_payment_method, and calendar_count. Also re-polls on window focus/visibilitychange after Stripe portal interactions. Additionally GET /api/venue/appointments-plan/status is called to sync live Stripe subscription state for Appointments plans.
- Mobile plan: Add a useBillingStatus hook in lib/queries/useBillingStatus.ts calling GET /api/venue/billing/status with react-query (staleTime: 0, cacheTime short). Expose plan_status, subscription_current_period_start/end, billing_quote. Re-fetch on AppState 'active' change (equivalent to visibilitychange). Use in plan.tsx instead of the static VenueBootstrap.

### [CRITICAL] Stripe Customer Portal — manage billing (card details, invoices, receipts, cancellation) — missing
- Backend: POST /api/billing/portal-session
- Web behaviour: Admin-only button calls POST /api/billing/portal-session, receives { url }, then opens the portal in a new tab. On return (?portal_return=1) the page re-fetches billing status and shows a success/cancellation banner.
- Mobile plan: Add a 'Manage Billing' Button in the Plan card. On press POST /api/billing/portal-session (with Bearer JWT), receive the Stripe portal URL and open via Linking.openURL. On app foreground return (AppState change), trigger a billing status refetch and show an inline success/cancellation banner. Admin-only: gate behind current_user_role === 'admin' from VenueBootstrap.

### [CRITICAL] Subscription status display — plan status pills, cancellation banners, expired access warning — missing
- Backend: GET /api/venue/billing/status
- Web behaviour: The Plan card shows a tier pill (neutral/success/brand) and a status dot pill (Active / Payment due / Cancelled) derived from venue.plan_status. A full-width amber banner shows when plan_status is 'cancelling' or 'cancelled' with future period end. A rose banner shows when plan_status is 'past_due'. An amber 'subscription has ended' banner shows when subscription has expired/cancelled and prompts resubscribe.
- Mobile plan: Use plan_status from useBillingStatus hook. Render status indicator (Badge/Pill) next to plan tier. Below the current-plan summary card, conditionally render status banners: amber for cancelling/cancelled-with-access, rose for past_due, amber for expired. Reuse existing Badge and Card components.

### [HIGH] Next billing date and estimated invoice amount — missing
- Backend: GET /api/venue/billing/status (billing_quote field)
- Web behaviour: The Plan card shows a 'Next billing' tile with subscription_current_period_end date and billing_quote.next_charge.formatted (from Stripe upcoming invoice preview). Shows coupon/discount summaries when present. Shows 'Access until' label when cancelling.
- Mobile plan: Add a two-column grid of info tiles: 'Current plan' (tier label + estimated next invoice from billing_quote.next_charge.formatted, coupon_titles) and 'Next billing' (period_end date, metered SMS note). All data comes from useBillingStatus hook.

### [HIGH] SMS usage meter (used / included per month with progress bar) — missing
- Backend: GET /api/venue/billing/status (calendar_count), GET /api/venue (sms_messages_sent_this_month via VenueBootstrap not currently exposed) — the web computes sms_monthly_allowance server-side via computeSmsMonthlyAllowance(tier, calendarCount).
- Web behaviour: Plan tab shows 'SMS usage' tile: sms_messages_sent_this_month / sms_monthly_allowance with a brand-coloured progress bar and percentage label. Overage rate shown (£0.04 per SMS segment for paid plans; cap note for free access). Usage window note shown when smsCountUsesStripePeriod.
- Mobile plan: Expose sms_monthly_allowance and sms_messages_sent_this_month in the venue bootstrap (GET /api/venue) or derive from billing status. Add an SMS Usage Card with a progress bar (use a View with percentage width, similar to web pattern). Show used/included counts and overage rate.

### [HIGH] Calendar usage meter (used / plan limit with progress bar) — missing
- Backend: GET /api/venue/billing/status (calendar_count field) or GET /api/venue/appointments-plan/status
- Web behaviour: Plan tab shows 'Calendar usage' tile: venue.calendar_count / planCalendarLimit(tier) with a sky-coloured progress bar. 'Unlimited' shown for pro tier.
- Mobile plan: Add a Calendar Usage Card alongside the SMS card. Derive planCalendarLimit from pricing_tier (constants are known: light=1, plus=5, appointments=Infinity). Show calendar_count from billing status response.

### [HIGH] Appointments plan upgrade/downgrade within existing subscription (Light / Plus / Pro) — missing
- Backend: POST /api/venue/appointments-plan/preview, POST /api/venue/appointments-plan/change
- Web behaviour: Admin-only, Appointments plan only: shows cards for each non-current tier (Light/Plus/Pro) with price, calendar/team/SMS limits, and a proration preview loaded via POST /api/venue/appointments-plan/preview { target_tier }. User confirms; action calls POST /api/venue/appointments-plan/change { target_tier }. Upgrades invoice immediately; downgrades create proration credit. Confirmation modal shows estimated charge (upgrade) or credit (downgrade). Disabled if plan_status is past_due, cancelling, or cancelled.
- Mobile plan: Add a 'Change plan' section in the Plan card, admin+appointments-plan only. Render plan option cards (Light/Plus/Pro) excluding current tier. On selection show a bottom sheet confirmation with proration preview (from POST /api/venue/appointments-plan/preview) and a Confirm button calling POST /api/venue/appointments-plan/change. After success refetch billing status and show a success banner.

### [HIGH] Subscription resumption (undo cancellation before period end) — missing
- Backend: POST /api/venue/change-plan
- Web behaviour: When plan_status === 'cancelling', the Plan tab shows a 'Changed your mind?' card with a 'Keep my plan' button that calls POST /api/venue/change-plan { action: 'resume_subscription' }. On success, reloads billing status.
- Mobile plan: Add an amber 'Changed your mind?' card (visible when plan_status === 'cancelling') with a 'Keep my plan' Button. On press POST /api/venue/change-plan { action: 'resume_subscription' } with Bearer JWT. On success refetch billing status and show confirmation banner.

### [HIGH] Resubscribe to cancelled plan via Stripe Checkout — missing
- Backend: POST /api/venue/change-plan
- Web behaviour: When subscription has expired/cancelled, the Plan tab shows a 'Your subscription has ended' banner with a Resubscribe button that calls POST /api/venue/change-plan { action: 'resubscribe' }. Response is either { redirect_url } (Stripe Checkout URL) or { ok: true }. Admin only.
- Mobile plan: Add 'Resubscribe' Button in the expired subscription banner. On press call POST /api/venue/change-plan { action: 'resubscribe' }; if redirect_url is returned open it with Linking.openURL (Stripe Checkout in browser). On successful return (AppState active) refetch billing status. Admin only.

### [HIGH] Stripe Connect onboarding — step indicator and start/continue/complete CTA — partial
- Backend: GET /api/venue/stripe-connect, POST /api/venue/stripe-connect
- Web behaviour: The Payments tab renders StripeConnectSection which: (1) calls GET /api/venue/stripe-connect to load charges_enabled + details_submitted; (2) renders a two-step progress indicator (Step 1: business/bank details, Step 2: identity verification); (3) renders contextual banners for each incomplete step; (4) on button press calls POST /api/venue/stripe-connect { return_path, refresh_path } to get an account link URL and redirects to Stripe. Handles not_connected / step1_pending / step2_pending / active / error states. Admin only; non-admins see 'Ask an admin' message.
- Mobile plan: Replace the current static badge with a live StripeConnectCard component. On mount fetch GET /api/venue/stripe-connect (if stripe_connected_account_id present). Show a 2-step visual indicator using React Native Views. On CTA press call POST /api/venue/stripe-connect and open returned URL with Linking.openURL. On app return (AppState active) re-fetch to reflect completed steps. Admin only: hide CTA for non-admin staff.

### [MEDIUM] Free trial countdown and referral bonus breakdown — missing
- Backend: GET /api/venue/billing/status (plan_status, subscription_current_period_end) — trial details may need a dedicated endpoint or be embedded in billing/status
- Web behaviour: The Plan tab renders a TrialBreakdownBanner when plan_status === 'trialing'. Shows days remaining, trial end date, standard days + referral bonus days breakdown, referrer venue name. Data comes from server-side loadVenueTrialBreakdown().
- Mobile plan: Add trial breakdown banner (conditionally shown when plan_status === 'trialing'). Compute daysRemaining from subscription_current_period_end. A simpler 'X days of free trial remaining' message without referral breakdown is sufficient initially.

### [MEDIUM] Free access / complimentary access mode display — missing
- Backend: GET /api/venue/billing/status (billing_access_source or free_access_granted_at fields)
- Web behaviour: When billing_access_source indicates superuser free access (isSuperuserFreeBillingAccess), the Plan tab shows 'Complimentary Resneo access' messaging, hides billing portal and plan-change controls, and shows 'No subscription charges. SMS is capped at your plan allowance.' None of the billing actions are rendered.
- Mobile plan: Expose billing_access_source in the billing status response. In the Plan card, detect free access mode and replace billing/portal actions with a 'Complimentary access' note badge.

### [MEDIUM] Past-due payment alert with inline CTA to update card — missing
- Backend: GET /api/venue/billing/status, POST /api/billing/portal-session
- Web behaviour: When plan_status === 'past_due', shows a rose 'Payment required' card with text explaining the last payment failed, and a 'Update payment method' button that triggers openManageBilling() (POST /api/billing/portal-session).
- Mobile plan: Add a rose alert card when plan_status === 'past_due'. Button opens Stripe portal via POST /api/billing/portal-session. Shares the same Linking.openURL flow as the general 'Manage Billing' action.

### [MEDIUM] Admin-only gating for billing actions (role check) — missing
- Backend: none — role is in VenueBootstrap (current_user_role)
- Web behaviour: The web checks isAdmin (staff.role === 'admin') throughout the Plan and Payments tabs. Non-admin staff see 'Ask an admin to...' messages instead of action buttons.
- Mobile plan: Use venue.current_user_role from VenueBootstrap (already available in VenueProvider). Gate all mutating Plan/Payments buttons behind current_user_role === 'admin'. Show a static info text ('Ask an admin to manage billing') for non-admin staff.

## Bugs spotted
- [high] getApiUrl() is used to construct the web link-out URL for 'Manage plan on web' and 'Manage Stripe on web'. getApiUrl() returns EXPO_PUBLIC_API_URL which is the backend API origin (e.g. https://api.resneo.com), not the web dashboard origin. The correct target should be the dashboard web app URL (e.g. https://app.resneo.com/dashboard/settings), not the API server. A user who taps the button will be sent to an API endpoint, not the dashboard. (app/(app)/manage/plan.tsx)
- [medium] Both 'Manage plan on web' and 'Manage Stripe on web' buttons link to the same path '/dashboard/settings' without a ?tab= query parameter. The web Settings page defaults to the 'profile' tab on load. The user will land on the Profile tab, not the Plan or Payments tab, which is confusing. The links should use '/dashboard/settings?tab=plan' and '/dashboard/settings?tab=payments' respectively. (app/(app)/manage/plan.tsx)
- [high] The app derives stripeConnected solely from !!venue.stripe_connected_account_id (a non-null ID means 'connected'). The web knows this is insufficient — having an account ID does not mean Stripe Connect onboarding is complete (step1_pending and step2_pending states both have an account ID but are not fully active). The app therefore incorrectly shows 'Stripe connected' badge and 'Online deposits and payments are enabled' copy for venues that have started but not completed Stripe onboarding. (app/(app)/manage/plan.tsx)
- [medium] The VenueBootstrap type (types/venue.ts) does not include plan_status, subscription_current_period_end, subscription_current_period_start, sms_monthly_allowance, sms_messages_sent_this_month, billing_access_source, or calendar_count. The plan.tsx screen therefore cannot show any live billing state even if the fields existed in the API response — they would be silently dropped by TypeScript. (types/venue.ts)

## Design notes
- The current page is purely informational (two read-only cards + two link-outs) making it feel like a dead-end. On mobile, Plan & Payments is a place users visit specifically to act (upgrade, fix a failed payment, check their next bill). Consider turning it into a genuinely actionable screen with at minimum a 'Manage Billing' portal link and a live subscription status badge.
- The Stripe Connect onboarding flow (POST /api/venue/stripe-connect + Linking.openURL) works well on mobile — Stripe's hosted onboarding is mobile-optimised. The app should open the Stripe URL in the system browser (Linking.openURL), not an in-app WebView, to satisfy Stripe's requirements for Express Connect.
- The plan upgrade/downgrade cards should use a vertical list on mobile (not the web's sm:grid-cols-2 layout). Each tier card needs enough tap target size (min 44pt) for the Upgrade/Downgrade button.
- Proration previews ('Pay £X today' / 'Credit £X') are especially valuable on mobile where users are deciding quickly. Show these as a prominent highlighted row above the confirm button in a bottom sheet, not inline text.
- SMS and calendar usage meters are high-value at-a-glance indicators. A horizontal progress bar with 'X / Y used' is a natural fit for mobile; consider a compact card row layout rather than the web's two-column grid.
- Plan status banners (cancelling, past_due, expired) must be visually prominent on mobile — use full-width coloured cards with a clear action button. The web uses text + button in a tight space; on mobile the button should be full-width.
- The 'Manage plan on web' link-out should be a last-resort fallback only. Given the backend routes are already deployed, admins should be able to complete all core billing actions (portal, plan change, resubscribe, Stripe connect) without leaving the app.
- Consider adding a Settings > Plan header subtitle that briefly states the current tier and status (e.g. 'Appointments Pro · Active') so users see the key fact before scrolling into the detail cards.
- The trial countdown banner (daysRemaining) is time-sensitive information users will check repeatedly during the trial period; it should appear at the very top of the Plan card on mobile so it is immediately visible.
- Non-admin staff should see a clearly labelled read-only view with a note such as 'Contact your admin to make changes'. Do not hide the plan information entirely — it is useful context even for non-admins.
