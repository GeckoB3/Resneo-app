## 10. Dashboard Home, Reports & Referrals

**Parity:** Partial — Reports are at near-full parity (and the app even adds a History/trends + Client Lifetime Value section), and the Today overview is mature, but the entire Referrals / Refer & Earn programme is absent and the Today screen is not the landing surface.

Reports (`app/(app)/reports.tsx`) faithfully mirror the web `ReportsView`: date-range presets, Reports 1/2/3/4/7, baseline appointment-performance metrics, booking-log email config, an embedded clients directory, full-venue CSV export, and an app-only History/trends + Client Lifetime Value addition. The Dashboard Home equivalent (`app/(app)/today.tsx`) is feature-rich — greeting, KPI grid, booking-type chips, capacity card, alerts, 7-day forecast, tappable diary, dismissible setup checklist — but it is a "Today" tile under Settings rather than the home tab (the home tab is the Calendar, an intentional IA choice), and it omits three secondary visualisations (capacity heatmap, secondary-booking-activity, KPI sparklines) that are already typed but never read. The single largest miss is **Referrals (Refer & Earn)**: the web has a complete programme plus a referee trial-credit banner, and the app has no route, tile, or banner at all.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Dashboard Home / Today overview | `dashboard/page.tsx`, `DashboardHomeClient.tsx` | `app/(app)/today.tsx` + `components/today/*` | Strong | Full greeting/KPI/checklist/forecast/diary; not the landing screen, and missing heatmap, secondary activity, sparklines, referee banner. |
| 7-day capacity heatmap / outlook | `DashboardHomeClient.tsx` (~L221-223, L475) | absent | Missing | Typed in `types/dashboard.ts` (L47-55, L78) but never rendered. |
| Secondary booking activity ("Other booking types") | `DashboardHomeClient.tsx` L190 | absent | Missing | `DashboardSecondaryActivity` typed (L62-68, L77) but unrendered; hybrid-restaurant scope. |
| Setup checklist | `dashboard/SetupChecklist.tsx` | `today.tsx` `SetupChecklistCard` + `useSetupStatus.ts` | Strong | Admin-only, dismissible 5-step checklist; app uses a fixed appointment-oriented list vs the web's model-specific copy. |
| Reports — overview (Report 1/2/3/4/7) | `reports/ReportsView.tsx` | `app/(app)/reports.tsx` | Strong | Presets, sub-tabs, SVG charts, CSV; omits `report_by_booking_model` render + table-utilisation (Report 5). |
| Reports — appointment performance (baseline) | `reports/BaselineMetricsSection.tsx` | `components/reports/BaselineMetricsCard.tsx` | Full | Faithful port of the full `VenueBaselineMetrics` shape. |
| Reports — daily booking-log email config | `reports/ReportsView.tsx` (`setDayTime` L1113, `type=time` L1208) | `components/reports/BookingLogEmailCard.tsx` | Partial | Toggles digest + recipient + which days; send time hard-coded 17:00 and read-only. |
| Reports — Clients directory (embedded sub-tab) | `reports/ClientsSection.tsx` | `components/reports/ClientsTab.tsx` | Strong | Searchable/paginated/editable/erase/CSV; tags read-only in this sub-tab only (full tag edit+filter exist on the primary contacts surfaces). |
| Reports — Client lifetime value & history trends | n/a | `components/reports/HistorySection.tsx` + `useReportHistory.ts` | App-only | History card + Client Lifetime Value card with CSV — net positive. |
| Reports — full data export (bookings/guests CSV) | `reports/DataExportSection.tsx` | `components/reports/DataExportCard.tsx` | Full | Both export full-venue bookings/guests from `GET /api/venue/export`. |
| Referrals / Refer & Earn | `dashboard/referrals/*`, `lib/referrals/load-dashboard.ts` | absent | Missing | No route, tile, or banner; web loads via SSR (no API route → backend endpoint needed). |
| Referee trial-credit banner | `dashboard/page.tsx` `loadRefereeBannerData` (L59-91), banner L38-44 | absent | Missing | No banner and no payload field in `types/dashboard.ts`. |

