# App gap report R27: the web delta `4463ac38..2c8c2bd7` (2026-09-06)

The read-only reference clone (`_reference/Resneo`) was refreshed from web `main`, which had
moved four squashes on from web #178: **#179** (a comms default), **#180** (collectives +
booking-page polish), **#181** (the answer to the app's R25 handover) and **#182** (the answer
to the app's R26 handover, plus Ask ResNeo). 170 files, +17,659 / -2,834.

This report is the audit of that delta from the app's side, and the record of what was built
for it. Web's own `Docs/R25_WEB_RESPONSE.md` and `Docs/R26_WEB_RESPONSE.md` are the other half
of the conversation; per [[plan-docs-vs-shipped-code]] every claim below was checked against
the implementation in the clone, not against those documents.

## 1. Summary

| # | Finding | Verdict |
|---|---|---|
| R27-1 | A partner's booking can now defer its guest email; the app still skipped it and never offered Notify | **Built** |
| R27-2 | Deleting a partner's guest document needs the FULL MANAGEMENT grant; the app offered Remove on an edit grant | **Built** |
| R27-3 | Ask ResNeo exists, takes the app's Bearer and knows it is answering an app user; the app had no way in | **Built** (the owner's request: from More, in place of the settings search) |
| R27-4 | `confirm_or_cancel_prompt` now defaults to email only for a new venue; the app's fallback still said email + SMS | **Built** |
| R27-5 | Waitlist mode labels lost their em-dashes on the web; the app still had them | **Built** |
| R27-6 | `calendar-entitlement` and `calendar-column-conflicts` now take the Bearer (R25) | **No app change**, verified |
| R27-7 | The Modify sheet already deferred and offered Notify on a linked booking, which could only 404 before #182 | **Fixed by the server**, no app change |
| R27-8 | `ASSISTANT_ENABLED` is unset in production and there is no way for a client to ask | **Open**, handed to web |

