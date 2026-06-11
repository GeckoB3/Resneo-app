# Calendar (diary) — parity ~35%

## App files
- app/(app)/(tabs)/index.tsx
- components/calendar/CalendarDayGrid.tsx
- components/calendar/AppointmentBlock.tsx
- components/calendar/WeekStrip.tsx
- components/calendar/MonthGrid.tsx
- components/calendar/RescheduleSheet.tsx
- components/calendar/grid-layout.ts
- components/bookings/BookingPeekSheet.tsx
- lib/queries/useCalendarGrid.ts
- lib/queries/useAvailabilityManage.ts
- lib/queries/useBookingMutations.ts
- lib/queries/useBookingDetail.ts
- types/calendar-grid.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/calendar/page.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/PractitionerCalendarView.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/PractitionerCalendarToolbar.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/BookingCard.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/BookingCardInfo.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/CalendarColumnsFilter.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/CalendarStaffBookingModal.tsx
- _reference/Resneo/src/app/dashboard/practitioner-calendar/MonthScheduleGrid.tsx
- _reference/Resneo/src/components/calendar/StaffScheduleHub.tsx
- _reference/Resneo/src/components/calendar/StaffScheduleMergedDayGrid.tsx
- _reference/Resneo/src/app/api/venue/calendar-grid/route.ts

## Summary
The app Calendar screen (app/(app)/(tabs)/index.tsx) shows day/week/month views, a per-practitioner chip selector, appointment blocks with status colours and arrival overlays, a long-press reschedule sheet with date/time/duration steppers plus an undo snackbar, a tap-to-peek bottom sheet (BookingPeekSheet) with inline quick status actions, and a FAB to create new bookings. It calls GET /api/venue/calendar-grid and GET /api/venue/practitioner-calendar-blocks for data. The web (PractitionerCalendarView) is architecturally richer: it renders all practitioner columns side-by-side in a scrollable horizontal grid per day, has dnd-kit drag-to-reschedule and press-and-hold bottom-edge duration resize directly on the calendar block, inline per-booking status action buttons rendered ON the block (Arrived/Clear/Confirm/Start/Undo Start/Complete/Reopen), a per-slot right-click/tap context menu to create blocks or new bookings, an editable block create/edit/delete modal, a status filter pill bar, a calendar-columns visibility checklist, a toolbar guest search panel, Supabase Realtime subscription for live updates, session-persisted preferences (view mode, date, visible columns, status filter, hour range), an adjustable time-range picker (start/end hour), a "walk-in" shortcut alongside the regular new-booking flow, and a rich month grid with business-day open/closed annotations. The app does not have: side-by-side multi-practitioner columns; drag-to-reschedule or bottom-edge duration resize directly on the grid; inline action buttons on appointment blocks; block create/edit/delete from the calendar; status filter; column visibility filter; guest search; Realtime live updates; preference persistence; walk-in shortcut; auto-scroll-to-now on load; month grid open/closed day annotation; or the adjustable hour-range picker.

## Recommendation
The calendar screen has solid foundations — the day/week/month scaffold, appointment blocks with status colours, the reschedule sheet, and the peek sheet with inline quick actions are all working. The highest-impact gap to close is the multi-practitioner side-by-side day grid: the backend already supports fetching all columns in a single call, and the data is already loaded; only the rendering layer needs to change from a single-column CalendarDayGrid to a horizontal multi-column layout. This single change would unlock the second-most-critical gap (inline action buttons per column) as a natural follow-on. After that, prioritise: (1) inline per-block status actions (Arrived/Confirm/Start/Complete) rendered on the appointment block itself — the mutations are fully implemented, only the UI overlay is missing, and this is the key "at-the-counter" ops feature; (2) block create/edit/delete from the calendar (hooks already exist, only a Sheet UI and a PATCH mutation are needed); (3) the walk-in shortcut (useCreateWalkIn already exists); (4) status filter pills (pure client-side, ~30 lines); (5) auto-scroll-to-now on load; and (6) Realtime subscription for live updates. Drag-to-reschedule and duration resize are nice-to-have but the existing RescheduleSheet stepper is a sufficient mobile-first substitute in the near term. Persist calendar preferences (view mode, anchor date) in AsyncStorage as a low-cost quality-of-life improvement alongside any of the above.

