# Reports — parity ~22%

## App files
- app/(app)/reports.tsx
- types/reports.ts
- lib/queries/useReports.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/reports/page.tsx
- _reference/Resneo/src/app/dashboard/reports/ReportsView.tsx
- _reference/Resneo/src/app/dashboard/reports/DataExportSection.tsx
- _reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx
- _reference/Resneo/src/app/dashboard/reports/BaselineMetricsSection.tsx
- _reference/Resneo/src/app/dashboard/reports/SmsUsageBanner.tsx
- _reference/Resneo/src/app/api/venue/reports/route.ts
- _reference/Resneo/src/app/api/venue/reports/booking-log-email/route.ts
- _reference/Resneo/src/app/api/venue/export/route.ts

## Summary
The app's Reports screen (app/(app)/reports.tsx) fetches from GET /api/venue/reports?from=&to= (Bearer-JWT, admin-only) and renders six stat cards: Bookings summary, No-shows and cancellations combined, Deposits, Clients summary, By practitioner, By service, and Add-on revenue. It uses a 3-option preset segmented control (7d / 30d / 90d) for the date range. The web equivalent (ReportsView.tsx, surfaced via /dashboard/settings?tab=reports) goes far beyond this: it has free-form date pickers with an explicit Apply button, two sub-tabs (Overview / Clients), interactive Recharts visualisations (pie charts, bar charts, line charts) for booking sources, status, no-show rate over time, and practitioner/service performance, a full Clients sub-tab (paginated searchable sortable client directory with tag filtering, expandable guest detail rows with inline edit, booking history, GDPR erase, and CSV export), a Baseline Metrics (Report 8) panel showing no-show rate, reschedule self-serve share, post-cancellation rebook rate, and staff time-to-create, a Daily Booking Log Email settings panel (toggle, recipient email, per-day schedule), a Data Export section offering full-venue CSV downloads for bookings and guests, an SMS Usage banner, and per-report CSV export buttons on each section. The app has none of these additional features and explicitly tells the user to visit the web dashboard for CSV exports.

## Recommendation
The Reports screen covers roughly 22% of web functionality. The most impactful gaps to close, in priority order, are: (1) Add the Baseline Metrics panel (report8_baseline_metrics / report8_baseline_snapshot) — the data is already returned by the backend for every appointment venue but the types and rendering are missing entirely; update types/reports.ts and build a BaselineMetricsCard component. (2) Add a working Data Export section (GET /api/venue/export?type=bookings and ?type=guests) using expo-file-system and expo-sharing to deliver CSV to the user's Files app or share sheet — removing the dead-end web-only footnote. (3) Add the Clients sub-tab with a paginated, searchable guest list (GET /api/venue/guests), expandable detail with inline edit (GET/PATCH /api/venue/guests/:id), and GDPR erase (POST /api/venue/gdpr/erase-guest). (4) Add per-report CSV export buttons (client-side, no new backend calls) to each metric card. (5) Replace the fixed preset segment control with a date-range picker that supports arbitrary from/to dates, matching web flexibility. (6) Add the Booking Log Email settings panel (PATCH /api/venue/reports/booking-log-email) so admins can configure daily digests in-app. (7) Wire up by_source rendering (currently completely absent) and add basic charts (victory-native or react-native-gifted-charts) for booking source, no-show rate trend, and practitioner/service volume — even simple horizontal bar charts will be a significant improvement over plain text rows. Throughout, apply colour-coded metric tiles mirroring the web's emerald/amber/red semantic colouring so staff can scan the dashboard at a glance.

## Gaps (15)

### [HIGH] Arbitrary date-range picker (from/to with Apply button) — missing
- Backend: GET /api/venue/reports?from=&to= (already deployed, app calls it)
- Web behaviour: Web has two <input type='date'> fields (from/to) plus an Apply button that triggers the SWR fetch to GET /api/venue/reports?from=YYYY-MM-DD&to=YYYY-MM-DD. Previous data is kept visible while loading (keepPreviousData). The range is arbitrary — any from/to the user types.
- Mobile plan: Replace the 3-option Segmented control with a DateRangePicker component (two TextInput-backed date fields or a native DateTimePicker from @react-native-community/datetimepicker). Add an explicit 'Apply' button; hold a separate appliedRange state so the query only refetches on Apply. The preset shortcuts (7d/30d/90d) can remain as quick-fill chips above the picker for convenience.