Everything else in the delta is web-only or server-side and inherited: the exact-copy service
duplication for a combined-page tick (#180), the scroll controls on the service category chip
row (#180), the help centre review and the "The ResNeo app" article category (#182), OpenAI
named as a sub-processor on the privacy and terms pages (#182), and the assistant retention
cron (`vercel.json`).

## 2. R27-1: a partner's move can tell the guest now

**What the web did (#182).** `POST /api/venue/bookings/[id]/guest-modification-notify` used to
filter the booking on the caller's `staff.venue_id`, so a partner's booking answered 404. It
now loads through `loadStaffAccessibleBooking(staff, id)`, refuses unless
`linkedGrantAllowsMutation(linkedGrant, isOwnVenue)` (the same gate as the PATCH that deferred
the message), and hands the booking's OWN venue id to the executor, so the email goes out as
the owner venue rather than ours.

**What the app did.** `commitDrag` in [the calendar tab](app/(app)/(tabs)/index.tsx) carried a
`linked?: boolean` that forced `{ skip: true, prompt: false }`: the guest email was suppressed
outright and no Notify offer followed, because the release route could only fail. The comment
said exactly that.

**Fix.** The flag is gone, from the input type and from both call sites, and every drag now
takes `guestNotifyPlanForChange` — a move defers and offers Notify, a resize skips and offers
nothing. The gate matches by construction: a linked column is only draggable when
`linkedColumnUsesNativeGrid` says `full_details` + an edit grant, which is
`linkedGrantAllowsMutation`. The Notify button was already grant-agnostic (`useNotifyBookingModification`
posts the booking id and nothing else; the server derives the venue).

## 3. R27-2: removing a partner's file is a full-management act

**What the web did (#182).** The five guest-document routes take `owner_venue_id`, gated in one
place (`src/lib/guests/linked-guest-access.ts`): a `full_details` link that also shares PII for
all five, plus `linkedGrantAllowsMutation` to sign and complete, plus **`linkedGrantAllowsCancel`
to delete**. That last one is deliberately stricter than the app's handover asked for: web's
reasoning is that destroying a file the owner venue holds follows booking cancel and booking
delete, not booking edit. `PATCH` on a document stays own-venue only.

**What the app did.** `DocumentsSection` had one gate, `canChange = !readOnly && !notSharedThroughLink`,
covering both adding and removing, and the booking panel set `readOnly={!policy.canEdit}`. On an
`edit_existing` link the app would therefore have offered Remove and taken a 403.

**Fix.** A separate `canDelete` prop (default true for own-venue callers), `canRemove = canChange
&& canDelete`, and [BookingDetailContent](components/bookings/BookingDetailContent.tsx) passes
`canDelete={policy.canCancel}` — the app's name for the same full-management grant. The stale
comments about the routes not yet serving the scope are gone, and `linkedDetailPolicy`'s doc now
says which of the two grants Records sits under.

The rest of that ask needed nothing: the app already sends `owner_venue_id` on all five routes
(R26), so the reads and the upload start working the moment the link shares records. Web left
customer notes / tags and `group_booking_id` own-venue on purpose, which is what the app's
read-only treatment of both already assumes.

## 4. R27-3: Ask ResNeo in the app

**What the web built (#182).** `POST /api/venue/assistant`, a help assistant answering from the
help centre articles alone, streamed back as server-sent events (`meta`, `token`, `done`,
`error`). Read only: no tools, no write path beyond its own log.

Three things about it are load-bearing for the app, all verified in the clone:

- The route builds its client with `createVenueRouteClient(request)`, so **the app's Bearer
  works**, and it reads the `Authorization` header to stamp the conversation `client: 'app'`.
- The prompt's context block ends with `- Using: the ResNeo app`, and the instructions tell the
  model to give app steps and to say when something can only be done on the web dashboard. Web
  also wrote a whole help category for this, `The ResNeo app` (eleven articles, including "What
  you can only do on the web dashboard"), so an app question has app answers to draw on.
- Answers may link only `/help/...`, `/dashboard...` and listed YouTube videos; the route drops
  any other link server-side (`postprocessAnswer`).

**What was built.** A screen rather than the web's right-hand drawer, reached from More:

| Piece | What it is |
|---|---|
| `lib/assistant/client.ts` | the two calls. The stream uses `expo/fetch`, whose response body is a real `ReadableStream` on device — React Native's own fetch buffers the whole body, which would mean a blank screen for the length of the answer. Keeps `apiFetch`'s Bearer and its refresh-and-retry-once on a 401 (`refreshExpiredAccessToken`, newly exported for it). |
| `lib/assistant/sse.ts` | the web's `parseSseFrames`, ported, so both clients read the stream the same way. |
| `lib/assistant/markdown.ts` | the answer's markdown as blocks and spans (steps, bullets, bold, links), with the web's href allowlist as the second gate. Re-parsed on every token, so a half-streamed answer reads as steps rather than as syntax. |
| `lib/assistant/useAssistantChat.ts` | the web hook's state machine: pending turn, blocked reasons, Stop, Start again, ratings. The conversation survives leaving the screen (module-level, as the web's survives closing the drawer through sessionStorage). |
| `lib/assistant/handoff.ts` | "Send this to support" parks the transcript; the Support screen fills its subject and message from it, once. `buildHandoffMessage` is the web's, verbatim. |
| `app/(app)/assistant.tsx` | the screen: the "please don't include client details" line pinned under the header, the conversation, and a composer that rises with the keyboard. |
| `components/more/AskResneoRow.tsx` | the entry, in the slot the settings search field held. |

**The settings search is gone**, as asked: the field, its filter and its empty state. The
per-destination `keywords` synonyms stay in `more-destinations.ts` (documented as the mapping to
restore if a find-a-screen field comes back), and the More tab test now pins the Ask ResNeo row
instead of the filter.

Degrading: a 429 says which limit was hit (this minute, or the venue's day), a 404 says the
assistant is not available and disables the composer, and both offer Support, which is exactly
the web's copy. See R27-8 for why the 404 case matters today.

**Not ported.** The `page` field (which screen the question was asked from). Expo Router's
pathname for the More tab is `/settings`, which the model would read as the web's Settings page;
sending nothing is better than sending something misleading, and the context block already says
the person is on the app. Worth revisiting with a proper app-screen name.

## 5. R27-4 and R27-5: two copy and default drifts

- `confirm_or_cancel_prompt` defaults to email only for a new venue since #179 (the code
  fallback and the `venues.communication_policies` column default both). The app's
  `MESSAGE_DEFS` still said `['email', 'sms']`, so a venue whose stored policies lack that lane
  would have been shown a channel the server would not send on. One line.
- `WAITLIST_MODE_LABELS` lost its em-dashes on the web (its CLAUDE.md forbids them in copy a
  user reads). The app mirrors those labels verbatim by design, so the three strings and the
  test that asserts one of them moved with it.

## 6. R27-6 and R27-7: two things the server fixed for us

- **R25.** `GET /api/venue/calendar-entitlement` and `GET /api/venue/calendar-column-conflicts`
  now build their client with `createVenueRouteClient(request)` (#181). Response shapes
  unchanged, so the plan pill, the "Add calendar" gate and the conflicts box the app built for
  R25 start answering with no app release. `useCalendarEntitlement` / `useCalendarColumnConflicts`
  still fall back to null/[] on a 401/403/404, which stays right for an older deployment.
- **The Modify sheet.** `ModifyBookingSheet` defers on any schedule change and offers Notify,
  with no linked branch — so before #182 a partner's booking modified from the sheet deferred an
  email that could then never be released (the Notify press 404'd and toasted "Could not notify
  the guest"). It is correct as written now, and needs no change; noted because the behaviour
  changed under it.

## 7. R27-8: what is owed, and by whom

**`ASSISTANT_ENABLED` is unset in production** (web's `Docs/help-assistant-plan.md` §11 lists the
migration, the sub-processor update and the flag as owed), so until it is set the route 404s and
the app's Ask ResNeo row leads to "Ask ResNeo is not available right now." That is honest, but it
is a dead end the person had to walk into.

The app cannot tell in advance: there is no cheap way to ask whether the assistant is on. Handed
to web in `Docs/R27_WEB_HANDOVER.md`:

1. A `GET /api/venue/assistant` answering `{ enabled: true }` (or a flag on an existing venue
   payload) so the app can hide the row instead of offering a 404.
2. A note that the app is now a client of the route, so the beta allowlist and the rollout should
   count app venues.

Neither blocks the app: without them the row simply shows the unavailable notice.

## 8. Checks

`tsc --noEmit` clean; `expo lint` no new findings; the full suite green, including the new
`lib/assistant/*` suites (markdown, SSE frames, the request and its refusals, the handoff) and
`app/(app)/assistant.test.tsx` (a question asked and streamed, Stop, the switched-off case, the
Support handoff, a rating).

**A device pass is owed**, and is the honest gap in this one: the streaming read path
(`expo/fetch` on a real device), the keyboard behaviour of the composer on Android under
edge-to-edge, and a link tap into the in-app browser have all been exercised only under jest.