The **Today overview** is the strongest non-Reports surface: `today.tsx` renders `GreetingHeader`, an admin-only dismissible `SetupChecklistCard`, `KpiGrid`, `BookingTypeChips` (shown only when more than one model is active and not table-secondaries), a `CapacityCard` for non-appointment venues, `AlertsCard`, `ForecastChart`, and a tappable `DiarySection`. The confirmed deltas vs the web are all secondary: it is reached as a featured tile (`settings.tsx` L203, `target: '/today'`) rather than as the index route; there is no 7-day capacity heatmap, no secondary-booking-activity block, no inline KPI sparkline, and no referee banner.

**Reports** is at near-full parity. `reports.tsx` provides 7d/30d/90d + custom ranges, Overview/Clients sub-tabs, SVG bar/line charts, and CSV export, with Reports 1/2/3/4/7 and the baseline metrics all present. The only web reports the app does not render are `report_by_booking_model` (typed but not surfaced) and `report5_table_utilisation` (table-only). The app additionally ships a History/trends section and a Client Lifetime Value card that the web does not isolate — a genuine plus.

The **Reports → Clients sub-tab** is a lighter secondary directory: it is searchable, paginated, has expandable detail with inline profile edit, two-step GDPR erase, history, and CSV, but renders tags read-only (`ClientsTab.tsx` L320-333) and has no tag filter. This is a localised gap — the app's primary contacts surfaces already have full tag parity (editing via `components/clients/GuestTagEditor.tsx`, wired in `app/(app)/client/[id].tsx` L450; filtering via `useGuestTags` + `segment='tag'` in `app/(app)/(tabs)/clients.tsx`).

### Gaps & deficiencies

#### High

- **Referrals / Refer & Earn programme entirely absent** — _function · high_
  - **Web:** A full Refer & Earn surface (`dashboard/referrals`): referral code + shareable link with copy-to-clipboard, three KPI cards (credits earned, credit remaining on next invoice, in-progress count), and a referrals table (referee name, status pill, credit, updated date, plus explain-outcome guidance). Data from `src/lib/referrals/load-dashboard.ts`.
  - **App:** Absent — no route, no settings tile, no banner. The `settings.tsx` workspace tiles (L203 Today → L209 Notifications) contain no Refer & Earn entry, and no refer-earn route exists.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/referrals/ReferralsDashboardContent.tsx`, `ReferAndEarnClient.tsx`, `src/lib/referrals/load-dashboard.ts` (+ 14 supporting modules under `src/lib/referrals/`). APP: no referrals file outside `Docs/`; `app/(app)/(tabs)/settings.tsx` L203/L205.
  - **Fix:** Build `app/(app)/refer-earn.tsx` mirroring `ReferAndEarnClient` + `ReferralsDashboardContent` (Card-based: code + shareable link with `Clipboard` copy, three KPI `Card`s, a referrals list using `StatusPill`). Register it in `app/(app)/_layout.tsx` and add an admin-gated "Refer & Earn" tile to the workspace group in `settings.tsx` (mirror the Reports tile at L205). Backend prerequisite: the web exposes referrals only via SSR `loadReferralsDashboardForVenue()` (no API route), so add a Bearer `GET /api/venue/referrals` in `C:/Resneo` and a matching `useReferrals` hook under `lib/queries/`.

#### Medium

- **7-day capacity heatmap / outlook not rendered** — _function · medium_
  - **Web:** Dashboard home renders `payload.heatmap[]` as a colour-coded 7-day fill-% outlook (quiet→full legend) with per-dining-service stacked rows for service-engine venues.
  - **App:** Absent — `DashboardHomePayload` models `heatmap[]`/`DashboardHeatmapDay`/`DashboardHeatmapService` but `today.tsx` never reads it.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` (heatmap ~L475; per-service depth L221-223). APP `types/dashboard.ts` L38-55 + L78 define the types; `app/(app)/today.tsx` has no `heatmap` usage.
  - **Fix:** Add `components/today/HeatmapWeek.tsx` rendering a 7-column row from `payload.heatmap`, background colour by `fill_percent` (null=muted, <40=brandSubtle, 40-69=brand, 70-89=warning, 90+=danger) with an optional per-service stack from `by_service`. Render in `today.tsx` only when `!isAppointment`. Data already arrives in the payload.