### [HIGH] Overview / Clients sub-tabs — missing
- Backend: none (UI routing only; Clients tab makes separate calls to GET /api/venue/guests and GET /api/venue/guests/:id)
- Web behaviour: Web has a TabBar with 'Overview' and 'Clients' tabs. Clients tab renders the full ClientsSection. The active tab is reflected in the URL query param (reportsTab=clients). Both tabs share the same date range.
- Mobile plan: Add a top-level Segmented control or TabBar with 'Overview' and 'Clients' options. Render the existing metric cards under Overview, and create a new ClientsTab component (see Clients sub-tab gap below) rendered when Clients is active. No additional backend dependency beyond what already exists.

### [HIGH] Clients sub-tab: paginated searchable client directory — missing
- Backend: GET /api/venue/guests (with query params), GET /api/venue/guests/tags
- Web behaviour: Web ClientsSection calls GET /api/venue/guests?sort=&page=&limit=25&filter=&search=&tags= and renders a paginated table of client rows (name, email, phone, total bookings, visit count with no-show count, last visit). Supports sort (6 options), filter (identified/all/anonymous), and debounced search. Calls GET /api/venue/guests/tags for tag filter chips.
- Mobile plan: Create lib/queries/useGuestsList.ts wrapping GET /api/venue/guests with react-query (infinite or page-based). Build a ClientsTab component in components/reports/ with a SearchBar (TextInput), a sort/filter sheet or dropdown, and a FlatList of GuestRow items. A 'Load more' button or onEndReached handles pagination. Tag filter pills above the list. This mirrors the existing contacts page pattern.

### [HIGH] Clients sub-tab: expandable guest detail with inline edit — missing
- Backend: GET /api/venue/guests/:id, PATCH /api/venue/guests/:id
- Web behaviour: Tapping a client row in web expands it inline showing editable first name, last name, email, phone fields, a Save button (PATCH /api/venue/guests/:id), a GuestTagEditor (PATCH /api/venue/guests/:id with tags), stat mini tiles (total bookings, cancellations, no-shows, deposits paid, first/last visit), booking history list (links to bookings), and an 'Export history (CSV)' button. Data loaded from GET /api/venue/guests/:id.
- Mobile plan: Create lib/queries/useGuestDetail.ts. On row tap, push or modal-present a GuestDetailSheet (bottom sheet or separate screen at app/(app)/contacts/[id]). Render editable fields via TextInput with a Save button, stat tiles as StatRow components, and a SectionList of recent bookings navigating to the booking detail. Tag editing can use a tag-chip multi-select.

### [HIGH] Baseline Metrics panel (Report 8): no-show rate, reschedule self-serve share, rebook rate, staff time-to-create — missing
- Backend: GET /api/venue/reports (report8_baseline_metrics and report8_baseline_snapshot fields, already in backend response)
- Web behaviour: Web renders a BaselineMetricsSection using report8_baseline_metrics from GET /api/venue/reports. Shows four metric groups with plain-English narrative explanations: Attendance (no-show rate with eligible count context), Reschedules (guest self-reschedule share, guest notified after move), After a cancellation (rebooked within 7d rate, median gap), Team efficiency (median staff time to create appointment). Optional snapshot comparison row if report8_baseline_snapshot is present.
- Mobile plan: Add report8_baseline_metrics and report8_baseline_snapshot to types/reports.ts (currently absent from ReportsResponse). Create a BaselineMetricsCard component in components/reports/. Render it in the Overview section between the Appointment Activity card and the Team/Services section. Each metric is a Card with a headline value and a multi-line Text description. Snapshot comparison shown as a caption row.

### [HIGH] Data Export section: full-venue bookings CSV and guests CSV download — missing
- Backend: GET /api/venue/export?type=bookings, GET /api/venue/export?type=guests
- Web behaviour: Web DataExportSection renders two download buttons calling GET /api/venue/export?type=bookings and GET /api/venue/export?type=guests. The backend streams CSV covering the whole venue (not range-limited). Staff (not admin-only) can access exports.
- Mobile plan: The app currently shows only a text footnote 'full reports & CSV export on the web dashboard'. Add a DataExportCard at the bottom of the scroll view. Two buttons call apiFetch to GET /api/venue/export?type=bookings and ?type=guests, receive the blob, write it to the FileSystem (expo-file-system), then share via expo-sharing. Show ActivityIndicator while downloading. This replaces the current web-only hint.

### [MEDIUM] Clients sub-tab: GDPR erase guest — missing
- Backend: POST /api/venue/gdpr/erase-guest
- Web behaviour: Each non-anonymous client row in web has an 'Erase' button that opens a confirmation modal (EraseGuestDataModal) and then calls POST /api/venue/gdpr/erase-guest with { guest_id }.
- Mobile plan: Inside the GuestDetailSheet, add a destructive 'Erase guest data' button that presents an Alert.alert confirmation, then calls apiFetch to POST /api/venue/gdpr/erase-guest. On success, dismiss the sheet and invalidate the guests list query.

