## 06. Classes & Events

**Parity:** Strong — core class/event management (type & event CRUD, scheduling, weekly rules, rosters with check-in, CSV) is at strong-to-full parity over the same Bearer routes the web uses, but the entire Class Products / class-commerce surface (credit packs, courses, memberships) is absent.

Day-to-day running of classes and events is genuinely well covered in the app, and in a few places (weekly-rule **creation**, per-row custom-date pickers, plan-gate handling) it is ahead of the current web view. The dominant gap is commercial, not operational: the web's prepaid **credit packs, fixed-session courses with enrollment management + refunds, and recurring memberships** have zero hooks, screens, or types in the app — confirmed by grep across `app/`, `components/`, and `lib/`. Secondary gaps are all surfacing/polish: no month-grid or class-type filter or stats bar on the timetable, the event public-booking-link not exposed on the Events screen (the link itself is already copyable elsewhere in the app), Classes/Events buried under Settings, and the per-session admin cancel reachable only from the manager list rather than the open roster.

### Screen-by-screen

| Surface | Web | App | Parity | Notes |
| --- | --- | --- | --- | --- |
| Class timetable (list/agenda) | `class-timetable/ClassTimetableView.tsx`, `ClassTimetableReadOnlyCalendar.tsx`, `ClassTimetableStatsRow.tsx` | `app/(app)/classes.tsx`, `components/classes/ClassSessionCard.tsx` | Partial | App is a rolling 7-day agenda; web adds a month-grid calendar, class-type filter, and stats bar. |
| Class type create/edit | `class-timetable/ClassTimetableView.tsx` (class-type modal) | `components/classes/ClassTypeEditorSheet.tsx` | Full | Field parity confirmed; app adds a swatch palette + hex field. |
| Schedule sessions (single/weekly/every-N-days) | `class-timetable/ClassScheduleModal.tsx` | `components/classes/ClassScheduleSheet.tsx` | Strong | Same expansion math + 100 cap; app uses a date-picker field, web a month grid. |
| Weekly recurring rule create/edit | `class-timetable/ClassTimetableView.tsx` (editingTimetable + chips) | `components/classes/ClassRuleSheet.tsx`, `ClassTypesManagerSheet.tsx` | Strong | App is ahead: it **creates** weekly rules + "Generate sessions"; web only edits/removes existing ones. |
| Class session roster / check-in | `practitioner-calendar/ClassInstanceDetailSheet.tsx` | `components/classes/ClassRosterView.tsx` | Strong | Full check-in/no-show/CSV/tap-through; missing the per-session cancel that lives in the roster header on web. |
| Class manager (types + sessions + rules hub) | `class-timetable/ClassTimetableView.tsx` | `components/classes/ClassTypesManagerSheet.tsx` | Strong | Lists types, next sessions, active rules, all CRUD + cancel-and-notify; web also has a "Class products" link. |
| Event list + manager | `event-manager/EventManagerView.tsx` | `app/(app)/events.tsx`, `components/events/EventManagerSheet.tsx`, `EventCard.tsx` | Strong | Upcoming/Past segmented + roster + manager; web adds ticket-tier/cap pills + copy-link. |
| Event create/edit | `event-manager/EventManagerView.tsx` (event form) | `components/events/EventEditorSheet.tsx` | Full | Full parity (112 matches); app's per-row date pickers are more robust than web's textarea. |
| Event attendee roster | `event-manager/EventManagerView.tsx` (attendees + EventAttendeeArrivedActions) | `components/events/EventAttendees.tsx` | Full | Full parity (46 matches): party size, per-ticket lines, deposit, Arrived/Clear, CSV. |
| Class Products — credit packs | `class-timetable/products/ClassCommerceProductsClient.tsx` (CreditPackPanel) | absent | Missing | No screen/route/hook/type; gated behind `class_commerce_enabled` on web. |
| Class Products — courses + enrollments | `products/ClassCommerceProductsClient.tsx` (CoursePanel, CourseEnrollmentsPanel) | absent | Missing | Web manages enrollments + admin cancel-with-refund; app has no usage at all. |
| Class Products — memberships | `products/ClassCommerceProductsClient.tsx` (MembershipPanel) | absent | Missing | Recurring class memberships (allowance/unlimited, rollover, discount); no app equivalent. |
| Event public booking link | `event-manager/EventManagerView.tsx` (line 819 copy, line 888 open) | `app/(app)/events.tsx`, `EventManagerSheet.tsx` (absent here) — but present in `manage/booking-page.tsx` | Partial | Action not on the Events screen; the same `/book/[slug]` link is already copyable/openable in `booking-page.tsx`. |