- **Dashboard home is not the app's landing screen** — _design · medium_
  - **Web:** `/dashboard` IS the home overview (greeting, KPIs, checklist, diary) — the first thing staff see after login.
  - **App:** The home tab (`tabs/index.tsx`) is the Calendar; the dashboard-home equivalent (`today.tsx`) is reached only as a featured "Today" tile in the Settings/More hub.
  - **Evidence:** APP `app/(app)/(tabs)/index.tsx` is the Calendar (imports `CalendarDayGrid`/`AllCalendarsDayGrid`, `useCalendarGrid`); `settings.tsx` L203 registers Today (`target: '/today'`, `featured: true`). WEB `_reference/Resneo/src/app/dashboard/page.tsx` renders `DashboardHomeClient` as the index route.
  - **Fix:** Product decision — the redesign memo intentionally chose a Calendar-first 4-tab IA. If closer parity is wanted, surface a few home KPIs atop the Calendar tab or promote Today to a tab; at minimum keep the Today tile prominent (already `featured: true`). Treat as an intentional IA divergence, not a defect.

#### Low

- **Secondary booking-activity section missing for hybrid table venues** — _function · low_
  - **Web:** For `tableFocusSecondariesEnabled` venues the web shows an "Other booking types" section: today-by-type chips, four KPI tiles (bookings, confirmed, deposit revenue, next up), and a 7-day non-table forecast chart.
  - **App:** Absent — `secondary_booking_activity` is typed but `today.tsx` renders nothing for it.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` L190. APP `types/dashboard.ts` L62-77 define `DashboardSecondaryActivity`; `today.tsx` reads `table_focus_secondaries_enabled` (L125) only to gate `BookingTypeChips`, never to render the section.
  - **Fix:** In `today.tsx`, when `payload.table_focus_secondaries_enabled`, render a section reusing `KpiGrid` (deposit-revenue tile from `secondary.today.revenue`) and `ForecastChart` (`secondary.forecast`). Low priority — only affects hybrid restaurant+secondary venues, tangential to the appointments-first product.

- **KPI tiles lack the inline 7-day sparkline** — _ui · low_
  - **Web:** `DashboardStatCard` embeds a sparkline driven by `forecastSpark` (`payload.forecast`) on the today and confirmed tiles.
  - **App:** Absent — `KpiGrid` tiles show value + up to two hint lines only, no sparkline; the component isn't even passed the forecast.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/DashboardHomeClient.tsx` L220 (`forecastSpark`) + L301/L316 (`sparklineValues`). APP `components/today/KpiGrid.tsx` props are `{today, isAppointment}` only; `today.tsx` renders `<KpiGrid today isAppointment>` at L177.
  - **Fix:** Add a small `react-native-svg` polyline `MiniSparkline` (the project already ships `SvgLineChart` in `components/reports`) and render it inside the primary KPI tile in `KpiGrid.tsx`, passing the forecast already loaded by `useDashboardHome`. Cosmetic polish.