### [MEDIUM] Interactive charts: booking source pie chart and status bar chart — missing
- Backend: none (data already in report1_booking_summary.by_source and .by_status from GET /api/venue/reports)
- Web behaviour: Report 1 in web renders a ResponsiveContainer PieChart for by_source (aggregated display labels) and a BarChart for by_status. Both are built with recharts loaded lazily.
- Mobile plan: Add react-native-svg and victory-native (or react-native-gifted-charts). Build a BookingSourcePie and StatusBar component inside a new components/reports/ folder. Wrap them in the existing Bookings Card, replacing the current flat StatRow list of by_status entries. The by_source data is already in the API response but is not rendered at all in the app.

### [MEDIUM] Interactive chart: no-show rate line chart over time — missing
- Backend: none (report2_no_show_series already included in GET /api/venue/reports response)
- Web behaviour: Report 2 in web renders an overall rate figure and a LineChart (rate_pct vs period_start) from the report2_no_show_series array. Each point is a day in the selected range.
- Mobile plan: The app already totals no_show_count from the series but discards the per-day rate_pct. Add a NoShowLineChart component using victory-native LineChart. Display the overall rate as a headline stat, then the chart below.

### [MEDIUM] Interactive charts: practitioner performance and service volume bar charts, channel mix pie — partial
- Backend: none (data already in report7_appointment_insights from GET /api/venue/reports)
- Web behaviour: Web renders three charts under 'Team, services & channels': a grouped BarChart (bookings vs arrived/completed per practitioner), a horizontal BarChart (bookings per service), and a PieChart (channel mix). Add-on revenue table is also shown as a rich table with group column.
- Mobile plan: The app currently renders by_practitioner and by_service as plain table rows, and by_booking_source is entirely absent. Replace the plain rows with victory-native charts: a grouped horizontal bar for practitioners (works better on narrow screens than rotated x-axis labels), a horizontal bar for services, and a pie for channel mix. The add-on revenue section shows only top_addons but omits the group column — add addon_group_name_snapshot to the table row.

### [MEDIUM] Daily Booking Log Email settings panel — missing
- Backend: PATCH /api/venue/reports/booking-log-email
- Web behaviour: Web renders BookingLogEmailSettingsPanel inside Report 1 for appointment venues. It reads booking_log_email_config and default_booking_log_email from the reports response, exposes an enable/disable toggle, recipient email input, and per-day/per-time schedule (7 day columns). Save calls PATCH /api/venue/reports/booking-log-email.
- Mobile plan: Add booking_log_email_config and default_booking_log_email to types/reports.ts. Create a BookingLogEmailCard component. Render it below the Bookings summary card for appointment venues. Use a Switch for enable/disable, a TextInput for recipient email, and a scrollable list of day rows (each with a checkbox and a time picker). Save via a dedicated mutation hook calling PATCH /api/venue/reports/booking-log-email.

### [MEDIUM] Per-report CSV export buttons — missing
- Backend: none (client-side CSV generation from the GET /api/venue/reports payload)
- Web behaviour: Web adds an 'Export CSV' button to every ReportSection header. Reports 1–4 and Report 7 each produce a distinct CSV file client-side from the already-fetched data (no separate backend call). The export function builds rows and triggers a browser download via Blob + URL.createObjectURL.
- Mobile plan: Add an 'Export' icon/button to each Card header (use the existing Card right-action slot or a header row). For each report, implement the same CSV row-building logic as the web (already documented in ReportsView.tsx) and write the result to a temp file via expo-file-system, then share with expo-sharing. This can be a shared buildAndShareCsv(filename, rows) utility in lib/reports/csv-export.ts.

### [LOW] Clients sub-tab: export guest booking history as CSV — missing
- Backend: none (client-side CSV generation from already-fetched GET /api/venue/guests/:id data)
- Web behaviour: Web has an 'Export history (CSV)' button inside the expanded client detail panel that builds a CSV client-side from the detail.booking_history array and triggers a download.
- Mobile plan: In the GuestDetailSheet, add a Share button using react-native Share.share or expo-sharing with CSV text assembled from the booking_history array. On iOS/Android this presents the OS share sheet allowing save-to-files or email.