**Class timetable.** The app's `classes.tsx` is a rolling 7-day `SectionList` agenda with week prev/next navigation and live-sync. Web pairs an agenda with a read-only month calendar (`ClassTimetableReadOnlyCalendar.tsx`) and a `scheduledClassFilterId` per-class-type filter plus a compact stats row. The screen is reached via **Settings → Booking types** (`appRoute '/classes'`), not a tab.

**Class type create/edit.** `ClassTypeEditorSheet.tsx` matches web field-for-field: name, description, colour, active, duration, capacity, a required calendar column with inline add, instructor label, booking rules, and price + payment radios with conditional deposit and a Stripe-not-connected warning. The app additionally offers a curated swatch palette plus a hex field, and gates non-admins to their managed calendars.

**Schedule sessions.** `ClassScheduleSheet.tsx` ports the date-expansion math (single / weekly / every-N-days), caps creation at 100, reports created/skipped counts, and can edit an existing instance. The only difference is the date input: the app uses a `DatePickerField` (6 refs, no month grid) where web uses a month-grid cell picker that shows existing sessions inline — functionally equivalent.

**Weekly recurring rule.** The app is genuinely ahead here. `ClassRuleSheet.tsx` both **creates** and edits a weekly rule (`day_of_week`, time, interval 1–8 weeks, end never/until/count), and `ClassTypesManagerSheet.tsx` exposes "Generate sessions". The current web view only edits/removes existing rules. Both use the same payloads to edit/remove.

**Class session roster.** `ClassRosterView.tsx` shows the attendee list with status/contact/deposit/checked-in time, per-attendee **Check in** and **No-show**, **Check in all**, CSV export, and tap-through to the booking detail, and it handles the class-commerce 403 gracefully. It is downgraded from full to strong for one reason: the per-session admin **Cancel class & notify** is absent from this roster header (it lives in `ClassTypesManagerSheet`), and the footer note (lines 356–357) wrongly states that cancelling a session is web-only.

**Event surfaces.** `events.tsx` is a read-only Events screen (Upcoming / Past 90 days segmented, expandable roster, live-sync over `experience_events` + bookings); `EventManagerSheet.tsx` adds New/search/View attendees/Edit/Delete and admin Cancel-and-notify. Create/edit (`EventEditorSheet.tsx`) and the attendee roster (`EventAttendees.tsx`) are both at full parity. Web additionally shows ticket-tier pills, a cap pill, and a copy-booking-link affordance.

### Gaps & deficiencies

#### High

- **Class Products / class-commerce surface entirely missing (credit packs, courses, memberships)** — _function · high_
  - **Web:** At `/dashboard/class-timetable/products` (linked from the timetable header when `class_commerce_enabled`), staff create/edit/archive/delete prepaid credit packs, fixed-session courses, and recurring memberships, and see class-commerce metrics. Backed by `/api/venue/class-credit-products`, `/api/venue/class-course-products`, `/api/venue/class-membership-products`, `/api/venue/class-commerce-reports`.
  - **App:** Absent — no screen, route, hook, or type for any class product. `lib/queries/useClassesManage.ts` (the only classes hook) covers only class types/instances/rules/attendees, and `ClassTypesManagerSheet.tsx` has no "Class products" entry. `settings.tsx` even comments that setup & products still live on the web.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/products/ClassCommerceProductsClient.tsx` + `products/page.tsx`; route groups on disk `src/app/api/venue/class-credit-products`, `class-course-products`, `class-membership-products`, `class-commerce-reports`. APP grep for `credit|course|membership|class-commerce` across `app/`, `components/`, `lib/` returns only unrelated files; `lib/queries/useClassesManage.ts` imports no commerce routes.
  - **Fix:** Build a gated `app/(app)/manage/class-products.tsx` reachable from `ClassTypesManagerSheet` (add a "Class products" button shown when a new `useClassCommerceEnabled()` flag mirrors web's `venueHasClassCommerceEnabled`). Add `lib/queries/useClassProducts.ts` wrapping the three Bearer route groups + class-commerce-reports, and `types/class-products.ts`. Phase it: credit packs first (simplest CRUD), then courses + the enrollment/cancel-refund panel, then memberships. Reuse `Sheet`/`Input`/`Segmented` and the `ConfirmDialog`/`Sheet` patterns already in `ClassTypesManagerSheet`. If deferring memberships, ship credits + courses and note the rest.

- **Course enrollment management + refunds unavailable on mobile** — _function · high_
  - **Web:** Within a course, staff list enrollees with per-session attendance and cancel an enrollment, triggering an automatic refund when inside (or bypassing) the cancellation window via `POST /api/venue/class-course-products/[id]/enrollments/[enrId]/cancel`.
  - **App:** Absent — no way to view or cancel course enrollments or issue course refunds; no `class-course-products` usage anywhere in the app.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/products/ClassCommerceProductsClient.tsx` `CourseEnrollmentsPanel` (`cancelEnrollment`, `bypass_window`, `refund_amount_pence`); routes on disk `src/app/api/venue/class-course-products/[id]/enrollments/route.ts` and `.../enrollments/[enrId]/cancel/route.ts`. APP has no `class-course-products` references.
  - **Fix:** As part of the class-products screen, port `CourseEnrollmentsPanel` into `components/classes/CourseEnrollmentsSheet.tsx` calling the enrollments + `enrollments/[id]/cancel` routes; surface the refunded amount in a Toast. This is a money action web can do and the app cannot, so prioritise it alongside courses.

