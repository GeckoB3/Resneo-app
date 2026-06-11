# Business Hours (hours) — parity ~35%

## App files
- app/(app)/manage/hours.tsx
- components/manage/OpeningHoursEditor.tsx
- lib/queries/useVenueSettings.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/settings/sections/OpeningHoursSection.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/BusinessClosuresSection.tsx
- _reference/Resneo/src/components/scheduling/OpeningHoursControl.tsx
- _reference/Resneo/src/app/api/venue/opening-hours/route.ts
- _reference/Resneo/src/app/api/venue/availability-blocks/route.ts
- _reference/Resneo/src/app/dashboard/settings/page.tsx

## Summary
The app page renders a weekly opening-hours editor (OpeningHoursEditor) with per-day open/closed toggle, 15-minute stepper controls for 1–2 periods per day, and a Save button that PATCHes /api/venue/opening-hours. Admin role gates editing; non-admins see a read-only list of hours per day. A footnote tells users that closures and per-service availability are managed on the web. The web equivalent (OpeningHoursSection within Settings) has the same weekly editor but additionally uses native time inputs instead of steppers, includes a "Copy to other open days" shortcut per day, and is immediately followed by a full Closures and Special Days sub-section (BusinessClosuresSection) which provides a calendar-picker UI for creating, editing and deleting availability blocks of type: closed, amended_hours, reduced_capacity, and special_event — each with date range, optional time range, override periods or capacity, and a reason field, backed by GET/POST/PATCH/DELETE /api/venue/availability-blocks.

## Recommendation
The app's weekly opening-hours editor is functionally sound but covers only 35% of the web's feature set because the entire Closures and Special Days sub-section is missing. This is the single highest-priority gap: implement useAvailabilityBlocks (GET), useCreateBlock, usePatchBlock, and useDeleteBlock hooks in lib/queries/, then build an AvailabilityBlocksSection component that renders a compact monthly mini-calendar (colour-coded by block type), a bottom-sheet BlockForm (type selector, DateRangePicker, conditional fields for amended hours and reduced capacity, reason), and upcoming/past block lists — mount it as a second Card in hours.tsx. Alongside this, fix the inline-render state-seeding bug (high severity) by moving draft initialisation into a useEffect or useState lazy initialiser. Add the 'Copy to other open days' per-day shortcut in OpeningHoursEditor as a medium-priority UX improvement. Finally, remove the footnote directing users to the web once closures are implemented in-app, and add a visual unsaved-changes indicator on the Card so users on small screens know they have pending edits without having to scroll to the Save button.

## Gaps (4)

### [CRITICAL] Closures and Special Days — full CRUD for availability blocks — missing
- Backend: GET /api/venue/availability-blocks, POST /api/venue/availability-blocks, PATCH /api/venue/availability-blocks, DELETE /api/venue/availability-blocks — all exist in the reference and require Bearer-JWT admin auth
- Web behaviour: BusinessClosuresSection renders a month calendar with colour-coded exception overlays, a form panel to create or edit blocks (type: closed / amended_hours / reduced_capacity / special_event; date range; optional time range; override hours; capacity overrides; yield overrides; reason). Uses GET /api/venue/availability-blocks to load, POST to create, PATCH to update, DELETE to remove. Blocks are shown in upcoming/past lists with inline edit and delete. Admin-only write; staff see nothing.
- Mobile plan: Add a useAvailabilityBlocks query hook in lib/queries/useAvailabilityBlocks.ts (GET) and useCreateBlock, usePatchBlock, useDeleteBlock mutations. Add a AvailabilityBlocksSection component under components/manage/ that renders: (1) a compact monthly mini-calendar using the existing calendar primitives showing colour-coded exception days; (2) a modal/bottom-sheet with BlockForm (type picker, DateRangePicker reusing expo DateTimePicker, optional time pickers, conditional fields for amended hours / reduced capacity, reason TextInput); (3) scrollable upcoming and past block lists. Mount this section in a Card below the weekly hours card in hours.tsx.

### [MEDIUM] Copy hours to other open days shortcut — missing
- Backend: none
- Web behaviour: OpeningHoursControl renders a 'Copy to other open days' button inside each open day row. Clicking it copies that day's periods to every other day that is currently toggled open, allowing quick bulk-copy of a single day's pattern.
- Mobile plan: In OpeningHoursEditor.tsx, add a 'Copy to all open days' Pressable/Button below the period rows for each day that is open. On press, iterate over all days, and for those that are open (not closed), set their periods to a clone of the current day's periods. Gate on editable prop. Render only when at least one other day is open.

