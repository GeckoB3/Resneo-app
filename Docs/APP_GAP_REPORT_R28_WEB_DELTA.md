# App gap report R28: the web delta `2c8c2bd7..19d31463` (2026-09-08)

The read-only reference clone (`_reference/Resneo`) was refreshed from web `main`, which had
moved three squashes on from web #182: **#183** (the answer to the app's R27 handover: an
"is Ask ResNeo on?" flag), **#184** (mobile-layout fixes for the web dashboard, combined-page
tools, calendar nesting chains, an add-on service picker) and **#185** (processing time may run
past the end of a service; the calendar draws tails, buffers and rounded pieces). 71 files,
+2,852 / -532. `origin/staging` sits one commit ahead of `main` (`751f3662`), but it is the
pre-squash form of #185, not unreleased work.

This report is the audit of that delta from the app's side. Nothing in it has been built yet;
each finding says what the web changed, what the app does today, and what the port is. Per
[[plan-docs-vs-shipped-code]] every claim was checked against the implementation in the clone
(`src/lib/appointments/processing-time.ts`, `PractitionerCalendarView.tsx`,
`booking-cluster-layout.ts`, the create routes) rather than against `Docs/MOBILE_API.md`,
although that document's new section "Processing time may run past the end of a service"
agrees with the code and names the app directly:

> the app's grid may keep its own treatment, but it should not clamp a block to the row's
> duration, and should place the next service of a visit after the tail.

## 1. Summary

| # | Finding | Severity | Verdict |
|---|---|---|---|
| R28-1 | A visit whose earlier service carries a tail now 400s from the app's wizard: the chain places the next service at `end + buffer`, the server wants `end + tail + buffer` | **Breaks live bookings** | **Built** 2026-09-08 (§3, §13) |
| R28-2 | The service form's validator still refuses a period that reaches past the service, so a service given a tail on the web can no longer be SAVED from the app (any field), and the app cannot create one | **Breaks live editing** | **Built** 2026-09-08 (§4, §13) |
| R28-3 | The processing-time module is one-ended: a re-fit clamps a tail to the new end instead of moving it with the end; a variant inheriting the parent's pattern is not re-fitted to its own length; a null-snapshot booking is not re-fitted to its own length | Wrong gaps drawn and sent | **Built** 2026-09-08 (§5, §13) |
| R28-4 | Calendar: a tail is clamped to the bar; the practitioner's free foot is painted as busy; a middle gap is a pale band, not a hole; nested bars are inset, and cannot chain; no buffer band; visits show no gap before a service that waits | Visual parity, plus a mis-drawn diary once tails exist | **Built** 2026-09-08 (§14) |
| R28-5 | Ask ResNeo: web answered R27-8 with `assistant_enabled` on `GET /api/venue` and a new `GET /api/venue/assistant`; the More row still shows unconditionally | Polish, closes R27-8 | **Built** 2026-09-08 (§14) |
| R28-6 | Add-on library: the group editor gained a "Linked services" picker and the PATCH takes `service_links`; the app's group editor has no picker (links are made from the service form only) | Parity | **Built** 2026-09-08 (§14) |
| R28-7 | Service card facts row: web shows price first, then duration with a clock glyph; the app shows duration then price | Copy/order | **Built** 2026-09-08 (§14) |
| R28-8 | The calendar-grid feed is unchanged, but its `processing_time_blocks` snapshots may now contain a block that ends past `booking_end_time` | Contract note | No change beyond R28-4 |
| R28-9 | Grid lines and the alternate-slot band went one step darker on the web ("a grid staff can see") | Visual | **Built** 2026-09-08 (§14) |

