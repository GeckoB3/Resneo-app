# Handover — R17-4: `allow_during_breaks` never reached the two visit save routes

**For:** an agent working in the ResNeo **web** repo.
**Repo / branch:** `C:\Resneo`, on **`staging`** @ `6bc9ef4f` (which is where the
SA-H7 fix `51d00fd6` also lives; `main` is 3 behind and does not have either).
**Size:** two schema lines and two argument lines. No new logic, no migration.
**Found by:** the ResNeo mobile app's R17 delta audit, while building the app
half of SA-H5. Full context in the app repo at
`Docs/APP_GAP_REPORT_R17_WEB_DELTA.md` (finding R17-4).

---

## 1. What is wrong

SA-H5 established that `allowOutsideHours` and `allowDuringBreaks` are **two
separate gates** — passing the hours flag has never relaxed the engine's break
check — and threaded the second one through:

- `PATCH /api/venue/bookings/[id]`
- `POST /api/venue/bookings/[id]/validate-appointment-modification` (the dry run)
- `validateAppointmentModificationInterval` itself

It stopped one route short. The **two routes that move and re-service a visit**
still accept only `allow_manual_overlap` and `allow_outside_hours`:

| File | Schema | Passes to the validator |
|---|---|---|
| `src/app/api/venue/visits/[groupBookingId]/schedule/route.ts` | `:54–55` | `:392–393` |
| `src/app/api/venue/visits/[groupBookingId]/services/route.ts` | `:85–86` | `:486–487` |

Both call `validateAppointmentModificationInterval` (`:380` and `:473`), which
**already accepts `allowDuringBreaks`** — the parameter added by SA-H5 in
`src/lib/booking/validate-appointment-modification.ts`. So the plumbing exists
and simply is not connected at these two ends.

This is the same shape as the visit dry-run hole SA-H5 found and fixed: a
staff override the PATCH honours, that the visit path does not, so the two
disagree and the visit is refused before anything is written.

## 2. Why it matters — it is live for mobile staff today

The ResNeo app now sends `allow_during_breaks: true` on every deliberate staff
placement (shipped app-side, R17-3). Neither schema calls `.strict()`, so today
the key is **silently stripped, not rejected** — harmless, and the app becomes
correct the moment you land this. The current split:

| Staff action on mobile | Route | Moving over a break |
|---|---|---|
| single-booking drag / resize / reschedule / undo | `PATCH /api/venue/bookings/[id]` | **works** |
| visit drag on the calendar | `…/visits/{id}/schedule` | **409 "Conflicts with a break"** |
| visit reschedule sheet | `…/visits/{id}/schedule` | **409** |
| visit modify sheet (dry run **and** save) | `…/visits/{id}/services` | **409** |

So a staff member can drag a single appointment over a break but not a
multi-service visit, with no explanation for the difference. Web's own diary has
the same exposure for the same reason.

## 3. The change

Four edits, two per file.

**a. `src/app/api/venue/visits/[groupBookingId]/schedule/route.ts`**

Schema, beside the existing flags at `:54–55`:

```ts
    allow_manual_overlap: z.boolean().optional(),
    allow_outside_hours: z.boolean().optional(),
+   /**
+    * Staff placement over a break. A SEPARATE gate from the one above — the
+    * engine has never let `allowOutsideHours` relax a break — so a visit drag
+    * the diary permits is refused here without it (SA-H5, missed on this route).
+    */
+   allow_during_breaks: z.boolean().optional(),
```

Validator call at `:392–393`:

```ts
          allowManualOverlap: body.allow_manual_overlap === true,
          allowOutsideHours: body.allow_outside_hours === true,
+         allowDuringBreaks: body.allow_during_breaks === true,
```

**b. `src/app/api/venue/visits/[groupBookingId]/services/route.ts`**

The same two, at `:85–86` and `:486–487`.

That is the whole change. `validateAppointmentModificationInterval` forwards it
to the engine already.

## 4. What NOT to do

- **Do not** make breaks non-blocking by default, and do not fold the two flags
  into one. The separation is deliberate: `allowOutsideHours` must keep not
  relaxing breaks, so that a caller which only means "past closing" does not
  silently also mean "over a break".
- **Do not** touch `validate-appointment-modification.ts` — the parameter is
  already there and already threaded to the engine.
- **Do not** relax `practitioner_leave`, classes, events or manual blocks. Only
  the break gate is in scope; full-day leave must keep surviving
  `allowOutsideHours` (SA-M3).

## 5. How to verify

**Static:** `tsc --noEmit`, then the existing suite. There is a guard file
pattern already in use for this class of defect —
`src/lib/booking/public-create-routes-booking-window.test.ts` asserts on route
source text specifically because a behaviour test cannot reach these branches.
A matching guard here would be worth adding, and would have caught this:

```ts
it.each([
  'src/app/api/venue/visits/[groupBookingId]/schedule/route.ts',
  'src/app/api/venue/visits/[groupBookingId]/services/route.ts',
])('%s forwards allow_during_breaks', (route) => {
  const src = readFileSync(route, 'utf8');
  expect(src).toMatch(/allow_during_breaks:\s*z\.boolean\(\)\.optional\(\)/);
  expect(src).toMatch(/allowDuringBreaks:\s*body\.allow_during_breaks === true/);
});
```

**Behavioural, on staging — this is the one that counts.** SA-H5's own lesson
from this batch is that the rule change alone changed nothing a user could do,
because a second layer was still enforcing. So exercise the real path:

1. Give a calendar a break (say 12:00–13:00) on a test day.
2. Take a **multi-service visit** (two services, one guest) on that day.
3. Drag it onto the break in the web diary, and separately from the ResNeo app.
4. Both should land, with the amber outside-hours note rather than a refusal.
5. Repeat for a **single** booking to confirm nothing regressed there.
6. Confirm a drag onto **full-day leave** is still refused.

## 6. Provenance, so you can check my work rather than trust it

- The claim "the validator already accepts it" — `allowDuringBreaks` is in
  `ValidateAppointmentModificationIntervalParams` and is forwarded into
  `intervalOpts` in `src/lib/booking/validate-appointment-modification.ts`,
  added in this same batch.
- The claim "the key is stripped, not rejected" — neither route file calls
  `.strict()` on its body schema; grep both to confirm.
- The claim "the app already sends it" — ResNeo app `main`, files
  `app/(app)/(tabs)/index.tsx`, `components/bookings/ModifyBookingSheet.tsx`,
  `components/calendar/RescheduleSheet.tsx`, `lib/queries/useBookingMutations.ts`,
  `lib/queries/useVisitMutations.ts`.
- Line numbers above are against `6bc9ef4f`. Re-grep rather than trusting them
  if the branch has moved.