## Gaps (13)

### [CRITICAL] Side-by-side multi-practitioner day columns — missing
- Backend: GET /api/venue/calendar-grid (already implemented, supports multiple calendar_ids in one call)
- Web behaviour: Web renders every visible practitioner as a separate vertical column sharing the same time axis for a selected day, allowing staff to see all practitioners at once and drag bookings between columns. Columns are driven by GET /api/venue/calendar-grid?calendar_ids=id1,id2&start_date=&end_date= with the full id list. The horizontal scroll wrapper uses [touch-action:pan-x_pan-y] so columns are thumb-scrollable.
- Mobile plan: Replace the single-column CalendarDayGrid with a horizontally-scrollable multi-column layout. Add a HorizontalDayGrid component that maps over visible practitioners and renders a CalendarDayGrid per column, sharing a single time-gutter on the left. Use a ScrollView with horizontal=false wrapping a row of fixed-width (e.g. 200 dp) columns. The data is already fetched; remove the current effectiveId single-column filter and pass each practitioner's bookings to its own column. Column selector chips move to a visibility checklist (see separate gap). Week view keeps the existing single-column behaviour (already consistent with web week view).

### [CRITICAL] Inline per-booking status action buttons rendered on the appointment block — missing
- Backend: PATCH /api/venue/bookings/[id] (already deployed, used by app's BookingPeekSheet)
- Web behaviour: Web renders Arrived/Clear + Confirm/Start/Undo Start/Complete/Reopen as small buttons overlaid in the bottom-right corner of every appointment block on the day grid. Actions call PATCH /api/venue/bookings/[id] via the same mutation payloads the app already has. Button set adapts to available block height (omits arrival toggle on very short bars). Guest must open a peek sheet or full detail on mobile to perform these transitions.
- Mobile plan: Extend AppointmentBlock to accept onStatusChange and onArrivalToggle callbacks and render a compact action tray in the block's bottom-right corner. Use the existing useUpdateBookingStatus / useSetBookingAttendance hooks. Show a maximum of two buttons (primary transition + Arrived or Clear) to fit mobile block widths; a third action (e.g. Undo Start) can be omitted when height < 60 dp. The tray should have pointer-events set so taps on buttons are captured independently from the block's open-booking tap.

### [HIGH] Drag-to-reschedule directly on the day grid (dnd-kit) — partial
- Backend: PATCH /api/venue/bookings/[id] (already deployed)
- Web behaviour: Web uses @dnd-kit/core with PointerSensor + TouchSensor (activation delay 200ms + 10px tolerance) so staff can press-and-hold any appointment block and drag it to a new slot or a different practitioner column. Collision detection validates against existing bookings and blocks before dropping. Uses PATCH /api/venue/bookings/[id] with booking_date + booking_time + optional duration_minutes. Shows live drag preview with invalid-slot highlighting.
- Mobile plan: The app has RescheduleSheet (long-press opens a stepper), which is a workable mobile substitute. To reach web parity, add gesture-based reschedule using React Native's PanResponder or react-native-reanimated gesture handler on each AppointmentBlock. A press-and-hold delay of ~500ms should arm the drag. Show a drop-zone overlay. On drop, call the existing useRescheduleBooking mutation. The sheet stepper can remain as a fallback for precision edits. This is a significant effort; the sheet is already a good mobile-first alternative.

### [HIGH] Bottom-edge duration resize on appointment blocks — missing
- Backend: PATCH /api/venue/bookings/[id] (already deployed, useRescheduleBooking accepts durationMinutes)
- Web behaviour: Web renders an 18px hit-target strip at the bottom of every appointment block. Press-and-hold (1000ms arm timer) lets staff drag to resize the duration. Calls PATCH /api/venue/bookings/[id] with duration_minutes. The app's RescheduleSheet stepper can already adjust duration but is 3 taps away.
- Mobile plan: Add a 24dp bottom resize handle inside AppointmentBlock (behind the content, only visible on tall enough blocks). Use PanResponder with a 600ms arming delay (show a fill animation) then allow vertical drag to change duration. Commit on release with useRescheduleBooking. The existing RescheduleSheet can remain as the precision path.

### [HIGH] Create/edit/delete calendar blocks (ad-hoc breaks) from the day grid — missing
- Backend: POST/PATCH/DELETE /api/venue/practitioner-calendar-blocks (hooks useCreateBlock, useDeleteBlock exist in app at lib/queries/useAvailabilityManage.ts; PATCH mutation is missing)
- Web behaviour: Web shows a context menu on empty slot click with 'Block time' option, opening a modal with start/end time and optional reason. Edit/delete available by tapping existing blocks. APIs: POST /api/venue/practitioner-calendar-blocks (create), PATCH /api/venue/practitioner-calendar-blocks/[id] (update, includes start_time/end_time/reason), DELETE /api/venue/practitioner-calendar-blocks/[id].
- Mobile plan: Tap on an existing grey block overlay opens a bottom sheet with editable time range and reason, plus a Delete button. Add a 'Block time' option to the empty-slot tap flow (currently goes straight to new booking): show an action sheet with 'New booking' and 'Block time'. Reuse the existing Sheet component. Add a useUpdateBlock mutation (PATCH /api/venue/practitioner-calendar-blocks/[id]) alongside the existing useCreateBlock/useDeleteBlock. No new backend routes needed.

### [MEDIUM] Status filter (Pending/Booked/Confirmed/Started/Completed/No-Show) on calendar view — missing
- Backend: none
- Web behaviour: Web toolbar has a filter panel with status chips. Selected status hides non-matching bookings from the grid without re-fetching. Also persisted in session preferences.
- Mobile plan: Add a filter row or expandable filter sheet below the practitioner chips. A horizontal ScrollView of Chip components maps CALENDAR_STATUS_FILTERS. Filter is applied client-side to the bookings array before passing to CalendarDayGrid. Persist selection in AsyncStorage alongside other calendar prefs.

### [MEDIUM] Calendar column visibility checklist (show/hide individual practitioners) — partial
- Backend: none
- Web behaviour: Web has a CalendarColumnsChecklist in the toolbar filter panel allowing staff to show 'All calendars' or any subset. Persisted in session preferences via readSessionPreference/writeSessionPreference.
- Mobile plan: The app already has Chip selector for single-practitioner selection. Extend it to a multi-select mode: long-pressing the chip row (or a filter icon) opens a Sheet with checkboxes for each practitioner. Store the visible set in useState (and AsyncStorage for persistence). Pass only the visible subset into the multi-column day grid.

### [MEDIUM] Walk-in quick booking shortcut — missing
- Backend: POST /api/venue/bookings (useCreateWalkIn exists in app at lib/queries/useCreateWalkIn.ts)
- Web behaviour: Web toolbar has an 'Walk-in' button alongside 'New booking'. It opens a modal pre-seeded with today's date and current time. Uses same POST /api/venue/bookings route as new bookings but with source='walk_in'.
- Mobile plan: Add a secondary FAB or long-press the existing FAB to show an action sheet with 'New booking' and 'Walk-in'. The Walk-in path calls useCreateWalkIn with the current time and effectiveId practitioner, then opens the resulting booking's detail screen. The hook already exists; only the UI entrypoint is missing.

### [MEDIUM] Supabase Realtime live update subscription — missing
- Backend: Supabase Realtime channel (same Supabase project the app already connects to via Bearer JWT)
- Web behaviour: Web subscribes to a Supabase channel on the venue's bookings table and debounces refetches (REALTIME_BOOKINGS_DEBOUNCE_MS). Shows 'reconnecting' state in the toolbar. Prevents stale grid on concurrent staff edits.
- Mobile plan: Use the Supabase JS client already available in the app to subscribe to postgres_changes on the bookings table filtered by venue_id. On INSERT/UPDATE/DELETE, call queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() }). Add a connection status indicator (subtle dot in toolbar). Use a debounced invalidation (300ms) to avoid rapid sequential refetches.

