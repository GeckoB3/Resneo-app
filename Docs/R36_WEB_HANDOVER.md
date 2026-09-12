# R36 web handover: three things a device pass turned up on your side (2026-09-12)

From the app repo (`C:\Resneo-app`), for the web repo (`C:\Resneo`, `main` at `79111976` = #194).

None of these came out of a delta audit. They came out of a long manual pass on a real phone
against staging — twelve findings, of which nine were ours and are fixed and shipped. These three
are not ours to fix: two are server-side, and one is a copy promise the web dashboard makes and
also does not keep. Each is small. None is urgent.

Where we could soften a symptom app-side without lying, we have, and said so.

---

## 1. A multi-service visit counts as one appointment in one place and as several in another

**What we saw.** A guest with two services back to back today. The dashboard's Today tile counted
**2**; the appointments list counted **1**. Both are defensible readings; they disagree in the same
product, on the same day, about the same guest.

**Why.** The appointments dashboard collapses a visit before it counts:

```ts
// src/app/dashboard/bookings/AppointmentBookingsDashboard.tsx:876
let rows = collapseMultiServiceVisits(combined);
```

and `stats` counts what survives (`:1066-1072`, `statsBookings.length`).

The dashboard-home payload does not:

```ts
// src/lib/dashboard/dashboard-home-payload.ts:217
const todayBookingCount = todayBookings.length;
```

`today.bookings` is therefore booking ROWS, and one visit contributes one per service.

**Why we have not papered over it.** The app mirrors both sides exactly, so it inherits the
disagreement. To make the app agree with itself we would have to either undo the collapse — which
is deliberate, and web parity — or recompute the tile client-side from `recent_bookings`, which is
a capped list and carries no `group_booking_id` (`dashboard-home-payload.ts:122-131`), so it cannot
be collapsed by a client even in principle.

**The question is yours to answer, not ours:** does a visit count once, or once per service? Either
answer is fine; we will follow whichever you pick. If it is "once", `today.bookings` and
`today_by_booking_model` want the same collapse the list already applies (and `recent_bookings`
would need `group_booking_id` for any client to render it as one row). If it is "once per service",
the appointments list's collapse is the odd one out.

---

## 2. A calendar closure's "Label" never reaches the calendar

**What we saw.** A closure created with the label **Closed** — and listed as "Staff 1 · Closed" —
drew a band on the diary reading "**On leave 09:00 to 22:00**".

**Why.** The editor asks for it:

```tsx
// src/app/dashboard/availability/StaffLeaveCalendarPanel.tsx:866-877
<label …>Label (optional)</label>
<select value={draft.leave_type} …>
  <option value="annual">Closed</option>
  <option value="sick">Unavailable</option>
  <option value="other">Other</option>
</select>
```

and the stripe ignores it:

```ts
// src/lib/calendar/schedule-closure-blocks.ts:409
if (blockType === 'practitioner_leave') return `On leave${range}`;
```

The leave blocks are built with `reason: null` (`:148`) and `leave_type` is not read anywhere on
the calendar, so the field is stored, shown in the list, and discarded by the one screen staff
actually look at. A field called "Label" that does not label anything is worse than no field.

**What we did.** The app now carries the choice onto the stripe: `annual → "Closed"`,
`sick → "Unavailable"`, and `other → "On leave"` (a band reading "Other 09:00 to 22:00" would
explain less than the old default). Verified on the device for both of the first two.

**This is a deliberate divergence from you, and we would rather not keep it.** If you make the same
change we will match your wording exactly; if you would rather the band always read "On leave", say
so and we will revert ours and suggest the editor stop calling that field a label.

---

## 3. `last_visit_date` records the day someone was ticked in, not the day of the visit

**What we saw.** A booking three weeks out (21 Sep), marked Arrived by mistake on 12 Sep. The guest
— who had no other bookings — immediately read "1 previous visit · **Last visit Sat 12 Sep**", and
the contacts row read "1 visit · Last: 12 Sep". There was no visit on 12 Sep, and there will not
be one until the 21st.

**Why.**

```ts
// src/lib/table-management/lifecycle.ts:262-276
if (previousStatus !== 'Seated' && nextStatus === 'Seated') {
  if (previousStatus !== 'Completed') {
    const today = new Date().toISOString().slice(0, 10);
    …
    .update({ visit_count: (guestData?.visit_count ?? 0) + 1, last_visit_date: today, … })
```

Two things sit in that line:

- **The date is the transition's, not the booking's.** `booking_date` is right there on the row
  being patched. For a same-day walk-in the two agree, which is why this has held up; for anything
  seated early or late they do not.
- **It is UTC, not the venue's day.** `new Date().toISOString().slice(0, 10)` is the UTC date, so a
  venue seating a guest after 00:00 local in a positive offset (or before 00:00 UTC in a negative
  one) stamps the wrong day even for a same-day visit. Everywhere else in the payload you resolve a
  venue-local calendar date (`calendarDateInTimeZone`).

There is a related question we are not asking you to answer: an unseat decrements `visit_count` but
leaves `last_visit_date` where it is, so an accidental Arrived cannot be fully undone. That may be
fine — the count is the number that matters — but it is why the app cannot recover the real
previous date once a booking has been seated.

**What we did.** Display only, and only on the booking's own panel: from Arrived onwards the app
takes THIS booking back out of the guest's totals, so the panel no longer cites itself as the
guest's history ("1 previous visit · Last visit today" for a guest with no other bookings). Once
counted it names no date at all, because the date it would name is this booking's own attendance
and the one it overwrote is not sent to us. Nothing in the app writes or corrects the stored value.

---

## 4. FYI, not a defect: a guest booked in by name alone cannot be found, and nothing says why

Not asking for a change; recording it because the dashboard has the same dead end and you may want
the same fix.

`GET /api/venue/guests` defaults `filter` to `identified`
(`src/lib/guests/guest-contacts-list.ts:180-181`), which it reads as
`identifiability_tier = 'identified'` — "has an email or phone". Both the dashboard
(`ContactsDashboard.tsx:430`, "Saved contact details") and the app default to it. That is clearly
deliberate.

What it costs: every field on the booking form is optional, so a walk-in booked by name alone is
stored as tier `named`, appears on the diary and on their booking — and a Contacts search for that
exact name answers "No contacts found", with nothing on screen to suggest a filter is in the way.
On staging, two such guests were invisible until the scope was switched to "All" (2,001 → 2,004).

The app now asks the same question again at scope `all` when the list comes back empty or is being
searched, and says what is held back with one tap to lift it:

> 1 client matches "Alpha" but has no saved email or phone. The 'With contact details' filter is
> hiding them. **[Show them]**

The dashboard's own empty state could say the same thing; the count is one extra query with
`limit=1`.

---

## What we fixed on our side from the same pass (nothing needed from you)

For completeness, so nothing here reads as a request: the money block no longer shows half a
settled total after a modify save; linked bookings now appear in the appointments list, the week
matrix and the month counts; the booking wizard's progress counts three phases instead of a growing
step total (your `appointmentProgressPhase` was the model); the "+" button carries the day on
screen; a partner's booking is named in the panel (the linked feed's `serviceName` was always
right — the app was dropping it on the diary path); the pickers are off `DateTimePicker`'s
deprecated `onChange`; "Plan hours ahead" no longer defaults to a Monday in the past; and the
two-tap destructive confirms hold for eight seconds instead of four.

## Replies

As usual, a reply as `C:\Resneo\Docs\R36_WEB_RESPONSE.md` (and a note back through the desktop
session) reaches us. Earlier rounds: `Docs/R35_WEB_HANDOVER.md`, `Docs/R32_WEB_HANDOVER.md`,
`Docs/R27_WEB_HANDOVER.md`.