#### Medium

- **No month-grid calendar view of class sessions** — _ui · medium_
  - **Web:** The timetable shows a read-only month calendar (sessions as coloured chips per day) above the agenda, and scheduling uses a month grid where tapping a day shows existing sessions inline.
  - **App:** The Classes screen shows only a rolling 7-day `SectionList` agenda; scheduling (`ClassScheduleSheet`) uses a plain `DatePickerField` with no month/day context.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableReadOnlyCalendar.tsx` + `ClassScheduleModal.tsx` month grid; APP `app/(app)/classes.tsx` (agenda only) + `components/classes/ClassScheduleSheet.tsx` (DatePickerField, no month/grid refs).
  - **Fix:** Add a `Segmented` "Agenda | Month" toggle to `app/(app)/classes.tsx`, reusing the existing `components/booking-wizard/MonthDatePicker.tsx` primitive and the `useClassSessions` feed to render session chips by day. Lower priority than class-commerce.

#### Low

- **No per-class-type filter on the timetable** — _function · low_
  - **Web:** A class-type dropdown (`scheduledClassFilterId`) filters both calendar and agenda to one class type and auto-resets if that type is deleted.
  - **App:** Absent — the agenda (`classes.tsx`) always shows all class types with no filter control.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableView.tsx` (`scheduledClassFilterId`, `filteredInstances`); APP `app/(app)/classes.tsx` has only week nav + `SectionList`.
  - **Fix:** Add a class-type chip/`Segmented` row above the `SectionList` in `app/(app)/classes.tsx`, deriving options from `useManagedClasses()` class_types and filtering the `useClassSessions` feed by name (or thread `class_type_id` once the feed exposes it).

