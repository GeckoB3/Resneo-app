# Calendar availability (blocks & leave) — parity ~22%

## App files
- app/(app)/availability.tsx
- lib/queries/useAvailabilityManage.ts
- types/availability-manage.ts
- lib/queries/usePractitioners.ts
- lib/queries/keys.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/calendar-availability/page.tsx
- _reference/Resneo/src/app/dashboard/availability/AppointmentAvailabilitySettings.tsx
- _reference/Resneo/src/app/dashboard/availability/StaffLeaveCalendarPanel.tsx
- _reference/Resneo/src/app/dashboard/availability/BookableCalendarsPanel.tsx
- _reference/Resneo/src/app/dashboard/availability/AvailabilitySettingsClient.tsx
- _reference/Resneo/src/app/api/venue/practitioner-leave/route.ts
- _reference/Resneo/src/app/api/venue/practitioner-calendar-blocks/route.ts
- _reference/Resneo/src/app/api/venue/practitioner-calendar-blocks/[id]/route.ts
- _reference/Resneo/src/app/api/venue/practitioners/route.ts

## Summary
The app's availability.tsx is a functional but minimal list-only screen. It shows the next 14 days of manual time blocks and leave periods across all practitioners, and provides creation and deletion for both. The web reference is a full-featured multi-tab settings centre (Calendars / Availability hours / Breaks / Closures) that manages the entire calendar configuration lifecycle: creating/editing/deleting/reordering practitioner calendar columns, editing weekly working hours per day, editing per-day break schedules, and a rich calendar-picker-driven closure/unavailable-window manager (StaffLeaveCalendarPanel). The app implements none of the working-hours, breaks, or calendar-management tabs, has no edit capability for existing blocks or leave periods, restricts block viewing to 14 days, cannot filter by practitioner, does not support partial-day unavailability windows, and has no "apply to all active calendars" leave option. The app has correctly wired all five REST operations the two backend routes expose (GET/POST/DELETE blocks, GET/POST/DELETE leave), but is missing PATCH on both and never calls the practitioners PATCH endpoint for hours/breaks.

## Recommendation
The app covers only the operational surface of availability management (creating and deleting single-day blocks and leave periods for the next 14 days). To reach full parity with the web, implement in this priority order: (1) Add PATCH support for editing existing blocks and leave periods — the backend routes are fully implemented and the app types already include all required fields (unavailable_start_time/end_time are in LeavePeriod); create useUpdateBlock and useUpdateLeave mutations in useAvailabilityManage.ts, and add a tap-to-edit flow re-using the existing Sheet. (2) Add partial-day unavailability: extend the leave Sheet with a block_type toggle and time pickers. (3) Implement working hours and breaks editors: usePractitioners already fetches working_hours via roster=1; add a usePatchPractitioner mutation (PATCH /api/venue/practitioners) and build per-day hour/break editing cards below the existing block/leave cards. (4) Add practitioner-level filtering: allow the user to scope the view and the calendar-picker interaction to a single practitioner. (5) Add an apply-to-all-active option for admin leave creation. (6) Fix the three medium-severity bugs: per-id delete loading state, unified-block practitioner name resolution, and empty-practitioners guard. Calendar column management (add/delete/reorder) should remain a web link-out given its complexity, but name and active-toggle editing can be added in-app. Replace the Stepper date input with a proper date picker for leave period selection as a high-impact UX improvement.

## Gaps (13)

### [HIGH] Edit existing time block (reschedule / change reason) — missing
- Backend: PATCH /api/venue/practitioner-calendar-blocks/[id]
- Web behaviour: Web calls PATCH /api/venue/practitioner-calendar-blocks/[id] with updated start_time, end_time, block_date, and/or reason. Inline stepper edit in a modal.
- Mobile plan: Add an 'Edit' button (pencil icon) to each block row in the list. Re-use the existing Sheet component already used for create, pre-populated with the block's current values. Wire to a new useUpdateBlock mutation in useAvailabilityManage.ts calling PATCH /api/venue/practitioner-calendar-blocks/[blockId].

