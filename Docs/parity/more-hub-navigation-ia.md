# More hub (navigation IA) — parity ~68%

## App files
- C:\Resneo-app\app\(app)\(tabs)\settings.tsx
- C:\Resneo-app\app\(app)\(tabs)\_layout.tsx
- C:\Resneo-app\app\(app)\today.tsx
- C:\Resneo-app\app\(app)\waitlist.tsx
- C:\Resneo-app\app\(app)\notifications.tsx
- C:\Resneo-app\app\(app)\reports.tsx
- C:\Resneo-app\app\(app)\availability.tsx
- C:\Resneo-app\app\(app)\manage\venue-profile.tsx
- C:\Resneo-app\app\(app)\manage\hours.tsx
- C:\Resneo-app\app\(app)\manage\team.tsx
- C:\Resneo-app\app\(app)\manage\booking-settings.tsx
- C:\Resneo-app\app\(app)\manage\communications.tsx
- C:\Resneo-app\app\(app)\manage\compliance.tsx
- C:\Resneo-app\app\(app)\manage\plan.tsx
- C:\Resneo-app\app\(app)\manage\services.tsx

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\DashboardSidebar.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\DashboardShell.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\layout.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\SettingsView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\StaffPersonalSettingsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\LinkedAccountsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\support\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\reports\ReportsView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\reports\DataExportSection.tsx

## Summary
The app's More hub (settings.tsx) is a well-structured iOS Settings-style menu that serves as the navigation entry point for all screens beyond the four main tabs. It shows a staff profile header, then grouped menu rows: Workspace (Today, Waitlist, Calendar Availability, Notifications, Reports), Manage (Services, Venue Profile, Business Hours, Team, Booking Settings, Communications, Compliance, Plan & Payments, Booking Page web link-out), Booking Types (secondary models — Classes/Events/Resources/Tables — shown only when enabled, all open on web), App (Push Notifications re-register, Web Dashboard link-out), and a Sign Out button. Most Manage sub-pages are fully implemented in-app. The web equivalent is a sidebar with Home, Bookings, New Booking, Contacts, Services (model-based), Waitlist, Calendar Availability, Settings (tabbed: Profile, Business Hours, Booking Settings, Booking Page, Plan, Payments, Communications, Compliance, Staff, Reports, Refer & Earn, Linked Accounts), Support, and sign-out. The web also has a Support form page at /dashboard/support that posts to /api/venue/support. The app has no Support entry anywhere, no personal account settings entry (name/email/phone/password for staff users), no Linked Accounts section, no Refer & Earn section, no CSV data export capability, and the Plan & Payments sub-page is a read-only stub that link-outs to web rather than implementing the in-app billing actions the web provides.

## Recommendation
The More hub itself is well-structured and the core navigation IA maps closely to the web sidebar. The highest-priority gaps to close are: (1) Add a Support screen (app/(app)/support.tsx) posting to /api/venue/support — this is a one-day build and is conspicuously absent; add it as a MenuRow in the App group. (2) Add a personal Account Settings screen for name/email/phone/password — every staff user needs this self-service; the web hides the full venue settings from non-admins and shows only this section. (3) Enhance the Plan & Payments screen to fetch /api/venue/billing/status on mount and render live SMS usage, calendar usage, plan status badge, and a 'Manage Billing' button that opens the Stripe Customer Portal via /api/billing/portal-session — this avoids the full web context for a very common action. (4) Add a Linked Accounts read-only view for admins who use the inter-venue feature (the notification bell badge already fires from this data). (5) Fix the URL construction bug in plan.tsx and team.tsx (use the webDashboardUrl helper from settings.tsx consistently). (6) Add at minimum a native date-picker to the Availability screen to replace the day-stepper. Secondary improvements: extend Business Hours to include opening exceptions, add a CSV export to Reports using expo-sharing, and add deep-link navigation from notification rows to the referenced booking or client.

## Gaps (12)

### [HIGH] Support / contact Resneo — missing
- Backend: /api/venue/support (POST) — likely deployed
- Web behaviour: Web has /dashboard/support — a form (category, subject, message, optional email/phone) that POSTs to /api/venue/support. Also shows 'Browse the help centre' link to /help. Available to all roles.
- Mobile plan: Add app/(app)/support.tsx screen with a ScrollView form: category Picker/Segmented, subject/message Input, optional email/phone fields. POST via the existing api client. Add a 'Support' MenuRow to the App section of More hub. Low-touch implementation, no special auth needed beyond existing session.

