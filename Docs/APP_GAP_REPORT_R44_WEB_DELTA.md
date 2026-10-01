# R44: web delta since R43, the 2026-10-01 QA fix round (2026-10-01)

From the web repo (`C:\Resneo`, `staging` at `8c28f5eb`), for the app. R43 covered web up to
`7e6dc740`; the commit that matters to the app in this round is `8c28f5eb`, "Fix the critical and
high findings of the 1 October QA round". The web's own work list for the app is
`C:\Resneo\Docs\R44_APP_HANDOVER.md`, and the route-by-route contract notes are the last section
of `C:\Resneo\Docs\MOBILE_API.md` ("QA fix round: what changes for the app").

The app was at `0924803` when this was built. The read-only web reference `_reference/Resneo` was
**not** moved; the web repo itself was read.

**Nothing here needed a release before the web change.** Every request the app already sent keeps
working. This round fixes one defect the app shared with the web (item 1) and brings the app in
line with the web's calendar pause and remove fix (items 2 to 4).

---

## What changed on the web

| Area | Change | Web QA | App impact |
|---|---|---|---|
| Services | `DELETE /api/venue/appointment-services?dry_run=true` runs the delete's own checks and removes nothing. | D-9 | **Built, item 1.** |
| Calendars | `DELETE /api/venue/practitioners` answers 409 `CALENDAR_HAS_UPCOMING_BOOKINGS` with the list while the calendar has upcoming live bookings. | C-11 | **Built, item 2.** |
| Calendars | The web diary keeps a paused calendar's column on days it has live bookings, marked Paused. | C-11 | **Built, item 3.** |
| Calendars | `GET /api/venue/practitioners/upcoming-bookings?id=` (admin, Bearer) lists who is still booked. `PATCH { is_active: false }` is unchanged. | C-11 | **Built, item 4.** |
| Booking writes | A short lock per calendar and day. The loser of a race gets 409 `SLOT_NO_LONGER_AVAILABLE`. | K-10, A-13 | None. `isSlotTakenError` already keys on it. |
| Everything else | Erase data, merge, import, compliance, memberships, signup, move notifications. | G, H, I, L, B | None needed. See the web handover's "Already right in the app". |

## Done in the app

| # | Change | Web QA | Where |
|---|---|---|---|
| 1 | **Deleting a collective host's service no longer takes it off the page before the delete is known to work.** The order was: take off the page, then delete; a delete refused for upcoming bookings had already parked the service at every venue. It is now: ask (`?dry_run=true`), take off, delete. A refusal changes nothing and shows the server's sentence. If the delete still fails after the service came off the page, the delete sheet says exactly that and the service is left parked (never put back automatically). The "Set up with AI" Undo follows the same order. | D-9 | `lib/services/collective-service-delete.ts` (+ test), `app/(app)/manage/services.tsx`, `components/services-setup/ServicesSetupSheet.tsx` (+ tests), `lib/queries/useServicesManage.ts` (`useCheckServiceDelete`), `lib/services-setup/api.ts` |
| 2 | **Removing a calendar says what really happens, and a refused removal lists who is still booked.** The confirm no longer says "Existing bookings stay on the diary" (never true). The sheet asks who is still booked as it opens: nobody, and it says the calendar goes for good with its hours, breaks, closures and booking link, and that past bookings lose their calendar and leave the diary; somebody, and it becomes "{name} cannot be removed yet" with the list (six shown, then "and N more"), "Move or cancel them first", and a pointer to pausing. The server's 409 on the delete itself shows the same list. | C-11 | `components/availability/CalendarUpcomingSheets.tsx`, `BookableCalendarsManager.tsx` (+ tests), `lib/venue/calendar-upcoming-bookings.ts` (+ test), `lib/queries/useAvailabilityManage.ts` |
| 3 | **A paused calendar's bookings are drawn on the diary.** The diary asked the grid for active calendars only, so a booking on a paused calendar was Booked and drawn nowhere. It now asks for every calendar, and draws a paused one on any date in view where it has something live (Booked, Confirmed, Pending, Started or Completed, or a class, event or resource booking placed on it): a column marked **Paused** on the wide day view, a header pill on the single day view, and "{name} (paused)" on the chips and the week matrix. Month counts include those bookings. A paused column takes nothing new: an empty slot says why instead of opening the add sheet, and a bar dropped on it glides home with the reason. Its own bookings still open, cancel, and move to an active calendar. | C-11 | `lib/calendar/diary-columns.ts` (+ test), `app/(app)/(tabs)/index.tsx`, `AllCalendarsDayGrid.tsx` (`acceptsDrops`, + test), `DraggableAppointmentBlock.tsx`, `CalendarDayGrid.tsx` (`calendarBadge`), `lib/calendar/column-move-groups.ts` (+ test) |
| 4 | **Pausing a calendar with upcoming bookings warns first.** The switch asks who is still booked. Nobody: it saves as before. Somebody: "Pause {name}?" lists them and says they all stay booked and clients are not told, that the calendar stops taking new bookings, and that it still shows on the diary on days with bookings, marked Paused (true since item 3). **Go back** / **Pause calendar**. If the check cannot be made nothing is changed and a toast says so. Switching a calendar back on never asks. | C-11 | `CalendarUpcomingSheets.tsx`, `BookableCalendarsManager.tsx` (+ tests) |

