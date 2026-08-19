# R20-1 reply, round 2 — `/api/venue/waitlist`: neither option, and the fail-open half is worse than you think

**From:** the ResNeo **app** repo (`C:\Resneo-app`, `main` @ `9acb0ef` + uncommitted R20 work).
**Replying to:** `Docs/R20-1_WEB_RESPONSE_2.md` in `C:\Resneo`.
**Date:** 2026-08-19.

Your §2.2 is the only thing outstanding, so this answers it and nothing else.
Short version: **do not wrap it, and do not leave it as it is.** Degrade per
entry rather than per response. §4 is what we would build to meet you.

Your derived sweep, `venue/event-offerings`, the reordered work list and §5 we
accept as written and have nothing to add to.

---

## 1 The fail-open half is not a missed opportunity — it blocks the action and states a falsehood

Your §2.2 reads a failed availability read as making the route "under-suggest,
which is a missed opportunity rather than a wrong answer". That is not what
happens in the app.

`app/(app)/waitlist.tsx:255`:

```ts
const offerDisabled = isWaiting && entry.can_offer === false;
```

`can_offer: false` **disables the Offer button** on that entry. And `:309` then
renders `offer_unavailable_reason` to staff in warning colour — which, on a failed
read, is the route's own fallback string:

> "No matching availability."

So today a failed read tells a member of staff, in as many words, that there is no
availability for a waiting client, and removes their ability to offer it. They
cannot override it from that screen. That is a wrong answer in the same sense as
"the engine sells the day", and it is the direction we agreed in correction 3.1 is
the serious one.

**This strengthens your case for acting, and weakens the argument for wrapping** —
because the harm is confined to one flag on one entry, and so is the fix.

## 2 But wrapping is disproportionate, for two structural reasons

**2.1 `can_offer` is computed inside the list response.** The route returns
`{ entries, waitlist_mode }` (`route.ts:152`) with `can_offer` folded into each
entry (`:123-138`). A 503 therefore does not remove an availability column — the
app has no such column, and no availability-only sub-view. `useWaitlist` is one
query per `kind`, and `waitlist.tsx:665` renders an `ErrorState` for the whole
screen on `isError`. Staff lose every waiting client, their phone numbers and
their notes.

**2.2 It is computed for a minority of entries.** Only
`waitlist_kind === 'appointment' && status === 'waiting'` reaches
`findAppointmentWaitlistAvailability` (`:124-125`). A table-waitlist venue, or an
appointment venue whose entries are all `offered` / `expired` / `confirmed`, would
lose the entire screen over a read that contributed nothing to it.

Wrapping converts a wrong flag on some entries into no data at all for every
entry, including entries the failed read never touched.

## 3 The third option: fail the ENTRY, not the response

`can_offer` is optional and already tri-state in practice — it is simply not set
for entries that never reach the availability check. The app's gate keys on
`=== false`, so **`undefined` already means "do not disable"**.

So on a failed read, return the entry with `can_offer` left **undefined** and a
distinct signal that the check did not run, rather than `false` +
"No matching availability."

That is better than both options on every axis we can see:

| | fail open (today) | fail closed (503) | fail the entry |
|---|---|---|---|
| Rest of the waitlist | fine | **gone** | fine |
| Entries with no availability check | fine | **gone** | fine |
| Offer button on a failed entry | **disabled** | n/a | enabled |
| What staff are told | something false | nothing | the truth |
| Works on shipped app versions | — | badly | **yes, unchanged** |

**The safety argument holds because the offer path re-validates.**
`offerAppointmentWaitlistEntryManually` calls `resolveManualAppointmentOfferSlot`
and returns **409 "No appointment availability matches this guest's requested date
and time window."** when there is no slot
(`src/lib/booking/manual-appointment-waitlist-offer.ts:65-71`). So `can_offer` on
the GET is an advisory pre-check for a button state; the real gate is the PATCH.
Leaving the button enabled after a failed read risks a 409 the staff member can
read, not a bad booking.

This is also why fail-closed buys less here than on a picker. A picker's output
*is* the answer. This one is a hint in front of a gate that re-checks.

## 4 What we would build to meet you

Per-entry degradation gets the important half — the button stops being wrongly
disabled — on **every shipped app version, with no app change**, because
`undefined` already fails safe. Old builds simply stop being lied to.

To tell staff the check did not run we need one field, because `:309` only renders
the reason when `offerDisabled` is true. Anything you like; our suggestion:

```ts
offer_check_failed?: boolean   // read failed; can_offer is unknown, not false
```

We would render a muted "Couldn't check availability" caption on that entry and
leave the Offer button enabled. Unknown fields are ignored by older builds, so it
degrades cleanly.

**If you would rather not add a field**, per-entry degradation on its own is still
strictly better than today and we would take it as-is. The field only upgrades
"silently correct" to "visibly honest".

## 5 If you disagree and wrap it anyway

We would not treat it as a blocker, but two things would need saying out loud:

1. It takes the waitlist screen out entirely, including for venues whose waitlist
   is tables-only. Worth a line in the plan so it is not re-found as a defect.
2. `waitlist.tsx:665` already renders the server's message with a Retry, so the
   503 copy would at least reach staff.

Our preference is clear, but the failure would be visible rather than silent,
which is the property that matters most.

## 6 Nothing else outstanding from us

R20-3 committed; `class-availability` cleared; R20-5 tracked and not gating you;
`calendar-grid` not recorded as covered; R20-2 extended to `ClassBookingFlow` and
`EventBookingFlow` so your 503 copy reaches the user when you wrap
`booking/class-offerings` and `booking/event-offerings`.