### [HIGH] Personal account settings (name, email, phone, password) for staff users — missing
- Backend: /api/venue/staff/me (GET/PATCH) — likely deployed
- Web behaviour: Web /dashboard/settings shows StaffPersonalSettingsSection for staff-role users: edit display name, sign-in email, phone; change password via Supabase auth. Calls /api/venue/staff/me (GET) and presumably PATCH, plus Supabase updateUser for password. Available to all roles.
- Mobile plan: Add app/(app)/manage/account.tsx screen. Load own profile via useStaffMe (already exists). Add PATCH support to /api/venue/staff/me for name/phone. Password change via supabase.auth.updateUser. Add 'Account settings' MenuRow in More hub (visible to all staff, not just admins), placed under the profile card or in a new Account group.

### [HIGH] Plan management — in-app billing actions (Stripe portal, plan upgrades/downgrades, resubscribe) — partial
- Backend: /api/venue/billing/status, /api/venue/appointments-plan/status, /api/venue/appointments-plan/preview (POST), /api/venue/appointments-plan/change (POST), /api/billing/portal-session (POST), /api/venue/change-plan (POST)
- Web behaviour: Web Settings → Plan tab fetches /api/venue/billing/status, /api/venue/appointments-plan/preview (POST), /api/venue/appointments-plan/status; allows upgrade/downgrade via /api/venue/appointments-plan/change (POST), opens Stripe Customer Portal via /api/billing/portal-session (POST), resumes/resubscribes via /api/venue/change-plan (POST). Shows SMS usage % and calendar usage bars, trial countdown, plan expiry warnings, coupon details.
- Mobile plan: Enhance app/(app)/manage/plan.tsx: (1) Fetch /api/venue/billing/status on mount to show live SMS usage bar, calendar usage, next billing date, plan status badge, coupon summaries — these are already rendered on web and do not require a browser. (2) Add 'Manage Billing' button that calls /api/billing/portal-session and opens the returned URL via Linking.openURL — this keeps Stripe Portal on web (appropriate for mobile). (3) Show subscription expiry / past_due warning banners. (4) Plan tier change stays as web link-out (complex proration flow is appropriate for web). This achieves ~80% parity without needing browser navigation for the status read path.

### [MEDIUM] Refer & Earn programme — missing
- Backend: /api/venue/referrals/dashboard (GET) — may not be deployed
- Web behaviour: Web Settings → Refer & Earn tab is admin-only when referralProgrammeEnabled(). Shows referral code, link, and reward status loaded from /api/venue/referrals/dashboard or similar. Conditionally shown tab.
- Mobile plan: Add app/(app)/manage/refer-earn.tsx screen. Conditionally show 'Refer & Earn' MenuRow in More hub for admins only, guarded by a featureFlags?.referralProgrammeAvailable check. Fetch via dedicated query. Mark low priority pending backend route confirmation.