- **Booking-log email: per-day send time not editable** — _function · low_
  - **Web:** `BookingLogEmailSettingsPanel` renders a `type=time` input per enabled weekday so each day's digest send time is configurable.
  - **App:** `BookingLogEmailCard` only toggles days on/off; each enabled day is hard-coded to 17:00 and the time is shown read-only.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx` L1113 (`setDayTime`) + L1208-1211 (`type=time`). APP `components/reports/BookingLogEmailCard.tsx` — `DEFAULT_SCHEDULE` hard-codes `'17:00'` (L21-27), `setDayEnabled` inserts `{day, time:'17:00'}` (L69), and `entry.time` renders as static `Text` (L174-178).
  - **Fix:** In `BookingLogEmailCard.tsx` add a time picker (the app already has `components/ui/DatePickerField` used in `reports.tsx`) bound to each enabled day's `entry.time` with a `setDayTime` updater, then include edited times in the existing `useBookingLogEmailMutation` PATCH (schedule already carries `{day,time}`).

- **Reports → Clients sub-tab shows tags read-only with no tag filter** — _function · low_
  - **Web:** `ClientsSection` (the web's main clients directory) shows a "Filter by tags" chip row (`GET /api/venue/guests/tags`, `tags=` query param) and a `TagEditor` in each expanded client that PATCHes guest tags.
  - **App:** Tag editing AND filtering already exist in the app, just not inside the Reports → Clients sub-tab. `components/reports/ClientsTab.tsx` renders tags read-only (L320-333) and has no tag filter. The primary contacts surfaces have full parity: editing via `components/clients/GuestTagEditor.tsx` (wired in `app/(app)/client/[id].tsx` L450, persisted with `useUpdateGuest({tags})`); filtering in `app/(app)/(tabs)/clients.tsx` (`useGuestTags` L286, `segment='tag'`+`segmentTag` L296, plus `BulkTagSheet`/`BulkRemoveTagSheet`).
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx`. APP exists: `components/clients/GuestTagEditor.tsx`; `lib/queries/useGuestTags.ts`; `useUpdateGuest` payload includes `tags?: string[]` (`lib/queries/useGuestMutations.ts` L15); `useGuests` supports `segment='tag'`/`segmentTag` (`lib/queries/useGuests.ts` L36-38, L66-70). APP gap localised to `ClientsTab.tsx` (read-only tags L320-333; `handleSave` omits tags, L129-134).
  - **Fix:** If parity is wanted in the Reports sub-tab specifically, drop the existing `GuestTagEditor` into `ClientsTab`'s `GuestDetail` (it already takes `useUpdateGuest`'s `mutateAsync`) and add a tag-filter chip row backed by the existing `useGuestTags` hook, passing `segment='tag'`/`segmentTag` into `useGuests`. No new hook or backend work needed.

- **Per-booking-model breakdown report not surfaced** — _function · low_
  - **Web:** The reports payload includes `report_by_booking_model` (booking_count, covers, cancelled, completed, checked-in, deposit collected per model), used for the full export's per-model breakdown.
  - **App:** Typed but not rendered — `types/reports.ts` defines `ReportByModelRow` and `ReportsResponse.report_by_booking_model`, but `app/(app)/reports.tsx` never reads it.
  - **Evidence:** WEB `_reference/Resneo/src/app/api/venue/reports/route.ts` (`report_by_booking_model`). APP `types/reports.ts` L59-68 (`ReportByModelRow`) + L159 (`report_by_booking_model?:`); `app/(app)/reports.tsx` has no reference.
  - **Fix:** Render a compact per-model summary (StatRows/table) in `reports.tsx` for multi-model venues (show when `enabled_models.length > 1`) from the already-typed `report_by_booking_model`, and include it in a CSV export. The type already exists, so no `types/reports.ts` change is needed.

- **Table utilisation report omitted** — _function · low_
  - **Web:** Report 5 "Table utilisation" (per-table utilisation %, occupied/available hours, bars, CSV) for table-management venues.
  - **App:** Absent — `reports.tsx` has no table-utilisation section, though `table_management_enabled` is typed in `ReportsResponse`.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx` L1029 ("Table utilisation") + `report5_table_utilisation` (L103/L424/L509). APP `types/reports.ts` L151 types `table_management_enabled`; `app/(app)/reports.tsx` has no report5 reference.
  - **Fix:** Intentional scope exclusion — table-management is a restaurant feature outside the appointments-first app. If a table venue ever uses the app, mirror the web's gated section behind a `table_management_enabled` check; otherwise leave out.

- **Referee trial-credit banner missing on home** — _content · low_
  - **Web:** Dashboard home shows a green banner for venues that signed up via a referral and are still trialling ("Your referral month is active … first charge on [date]").
  - **App:** Absent — `today.tsx` has no referee banner and the dashboard-home payload (`types/dashboard.ts`) exposes no such field.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/page.tsx` L38-44 (banner) + `loadRefereeBannerData` L59-91. APP `app/(app)/today.tsx` has no banner; `types/dashboard.ts` `DashboardHomePayload` has no referee field.
  - **Fix:** Lower priority; ties to the broader Referrals gap. If implemented, add `refereeBanner?: {trialEndDisplay}` to the dashboard-home payload (`C:/Resneo`) and render a dismissible info `Card` above `SetupChecklistCard` in `today.tsx`.

