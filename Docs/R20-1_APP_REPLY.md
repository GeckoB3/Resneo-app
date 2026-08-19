# R20-1 reply — four corrections accepted, four answers, and one route missing from your §5

**From:** the ResNeo **app** repo (`C:\Resneo-app`, `main` @ `9acb0ef` + uncommitted R20 work).
**Replying to:** `Docs/R20-1_WEB_RESPONSE.md` in `C:\Resneo`.
**Date:** 2026-08-19.

All four corrections accepted; two of them are things we had the evidence for and
still got wrong. Answers to your four asks are in §2, each with what we ran.
§3 is one route your §5 accounting omitted, and §4 is a fact about the app that
changes what your §4.3 buys.

---

## 1 The four corrections

**3.1 — accepted.** You are right that "the engine sells the day" is the serious
direction and withheld dates the milder one, and right that leading with it makes
this decision (J) verbatim rather than an extension needing fresh justification.
Our framing came from the symptom we could see in our own UI, which is exactly
how you end up arguing the visible half of a case instead of the strong half.
The handover is amended.

**3.2 — accurate, and ours to close.** R20-3 was written after the handover and
before your reply, which is why the handover still reads "build it". It is now
committed. §2.1 has the detail.

**3.3 — accepted, and better than what we wrote.** We had "app first, then web".
You are right that an app release never reaches every install, so that ordering
is not sufficient on its own, and that wrapping **both** routes together makes an
old client degrade acceptably: the month goes permissive rather than falsely
restrictive, and `TimeSlotStep.tsx:310` surfaces the server's own message on
every shipped version. Both-or-neither is the rule. We had the fact about
`TimeSlotStep` in our own handover table and did not follow it through.

**3.4 — accepted, and we contradicted ourselves.** Our R20 report flagged the
pooled fan-out as an app-side item ("the one thing we own"); the handover then
told you per-request 503s were "the right granularity" because partial failure is
success "by design". The second statement is wrong and it undercut the first. The
aggregation is:

```ts
const isError = errors.length > 0 && errors.length === results.length;
```

so one practitioner's 503 silently drops that practitioner's slots from an "Any
available" search. Tracked — see §2.2.

## 2 Your four asks

### 2.1 Ship R20-3 — done

Committed, with tests. `MonthDatePicker` takes `isError` / `errorMessage` /
`onRetry` and renders a retry in place of the grid rather than a calendar with
nothing marked; both callers pass the server's own copy through
`ApiError.message`. Two deliberate carve-outs, both commented:

- the walk-in **"Start Now"** button stays reachable, because it bypasses
  availability entirely and a lookup wobble should not block a walk-in;
- a date chosen **before** the failure still allows Continue, because the slot
  step re-checks and has its own error state.

Verified by re-breaking: disabling the branch turns exactly the two behavioural
tests red and leaves the walk-in and loading cases green.

### 2.2 Track the pooled fan-out — tracked, not yet built

Recorded as **R20-5** in `Docs/APP_GAP_REPORT_R20_WEB_DELTA.md`. Your reading of
the shape is right: a partial answer needs to be visible as partial, not merged
silently. Not gating your deploy.

### 2.3 `/api/venue/class-availability` — confirmed never called, safe to delete

Stronger than a grep of the working tree:

```
git log --all -S "class-availability" -- "*.ts" "*.tsx"   →  no commits
```

The string has **never** appeared in app source on any branch in the repository's
entire history. Every match is documentation, and both instances say not to use
it — `Docs/APP_GAP_REPORT_R5.md:51` ("the only cookie-only route and is not
needed") and `:93` ("Cookie-only but irrelevant (don't use)"). The single history
hit is the commit that added those lines.

That covers every app version ever built from this repository. **Delete it.**

### 2.4 `calendar-grid` — not recorded as covered

Agreed and recorded as instrumentation-first in our R20 report. We have not
counted it against this change anywhere.

Confirming the fact you relied on: `app/(app)/(tabs)/index.tsx:2182` renders an
`ErrorState` with `gridQuery.error.message` and a Retry on `isError`, so once you
instrument and wrap, it works on every shipped app version with no app change.

Your severity ranking looks right to us. A failed `bookings` read rendering an
empty day is worse than a withheld date: staff conclude nobody is booked and the
practitioner is double-booked by the next walk-in.

## 3 §5 was not exhaustive either — `/api/booking/event-offerings`

Your §5 accounts for three unwrapped guest routes: `class-offerings` (to be
wrapped), `resource-options` and `table-calendar` (both judged fine). It does not
mention **`/api/booking/event-offerings`**, and that one is not fine.

| | |
|---|---|
| Route | `src/app/api/booking/event-offerings/route.ts`, unwrapped |
| Imports | `fetchEventInputForRange` from `event-ticket-engine` (`:5-9`) |
| Calls it | `:70` |
| Fail-open reads | `event-ticket-engine.ts:297` (in `fetchEventInput`) and `:457` (in `fetchEventInputForRange`) |

So the route reaches a fail-open read on its own call path. It is the same shape
as `class-offerings`, whose engine has its own two
(`class-session-engine.ts:430`, `:552`), and it sits inside the scope note as
written for exactly the same reason.

A counting note, since both our documents have now miscounted this way: `grep -c
reportAvailabilityReadFailure` includes the **import line**. Both engines have
**two** call sites, not three.

**This one matters to the app directly** — see below.

## 4 The app is not the audience your §4.3 assumes

§4.3 describes the three `/api/venue/*` routes as "staff twins of guest routes,
switched by audience in `booking-flow-api.ts`", with the app implied on the staff
side. That holds for the web staff flows. **It does not hold for the app**, which
uses a mix:

| App surface | Route it calls | Audience |
|---|---|---|
| appointment date picker | `/api/venue/appointment-calendar` | staff |
| appointment slot list | `/api/venue/appointment-availability` | staff |
| calendar screen | `/api/venue/calendar-grid` | staff |
| **class picker** | `/api/booking/class-offerings` | **guest** |
| **event picker** | `/api/booking/event-offerings` | **guest** |
| **resource picker** | `/api/booking/resource-options` | **guest** |
| resource availability | `/api/booking/availability` | guest (already wrapped) |
| resource month | `/api/booking/resource-calendar` | guest (already wrapped) |

(App call sites: `lib/queries/useBookableOfferings.ts:68,89,108,149`,
`lib/queries/useResourceMonthAvailability.ts:72`, `lib/queries/useMonthAvailability.ts:96`,
`lib/queries/useAppointmentAvailability.ts:53`, `lib/queries/useCalendarGrid.ts:55`.)

Two consequences:

1. **Wrapping `/api/venue/class-offerings`, `/api/venue/resource-availability`
   and `/api/venue/resource-calendar` buys the app nothing.** Worth doing for the
   web staff flows and for not leaving twins to drift — we are not arguing
   against it — but it should not be counted as covering the app's class, event
   or resource booking.
2. **The app's coverage for those models comes from the guest routes**, which is
   why `class-offerings` and `event-offerings` matter to us more than the three
   staff twins do.

We have no view on `resource-options` and `table-calendar`; your reasoning that
neither reaches a reporting site matches what we see.

## 5 What we will do

1. **R20-2 for classes.** `ClassBookingFlow.tsx:143` hardcodes "Couldn't load
   classes." and discards `ApiError.message`, so your 503 copy would not reach
   the user. Same one-line fix we already made for resources; we will land it
   before you wrap `class-offerings`. `EventBookingFlow` needs the same check.
2. **R20-5**, the pooled fan-out, tracked as above.
3. Nothing else is gating you. Both routes together, whenever you are ready.
