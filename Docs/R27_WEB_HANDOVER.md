# R27 web handover: Ask ResNeo now has an app client (2026-09-06)

From the app repo (`C:\Resneo-app`), after auditing web `4463ac38..2c8c2bd7` and building against
it. Full audit: `Docs/APP_GAP_REPORT_R27_WEB_DELTA.md`.

Thank you for #181 and #182 — both handovers answered, both taken. Nothing below blocks the app;
it is one ask and two things you should know.

## What the app now does

**Ask ResNeo is built into the app**, reached from the More tab (it stands where the settings
search field used to). It calls your routes exactly as they are, with no new fields:

- `POST /api/venue/assistant` with the Bearer, `{ messages, conversationId?, client: 'app' }`,
  reading the SSE stream (`meta` / `token` / `done` / `error`) with `expo/fetch`.
- `POST /api/venue/assistant/feedback` for the thumbs.

It handles 429 (`daily_cap` and the bare rate limit), 404 and a mid-stream `error` frame with
your copy, verbatim from `src/lib/assistant/copy.ts`. Links in an answer are re-checked
app-side against your allowlist (`/help/...`, `/dashboard...`, listed YouTube) and open on the
web origin; anything else renders as plain text, matching `postprocessAnswer` and the sanitiser.

`page` is deliberately not sent: Expo Router's pathname for the More tab is `/settings`, which
the model would read as your Settings page. Say if you would rather have an app screen name in
some agreed vocabulary, and the app will send one.

The help centre's new **"The ResNeo app"** category is accurate against the build as it stands
today (spot-checked `web-only-features` in full). Two things in it that will age: the app can
now show and add to a partner venue's client Records across a link (your #182), and a partner's
booking moved from the diary now offers to notify the guest (also #182).

## The one ask: let a client find out whether the assistant is on

`ASSISTANT_ENABLED` is unset in production (your `help-assistant-plan.md` §11 lists it, the
migration and the sub-processor update as owed), so today the app's Ask ResNeo row leads to a
screen that says "Ask ResNeo is not available right now. The Support form is always available."
That is your copy and it is honest, but the person had to walk into a dead end to see it.

Either of these would let the app hide the row entirely, whichever is cheaper for you:

1. `GET /api/venue/assistant` answering `{ enabled: boolean }` for a staff session (the same
   `assistantEnabledFor(staff.venue_id)` the POST runs), or
2. the same boolean on a payload the app already loads at start-up, e.g. the venue bootstrap or
   `staff/me`.

Until then the app degrades as above, so this is a polish ask, not a blocker.

## Two things to know

1. **The app is now a client of the route.** When the beta allowlist goes on, an allowlisted
   venue's app users get the assistant too, and the conversation log will carry `client: 'app'`
   rows. Worth counting app venues in the rollout, and worth knowing that a gap review reading
   `client = 'app'` rows is reading questions asked from a phone, often at the counter.
2. **Logging being off is visible to the app.** Until the `assistant_conversations` migration
   runs, `assistantMessageId` comes back null, so the app (like your drawer) hides the thumbs and
   only offers "Send this to support". No error, just less feedback.

## Answering this

The app reads a reply as `C:\Resneo\Docs\R27_WEB_RESPONSE.md`, the way R25 and R26 came back.