Everything else in the delta is web-only or server-side and inherited: the dashboard's 375px
layout fixes (settings tab bar, support-session toolbar, walk-in modal, table combinations,
super pages, the combined-page dialog, booking-page editor headers, #184); the About-tab map
embed and `map_place_name` on the public venue payload (computed server-side from the Google
review link; nothing for the app to edit); the drag drop-outline covering every service of a
visit and its buffer (the app's drag guard never modelled buffers, and the server refuses a
bad drop either way); the Ladle story; the help-article rewrites (the app opens help on the
web); `Docs/README.md`; and, server-side, the create routes' re-fitted snapshots
(`snapshotProcessingTimeBlocksForBooking`, `serviceWithDurationMinutes`), the engine's
hours/closure/break gates on `serviceSpanMinutes`, the validate-slot phantoms' optional
`processing_time_blocks` (the app never calls that route), and the visit schedule/services
routes carrying `processing_tail_minutes` into the resequencer (the app's Modify sheet posts
to those routes and inherits the fix).

## 2. What "a tail" is, in one paragraph

A processing period on a service (`processing_time_blocks`, each `{ start_minute,
duration_minutes }` from the booking's start) may now START at the service's end
(`start_minute <= duration_minutes`) and run on past it by up to 480 minutes. The stored
`booking_end_time` and `duration_minutes` are unchanged: the tail is not part of the service
length the client sees. The practitioner is FREE for it (another booking may be taken there),
the buffer follows the tail rather than the service end, and in a multi-service visit the next
service starts at `previous start + duration + tail + buffer`. The web's service form now
places the FIRST added period after the service by default (the common case: colour develops
once applied, the chair is free, the cut waits), and a period that reaches the service's end
keeps its distance from the end when the service or booking is re-lengthened (a 60-minute
colour with a 30-minute tail booked with a 15-minute add-on snapshots the tail at minute 75).

The new helpers on the web module, all pure and all needed app-side:

| Helper | What it answers |
|---|---|
| `processingActiveEndMinutes(blocks, duration)` | where the practitioner's last busy stretch ends (touching blocks that reach the end count as one run); equals `duration` when nothing reaches the end |
| `processingTailMinutes(blocks, duration)` | how far the pattern runs past the end (0 when it does not) |
| `serviceSpanMinutes({ duration, buffer, blocks })` | `duration + tail + buffer`: what the next service waits behind and what the hours gates fit |
| `fitProcessingBlocksToDuration(blocks, { from, to })` | two-ended: a block reaching the OLD end shifts by `to - from` at full length; a middle block stays put, is trimmed only when shortened past it, dropped below 5 minutes; result gains `shifted[]` |
| `placeNewProcessingBlock(blocks, duration)` | first block after the service (`start = duration`, 10 min); later ones fill backwards inside it, clear of the trailing run; null when nothing fits |
| `resizeProcessingBlock(block, nextLength, duration)` | a block ending exactly at the end stays anchored there (longer = starts earlier); one starting at or past the end grows later |
| `validateProcessingTimeBlocks` | `0 <= start <= duration`, `start + length <= duration + 480`, no overlap; new error strings |

`practitionerBusyMinuteOffsets` puts the buffer after `duration + tail`; `serviceSchedulingSpanMinutes`
uses `serviceSpanMinutes`; `applyVariantToService` re-fits an inherited parent pattern from the
parent's length to the variant's; `mergeAppointmentServiceWithPractitionerLink` re-fits a
custom staff duration the same way; `resolveEngineBookingProcessingBlocks` re-fits a
null-snapshot booking's template from the catalogue length to the booking's own.

## 3. R28-1: the wizard's chain must wait behind the tail

**What the web did (#185).** `recomputeMultiServiceChain` on the public flow advances by
`duration + processingTailMinutes + buffer`; each segment carries `processingTailMinutes` and
its `processingTimeBlocks` re-fitted to the length it is actually booked at (custom or add-on
minutes included, `segmentProcessing`); `chainSegmentGapMinutes = tail + buffer` feeds
`chainSegmentsSpanMinutes` (the availability engine's chain fit) and `chainSpanMinutes` (the
month span); `planVisitServices` reads `processingTailMinutes` off the catalogue service or
chosen variant. **`POST /api/booking/create-multi-service` now enforces `each start = previous
end + processing time + buffer`** and 400s otherwise with `expected_start`.

**What the app does.** `lib/booking/multi-service-chain.ts` `recomputeMultiServiceChain` adds
`durationMinutes + bufferMinutes` (comment: "verbatim mirror of the web"); `chainTotalMinutes`
counts inner buffers only; `lib/booking/service-chain.ts` `chainSpanMinutes` (the month route's
one length) likewise. The segment type has no tail field, and it cannot compute one:
`AppointmentServiceOption` (`types/appointment-catalog.ts`) drops `processing_time_blocks` when
`ServicePickerStep` and `PractitionerStep` flatten the catalogue, although
`AppointmentCatalogService` and `AppointmentCatalogVariant` both carry it. So the moment a venue
gives a service a tail on the web, every two-service visit started in the app whose FIRST
service is that one is refused by the server. The day's chain availability is unaffected
(`useChainAvailability` sends the `services` param and the server spaces the starts), which
makes the failure worse: the app offers a start the server computed with the tail, then posts
starts it computed without it.

**Port.**
- Carry `processing_time_blocks` onto `AppointmentServiceOption` in both builders (the
  practitioner-scoped row in `PractitionerStep` overrides duration/buffer per practitioner; the
  pattern follows the same service row).
- `MultiServiceSegment` gains `processingTailMinutes` (and `processingTimeBlocks`, kept for the
  review card and any later phantom use). Compute it the web's way: the option's or chosen
  variant's pattern (variant's own when non-empty, else the parent's re-fitted to the variant's
  length, R28-3), re-fitted from the catalogue length to `durationMinutes` (add-ons and the
  staff override folded in), then `processingTailMinutes(blocks, durationMinutes)`. Do it in
  `buildChainFromSlot` and `segmentLength` in `ServiceBookingFlow`.
- `recomputeMultiServiceChain`: `+= durationMinutes + (processingTailMinutes ?? 0) + bufferMinutes`.
- `chainTotalMinutes` (ConfirmStep's client-facing figure) and `chainSpanMinutes` (month) add the
  tail between segments, as the web's `chainSpanMinutes` does.
- Tests: `multi-service-chain.test.ts` and `service-chain.test.ts` gain a tailed segment; a
  `ServiceBookingFlow` case asserting the posted `booking_time` of the second segment.

Group bookings (`GroupBookingFlow`, one slot per person) are not chained and need nothing.

## 4. R28-2: the service form refuses what the web now allows, and cannot save what it made

**What the web did (#185).** `validateProcessingTimeBlocks` accepts `start <= duration` and
`start + length <= duration + 480` with the two new messages ("Processing periods must start
within the service, or at its end"; "Processing time cannot run more than 480 minutes past the
end of the service"). `ProcessingTimeTimelineEditor`: "+ Add processing period" uses
`placeNewProcessingBlock` (first period AFTER the service), the Length field uses
`resizeProcessingBlock`, the Start field keeps `max={duration}`, each row says where it sits
("After the service, 30 min" / "Runs 10 min past the end of the service" / "20 to 45 min into the
service"), the bar spans `serviceSpanMinutes` with the active stretch to `activeEnd`, a paler
tail of the service length, a hairline where the service ends, and "Service: 60 min" / "After
the service: 30 min" in the legend. The help tooltip and caption were rewritten.

**What the app does.** `components/services/ProcessingTimeBlocksEditor.tsx`
`validateProcessingBlocks` still returns "Processing periods must fit within the service
duration (before buffer)" for `start + duration > durationMinutes`, and
`app/(app)/manage/services.tsx` runs it on EVERY admin save, changed or not (line 1118), as does
`VariantsEditor` per option (line 136). So a service whose pattern was given a tail on the web
cannot be saved from the app at all, whatever field the admin touched, and the app cannot create
a tail. `add()` still seeds a new period inside the service at the last block's end.

**Port.**
- `validateProcessingBlocks`: the web's bounds and messages; the `PROCESSING_TAIL_MAX_MINUTES`
  constant lives in the shared module (R28-3).
- `add()`: `placeNewProcessingBlock` (first period after the service, default 10 minutes; the
  web's fallback when nothing fits is a 5-minute block at 0 so the validator explains why).
- Length edits go through `resizeProcessingBlock`; Start stays a plain number capped at the
  duration.
- Per-row placement hint and the header copy: "Time the client waits (colour developing, a mask
  setting) while you are free to see someone else. A period can sit inside the service, or start
  at its end and run on afterwards. Buffer time comes after all of it." Summary line gains
  "After the service: N min" when there is a tail.
- Tests: `ProcessingTimeBlocksEditor` has none today; add validator cases for the three new
  outcomes plus the existing overlap case.

## 5. R28-3: the shared module is one-ended

**What the web did (#185).** Section 2. The important semantic change is
`fitProcessingBlocksToDuration(blocks, { fromDurationMinutes, toDurationMinutes })`: a block
that reaches the OLD end (or a run of touching blocks that does) moves with the end at its full
length, so shortening a booking from 60 to 45 turns a tail at 60 into a tail at 45 rather than
deleting it, and lengthening to 90 puts it at 90 rather than leaving a hole at 60 that the
practitioner is actually working. `processingBlocksForDurationChange` gained
`currentDurationMinutes` and `templateDurationMinutes` for the same reason.

**What the app does.** `lib/booking/processing-time-fit.ts` `fitProcessingBlocksToDuration(blocks,
durationMinutes)` clamps every block to the new end (`room = limit - start`) and drops what does
not fit. `effectiveProcessingTemplate` returns the parent's blocks unfitted for a variant of
another length. Callers:
- `components/bookings/ModifyBookingSheet.tsx` (line 747) fits from the booking's OWN snapshot
  or the chosen service's template to `effectiveDuration`, with no "from" length, so a
  shortened colour with a tail loses the tail, and a lengthened one keeps it in the middle.
  Then the PATCH sends that pattern, so the server stores the wrong thing.
- `lib/calendar/processing-gaps.ts` `bookingProcessingBlocks` returns a null-snapshot booking's
  template at the CATALOGUE length, not re-fitted to the booking's own length (web's
  `bookingTemplateProcessingBlocks` re-fits from `bookingTemplateDurationMinutes`), and returns a
  variant-less parent pattern unfitted to the variant's length.
- `describeProcessingChange` has no wording for a shifted block.

**Port.**
- Replace `fitProcessingBlocksToDuration` with the two-ended version (result gains `shifted`);
  add `processingActiveEndMinutes`, `processingTailMinutes`, `serviceSpanMinutes`,
  `placeNewProcessingBlock`, `resizeProcessingBlock`, `PROCESSING_TAIL_MAX_MINUTES`, and
  `PROCESSING_BLOCK_DEFAULT_MINUTES` (10). Port the web's new test cases from
  `src/lib/appointments/processing-time.test.ts` (the `fit(colour, 60, 45)` family, the
  trailing-run cases, `placeNewProcessingBlock`, `resizeProcessingBlock`).
- `effectiveProcessingTemplate` takes the parent's and the variant's durations and re-fits an
  inherited parent pattern to the variant's length (web `applyVariantToService`).
- `ModifyBookingSheet`: the "from" length is the booking's core duration as opened when the
  snapshot is the source, and the chosen service's (or option's) catalogue length when the
  service changed (web `sourceProcessingDuration`). `describeProcessingChange` gains the shifted
  case ("A wait after the service moves with the new end").
- `bookingProcessingBlocks` re-fits a null-snapshot template from the catalogue length
  (`ManagedService.duration_minutes` / the variant's; `LinkedService.durationMinutes` for a
  partner column) to the booking's own span. `ProcessingPatternSource` gains the durations.

## 6. R28-4: the calendar

**What the web did (#184, #185).** In drawing order:

1. **No clamping.** `bookingProcessingWallGaps` no longer clips a block to the core duration; a
   tail is a free range another booking may share the lane in.
2. **The card stops where the practitioner stops.** `bookingFreeRegions` splits a booking into
   `middle` bands (before `activeEnd`) and the trailing free stretch (`core - activeEnd`); the
   card's painted height is `blockH - trailingFreePx`, the shell keeps the full length for drag
   and resize, and `ProcessingFreeTail` sits in the foot: nothing painted, a tap opens the
   empty-slot menu for that minute, never the booking.
3. **Middle gaps are holes.** `BookingBarPieces` paints one rounded lozenge per busy stretch
   (`paintedPiecesMinutes(total, holes)`), each with the full card finish and its own glass
   edge; the box itself paints nothing. `ProcessingFreeBands` over each middle gap: a faint
   tint (`slate-900/[0.06]`), the grid showing through, clickable to book someone else in. The
   host's text and tray keep off the free bands exactly as they keep off nested bars
   (`hostRegionsPx(..., freeBands)`).
4. **Nested bars take the full lane, and chain.** `NESTED_BOOKING_INSET_PX` is historical;
   `clusterLayoutHorizontalStyle` gives a nested bar its host's whole lane, above the host,
   z-index `min(base + 9, base + 4 + 2 * depth + lane)` (capped under the dashboard chrome).
   `assignNesting` lets a host itself be nested (`hostChain`, `nestDepth`, `laneOwnerOf`), so a
   trim booked into the processing time of a cut that was booked into a colour's reads as one
   line of bookings; `nestedRanges` propagate up every host in the chain; lane reach follows
   the chain. The left shadow on nested bars is gone.
5. **Buffers are drawn.** `BookingBufferBand`: a hatched, dashed-topped grey band labelled
   "Buffer" directly under the bar's lane, from `wall0 + core + tail` for the service's
   `buffer_minutes` (from the service map, not the grid feed), skipped for Cancelled/No-Show,
   drawn after the bars, taking no clicks. Linked columns draw it too.
6. **Visits.** A `visitTimeline` places each service at `start + dur + gapAfter` where the
   observed gap at rest is the wait (tail) then the buffer; the bar is masked transparent for
   the gap and for each segment's trailing free stretch (`visitHoles`), the wait part of a gap
   catches clicks (`ProcessingFreeHole`, `clickEnd = segEnd + min(gapAfter, tail)`), and a
   service that starts a new lozenge repeats the guest's name (`segmentStartsNewPiece`).
   `visitRowFor` hands the resolver `processing_tail_minutes` alongside `buffer_minutes`.
7. **Drag footprint.** `bookingMoveFootprintMinutes` sizes the drop outline and the conflict
   checks from every moved row's `core + tail + buffer`.
8. **Grid.** Hour line `slate-500` (was 400), half hour `slate-400` (was 300), quarter
   `slate-200` (was 100); alternate 15-minute band `slate-100/80` (was `slate-50/55`).

**What the app does.** `lib/calendar/processing-gaps.ts` `processingGapRanges` clamps to the
booking's end. `CalendarDayGrid` / `AllCalendarsDayGrid` pass every gap as a `processingBands`
entry, which `AppointmentBlock` paints as a lighter band (`#FFFFFF` at 0.42) under the text,
including a band that reaches the end, so the free foot is drawn as part of the appointment and
its tap opens the booking. `booking-cluster-layout.ts` is the pre-#184 port: one level of
nesting, `NESTED_BOOKING_INSET_PX = 5` applied as `paddingLeft` in `DraggableAppointmentBlock`
`nestedRoot` and `AllCalendarsDayGrid` `nestedWrap`, with the left shadow. No buffer is drawn
anywhere (the feed has none; the app has `buffer_minutes` on `ManagedService` and
`LinkedService.bufferMinutes`). A visit is one bar from the first start to the maximum end
(`cluster-bookings.ts`), no per-segment holes, no gap for a wait. Grid lines are `colors.border`
hairlines and the alternate-HOUR band is `colors.text` at 0.025 (the app bands by hour, the web
by 15-minute slot; that difference predates this delta and is deliberate).

**Port, in this order (each step is shippable on its own).**
1. `processingGapRanges`: stop clamping to `endMin` (keep the `>= startMin` floor). Re-run the
   nesting and drag tests: `startsInGapAndStaysFree` already accepts an item running past the
   host's end when the gap does, and `occupiedRangesMinusGaps` only subtracts inside the span,
   so both should hold.
2. The free foot: compute `activeEnd` per bar (`processingActiveEndMinutes` on the resolved
   blocks against the core span) and paint the card to `activeEnd` only, with an unpainted,
   separately tappable foot that opens the slot action for that minute (the app's equivalent of
   the empty-slot menu is the long-press / tap-to-book on the grid). The drag shell keeps the
   full height.
3. Middle gaps as holes: replace the white-at-0.42 band with a see-through cut (the grid's own
   surface, `colors.background`, at full opacity, with the alternate band showing) and split the
   card's painted surface into lozenges either side (`paintedPiecesMinutes`). Keep the text off
   the holes through `contentInset` as today.
4. `booking-cluster-layout.ts`: port `hostChain`, `nestDepth`, `laneOwnerOf`, the propagated
   `nestedRanges`, and the layout's `nestDepth`; drop the inset and the left shadow in
   `DraggableAppointmentBlock` and `AllCalendarsDayGrid` (keep `NESTED_BOOKING_INSET_PX` exported
   as the web did, marked historical); raise nested z-index by depth. Extend
   `booking-cluster-layout.test.ts` with the web's chain cases.
5. Buffer band: from the pattern lookup (which must start carrying `buffer_minutes`; the linked
   feed already does), a hatched band under the bar from `core + tail`, no text under ~14px, no
   press handling, hidden for Cancelled/No-Show. Also in partner columns.
6. Visits: give `AppointmentBlock` per-segment geometry (start offset, duration, trailing free,
   gap after) so a wait shows as a hole and the guest name repeats on the lozenge after it. The
   cluster's `end` already uses the maximum end, which covers the gap.
7. Grid: the app has one border colour token; darkening the hour and half-hour lines one step
   and the alternate band to ~0.045 matches the intent ("a grid staff can see") without a new
   token. Confirm on the AA contrast check from R14 before shipping.

The drag footprint (7 above) is optional: the app's guard never modelled buffers and the server
refuses a landing on one, so the only change is that the outline is honest about the buffer; do
it with step 5 if the band makes the short outline look wrong.

## 7. R28-5: hide the Ask ResNeo row when the assistant is off

**What the web did (#183, `Docs/R27_WEB_RESPONSE.md`).** `GET /api/venue` gained
`assistant_enabled: boolean`, and `GET /api/venue/assistant` answers `{ enabled }` (200 with
`false`, not 404; `Cache-Control: no-store`). Both run `assistantEnabledFor(staff.venue_id)`,
the check the POST runs. `ASSISTANT_ENABLED=true` is now set on Vercel for staging and
production.

**What the app does.** `components/more/AskResneoRow.tsx` is rendered unconditionally in
`app/(app)/(tabs)/settings.tsx`; `VenueBootstrap` (`types/venue.ts`) has no such field. R27-8
was recorded as open pending exactly this.

**Port.** `assistant_enabled?: boolean` on `VenueBootstrap`; the More tab renders the row when
the flag is `true` OR absent (an older deploy keeps today's behaviour, and the screen's own
"not available" copy still covers a 404). The assistant screen needs nothing: it already shows
the unavailable message on 404. No need for the second endpoint.

## 8. R28-6: the add-on library's linked-services picker

**What the web did (#184).** `AddonGroupEditor` in the library gained a "Linked services"
picker (search, select all, clear, a checkbox per service); `PATCH /api/venue/addon-groups/[id]`
takes an optional `service_links: { service_item_ids?, appointment_service_ids? }` and
`replaceAddonGroupServiceLinks` makes the group's links match the set (removing others,
appending new ones after the service's existing groups). The service form omits
`service_links` and keeps managing links from its side.

**What the app does.** `components/manage/AddonGroupEditorSheet.tsx` edits the group's fields
only; `useAddonGroups` PATCHes `{ group }`. The library tab shows read-only "Used by" chips
(`serviceLinks` from the groups query) and the only way to link is `AddonLinksEditor` inside
each service's form. Functionally complete, one direction only.

**Port (medium).** A "Linked services" section in the sheet when opened from the library
context (not from a service form, which auto-links its own service): the managed services list
with a search field and checkboxes, seeded from `service_links`, sent as `service_links` on
PATCH (unified venues send `service_item_ids`, legacy `appointment_service_ids`; the app knows
which schema from the services query). Invalidate the services query on save so the "Used by"
chips and each service's linked list refresh. Reasonable to defer: nothing is broken.

## 9. R28-7: price before duration on the service card

Web's `AppointmentServicesView` facts row is now price (brand pill), duration with a small
clock glyph, then buffer and payment terms. The app's card caption in `app/(app)/manage/services.tsx`
reads `"{duration} min · {price} · N options · N add-on groups"`. Swap the first two and put a
clock glyph (the app's `SymbolView`, object form) before the duration. Tiny.

## 10. R28-8: the grid feed contract

`GET /api/venue/calendar-grid` rows are unchanged in shape, but a row's `processing_time_blocks`
snapshot may now hold a block whose `start_minute + duration_minutes` exceeds the row's own
span, and the public catalogue's `processing_time_blocks` likewise. Nothing in the app parses
these defensively against the duration (`parseProcessingTimeBlocks` only checks the numbers),
so nothing throws; the clamping in R28-4 step 1 is the only reader that quietly hides them.
`Docs/MOBILE_API.md`'s new section is the record.

## 11. Suggested order

1. R28-1 and R28-2 together, with R28-3's module underneath them (one shared change; the wizard
   and the form both need the tail helpers). These are the two live breakages and ship in one OTA.
2. R28-4 steps 1 to 4 (no clamping, the free foot, holes, nesting chains), then 5 to 7.
3. R28-5 and R28-7 (an hour between them).
4. R28-6 when the library gets attention.

No web handover is needed for this delta: everything the app needs is served, and web's own
`MOBILE_API.md` note anticipated the app's port.

## 12. What was checked and how

- The clone was reset to `origin/main` at `19d31463` (`git fetch --prune`, `git reset --hard`,
  `git clean -fd`); it was clean before the reset.
- `git diff --stat 2c8c2bd7 19d31463` (71 files) and the three squash messages; then the full
  diffs of `processing-time.ts`, `booking-cluster-layout.ts`, `booking-move-footprint.ts`,
  `PractitionerCalendarView.tsx`, `appointment-engine.ts`, `appointment-chain*.ts`,
  `service-chain.ts`, `visit-services-plan.ts`, `appointment-visit.ts`, `service-variant.ts`,
  `merge-service-with-overrides.ts`, the seven API routes, `ProcessingTimeTimelineEditor.tsx`,
  `AppointmentBookingFlow.tsx`, `StaffAppointmentModifyForm.tsx`, `AddonGroupEditor` /
  `addon-groups.ts`, `AppointmentServicesView.tsx`, and the help articles.
- App side: `lib/booking/processing-time-fit.ts`, `lib/calendar/processing-gaps.ts`,
  `lib/calendar/booking-cluster-layout.ts`, `lib/calendar/cluster-bookings.ts`,
  `components/calendar/{CalendarDayGrid,AllCalendarsDayGrid,AppointmentBlock,DraggableAppointmentBlock,WeekGrid}.tsx`,
  `components/services/ProcessingTimeBlocksEditor.tsx`, `components/manage/VariantsEditor.tsx`,
  `app/(app)/manage/services.tsx`, `components/bookings/ModifyBookingSheet.tsx`,
  `lib/booking/{multi-service-chain,service-chain}.ts`, `components/booking-wizard/{ServiceBookingFlow,ServicePickerStep,PractitionerStep}.tsx`,
  `types/{appointment-catalog,calendar-grid,linked-venues,services-manage,venue}.ts`,
  `lib/queries/{useChainAvailability,useAddonGroups,useVenue}.ts`, `components/more/AskResneoRow.tsx`.

## 13. Built the same day: R28-1, R28-2, R28-3

One change, shared module first, as section 11 suggested. Type check, lint and the full suite
(255 suites, 2,605 tests) pass; not yet in an OTA.

**R28-3, the module** (`lib/booking/processing-time-fit.ts`): the web's two-ended
`fitProcessingBlocksToDuration(blocks, { fromDurationMinutes, toDurationMinutes })` with the
`shifted[]` result; `processingActiveEndMinutes`, `processingTailMinutes`, `serviceSpanMinutes`,
`placeNewProcessingBlock`, `resizeProcessingBlock`, `PROCESSING_TAIL_MAX_MINUTES` (480) and
`PROCESSING_BLOCK_DEFAULT_MINUTES` (10). `effectiveProcessingTemplate` takes the parent's and
option's lengths and re-fits an inherited parent pattern to the option's (web
`applyVariantToService`). `describeProcessingChange` says "The wait after the service moves with
the new end." The web's new test cases are ported (41 in the suite).

- `lib/calendar/processing-gaps.ts`: `ProcessingPatternSource` carries `duration_minutes` for
  the service and each option (both lookups fill it; the linked feed has no per-option length, so
  a partner option inheriting the parent's pattern reads it at the parent's length);
  `bookingProcessingBlocks(booking, lookup, bookingDurationMinutes)` re-fits a null-snapshot
  template from the catalogue length to the booking's own span. `clusterProcessingGaps` and both
  grids' drag guards pass the span. A stored snapshot is never re-fitted.
- `components/bookings/ModifyBookingSheet.tsx`: latches `originalProcessingDuration` alongside
  the original blocks (once add-ons are seeded, so it is the span as opened), fits a
  null-snapshot template from the catalogue length to that span on open, and re-fits the source
  from the right "from" length: the opened span for the booking's own snapshot, the chosen
  service's or option's catalogue length after a service change. The five processing tests
  moved to a middle-gap fixture and a new case pins an end-reaching wait moving with the end.

**R28-2, the service form** (`components/services/ProcessingTimeBlocksEditor.tsx`):
`validateProcessingBlocks` accepts `start <= duration` and `start + length <= duration + 480`
with the web's two messages; "Add processing period" places the first block AFTER the service
through `placeNewProcessingBlock`; a Length edit goes through `resizeProcessingBlock` (a block
ending at the service's end stays anchored there; one starting at the end grows later); each
row says where it sits ("After the service, 30 min" / "Runs 10 min past the end of the service"
/ "20 to 45 min into the service"); the header copy and the summary line follow the web
("Service: 60 min, then 30 min after it"). `VariantsEditor` and the service screen use the same
validator unchanged, so a service or option given a tail on the web saves from the app again.
New `ProcessingTimeBlocksEditor.test.ts` (10 cases).

**R28-1, the wizard's chain** (`lib/booking/multi-service-chain.ts`): `MultiServiceSegment`
carries `processingTailMinutes` and `processingTimeBlocks`; `chainSegmentGapMinutes = tail +
buffer` feeds `recomputeMultiServiceChain` and `chainTotalMinutes`; `service-chain.ts`
`chainSpanMinutes` (the month span) takes the tail too. `segmentProcessing({ service, variant,
segmentDurationMinutes })` resolves the pattern the web's way (option's own, else the parent's
re-fitted to the option's length, then re-fitted to the booked length) and returns the tail.
`AppointmentServiceOption` gains `processing_time_blocks`, filled by `ServicePickerStep`,
`PractitionerStep` and the rebook path in `ServiceBookingFlow`; the flow's first segment, its
extras and `segmentLength` (the month span) all call `segmentProcessing`. Chain tests gained a
tailed visit (10:00 colour 60 + wait 30 + buffer 10, cut at 11:40), the totals case and four
`segmentProcessing` cases. Group bookings are unchained and untouched.

## 14. Built later the same day: R28-4, R28-5, R28-6, R28-7, R28-9

Type check, lint and the full suite (256 suites, 2,616 tests) pass. All JavaScript and styling:
no native module, no config, so the whole R28 batch is one OTA on the current runtime.

**R28-4, the calendar.** The port follows section 6's order, adapted to the app's one-card bar
rather than the web's per-lozenge DOM:

1. `lib/calendar/processing-gaps.ts` `processingGapRanges` no longer clamps a block to the
   booking's end (a tail is a free range another booking may share the lane in); the drag guard
   still clips through `occupiedRangesMinusGaps`, so nothing changes there.
2. New `bookingFreeRegions` (active end, middle bands, tail) and `clusterPaintRegions` (per
   visit: `holes` the bar leaves unpainted, `freeTaps` the bookable parts of them, and
   `bufferBands`). `ProcessingPatternSource` carries `buffer_minutes` for the service and each
   option, filled by both lookups (`ManagedService.buffer_minutes`, `LinkedService.bufferMinutes`),
   and `bookingBufferMinutes` reads it.
3. `AppointmentBlock` paints each hole in the grid's own surface, full width, with a hairline
   at either end, so a middle gap, the free foot and the wait between a visit's services read as
   the diary showing between lozenges; the free parts carry a `Pressable` that hands the
   wall-clock minute under the finger (snapped down to five) to `onFreePress`, and both grids
   route that to their empty-slot handler, so booking someone else into a colour's developing
   time is the same gesture as tapping empty grid and never opens the host. The host's text and
   tray keep off its own holes as they keep off nested bars (`hostRegionsAroundNested` takes
   both). The buffer hangs under the card as a hatched-look "Buffer" band (dashed top, muted
   fill, label from 14px), untouchable, skipped for Cancelled and No-Show, one per bar (a
   visit's last segment's; an inner one sits inside the wait hole).
4. `lib/calendar/booking-cluster-layout.ts` is the #184 port: `hostChain`, `nestDepth`,
   `laneOwnerOf`, nested ranges propagated to every host in the chain; a host may itself be
   nested. Nested bars take the full lane (the 5px inset and the left shadow are gone from
   `DraggableAppointmentBlock` and the read-only wrap; `NESTED_BOOKING_INSET_PX` stays exported,
   marked historical) and stack by depth (`10 + lane + 10 * depth`, capped under the settled and
   dragging tiers).
5. The linked-column path draws holes and the buffer band too; its free time is not tappable,
   since a read-only column takes no bookings.

Left for later, on purpose: the drag footprint covering the buffer (the server refuses a
landing on one).

**Follow-up the same evening (owner's ask): rounded pieces and per-service labels.** The
first cut painted a hole over a single card, so the boundary at a processing period was a
straight cut. The bar now paints the web's way (`BookingBarPieces`): `clusterPaintRegions`
returns `pieces` (`paintedPieceRanges`, the span less the holes) and `AppointmentBlock` draws
one rounded lozenge per piece, each with the full finish (fill, status border, the pale ring,
the glass edge, the gloss top and base), while the bar's own box paints nothing, so every
lozenge end looks like a bar end and the diary shows between them. And every later service of
a visit is labelled on its own block of service time (`segments`: the guest's name, the
service and the time, three rows from 42px, two from 28px, one from 14px, nothing below), with
the first service's main text stopped at its own busy stretch so the labels never sit under it.
`AppointmentBlock.edges.test.tsx` moved its ring and border assertions to the piece
(`bar-piece`, `bar-piece-card`); `CalendarDayGrid.multi-service.test.tsx` gained the labels
cases.

**R28-9.** Hour lines `colors.borderStrong`, half-hour lines `colors.border` at full opacity
(was 0.55), the alternate band 0.045 (was 0.025), in the single grid, the multi-column grid and
the week grid. No new token.

**R28-5.** `VenueBootstrap.assistant_enabled`; the More tab renders the Ask ResNeo row unless
the flag is exactly `false`, so an older deploy keeps the row. Closes R27-8.

**R28-6.** `useUpdateAddonGroup` takes `service_links`; `AddonGroupEditorSheet` gains a
"Linked services" section when opened from the library on an existing group (search, Select
all, Clear, a checkbox row per service, seeded from the groups query's `service_links`), and
the save sends the ticked ids in BOTH `service_item_ids` and `appointment_service_ids` because
the server reads only the array for its schema. The service form's path passes nothing and its
links are untouched. Creating a group from the library has no picker (the create route takes
no links); link it from a service form or edit it once made.

**R28-7.** The service card reads price, then a clock glyph (`SymbolView`, object form) and the
duration, then the option and add-on counts.

**Tests.** `booking-cluster-layout.test.ts` gained the chain and no-loop cases and `nestDepth`
on every nested expectation; `processing-gaps.test.ts` pins the no-clamp rule; new
`processing-gaps.paint.test.ts` covers buffers, free regions and the paint regions (lone tail,
middle gap plus foot, a visit's wait vs buffer, cancelled segments);
`CalendarDayGrid.overlap.test.tsx` moved to the `processing-hole` test id and gained a free-foot
tap and buffer-band case.