- **Timetable stats bar absent** — _ui · low_
  - **Web:** A compact bar shows active class types, sessions in the next 7 days, upcoming sessions, and total booked spots above the timetable.
  - **App:** Absent — `classes.tsx` has no summary metrics.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableStatsRow.tsx`; APP `app/(app)/classes.tsx` has no stats strip.
  - **Fix:** Compute the same four metrics from `useManagedClasses()` (class_types + instances) and render a small stats strip in the `ClassTypesManagerSheet` header or atop the classes screen; trivial, reuses existing data.

- **Event public booking link not surfaced on the Events screen** — _function · low_
  - **Web:** Event manager has "Copy booking link" (`copyPublicBookingLink`, line 819) and an "Open booking page" link (line 888) to the public `/book/[slug]` page where guests buy tickets.
  - **App:** The Events surface (`events.tsx` + `EventManagerSheet`) offers no copy/share/open action. However, the same venue-level `/book/[slug]` link is already copyable **and** openable in the app via Settings → Booking page (`manage/booking-page.tsx` lines 298–310), so the capability exists app-wide — it is just not one tap from Events.
  - **Evidence:** WEB `_reference/Resneo/src/app/dashboard/event-manager/EventManagerView.tsx` (`copyPublicBookingLink` line 819; "Open booking page" Link line 888; both gated on `publicBookingUrl.includes('/book/')`). APP grep for `Clipboard|booking link|openURL|Linking|/book/` in `components/events` and `app/(app)/events.tsx` returns no matches; `app/(app)/manage/booking-page.tsx` already does `Clipboard.setStringAsync(`${webBase}/book/${slug}`)` (line 303) + `WebBrowser.openBrowserAsync` (line 309), `publicUrl` derived from `venue?.slug` (lines 298–300).
  - **Fix:** Add "Copy booking link" / "Open booking page" actions (IconButtons in the `EventManagerSheet` header or `events.tsx` headerRight) by lifting the `publicUrl` + copy/open logic already in `manage/booking-page.tsx` (`expo-clipboard` + `expo-web-browser`, `venue?.slug`). Trivial — all primitives are proven in the app.

- **Classes & Events buried in Settings rather than a first-class entry** — _design · low_
  - **Web:** Class timetable and Event manager are top-level dashboard sidebar destinations.
  - **App:** Both `/classes` and `/events` are reachable only from Settings → Booking types tiles; there is no tab-bar or calendar-level shortcut.
  - **Evidence:** APP `app/(app)/(tabs)/settings.tsx` `SECONDARY_MODEL_ROWS` (lines 107–108) register Classes (`appRoute '/classes'`) and Events (`appRoute '/events'`) under the booking-models group; `app/(app)/_layout.tsx` has no classes/events tab. WEB `_reference/Resneo/src/app/dashboard/DashboardSidebar.tsx` lists them directly.
  - **Fix:** Surface Classes/Events from the Calendar tab header or a quick-action when the venue has those booking models enabled, so staff running classes don't have to dig through Settings each time. Intentional given the appointments-first 4-tab redesign, but worth a more prominent shortcut.

- **Per-session admin cancel-and-notify lives only in the manager list, not on the open roster** — _ui · low_
  - **Web:** When an admin opens a session's roster (`ClassInstanceDetailSheet`), a "Cancel class & notify guests" button sits alongside CSV / Check-in-all.
  - **App:** The roster view (`ClassRosterView`) has no cancel button; admins must back out to `ClassTypesManagerSheet` and use the per-session "Cancel" in the upcoming list. `ClassRosterView`'s footer note (lines 356–357) also wrongly states "Cancelling the whole session is managed on the web dashboard" even though it IS available in-app.
  - **Evidence:** WEB `_reference/Resneo/src/components/practitioner-calendar/ClassInstanceDetailSheet.tsx` (`handleCancelInstance` in the roster); APP `components/classes/ClassRosterView.tsx` has CSV/check-in but no cancel action, footer note lines 356–357; the cancel actually lives in `components/classes/ClassTypesManagerSheet.tsx` (per-session "Cancel" button lines 494–505 + cancel-and-notify Sheet lines 581–623, via `useCancelClassInstance`).
  - **Fix:** Add an admin "Cancel session & notify" action to `ClassRosterView`'s header (reusing `useCancelClassInstance`, already wired in `ClassTypesManagerSheet`) so cancel is reachable from the roster like web, and fix the misleading footer note (lines 356–357) that claims it's web-only.

### Recommended work (ordered)

1. **Credit packs first (`manage/class-products.tsx` + `useClassProducts.ts` + `types/class-products.ts`).** Stand up a gated class-products screen reachable from `ClassTypesManagerSheet`, behind a new `useClassCommerceEnabled()` flag; wrap `/api/venue/class-credit-products` CRUD. Establishes the screen, hook, and types the rest builds on.
2. **Courses + enrollment management with refunds.** Add `CoursePanel`-equivalent CRUD and `components/classes/CourseEnrollmentsSheet.tsx` calling `class-course-products/[id]/enrollments` and `.../enrollments/[enrId]/cancel`; show the refunded amount in a Toast. (Money action web can do that the app cannot.)
3. **Recurring memberships.** Port `MembershipPanel` into the class-products screen over `/api/venue/class-membership-products` (allowance/unlimited, rollover, discount %, eligible classes, recurring Stripe price). Defer if needed, but note the gap.
4. **Surface the event public booking link.** Lift the `publicUrl` + copy/open logic from `manage/booking-page.tsx` (lines 298–310) into IconButtons on `EventManagerSheet`/`events.tsx`. Trivial, all primitives proven.
5. **Add the per-session cancel to the roster + fix the note.** Wire `useCancelClassInstance` into `ClassRosterView`'s header and correct the misleading footer note (`ClassRosterView.tsx` lines 356–357).
6. **Month view toggle on the timetable.** Add a `Segmented` "Agenda | Month" to `app/(app)/classes.tsx` reusing `components/booking-wizard/MonthDatePicker.tsx` + `useClassSessions`.
7. **Class-type filter on the timetable.** Add a chip/`Segmented` row above the `SectionList` in `classes.tsx` from `useManagedClasses()` class_types.
8. **Stats bar.** Render the four metrics (active types, sessions next 7 days, upcoming, booked spots) atop the classes screen or in the manager header.
9. **More prominent Classes/Events entry.** Add a Calendar-tab shortcut/quick-action when those booking models are enabled, rather than Settings-only.
