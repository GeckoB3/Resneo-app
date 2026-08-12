# App Gap Report R14 — Web delta audit (resneo `671f5051..4595623d`)

**Date:** 2026-08-12
**Scope:** 12 commits on **`staging`** (66 files, ~4,835 insertions). Previous audited point: `671f5051` (see [R13](APP_GAP_REPORT_R13_WEB_DELTA.md)).
**Caveat:** this range is **unreleased**. `origin/main` is still at `671f5051`; everything below is staging-only. The reference clone was moved to `staging` for this audit at the user's request — see [Reference repo](../_reference/Resneo) and put it back on `main` afterwards.
**Verdict:** four app items, plus one correction to R13. Two are the app inheriting bugs web found in shared logic (a 15-minute floor that no longer exists, and a resize that asks to notify the guest), one is a workflow the app can't complete at all (processing time), and one is an accessibility fix that is a pure token change.

**Status: all four BUILT 2026-08-12**, after R13 landed as `f77c07e`. Full suite green: 160 files / 1,634 tests, `tsc --noEmit` clean, `eslint .` at its exact pre-existing baseline (226 problems / 15 errors, none in touched files). An adversarial review pass followed the build and is recorded in §5.

> **Do not ship the app before the web staging release.** R14-1 lowers the app's duration floor to 5, but production web (`671f5051`) still hard-codes `durationMinutes < 15` in `resolveAppointmentModifyEndCoreHHmm`, which both the dry run and the save go through. Against production, picking 5 or 10 minutes leaves Save disabled showing *"duration_minutes must be an integer between 15 and 840"*. Readable and non-destructive, but wrong. The other three items are safe against production today.

---

## 0. Correction to R13

R13-4 recorded the app's `MIN_CORE_DURATION_MINUTES = 5` as a **deliberate divergence** from web's 15. That is no longer a divergence: `7a9ca665` sets web's constant to `MIN_APPOINTMENT_CORE_DURATION_MINUTES` (= 5), for exactly the reason the app used — the engine and the service schema always allowed 5, and the 15 was a clamp that "silently rounded a short appointment back up: the modify form opened a 5 minute booking showing 15."

The app was early, not divergent. The other R13-4 divergence (returning null rather than 1440 when the end equals the start) still stands and is still right.

Web also converged on the app's other R13 position: the backfill migration + `booking-end-time.ts` make `booking_end_time` authoritative, and `bookingDisplayEndHm` gained the same `Number.isNaN` guard the app's `resolveBookingCoreDurationMinutes` already had.

---

## 1. What the web shipped

| Theme | What it is | App relevance |
| --- | --- | --- |
| **One minimum duration** | Eight places carried their own 15 against an engine floor of 5. Four availability routes rejected a short duration outright; the modify form's input, catalogue-adoption guard and presets all started at 15; the read helper rounded a saved 5-minute booking up to 15; the override parser silently dropped a sub-15 value. All now `MIN_APPOINTMENT_CORE_DURATION_MINUTES`, presets gain 5 and 10. | **R14-1** |
| **Processing time on modify** | New `fitProcessingBlocksToDuration` / `processingBlocksForDurationChange`. The modify form now fits the booking's blocks to the chosen duration, sends them on both the dry run and the PATCH, and shows a "Processing time" panel saying what saving will do. | **R14-2** |
| **Calendar bar contrast** | `Pending` / `Deposit Pending` calendar fills darkened `#EA580C` → `#9A3412`, `Seated` `#059669` → `#065F46`. White text measured 2.53:1 to 3.03:1 against the old fills once the bar's gloss composites, against a 4.5:1 AA floor. | **R14-3** |
| **Notify follow-up** | Two faults: a StrictMode teardown left every button dead and sent the guest's message on arrival; and **drag-to-resize armed the move-notify prompt**, offering to tell a guest their appointment had moved when only its length changed. | **R14-4** (the resize half) |
| **Calendar bar geometry** | Compact bars lose their own action renderer; one stacked corner tray everywhere, geometry extracted to `booking-corner-actions.ts`; bars drawn to scale below a slot; two-tone button ring for WCAG 1.4.11; multi-service segments stop repainting over the card gloss. | Mostly **web catching up to the app** — see §3 |
| **Scheduling correctness** (`a3a09d6a`) | `booking_end_time` written everywhere from one helper + a backfill; the unified fetcher's narrowed service map (neighbouring bookings resolved with no buffer and a 30-minute default); variant rows no longer destroyed and re-created on save (which orphaned `service_variant_id` on existing bookings); per-calendar duration override applied twice; plus a long tail. | Server-side — **free**, see §3 |
| **Availability correctness** (`1360bfc8`) | Minimum notice enforced on every date (not just today); `parallel_clients` measures concurrency rather than counting touched rows; closures beat amended hours; the month picker's own row mapper never read `booking_end_time`; working hours must end after they start; linked creates run the owner venue's interval validation. | Server-side — **free**, but see the availability note in §3 |
| **Permission gate** | `practitioner-service-overrides` PATCH enforced `staff_may_customize_*` only on the dead legacy branch; the unified branch (the only live one) allow-listed column names and never loaded the flags. Now 403s. | Server-side security fix — **free** |
| Date-nav updater, `/pay` flows, help, e2e | Toolbar arrows take a state updater so a click burst doesn't compute from a stale date. | N/A — the app **already** uses `setAnchor((current) => …)` at [index.tsx:851](app/(app)/(tabs)/index.tsx:851) |