### [MEDIUM] Session-persisted calendar preferences (view mode, date anchor, visible columns, status filter, hour range) — missing
- Backend: none
- Web behaviour: Web saves/restores PractitionerCalendarPreferences (viewMode, date, weekStart, monthAnchor, visibleCalendarIdsState, filterStatus, startHourOverride, endHourOverride) to sessionStorage keyed by venueId.
- Mobile plan: Use AsyncStorage to persist the same preference shape. Key: resneo:calendar:{venueId}:prefs. Read on mount (after first render to avoid flicker), write on every preference change via a debounced effect. Start with viewMode and anchor date as the highest-value fields.

### [LOW] Adjustable time-range (start/end hour) picker — missing
- Backend: none
- Web behaviour: Web toolbar includes a CalendarDateTimePicker that lets staff set the visible hour window (startHour/endHour overrides) beyond what working hours auto-derive. Useful for venues with unusual schedules.
- Mobile plan: The app already auto-derives hour bounds from workingHours + bookings via computeGridBounds, which is good mobile default behaviour. Expose start/end override as a secondary filter option (e.g. a long-press on the time gutter or a settings cog in the toolbar). Low priority — the auto-derive already handles most cases.

### [LOW] Month grid open/closed day annotation and intensity shading — partial
- Backend: none (venue opening_hours already available from VenueProvider)
- Web behaviour: Web MonthScheduleGrid shows 'Open' or 'Closed' label on days with no bookings (derived from venue opening_hours), per-booking-type colour dots (blue=appointments, amber=events, green=classes, grey=resources), and intensity-shaded background based on booking volume. The app MonthGrid shows only a count pill.
- Mobile plan: In MonthGrid, add a tiny colour dot row (brand colour for appointments) using the counts already available. Add 'Open'/'Closed' text for zero-count days by checking venue.opening_hours from useVenueContext. Intensity shading via backgroundColor rgba is straightforward in React Native.