### [MEDIUM] Linked Accounts management — missing
- Backend: /api/venue/linked-accounts/* (GET, POST, PATCH, DELETE) — likely deployed (notification bell already uses useNotifications)
- Web behaviour: Web Settings → Linked Accounts tab (admin only, not restaurant tier). Full CRUD: invite a linked venue by slug, accept/reject incoming invitations, manage grant permissions (calendar visibility, booking access), notification preferences per link. Calls multiple /api/venue/linked-accounts/* routes. Notification bell in sidebar footer also depends on this.
- Mobile plan: Add app/(app)/manage/linked-accounts.tsx screen with list of accepted links and invite flow. The useNotifications hook already works for the badge count. Add 'Linked Accounts' MenuRow in More hub for admins on non-restaurant tiers. Initially read-only list with link-out to web for editing is acceptable; full management would use the linked-accounts API endpoints.

### [MEDIUM] CSV data export (bookings and guests/clients) — missing
- Backend: /api/venue/export?type=bookings and /api/venue/export?type=guests (GET)
- Web behaviour: Web Reports page → DataExportSection allows downloading bookings CSV and guest/client CSV via GET /api/venue/export?type=bookings and /api/venue/export?type=guests. File saved to downloads folder.
- Mobile plan: Add export buttons to the app's Reports screen (reports.tsx). On mobile, use expo-file-system + expo-sharing: fetch the CSV blob from /api/venue/export?type=bookings|guests with Bearer auth, write to FileSystem.cacheDirectory, then Share.shareAsync() to trigger the native share sheet (saves to Files, shares via email, etc.). This is the correct mobile-native pattern.

### [MEDIUM] Advanced Reports — revenue timeline, booking-source breakdown, by-source chart, no-show rate series — partial
- Backend: /api/venue/reports (GET) — already called by app
- Web behaviour: Web reports include a full BaselineMetricsSection (revenue timeline chart, booking source pie, by-practitioner/service tables with charts, no-show rate series over time), a tabbed UI (Overview / Clients / Export), and visual stat tiles. Calls /api/venue/reports and /api/venue/reports/metrics. App only shows flat stat rows from the same API.
- Mobile plan: Enhance reports.tsx to (1) show revenue totals from existing data, (2) add a simple booking-by-source breakdown from report7_appointment_insights.by_booking_source, (3) render a sparkline/bar for no-show rate over the period from report2_no_show_series (already in the query response). Full charted BaselineMetrics is web-only for now.

### [MEDIUM] Business Hours — one-off closures and opening exceptions — partial
- Backend: PATCH /api/venue/settings (already used by useUpdateVenue)
- Web behaviour: Web Settings → Business Hours tab includes BusinessClosuresSection for one-off exceptions (closed dates, partial-hour overrides). The manage/hours.tsx app screen explicitly notes 'One-off closures and per-service custom availability are managed on the web dashboard.' Web calls PATCH /api/venue/settings to save venue_opening_exceptions JSONB.
- Mobile plan: Extend app/(app)/manage/hours.tsx to add a 'Closures & exceptions' section below the weekly hours editor. Render a list of existing exceptions from venue.venue_opening_exceptions, allow add/remove individual closure entries (date, closed=true or custom time range). Save via useUpdateVenue with venue_opening_exceptions patch. No new backend route needed.

### [MEDIUM] Team management — invite staff, edit roles, remove members, per-calendar access — partial
- Backend: /api/venue/staff/invite (POST), /api/venue/staff/[id] (PATCH/DELETE) — may or may not be deployed
- Web behaviour: Web Settings → Staff tab shows full CRUD: invite by email, set role (admin/staff), assign calendar columns, set public booking visibility, remove members. Calls /api/venue/practitioners (GET/POST/PATCH/DELETE) and /api/venue/staff/* routes.
- Mobile plan: The current team.tsx is read-only with a web link-out for inviting. As a minimum enhancement: add inline role-display with an admin-only 'Edit' button per member that opens a Sheet allowing role toggle (admin/staff). Invite stays as web link-out until the invite endpoint is confirmed deployed.

### [LOW] Booking page settings — public URL, branding, embed widget, QR code — partial
- Backend: PATCH /api/venue/settings (for slug, accent), image upload endpoints
- Web behaviour: Web Settings → Booking Page tab has full branding editor (cover photo, logo, accent colour, font presets, booking page slug, embed code, QR code). App shows this as an external web link-out in the 'Booking page' menu row.
- Mobile plan: A minimal in-app screen could show the venue's public booking URL and a QR code generated from it (using a native QR library), plus a copy-link button. Full branding editor (image upload, Konva canvas cropping) appropriately stays on web. This would give the at-counter QR-code use case without full web navigation.

### [LOW] Communications — full message template editor (edit email/SMS body text) — partial
- Backend: PATCH /api/venue/settings for communication_templates JSONB
- Web behaviour: Web CommunicationTemplatesSection allows editing the full template body text for each message type per channel (email HTML template, SMS body). App communications.tsx only allows toggling enabled/channels/timing/optional extra lines — not the base template body.
- Mobile plan: Current app coverage of the frequently-changed fields (enable, channels, timing, custom lines) is appropriate for mobile at-counter use. Full template body editing is complex (HTML preview needed for email) and should remain a web function. No action needed unless explicitly prioritized.

### [LOW] Classes / Events / Resources / Tables booking-type management — partial
- Backend: none — web link-out is intentional
- Web behaviour: Web has dedicated pages for each secondary booking model: /dashboard/class-timetable, /dashboard/event-manager, /dashboard/resource-timeline, /dashboard/table-grid+floor-plan. App correctly opens these as external web links under the 'Booking types' group when those models are enabled.
- Mobile plan: This is intentional scope (out-of-scope for appointments-only app). Keep the web link-out pattern. No change needed.

## Bugs spotted
- [low] In settings.tsx the SECONDARY_MODEL_ROWS filter uses a Set built from three venue model fields (active_booking_models, enabled_models, booking_model) but the Set constructor call is wrapped in spread syntax: `new Set<BookingModel>([...(venue?.active_booking_models ?? []), ...(venue?.enabled_models ?? []), ...(venue?.booking_model ? [venue.booking_model] : [])])`. This is functionally correct but the Set<BookingModel> generic is redundant since the array element type is already inferred. More importantly, if venue is undefined (still loading), `enabledSecondaryRows` is computed to an empty array on every render during the loading state since the venue-not-yet-loaded guard comes after the `enabledSecondaryRows` assignment. This means the loading state renders the profile header twice per load cycle (one with empty rows, then correct data). Not a crash but wasteful. (C:\Resneo-app\app\(app)\(tabs)\settings.tsx)
- [medium] In plan.tsx, the `openWeb` helper constructs URLs as `${getApiUrl()}${path}` where getApiUrl() likely returns the API base (e.g. https://api.resneo.com) not the web dashboard root. The web dashboard lives at a different origin than the API. If getApiUrl() returns the API server URL, opening '/dashboard/settings' will 404. The same helper pattern is in team.tsx and the openWeb function in settings.tsx has a try/catch fallback to 'https://reserve-ni.vercel.app' — but plan.tsx does not have that fallback, so errors silently fail to open the correct URL. (C:\Resneo-app\app\(app)\manage\plan.tsx)
- [medium] In manage/team.tsx the `openWebStaff` function hardcodes `${getApiUrl()}/dashboard/settings` without the fallback URL that settings.tsx uses. If getApiUrl() returns the API server URL rather than the web dashboard URL, the link will navigate to the wrong domain (same issue as plan.tsx). The consistent pattern in settings.tsx uses webDashboardUrl() with a fallback — team.tsx and plan.tsx skip this utility. (C:\Resneo-app\app\(app)\manage\team.tsx)
- [medium] In availability.tsx (calendar availability screen), the date steppers for block-time and leave creation use addDaysToDateStr arithmetic but there is no date-picker or calendar date-selector: the user must step day-by-day from today. For leave periods spanning many days (e.g., two-week holiday) this requires tapping the increment button 14 times for the end date alone. The web uses a date-range picker. There is no upper bound on how far ahead a date can be set via the stepper, so invalid far-future dates can be submitted. (C:\Resneo-app\app\(app)\availability.tsx)
- [medium] In notifications.tsx, tapping a notification row marks it as read (via markRead.mutate) but does NOT navigate the user anywhere — no deep-link to the related booking or linked-account event. The web notification bell navigates to the relevant resource. For linked-account notifications (actorVenueName is shown) there is no action taken, making notifications informational only with no actionable tap target. (C:\Resneo-app\app\(app)\notifications.tsx)
- [low] In booking-settings.tsx the `handleSave` function sends `active_booking_models: ordered` always — even when only requireLogin changed. This means a models update is always sent alongside a requireLogin-only change, which could unintentionally overwrite active_booking_models with the locally-derived value if the server has changed it since the page loaded (stale data window). The web's BookingTypesSection and RequireAccountLoginSection patch independently. (C:\Resneo-app\app\(app)\manage\booking-settings.tsx)

## Design notes
- The More hub page title 'More' is shown at the top as a display-size Text — on small iPhones (SE, 12 mini) the long list of menu groups requires a lot of scrolling before reaching Sign Out. Consider adding a sticky 'Sign out' option or moving it closer to the profile card (iOS Settings places the account section at top with sign-out immediately below — this pattern is already followed but the amount of content in between on admin accounts can push it very far down).
- The profile header card shows name, venue name, and role badge but does NOT show the staff member's avatar photo or the venue logo. The web sidebar footer shows the venue initial letter in a branded circle. Adding the venue logo or staff photo to the profile card would reinforce identity context at a glance.
- The unread notification count badge on the More tab (from _layout.tsx) correctly badges the tab, but tapping the tab goes to the More hub list rather than directly to the Notifications screen. Standard mobile pattern (Instagram, Slack) is to navigate directly to the notifications feed when tapping a badged tab. Consider routing to /notifications when the tab is tapped and a badge is present.
- The 'Booking page' menu row (external link to web) should show the venue's public booking URL as a hint/subtitle so staff can verify which URL it will open. Currently it only says 'Public page, branding & widget' as the hint.
- The HoursStepper in availability.tsx (block time/leave creation) is friction-heavy for picking dates — a native DateTimePicker (from @react-native-community/datetimepicker, already a common Expo SDK 56 dependency) would give the native date picker UX expected on iOS and Android for the date fields.
- The 'Push notifications' row in the App group uses a regular MenuRow that fires an Alert on success/failure. On iOS this is fine. On Android, the Alert dismiss and re-trigger pattern can feel clunky; consider an inline status indicator (a small checkmark or 'Registered' badge) that persists after successful registration rather than dismissing.
- Reports screen has no chart visualisation — just flat stat rows. A simple bar chart for the 7-day no-show series (already in the query response as report2_no_show_series) using react-native-svg or a lightweight charting library would significantly improve the value of the Reports screen without new API calls.
- The app does not show any subscription status warning banner on the More hub or anywhere else, unlike the web dashboard which shows prominent amber/rose banners for expired/past_due subscriptions in the layout header. An admin seeing plan_status='past_due' or 'cancelled' should get a clear in-app warning — at minimum a banner or a highlighted 'Plan & payments' row with a warning badge.