---

## 2. Gaps

### R14-1 · The app still carries the 15-minute floor web just deleted — **Medium**

[ModifyBookingSheet.tsx:64](components/bookings/ModifyBookingSheet.tsx:64) sets `MIN_DURATION_MINUTES = 15`, and its comment justifies the value by pointing at web:

> The API floor is 5 (`MIN_APPOINTMENT_CORE_DURATION_MINUTES`), but the web modify form's input is `min={15} step={5}`, so the UI floor stays 15 here to match it — deliberately, not by omission.

That `min={15}` no longer exists. The rationale is now inverted: web moved to 5 and added 5 and 10 to its quick presets.

Three consequences in the app, in ascending order of severity:

1. The duration Stepper cannot go below 15, so a 5- or 10-minute appointment cannot be set from the app at all.
2. `durationPresets` filters `>= MIN_DURATION_MINUTES`, so the short presets web just added are absent.
3. **A dead end I introduced yesterday.** R13-4's catalogue-adoption effect reads:

```ts
if (!Number.isFinite(catalogueDuration) || catalogueDuration < MIN_DURATION_MINUTES) return;
```

For a service shorter than 15 minutes whose booking carries no end time, the adoption is skipped, `duration` stays `null` forever, the Stepper renders `—` and Save is permanently disabled. Before R13-4 that booking defaulted to 30 (wrong, but usable). So the combination is a **regression for sub-15 services** — narrow, but real, and it is mine. Web hit the identical line and fixed it the same way (`adopted < MIN_APPOINTMENT_CORE_DURATION_MINUTES`).

The app is also internally inconsistent: [RescheduleSheet.tsx:42](components/calendar/RescheduleSheet.tsx:42) already uses `MIN_DURATION_MINUTES = 5`.

**Fix:** one constant at 5, presets gain 5 and 10, and the R13-4 guard clamps against it. Small, and it closes the regression.

### R14-2 · Shortening a booking with processing time is refused, with no way out — **Medium**

The staff PATCH resolves processing blocks from the booking's stored snapshot when the body omits `processing_time_blocks`, then validates them against the new duration. Shorten the booking below the last block's end and the save fails with *"Processing blocks must lie within the service duration (before buffer)"*.

Web's answer: fit the blocks client-side to the chosen duration and send them on **both** the dry run and the PATCH, so the validator judges what will actually be persisted. Plus a "Processing time" panel that says in words what saving will do — shorten a gap, drop one, or swap in the new service's pattern.

The app sends nothing. [types/booking-detail.ts](types/booking-detail.ts) has no `processing_time_blocks` field and `ModifyBookingSheet` never mentions it — so staff hit a validation error they cannot resolve from the app, on any service configured with a processing gap.

Two things make this cheaper than it looks:
- The column is already on the wire. The detail GET spreads the whole booking row, exactly like `estimated_end_time` in R13-4.
- The app **already has** the `ProcessingTimeBlock` type and a processing-time editor on the services screen ([types/services-manage.ts:104](types/services-manage.ts:104), `VariantsEditor`). What is missing is the booking-side half.

**Fix:** port `fitProcessingBlocksToDuration` + `processingBlocksForDurationChange` (pure, ~60 lines, no dependencies beyond the existing type), add the field to `BookingDetail`, and thread the fitted blocks through the validate call, the save and the undo. The explanatory panel is optional; the send is not.

### R14-3 · Calendar bar text fails AA contrast — **Medium**

[lib/booking/booking-status-visual.ts](lib/booking/booking-status-visual.ts) carries the exact hexes web just replaced:

| Status | App `calendarBlock.bg` | Web now | Measured (white text) |
| --- | --- | --- | --- |
| `Pending` ([:44](lib/booking/booking-status-visual.ts:44)) | `#EA580C` | `#9A3412` | 2.96:1 name, 2.53:1 meta |
| `Deposit Pending` ([:110](lib/booking/booking-status-visual.ts:110)) | `#EA580C` | `#9A3412` | as above |
| `Seated` ([:69](lib/booking/booking-status-visual.ts:69)) | `#059669` | `#065F46` | 3.03:1 name, 2.60:1 meta |

Both are white-on-fill in the app too, so the failure carries across regardless of whether the app paints web's gloss. Borders move with them (`#C2410C` → `#7C2D12`, `#047857` → `#064E3B`; the `Seated` *accent* stays `#047857`).

A pure token change — no layout, no logic.

**Worth checking while in there** (not something web fixed for us): the app's tray buttons use `borderColor: rgba(255,255,255,0.45–0.55)` over the bar fill ([AppointmentBlock.tsx:413](components/calendar/AppointmentBlock.tsx:413)). That is high contrast on the dark navy bars and low on the light amber `Arrived` fill — the same WCAG 1.4.11 class of problem web solved with a two-tone ring. Measure before changing anything.

### R14-4 · A resize offers to tell the guest their appointment moved — **Medium**

Web's commit fixed two things in the notify follow-up. The first (a StrictMode teardown leaving every button dead) is **dev-only and web-only** — the app's notify step is a `mode` on the existing Sheet with no unmount fallback, so it cannot happen. The second applies directly:

> A resize changes the duration, not when the guest is due, which is how the modify form has always treated it. The resize now sends `skip_` rather than `defer_` and arms nothing.

In the app, [commitDrag](app/(app)/(tabs)/index.tsx:966) fires `setMoveNotice(...)` on **every** successful drag. It already knows which kind it was — `durationChanged` is threaded all the way through — but the flag is only used to pick the *error* copy ([:1003](app/(app)/(tabs)/index.tsx:1003)). So resizing a booking from 30 to 45 minutes raises a sheet headed with the move wording and asking *"Let {guest} know about the change?"*, and tapping Notify POSTs `guest-modification-notify`, telling a guest their appointment changed when its start never moved.

**Fix:** when `durationChanged` and the start did not move, skip the prompt and send `skip_booking_modification_guest_notification` instead of deferring. Undo stays available from the existing toolbar path. The flag is already in hand, so this is a branch, not a refactor.

**Related, worth a decision rather than a fix:** the app's notify prompt is a dismissible Sheet, so dragging it down or tapping the backdrop closes it and sends nothing. Web's stated rule is the opposite — *"the deferral exists to offer skip/undo, never to silently drop the update"* — and it sends on dismissal. The app's behaviour means an accidental dismissal leaves a guest un-told about a genuine time change. Divergent by accident rather than design, and the safer default is web's.

---

## 3. Checked and clear

- **The calendar bar rework is web catching up to the app.** `61bb9542` gives every web bar one stacked corner tray and draws bars to scale below a slot. The app already draws bar height as exactly its duration ([[calendar-bar-height-is-duration]]) and already has a *different, deliberate* short-bar layout — `pickBlockLayout`'s `row` mode, where the name and buttons are flex siblings and the name keeps a reserve ([[calendar-compact-mode]]). Porting web's corner tray onto short bars would re-introduce the overlap that design exists to prevent. **Do not converge here**; take only the contrast fix (R14-3).
- **Date-nav stale closure.** Web's toolbar arrows now take a state updater. The app's already do ([index.tsx:851](app/(app)/(tabs)/index.tsx:851)).
- **`bookingDisplayEndHm` throwing on an unparseable date.** The app's `resolveBookingCoreDurationMinutes` shipped with that guard yesterday.
- **`staff_may_customize_*` enforcement.** A server-side authorisation hole on the unified branch. The app's client already respects the flags (`lib/services/service-override.ts`, `StaffServiceOverrideSheet`); the fix closes the hole underneath it. Nothing to build.
- **Visit price breakdown naming.** `payment-summary.ts` now falls back to the service-name snapshot when a line has no variant, so a visit of plain services stops listing every line as the literal word "Service". Computed server-side; the app renders whatever it is sent. Free.
- **Add to calendar / day sheet.** Web fixed a 60-minute hardcode in "Add to calendar" and a literal `"2026-"` end time in the day sheet. The app has neither surface.
- **Required add-on groups on multi-service and group creates.** Server-side enforcement catching up to what the app's `AddonsStep` and `ModifyBookingSheet` already enforce client-side.
- **Guest-facing flows, `/pay`, combined booking pages, collectives slot validation, class session inserts, linked-venue insert migration.** No app surface, or server-side only.