### [LOW] Toolbar guest search (find booking from calendar page) — missing
- Backend: none (client-side filter of already-loaded bookings, or GET /api/venue/bookings with q= param)
- Web behaviour: Web OperationsToolbarGuestSearchPanel lets staff type a guest name or phone and highlights matching bookings on the grid or navigates to their detail. Uses the existing bookings list query filtered client-side, with a 'jump to booking' action.
- Mobile plan: Add a search icon button to the toolbar that opens a modal search input. Filter the already-loaded grid bookings by guest name match; highlight matching blocks or show a result list with 'Open' action that calls openBooking(id). For cross-date search, use useBookingsList with a q= param.

## Bugs spotted
- [medium] In CalendarDayGrid.tsx the background Pressable (empty-slot tap handler) uses StyleSheet.absoluteFill which covers the entire scrollable grid including over booking blocks. Booking blocks render above it via z-ordering, but the Pressable still intercepts long-presses on the background because React Native's hit-testing traverses the full tree. This can make the 'add booking at time' action fire unintentionally when the user is trying to long-press a block to reschedule, particularly when the appointment is short (under 50dp) and the user's finger drifts to the block edge. (components/calendar/CalendarDayGrid.tsx)
- [medium] In RescheduleSheet.tsx the 'seeded state during render' pattern (lines 57–64) calls setState inside the render function body. This is technically the React 'adjust state during render' idiom but is error-prone: the condition `target.id !== seededId` will re-seed on every render if the parent re-renders with the same target object (new reference). It also means that if the user edits the date/time and then the parent re-renders (e.g. from a query refetch), the edits are silently reset. A useEffect with [target?.id] dependency would be safer. (components/calendar/RescheduleSheet.tsx)
- [low] In CalendarDayGrid.tsx the empty-slot press handler calculates tap time purely from locationY on the Pressable, but the Pressable has paddingTop: spacing.sm applied via scrollContent style on the ScrollView contentContainerStyle. The paddingTop offset is not subtracted from the locationY calculation, so tapping near the top of the grid creates a booking ~8dp earlier than intended. (components/calendar/CalendarDayGrid.tsx)
- [low] In index.tsx the `counts` memo (lines 180–188) sums bookings across ALL calendars for the week strip and month grid dot, but CalendarGridBooking objects in the type (types/calendar-grid.ts) do not include a `status` field check, meaning cancelled bookings (which the web hides from the calendar view=calendar responses) are included in the count if the API returns them. If the backend ever changes to include cancelled bookings in the grid response, the dot count would be misleading. (app/(app)/(tabs)/index.tsx)
- [low] In BookingPeekSheet.tsx the `showArrived` condition includes `Seated` status (line 68), but on the web calendar the arrived toggle is only shown for Pending/Booked/Confirmed (not Seated, where it is replaced by Complete/Undo Start). Showing the Arrived button for a Seated booking is redundant and potentially confusing since the guest has already started. (components/bookings/BookingPeekSheet.tsx)