### Investigated — not a gap

- **Clients tag editing/filtering "missing" from the app** — corrected. Both already exist: tag editing via `components/clients/GuestTagEditor.tsx` (wired in `app/(app)/client/[id].tsx` L450) and tag filtering via `useGuestTags` + `segment='tag'` in `app/(app)/(tabs)/clients.tsx` (plus bulk tag sheets). The candidate's evidence ("`useGuests` has no tags arg", "add a new `useGuestTags` hook") was factually wrong — `useGuests` already supports `segment='tag'`/`segmentTag` and `useGuestTags.ts` already exists. Residual is only that the Reports → Clients sub-tab doesn't reuse them; downgraded medium → low (kept above as a localised low gap).
- **`report_by_booking_model` "not typed" in the app** — corrected. The type IS defined (`types/reports.ts` `ReportByModelRow` + `ReportsResponse.report_by_booking_model` L159). The genuine gap is only that `reports.tsx` does not render it; severity unchanged (low, kept above).

### Recommended work (ordered)

1. **Build the Refer & Earn surface** — new `app/(app)/refer-earn.tsx` (code + shareable link with `Clipboard` copy, three KPI `Card`s, referrals list with `StatusPill`); register in `app/(app)/_layout.tsx`; add an admin-gated tile to the workspace group in `settings.tsx`; add a Bearer `GET /api/venue/referrals` in `C:/Resneo` + a `useReferrals` hook under `lib/queries/`. (High)
2. **Render the 7-day capacity heatmap** — add `components/today/HeatmapWeek.tsx` from `payload.heatmap`, gated to `!isAppointment` in `today.tsx`. Data already in the payload. (Medium)
3. **Decide on the landing-screen IA** — confirm Calendar-first is intentional (it is per the redesign memo); optionally surface home KPIs atop the Calendar tab or promote Today to a tab. (Medium, product decision)
4. **Make booking-log email send time editable** — wire a per-day time picker (`components/ui/DatePickerField`) into `components/reports/BookingLogEmailCard.tsx` and include edited times in the existing PATCH. (Low)
5. **Add KPI sparklines** — pass the already-loaded forecast into `components/today/KpiGrid.tsx` and render a `MiniSparkline` (reuse `SvgLineChart` from `components/reports`) in the primary tile. (Low)
6. **Surface the per-model breakdown report** — render `report_by_booking_model` as StatRows/table in `reports.tsx` for multi-model venues, with CSV. No type change needed. (Low)
7. **Bring tag edit/filter into the Reports → Clients sub-tab** — drop `GuestTagEditor` into `ClientsTab`'s `GuestDetail` and add a tag-filter chip row backed by `useGuestTags` (`segment='tag'`). No new hook/backend. (Low)
8. **Add the secondary booking-activity section** — in `today.tsx`, render `secondary_booking_activity` via `KpiGrid` + `ForecastChart` when `table_focus_secondaries_enabled`. (Low, hybrid-venue only)
9. **Add the referee trial-credit banner** — once referrals exist, expose `refereeBanner` on the dashboard-home payload and render a dismissible `Card` above `SetupChecklistCard` in `today.tsx`. (Low)
10. **Table utilisation (Report 5)** — leave out as an intentional restaurant-feature scope exclusion; revisit only if a table venue adopts the app. (Low)