### [LOW] Native time input vs 15-minute stepper UI — partial
- Backend: none
- Web behaviour: Web uses native <input type='time'> which renders the OS time picker; user can type or spin any minute value freely, giving full precision and faster input on a laptop.
- Mobile plan: The stepper UX is appropriate for mobile; however the current 15-minute step is potentially too coarse for some venues. Consider offering a long-press or an alternate modal using expo DateTimePicker in 'time' mode for arbitrary minute selection, while keeping the stepper as the default quick control. This is an enhancement, not a bug.

### [LOW] Day ordering — Sunday first vs Monday first — partial
- Backend: none
- Web behaviour: Web OpeningHoursControl lists Sunday first (key '0' at top) following ISO calendar convention.
- Mobile plan: App intentionally renders Monday first (Monday through Sunday), which is preferred by most UK/EU locales. This is an intentional deviation; consider deriving day order from the venue's locale/timezone setting or making it a venue preference rather than hardcoding either order. Low priority.

## Bugs spotted
- [high] State-seeding anti-pattern: `if (venue && !seeded) { setSeeded(true); setDraft(...) }` is called inline during render, which in React 18 strict mode (and with concurrent rendering) can execute the render body multiple times before effects fire, leading to multiple setState calls in the same render pass. This will trigger a React warning ('Cannot update a component while rendering a different component') and may cause stale-draft issues. The seed should be in a useEffect or initialised via useState lazy initialiser. (app/(app)/manage/hours.tsx)
- [medium] Stale success badge: `saved && !hasChanges` shows 'Hours saved.' but `setSaved(true)` runs before the query client invalidation (which triggers a re-fetch that overwrites `venue.opening_hours`). If the network is slow, the re-fetch that re-seeds `draft` will reset `seeded` to false and re-run the seed logic, which resets `draft` to the server value AND leaves `saved` as true. The net effect can be a ghost 'Hours saved.' message after the re-seeded draft diverges again. Reset `saved` in the onSuccess of useUpdateOpeningHours (via an `onSuccess` callback in the mutation) rather than managing it separately in the component. (app/(app)/manage/hours.tsx)
- [low] validate() only checks periods[0] and periods[1] for ordering but iterates the whole periods array looking for open >= close. However the function then destructures `const [first, second] = day.periods` and checks `second.open < first.close` — this is correctly checking second-period overlap but the index is implicit and will silently ignore any third or higher periods (which the backend schema allows up to 4). Not a current crash risk since the editor caps at 2 periods, but the validation logic is inconsistent with the backend schema. (app/(app)/manage/hours.tsx)

## Design notes
- The TimeStepper (− / + buttons with 36×36 circular press targets) is a reasonable mobile-first pattern, but the value label has `minWidth: 52` which can clip 5-character times like '23:45' on smaller fonts. Increase to 60 or use `tabular-nums` with a fixed width of 64.
- There is no visual feedback on the Card between 'no changes' and 'unsaved changes' states. On web the sticky Save bar is always visible. On mobile, consider a subtle amber border or badge on the Card header when `hasChanges` is true to help the user know they have pending changes before they scroll down to the Save button.
- The footnote ('One-off closures … are managed on the web dashboard') is a dead-end for the user — once Closures and Special Days are implemented in-app, this copy should be removed or updated.
- Non-admin read-only view renders inline text (`Closed` or `HH:mm–HH:mm`) instead of the stepper row. This is correct but the layout collapses to a single line per day which could be hard to scan. Consider a two-column grid (day name left, hours right) for the read-only mode.
- The 'Add second period' button uses a ghost Button component with no minimum height guard; on Android the touch target can be below the 44pt recommended minimum. Wrap in a View with minHeight: 44 or use the `size='md'` variant.
- When the save mutation is in flight (`update.isPending`), the individual day switches and steppers remain interactive. This can cause a race where the user modifies hours after hitting Save but before the mutation resolves. Disable the entire OpeningHoursEditor while `update.isPending` by passing `editable={isAdmin && !update.isPending}`.
