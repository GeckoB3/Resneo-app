# Today / Dashboard Home — parity ~38%

## App files
- C:\Resneo-app\app\(app)\today.tsx
- C:\Resneo-app\types\dashboard.ts
- C:\Resneo-app\lib\queries\useDashboardHome.ts
- C:\Resneo-app\lib\queries\useSetupStatus.ts
- C:\Resneo-app\lib\venue\venue-experience.ts
- C:\Resneo-app\lib\queries\keys.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\page.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\DashboardHomeClient.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\DashboardHomeForecastChart.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\SetupChecklist.tsx
- C:\Resneo-app\_reference\Resneo\src\lib\dashboard\dashboard-home-payload.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\dashboard-home\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\setup-status\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\setup-checklist-dismiss\route.ts
- C:\Resneo-app\_reference\Resneo\src\lib\venue\compute-setup-status.ts

## Summary
The app Today screen calls GET /api/venue/dashboard-home, displays four KPI tiles (today's count, confirmed/pending, arriving in 30 min, next up), a plain bar chart of the 7-day forecast, an alerts card, and a flat list of today's bookings (up to 10) with status pills. The setup checklist is shown for admins and can be dismissed. Booking rows are NOT tappable — users must navigate to the Bookings or Calendar tabs to open a booking detail. The web reference does significantly more: it shows a contextual greeting + date header with action buttons (Calendar/Bookings), richer KPI tiles with sparklines and sub-values, a full 7-day colour-coded capacity heatmap with per-service breakdown, a secondary-booking-activity section for table-primary venues with secondary booking models, deposit revenue tiles, coloured status strips on each diary row, a deposit-status pill per booking row, a referral trial credit banner for referred venues, a dynamic setup checklist with per-model step logic (events/classes/resources secondary catalog steps), tappable diary rows that link directly to the booking detail, and a 'View all / View calendar' link at the bottom of the diary. Most critically: the web's dashboard-home payload now includes a heatmap array and secondary_booking_activity object that the app's DashboardHomePayload type does not model at all, and the app's SetupStatus interface is missing secondary catalog fields (secondary_event_catalog_ready, secondary_class_catalog_ready, secondary_resource_catalog_ready) compared to the web.

## Recommendation
The Today screen has the data pipeline correct (GET /api/venue/dashboard-home, auth, react-query) but renders only a fraction of the available payload. The single highest-impact change is making today's booking rows tappable to open the booking detail — this is a one-line Pressable wrapper with router.push('/booking/[id]'), mirrors exactly the Calendar tab pattern, and is the primary at-the-counter action. Immediately after that: (1) fix the percentage-height bar chart bug on Android by converting to an SVG/react-native-svg implementation; (2) extend DashboardHomePayload and SetupStatus types to include heatmap, secondary_booking_activity, and the secondary_*_catalog_ready setup fields so that TypeScript catches future mismatches; (3) add the deposit_status pill to each diary row (the data is already returned); (4) enrich the Confirmed KPI tile with the seated count and confirmation percentage already present in the payload; (5) add the 'Today's capacity' card (in-house now, arriving soon, fill bar) for non-appointment venues using the already-returned today.covers_in_house_now and today.peak_fill_percent fields; and (6) add a greeting/date header with navigation shortcuts to Calendar and All Bookings. The heatmap, secondary booking activity section, sparklines, and referral banner are secondary polish work and can follow once the above critical/high items are resolved.

## Gaps (14)

### [CRITICAL] Tappable today's-bookings diary rows (navigate to booking detail) — missing
- Backend: GET /api/venue/bookings/[id] (already used by booking detail page in the app)
- Web behaviour: Each diary row in the Today's bookings section is clickable and opens the full booking detail page at /dashboard/bookings/[id]. This is the primary at-the-counter action.
- Mobile plan: Wrap each row in a Pressable in today.tsx and call router.push(`/booking/${booking.id}`) (same pattern as CalendarDayGrid uses in app/(app)/(tabs)/index.tsx). Consider adding the BookingPeekSheet bottom-sheet pattern used in the Calendar tab for a consistent quick-look before full-detail.

### [HIGH] Deposit status pill per diary row — missing
- Backend: none
- Web behaviour: Each diary row in the web shows a second Pill for deposit_status (e.g. 'Paid', 'Pending', 'N/A'). The field is already present in DashboardRecentBooking but never rendered in the app.
- Mobile plan: In today.tsx, add a second StatusPill (or a plain text chip) next to the existing status pill, using booking.deposit_status. Conditionally hide when deposit_status is 'N/A'.

### [HIGH] 7-day capacity heatmap (colour-coded fill % per day, with per-dining-service breakdown) — missing
- Backend: GET /api/venue/dashboard-home — heatmap is already computed server-side and included in the JSON response; the app simply discards it.
- Web behaviour: The web renders a '7-day capacity outlook' section from payload.heatmap[] showing each day's fill_percent as a heat-coloured block (grey/brand/amber/red). For service-engine venues it stacks per-service rows. The app's DashboardHomePayload type has no heatmap field and the UI does not render it.
- Mobile plan: Add heatmap: Array<{date,day,daily_total_covers,peak_in_house_covers,concurrent_cap,fill_percent|null,by_service?}> to DashboardHomePayload in types/dashboard.ts. Build a HeatmapWeek component in components/ui that renders a horizontal row of 7 day-tiles with background colour driven by fill_percent (null=grey, 0-39=brand-light, 40-69=brand, 70-89=amber, 90+=red). For appointments-first venues this section is low-priority (it is hidden on the web too when useAppointmentPhraseology is true).

### [MEDIUM] Contextual greeting + full date header — missing
- Backend: none
- Web behaviour: The web header shows an eyebrow weekday ('Monday'), a greeting ('Good morning/afternoon/evening'), and a subtitle with the full UK date. The app Stack.Screen title is simply 'Today'.
- Mobile plan: Replace the static Stack.Screen title with a header rendered in today.tsx: compute greeting from device time (same logic as web formatGreeting()), show weekday + date using the venue timezone from useVenueContext(). Can be a two-line header Card placed before SetupChecklistCard.

### [MEDIUM] Quick-action buttons: 'Calendar' / 'All appointments' CTAs in the page header — missing
- Backend: none
- Web behaviour: The web header has two action buttons: one navigating to /dashboard/calendar or /dashboard/day-sheet, and one navigating to /dashboard/bookings. These are the most clicked actions on the dashboard.
- Mobile plan: Add two Button rows (or a horizontal pill strip) in today.tsx below the greeting: 'View calendar' → router.push('/(app)/(tabs)/') and 'All bookings' → router.push('/(app)/(tabs)/bookings'). Style as outlined + filled buttons to match importance hierarchy.

### [MEDIUM] Confirmed stat tile: sub-values showing seated count and confirmation percentage — partial
- Backend: none
- Web behaviour: The web's Confirmed tile shows `confirmed/bookings` as the main value, a sub-value line 'X% of bookings', and a second sub-value line '${seated} seated · ${pending} pending'. The app only shows today.confirmed as the main value with 'X pending' as the hint.
- Mobile plan: In today.tsx Kpi component (or a new AppointmentKpi variant), compute attendanceConfirmedPct = bookings > 0 ? Math.round((confirmed/bookings)*100) : null. Render the tile value as `${confirmed}/${bookings}`, sub-hint as `${pct}% confirmed`, second hint as `${seated} seated` (only when seated > 0). today.seated is already in DashboardTodayStats.

### [MEDIUM] Covers/appointments tile sparkline (7-day forecast inline mini-chart on the KPI tile) — missing
- Backend: none
- Web behaviour: The web's DashboardStatCard embeds a MiniSparkline (recharts sparkline) using forecastSpark values derived from payload.forecast on the main today KPI tile and confirmed tile.
- Mobile plan: Build a lightweight MiniSparkline RN component (simple SVG polyline using react-native-svg). Render it inside the primary KPI tile using the forecast data already loaded by useDashboardHome.

### [MEDIUM] Today's capacity panel (in-house now + arriving soon + fill bar for table venues) — missing
- Backend: none — all fields (covers_in_house_now, arriving_within_30_min, peak_fill_percent, concurrent_cap, peak_in_house_covers) are already in DashboardTodayStats and returned by the API.
- Web behaviour: For table-reservation venues the web shows a dedicated card with: a pulsing green dot when inHouseNow > 0, 'Busiest time: X of Y covers', a fill-percent progress bar, and two mini stat boxes for 'in house now' and 'arriving soon'. Hidden for appointment venues.
- Mobile plan: Add a CapacityCard component in today.tsx rendered only when !isAppointment. Use today.covers_in_house_now, today.arriving_within_30_min, today.peak_fill_percent, today.concurrent_cap. Render a View with two mini stat boxes and, when concurrent_cap is non-null, a fill-bar (Animated.View with widthPercent).

### [MEDIUM] Revenue tile / deposit revenue KPI — missing
- Backend: none — today.revenue already in DashboardTodayStats type.
- Web behaviour: The web's secondary_booking_activity section includes a 'Deposit revenue · other types' tile (£X.XX). For appointments-only venues there is no explicit revenue tile on the web either, but today.revenue is computed server-side and present in the payload.
- Mobile plan: Add a Kpi tile for 'Deposit revenue' showing formatted currency (today.revenue.toFixed(2) with £ prefix) only when today.revenue > 0. Low priority for pure-appointment venues since the web also omits it there.

### [MEDIUM] 'Today by booking type' breakdown chips (multi-model venues) — missing
- Backend: GET /api/venue/dashboard-home — today_by_booking_model already present in DashboardHomePayload type and returned by the API.
- Web behaviour: When today_by_booking_model has more than one key the web renders a chip strip labelled by booking model (e.g. 'Table 12 · Appointment 4'). Sorted by BOOKING_MODEL_ORDER.
- Mobile plan: In today.tsx add a horizontal chip row (FlatList horizontal) using payload.today_by_booking_model entries, sorted by BOOKING_MODEL_ORDER. Render only when Object.keys(today_by_booking_model).length > 1. Use the Chip component from components/ui/Chip.

### [LOW] Secondary booking activity section (table-primary venues with secondary models) — missing
- Backend: GET /api/venue/dashboard-home — secondary_booking_activity included in response when applicable.
- Web behaviour: For tableFocusSecondariesEnabled venues the web renders a complete 'Other booking types' section with four additional KPI tiles (bookings, confirmed, deposit revenue, next up) and a 7-day chart for non-table bookings. Calls GET /api/venue/dashboard-home and reads payload.secondary_booking_activity.
- Mobile plan: Add secondary_booking_activity?: {today: ...; forecast: ...} and table_focus_secondaries_enabled?: boolean to DashboardHomePayload in types/dashboard.ts. In today.tsx, render a collapsible SectionCard 'Other booking types' beneath the main KPI grid when payload.table_focus_secondaries_enabled is true. Re-use the Kpi component and ForecastChart. Mark low priority as this only applies to hybrid restaurant/appointment venues.

### [LOW] Setup checklist: secondary catalog steps (events/classes/resources) — partial
- Backend: GET /api/venue/setup-status — the route already returns these fields but the app SetupStatus interface in lib/queries/useSetupStatus.ts does not include them.
- Web behaviour: The web SetupChecklist computes getSecondaryCatalogSteps() and adds steps for secondary_event_catalog_ready, secondary_class_catalog_ready, secondary_resource_catalog_ready when the venue has those enabled_models. GET /api/venue/setup-status returns all these fields in SetupStatus.
- Mobile plan: Add secondary_event_catalog_ready, secondary_class_catalog_ready, secondary_resource_catalog_ready, onboarding_completed, booking_model, active_booking_models, enabled_models, pricing_tier to the SetupStatus interface. The app checklist is appointment-only scope so secondary catalog steps can be omitted from the rendered list, but having the full type prevents silent mismatch.

### [LOW] Referral trial credit banner — missing
- Backend: None currently exposed; the web reads directly from DB. Would need a new GET /api/venue/referral-status route or inclusion of refereeBannerData in the dashboard-home payload.
- Web behaviour: The web page.tsx queries the referrals and venues tables server-side and, when a venue is in 'referee_signed_up' status and still trialling, renders a green banner: 'Your referral month is active. Trial: 14 days + N days referral credit. Your first charge will be on [date].'
- Mobile plan: Low priority. If added, include a refereeBanner?: {trialEndDisplay: string|null} field in DashboardHomePayload and render a dismissible InfoBanner Card above SetupChecklistCard. Requires backend route addition.

### [LOW] Diary 'View all' / 'View calendar' link at foot of today's bookings section — missing
- Backend: none
- Web behaviour: The web renders a 'View all / View calendar' link at the top-right of the diary section header, and when bookingsCountAllModes > 10 a footer link 'N more bookings, view all'. Navigates to /dashboard/bookings or /dashboard/calendar.
- Mobile plan: Add a Text link ('See all bookings →') below the recent bookings Card that calls router.push('/(app)/(tabs)/bookings'). Add a badge on the card header showing count when recent_bookings.length >= 10.

## Bugs spotted
- [medium] DashboardHomePayload in types/dashboard.ts does not include the heatmap field, but the backend already returns it. The payload is cast to DashboardHomePayload so TypeScript silently discards heatmap; adding heatmap-dependent features later will silently receive undefined data without a type error. (C:\Resneo-app\types\dashboard.ts)
- [medium] SetupStatus in lib/queries/useSetupStatus.ts is missing onboarding_completed, pricing_tier, booking_model, active_booking_models, enabled_models, secondary_event_catalog_ready, secondary_class_catalog_ready, and secondary_resource_catalog_ready. The web's /api/venue/setup-status route returns all of these. The truncated interface means the checklist cannot correctly show booking-model-specific step copy or secondary catalog steps, and any code referencing these fields will get undefined without a TypeScript error. (C:\Resneo-app\lib\queries\useSetupStatus.ts)
- [low] In today.tsx the Kpi component for 'Today's appointments/covers' shows String(today.bookings) or String(today.covers) depending on isAppointment, but the hint for the 'Confirmed' tile is hardcoded as `${today.pending} pending` without any guard for when today.pending is 0. This causes '0 pending' to appear as a hint even when there are no pending bookings, which is visually noisy. (C:\Resneo-app\app\(app)\today.tsx)
- [medium] The ForecastChart in today.tsx uses the native `height` string prop with a percentage value: `{ height: \`${Math.round((value / max) * 100)}%\` }` on the bar View inside a barTrack View with `flex: 1`. React Native does not support percentage string values for height on plain Views (only for width when the parent has a known size). This is likely to produce incorrect bar heights on Android. (C:\Resneo-app\app\(app)\today.tsx)
- [low] isAppointmentExperience() in today.tsx receives payload?.enabled_models ?? venue?.enabled_models as the third argument. The web DashboardHomePayload types enabled_models as unknown (from the DB column); at runtime this arrives as string[] but the TypeScript type is unknown, so the isAppointmentExperience call compiles only because venue.enabled_models (from VenueProvider, typed as string[]) is the fallback. If the API returns enabled_models at the top level and it is falsy, the fallback is venue?.enabled_models which may reflect stale bootstrap data from a different session. (C:\Resneo-app\app\(app)\today.tsx)

## Design notes
- The four KPI tiles use flexBasis: '46%' which on narrow phones (< 375 pt) may force a tile to a third line. Use a fixed minWidth or a 2-column grid approach to guarantee 2-per-row on all devices.
- The forecast bar chart uses a custom hand-drawn bar chart with percentage-height bars. This is brittle on Android (percentage heights on flex children fail silently). Replace with a minimal SVG-based implementation using react-native-svg for reliable cross-platform rendering.
- The 'Today's bookings' list rows have no press feedback (no Pressable wrapper). Since rows will need to be tappable (booking detail nav), adding ripple/press feedback from the start avoids a subsequent visual regression.
- The footnote 'Tap a booking in Bookings or the Calendar to manage it.' is the only pointer to booking actions. Once rows are made tappable this note should be removed or updated to avoid confusion.
- The alerts card uses a hardcoded borderColor: colors.warning with borderWidth: 1 but does not distinguish between 'warning' and 'info' alert types — the web renders warning alerts in amber and info alerts in blue. Add type-conditional styling.
- There is no pull-to-refresh skeleton; the spinner appears inside the existing content during refetch. Consider showing a subtle top-of-page progress bar (similar to web's sr-only 'Refreshing dashboard data') rather than the default RefreshControl spinner which is visually inconsistent with the otherwise card-based design.
- The page has no empty-state for the case where the query succeeds but payload.today.bookings === 0 AND recent_bookings is empty beyond the inner empty state. The overall page still shows four KPIs all reading '0' or '—', which is valid but could be warmer with a 'Quiet day ahead' illustration.
- KPI tile labels are in plain sentence-case ('Today's appointments') while the web uses mixed approaches. On small phones the label truncates with numberOfLines={1}; the label 'Today's appointments' (21 chars) clips on 320 pt wide devices. Use a shorter label like 'Today' for the count tile.