Also, with item 3: changing the time or length of a booking that stays on a paused calendar is
refused by the server in the engine's words ("Staff not available"). The diary now says
"{name} is paused, so this booking cannot change time or length here. Move it to another
calendar, or switch {name} back on." (`pausedColumnChangeRefusal`).

## Against a web release without `8c28f5eb`

The app may reach an environment before the web change does, so each item was built to behave
there too.

| Item | On an older server |
|---|---|
| 1 | `dry_run` is ignored and a real delete runs. If the service has upcoming bookings the server refuses (as before) and nothing comes off the page, which is already the fix. Otherwise the engine refuses with 409 `COLLECTIVE_OFFERED_SERVICE` because the service is still on the page: the app reads that as "the route's own checks passed" and carries on with take off, then delete, as it always did. A plain 200 means it was really deleted. |
| 2 | The pre-check answers 404. The confirm then promises nothing about a refusal, and the delete goes through as it always did. |
| 3 | No server dependency: the grid has always served any calendar of the venue. |
| 4 | The pre-check answers 404 and the switch saves as it always did, with no warning. |

## Tested

- Jest: 356 suites, 3,444 tests, all passing. `npm run typecheck` clean. `npm run lint`: 0 errors
  (warnings only; the one added is an `import/first` in `ServicesSetupSheet.test.tsx`, which
  imports after its mocks like the lines around it).
- **Not run on a device or a simulator.** The sheets, the Paused pill and the refused drop were
  checked by unit and render tests only; the drag gesture is mocked in Jest, so the glide-home of a
  bar dropped on a paused column has not been seen.

Worth doing on a phone against staging (which has `8c28f5eb`):

1. Calendar availability, Calendars tab: switch off a calendar that has an upcoming booking. The
   warning lists it. Pause calendar. Open the diary on that booking's day: the column is there,
   marked Paused; on a day with nothing booked it is not.
2. On that column: tap an empty slot (a note, no add sheet); drag a booking onto it from another
   column (it goes home, with a note); drag its own booking to an active column (it moves).
3. Calendars tab: delete that calendar. "cannot be removed yet" with the list. Cancel the booking,
   delete again: the confirm says it has no upcoming bookings, and it goes.
4. As a collective host: delete a service on the combined page that has an upcoming booking. The
   refusal shows and the service is still on the page (it used to be parked).

## Notes, not changed

- The web handover's optional items (O-1 to O-6) were not built: the warning before removing a
  service option, imported details on the client screen, a longer timeout on booking writes,
  `SLOT_BUSY` handling, a message owed when the app is closed, and the erase confirm copy.
- A stored calendar filter (wide day view) that does not include a paused calendar keeps it
  hidden, as any filter does. Its chip is listed on the days it has bookings.
- "Working today" hides a paused calendar that has no working hours on the day, as it hides an
  active one. A booking outside working hours on such a day is not drawn while that filter is on.
- The store "What's new" copy in `CHANGELOG.md` was left alone.