**One behavioural heads-up with nothing to build:** `1360bfc8` changes what the availability endpoints return. Minimum notice is now enforced on every date rather than only today, which **reduces** availability for venues whose notice window is above 24 hours (the rule they configured, previously inert), and `parallel_clients` now measures concurrency, which **increases** availability wherever the cap is above 1. The app's pickers will simply show different slots. Worth knowing before someone reports it as an app defect — the same posture as R13-5's sweep cadence.

---

## 4. Suggested order

| Order | Item | Why |
| --- | --- | --- |
| 1 | **R14-1** (one floor at 5) | Smallest, and it closes a dead end R13-4 introduced for sub-15 services. |
| 2 | **R14-4** (resize does not arm the notify prompt) | A branch on a flag already in hand; stops a guest being told about a change that did not happen. |
| 3 | **R14-3** (contrast tokens) | Pure token change, no logic. |
| 4 | **R14-2** (processing time on modify) | Largest. A whole workflow the app cannot currently complete. |

All four are app-only. No backend work is outstanding from this delta — but note that everything above describes **unreleased staging code**, so shipping the app side before web releases would put the app ahead of production (see the R14-1 warning at the top).

**What was built, per item:**

- **R14-1** — `MIN_DURATION_MINUTES` in both `ModifyBookingSheet` and `RescheduleSheet` now derive from the single `MIN_CORE_DURATION_MINUTES` (5); presets gained 5, 10 and 15. The R13-4 dead end for sub-15 services closes with it.
- **R14-4** — new pure `lib/booking/modification-notify.ts` (`bookingStartMoved`, `guestNotifyPlanForChange`, 8 tests). `commitDrag` derives the rule from the slots themselves rather than the caller's `durationChanged` flag, which caught an edge the flag hid: **a cross-column reassign at the same time**. That is a real move (to another person) but the start has not changed, so it now skips the email, withholds the notify offer, and still reads "Booking moved" rather than "Duration updated". Undo is kept in both cases: it is the app's only undo for a drag, where web has a toolbar one.
- **R14-3** — the three fills darkened, plus a `contrastRatio` test that walks every status and fails below 4.5:1, so a future palette tweak cannot quietly undo it.
- **R14-2** — new pure `lib/booking/processing-time-fit.ts` (20 tests) and 12 new `ModifyBookingSheet` cases. The fitted blocks go to the dry run, the save and the undo.

## 5. Adversarial review

Four defects found in my own work after it was green, all fixed:

1. **Overnight end times clamped instead of wrapping** (R13, shipped in `f77c07e`). `minutesToTime` pins anything past midnight to 23:59, so the derived range on a 23:30 booking running an hour read `23:30 – 23:59`. Before R13 it showed the bare start, so this replaced *missing* information with *wrong* information. Now modulo, matching `endPreview` in the modify sheet.
2. **The catalogue template was forwarded unparsed** (R14-2). Only the booking's own snapshot went through `parseProcessingTimeBlocks`; a malformed catalogue entry would have turned a clean save into a server-side schema rejection staff could not act on. Now parsed on both paths, with a test.
3. **Comments that misstated the mechanism** (R14-4). Several said deferring "leaves a notification armed". Checking the route, `defer_` and `skip_` are handled *identically* — both suppress the immediate send and neither queues anything. The code was right and the reasoning was wrong, which is worse in a comment than in a commit message. Reworded everywhere: the two flags differ in intent, and `prompt` is the load-bearing half.
4. **A `null` snapshot was read as "no gaps"** (R14-2) — the serious one. `bookings.processing_time_blocks` has three states, and `null` means *inherit the service's catalogue pattern*, not *has none*. Parsing it to `[]` and sending that would have **stripped the service's processing time from every such booking on its first modify**. The resolution now distinguishes all three states, the latch waits for the catalogue when the snapshot is null, and three tests pin it (inherit / genuinely-empty / malformed).

**Adjacent finding, not fixed** (outside this delta's scope, flagged rather than silently changed): `lib/booking/booking-action-colors.ts` gives the "Start" button `#059669` with white text, which fails AA for the same reason the `Seated` bar did. Web never touched it because it is the app's own module. Changing it is an app-wide button-colour decision, not a parity fix.

**Left as a decision, not built:** the app's notify prompt is a dismissible Sheet, so dragging it down after a genuine *move* sends nothing, where web deliberately sends on dismissal. Flagged in R14-4 as "worth a decision rather than a fix" and still open.