### [HIGH] Edit existing leave period (change dates, type, notes) — missing
- Backend: PATCH /api/venue/practitioner-leave
- Web behaviour: Web calls PATCH /api/venue/practitioner-leave with { id, start_date, end_date, leave_type, notes, unavailable_start_time, unavailable_end_time }. Tapping an upcoming period opens the form pre-populated.
- Mobile plan: Add a tap-to-edit affordance on each leave row. Pre-populate the existing leave Sheet with period data and wire to a new useUpdateLeave mutation in useAvailabilityManage.ts calling PATCH /api/venue/practitioner-leave.

### [HIGH] Partial-day unavailability window for leave — missing
- Backend: POST /api/venue/practitioner-leave (unavailable_start_time + unavailable_end_time fields already exist in schema)
- Web behaviour: Web's StaffLeaveCalendarPanel supports a 'block_type' of 'partial' with unavailable_start_time and unavailable_end_time fields (HH:mm). POST /api/venue/practitioner-leave accepts these. Web renders them as a separate badge type ('Unavailable window' vs 'Closure').
- Mobile plan: Add a block_type Segmented toggle ('All day' / 'Time window') to the leave Sheet. When 'Time window' is selected show Start time / End time Steppers. Include unavailable_start_time / unavailable_end_time in the POST body. Display partial-day periods with a distinct label ('Window') in the leave list. Type is already in LeavePeriod (unavailable_start_time / unavailable_end_time) in types/availability-manage.ts.

### [HIGH] Working hours editor (per-day weekly schedule per practitioner) — missing
- Backend: GET /api/venue/practitioners?roster=1 (already called by usePractitioners), PATCH /api/venue/practitioners
- Web behaviour: Web 'Availability' tab fetches practitioners from GET /api/venue/practitioners?roster=1 (includes working_hours per day as JSON). Lets admin or calendar-owner edit hours per weekday and saves via PATCH /api/venue/practitioners with { id, working_hours }.
- Mobile plan: Add a new 'Hours' section card to availability.tsx (or a separate screen accessible via a 'Manage hours' row). Render a WorkingHoursEditor component: for each of 7 weekdays, show start/end time steppers (or native time pickers). On save call a new usePatchPractitioner mutation (PATCH /api/venue/practitioners with { id, working_hours }). Note: usePractitioners query does not currently request working_hours; ensure roster=1 param is already present (it is) so the field is returned.

### [HIGH] Breaks editor (per-day break windows per practitioner) — missing
- Backend: PATCH /api/venue/practitioners
- Web behaviour: Web 'Breaks' tab allows adding/removing/editing per-day break time ranges for a selected practitioner. Saves via PATCH /api/venue/practitioners with { id, break_times: [], break_times_by_day: { '1': [{start,end}], ... } }.
- Mobile plan: Extend the same screen/section as working-hours. Add a 'Breaks' card per-day. For each weekday, allow adding multiple HH:mm–HH:mm ranges using + add / swipe-to-delete. Include a 'Copy Monday to all days' button. Save via the same usePatchPractitioner mutation with break_times_by_day payload.

### [HIGH] Calendar (practitioner column) management: add, edit, delete, reorder — missing
- Backend: POST /api/venue/practitioners, PATCH /api/venue/practitioners, DELETE /api/venue/practitioners, PUT /api/venue/practitioner-services
- Web behaviour: Web 'Calendars' (team) tab: lists all calendar columns with services/classes/resources/events badges. Allows creating a new column (POST /api/venue/practitioners), editing name/active/service links (PATCH /api/venue/practitioners + PUT /api/venue/practitioner-services), deleting (DELETE /api/venue/practitioners), and reordering via drag or up/down buttons (PATCH /api/venue/practitioners with sort_order).
- Mobile plan: This is deep admin config; consider a 'Manage calendars' web link-out for the delete/reorder operations. However add/rename/active-toggle are achievable in-app: add a 'Calendars' card listing practitioners with an Edit sheet for name and is_active toggle. Wire to PATCH /api/venue/practitioners. Keep delete and reorder as web link-out. Service linking may also remain web-only.