### [LOW] SMS Usage Banner — missing
- Backend: GET /api/venue/sms-usage-display
- Web behaviour: Web renders SmsUsageBanner which calls GET /api/venue/sms-usage-display. Shows a progress bar of segments used vs included, remaining count, and an overage warning if overage_count > 0.
- Mobile plan: Create a SmsUsageBanner component. Fetch with a separate react-query hook (useQuery key ['sms-usage-display']). Render a thin progress bar + text line near the top of the Reports scroll view, above the date range toolbar. Only render when data is returned (the route returns null for non-SMS venues).

### [LOW] Booking source breakdown in Bookings card — missing
- Backend: none (by_source already present in report1_booking_summary from GET /api/venue/reports)
- Web behaviour: Report 1 web view shows by_source via a pie chart and includes it in the Export CSV. The app only iterates by_status but never renders by_source at all.
- Mobile plan: At minimum, add StatRow entries for each source (after the status rows) in the existing Bookings Card. Ideally replace with a pie chart as described in the charts gap above.

## Bugs spotted
- [medium] types/reports.ts ReportsResponse is missing the report8_baseline_metrics and report8_baseline_snapshot fields that the backend already returns. The app therefore silently drops baseline performance metrics even though the data is in every response for appointment venues. If the team ever reads these fields from query.data they will get undefined with no TypeScript error. (types/reports.ts)
- [medium] types/reports.ts ReportsResponse is missing booking_log_email_config, default_booking_log_email, enabled_models, and table_management_enabled fields. The backend always returns them. Absence from the type makes it impossible to implement the Booking Log Email panel or Baseline Metrics with type safety. (types/reports.ts)
- [low] The no-show card combines no-show count with all cancellation metrics under one 'No-shows & cancellations' heading, but the web treats them as separate Report 2 (No-show rate) and Report 3 (Cancellation rate) sections. The total no-shows value shown is the raw sum of no_show_count across the series without dividing by confirmed_at_time_count, so it is a count not a rate. There is no overall rate_pct displayed, and the series data (useful for trend display) is entirely discarded after the .reduce(). (app/(app)/reports.tsx)
- [low] In the Add-on revenue card (line ~219), insights.addon_revenue.top_addons is sliced to 5 items: .slice(0, 5). The web shows all top_addons (up to 10 from the backend) and also shows the addon_group_name_snapshot column. The app omits the group column entirely, making it impossible to distinguish same-name add-ons from different groups. (app/(app)/reports.tsx)
- [low] The app uses calendarDateInTimeZone(new Date(), timeZone) to compute 'today' for the range end, then passes `today` as `to` to addDaysToDateStr. However when building the Segmented control the label shows '30 days' but RANGE_DAYS['30d'] is 30, meaning the range is `today - 29` to `today` (29 days of history plus today = 30 days total). The web's last7Days() function uses `to - 7` as from, which gives 8 calendar days of data. There is an off-by-one inconsistency between web and app range semantics, and the user-visible label does not clarify whether the range is inclusive. (app/(app)/reports.tsx)

## Design notes
- The footnote 'full reports & CSV export on the web dashboard' is a dead-end on mobile. It should either be replaced by working in-app export buttons or, as a minimum, rendered as a tappable link that opens the web dashboard URL in an in-app browser so users can act on it.
- The date range selector is three opaque segment labels ('Last 7 days', '30 days', '90 days'). A custom range is the most common admin need; adding a 'Custom' option that opens a bottom-sheet date-range picker would bring the page up to web parity without cluttering the toolbar.
- The Bookings card renders by_status entries via Object.entries() which yields raw status strings (e.g. 'Confirmed', 'Pending') with no human-friendly formatting. The web applies bookingStatusDisplayLabel() for appointment venues. App should do the same to avoid showing raw enum values.
- All metric cards are plain flat text rows without any visual hierarchy — no headline stat, no colour differentiation between positive/negative indicators. The web uses coloured StatTile components (emerald for collected, amber for refunded, red for forfeited). Applying colour-coded StatRow or StatTile variants on mobile would make the data scannable at a glance.
- The no-show rate has no percentage shown — only a raw integer count of no-shows. The web shows both overall rate_pct and an explanatory context sentence. On mobile, practitioners are likely the primary audience for no-show data; showing the percentage is more actionable than a count.
- There is no empty state for the case where the API returns data but all report sections are null (possible for a new venue with no bookings). Each card should show a non-null empty state with encouraging copy rather than simply disappearing.
- The scroll view has no sticky header for the date range toolbar. After scrolling down through several cards, returning to change the range requires scrolling back to the top. A sticky or floating date-range pill would improve usability.
- The practitioner and service table rows truncate practitioner_name with numberOfLines={1} but do not show a tooltip or expand-on-tap. Long practitioner names will be silently clipped. Using adjustsFontSizeToFit or an expandable row would be more accessible.