## Design notes
- The day grid does not auto-scroll to the current time on load. Web does not do this either (it relies on the column spanning the full day), but on mobile the first visible area defaults to 08:00. When a venue operates 09:00–20:00 and a staff member opens the calendar at 14:00, they must scroll down manually. Add a useEffect + ScrollView ref that scrolls to (nowMinutes * PX_PER_MINUTE - screenHeight/3) on initial mount when viewing today.
- The practitioner chip row is a horizontal ScrollView but has no visual affordance (no fading edge or 'swipe' hint) on iOS/Android. Users with many practitioners may not discover that the list scrolls. Add a right-edge fade gradient overlay similar to the web's HorizontalScrollHint component.
- The RescheduleSheet uses steppers that increment/decrement by 1 minute, requiring many taps to move a booking by 30 minutes. The sheet mentions 'Hold +/- to change faster' but the Stepper component likely does not implement press-and-hold acceleration. Confirm the Stepper has longPress repeat and if not add it — this is essential for usability.
- The AppointmentBlock shows guestName in semibold and serviceName + timeLabel on the second line only when height >= 52dp. Web also shows guest phone number on taller blocks (BookingCardInfo). Adding phone to the block (even just as a third truncated line) would let counter staff identify guests without opening the peek sheet.
- The month grid cell height is fixed at 56dp (dayCell style). On a 6-row month this gives 336dp of grid, which can be tight on small phones in landscape. The web uses min-h-[96px] per cell. Consider making the cell height proportional to screen height or at minimum 64dp.
- There is no swipe-left/right gesture to move between days in day view or weeks in week view. All navigation requires tapping the chevron buttons, which are 36dp — small for a primary navigation action on mobile. A horizontal swipe on the CalendarDayGrid's parent ScrollView should advance the date. Note: CalendarDayGrid currently uses a vertical-only ScrollView so a wrapping horizontal swipe gesture (e.g. via GestureHandler PanGestureHandler detecting dx > 40 with small dy) would be needed.
- The 'Today' pill appears in the toolbar only when not viewing today. On first open the user sees no indication of what today's date is relative to the displayed date. Consider showing a faint 'today' marker dot in the week strip for the current day even when selected, mirroring the web's ring-1 ring-brand approach (already partially implemented via the isToday border in WeekStrip).
- In week view the practitioner chip filter still appears above the week strip, but the day grid below only shows ONE practitioner's column. This is confusing — the header implies 'which practitioner to focus on' but provides no indication that other practitioners' columns exist. The chips should be hidden in multi-column day view or replaced by a column-visibility toggle.