### [MEDIUM] Apply leave to all active calendars at once — missing
- Backend: POST /api/venue/practitioner-leave (apply_to_all_active field)
- Web behaviour: Web shows an 'Apply to all active calendars' checkbox when isAdmin and not editing an existing record. POST /api/venue/practitioner-leave accepts apply_to_all_active: true (omitting practitioner_id).
- Mobile plan: Add a Switch component 'Apply to all practitioners' to the leave Sheet, visible when the user is an admin. When toggled on, hide the practitioner chip row. Include apply_to_all_active: true in the POST body and omit practitioner_id.

### [MEDIUM] Filter leave/blocks view by practitioner — missing
- Backend: GET /api/venue/practitioner-leave?practitioner_id=
- Web behaviour: Web's StaffLeaveCalendarPanel passes practitioner_id as a query param to GET /api/venue/practitioner-leave, fetching per-calendar data. Each calendar is shown separately in the calendar-picker UI.
- Mobile plan: Add a horizontal Chip scroll row above the two cards to filter both lists to the selected practitioner. Pass the selected practitioner_id to useCalendarBlocks and usePractitionerLeave queries (add optional param to both hooks). When no filter is active show all (current behaviour).

### [MEDIUM] Calendar entitlement / plan limit enforcement — missing
- Backend: GET /api/venue/calendar-entitlement
- Web behaviour: Web calls GET /api/venue/calendar-entitlement before showing 'Add calendar'. Shows usage badge (N of M on plan) and upgrade modal when at_calendar_limit is true.
- Mobile plan: If/when calendar-add is implemented in-app, fetch /api/venue/calendar-entitlement (add a useCalendarEntitlement hook) and block the Add button with an inline notice or Alert when at_calendar_limit. Low priority until calendar-add is built.

### [MEDIUM] Calendar-picker month navigation for leave (with visual closure heat-map) — missing
- Backend: GET /api/venue/practitioner-leave?from=&to=&practitioner_id= (same route, different date window)
- Web behaviour: Web renders a full ResourceExceptionsCalendar month grid where closure/partial-window days are highlighted. Clicking dates sets the date range. Prev/next month navigation. Query uses rangeFrom/rangeTo matching the displayed month.
- Mobile plan: The app's stepper date picker is functional but blind (no calendar heat-map). As a medium-priority enhancement, add a month-grid calendar picker using a React Native date-grid component (e.g. @marceloterreiro/flash-calendar or custom FlatList grid). Highlight dates that already have blocks/leave using the existing query data. Would dramatically improve UX for creating multi-day leave.

### [MEDIUM] Role-based access: non-admin staff can only see/edit their own calendar — missing
- Backend: none (server enforces), but the app needs to conditionally hide practitioner chips or show only the user's own calendar based on staff role from venue bootstrap.
- Web behaviour: Web checks staff.role and currentStaffId. Non-admin staff see only their own calendar's hours/breaks and cannot access the 'Calendars' management tab. The API enforces this server-side (requireManagedCalendarAccess).
- Mobile plan: Read staff role from VenueProvider (already available). When role is 'staff', default the practitioner chip to the authenticated user's calendar ID and hide admin-only features (add/delete calendar, apply-to-all leave). The backend will return 403 for out-of-scope operations regardless.

### [LOW] Practitioner booking slug (per-calendar public booking URL) management — missing
- Backend: PATCH /api/venue/practitioners, GET /api/venue
- Web behaviour: Web BookableCalendarsPanel shows an inline text input per calendar to edit and save the practitioner slug (PATCH /api/venue/practitioners with { id, slug }), plus a copy-to-clipboard button for the full public book URL.
- Mobile plan: Out of scope for at-the-counter ops; provide a web link-out from the calendar listing if users need to update slugs.

### [LOW] Past blocks/leave history display — missing
- Backend: none (same endpoints, extend date window or add history param)
- Web behaviour: Web separates periods into 'Upcoming' and a collapsed 'Past blocks (N)' section. App shows no past periods because the 14-day window starts from today. Web fetches current month's data and shows past entries in a collapsible section.
- Mobile plan: Add a 'Show past' toggle or a separate collapsed section that extends the query window backwards (e.g. last 30 days). Low priority.

## Bugs spotted
- [medium] The block list filters out class-instance blocks using `!b.class_instance_id` but blocks from the unified `calendar_blocks` table use `calendar_id` not `practitioner_id`. The display line `practitionerName(block.practitioner_id ?? block.calendar_id)` may fall back to 'Staff member' for unified blocks because the practitioners array returned by usePractitioners maps `unified_calendars.id` values correctly only if roster=1 is used — however the fallback to `calendar_id` may silently show 'Staff member' rather than the actual calendar name when the block comes from the `calendar_blocks` table (source='calendar_blocks', practitioner_id=null, calendar_id=<uuid>). (app/(app)/availability.tsx)
- [medium] The `deleteBlock` mutation uses `isPending` as a single loading flag for all rows simultaneously. Any click on any 'Remove' button during a delete operation disables ALL Remove buttons at once and shows the loading spinner on the tapped row, but actually any second delete initiated while the first is pending will also fire (no guard). Should track the specific id being deleted to avoid a double-delete race and to correctly scope the loading indicator. (app/(app)/availability.tsx)
- [medium] Same issue as deleteBlock: `deleteLeave.isPending` is used for all leave rows' loading state simultaneously. Both mutation loading flags should be replaced with per-id tracking (e.g. a Set<string> in local state). (app/(app)/availability.tsx)
- [low] The leave POST body sends `leave_type: leaveType` which is typed as `LeaveType` ('annual' | 'sick' | 'other'), but the web API's Zod schema maps 'annual' to 'Closed', 'sick' to 'Unavailable', and 'other' to 'Other' only in the display label. The underlying value is correct. However the Segmented options on the app label them 'Annual', 'Sick', 'Other' — these are raw DB enum values, not user-facing copy. The web shows 'Closed', 'Unavailable', 'Other'. The app labels are misleading for non-HR venues (e.g. a hair salon that just wants to mark a column 'Closed' or 'Unavailable'). (app/(app)/availability.tsx)
- [low] If `practitioners` is empty when the sheet opens, `practitionerId` will be null (set to `practitioners[0]?.id ?? null`), but the Save button is only disabled when `!practitionerId`. With an empty roster, pressing Save will pass the missing-access-token guard but send `practitioner_id: null` to the API which will return a 400. The error will be caught and shown, but no guard prevents the attempt. Should also disable/show empty state when practitioners are still loading. (app/(app)/availability.tsx)

## Design notes
- The Stepper component for date selection is functional but slow for navigating more than 1-2 days. Users creating a leave period spanning future months must tap the increment button many times. A date picker modal using expo-datetime-picker or a custom month-grid would dramatically improve the experience.
- The 14-day window is silently applied with a small caption note ('Next 14 days'). Users cannot see blocks beyond this window from the app. The window should either be longer (e.g. 90 days) or a date-range picker should allow browsing forward.
- Time blocks and leave periods are presented in two separate Card sections rather than a unified chronological timeline. A merged timeline sorted by date would be more scannable on a small screen and matches how staff think about availability (what days are blocked?).
- The 'Block time' and 'Add leave' action buttons sit above the caption and list, but on short screens this pushes the lists down. Consider moving the FAB-style action to a sticky bottom bar or a '+' floating action button so the list uses maximum screen height.
- The sheet for create/edit is a generic bottom sheet with no visual differentiation between 'block' and 'leave' modes beyond the overline text. Using distinct header colours (e.g. amber for block, teal for leave) would reduce errors.
- The practitioner chip scroll row in the sheet has no 'All' option. If a manager wants to add leave for all staff they must tap 'Add leave' for each practitioner individually (there is no apply-to-all in the app). This is a significant time cost for whole-salon closures.
- Block and leave rows show a plain 'Remove' ghost button which is low-affordance and easy to tap accidentally on a small screen. Swipe-to-delete (using a Reanimated swipeable row) would be more mobile-native and reduce accidental deletions. The current confirm Alert provides a safety net but the trigger is too easy to hit.
- There is no visual indication that a block has already passed (past blocks share the same style as future ones). Greying out or grouping past items would help staff focus on upcoming availability.
