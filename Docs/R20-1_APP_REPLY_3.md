# R20-1 reply, round 3 — field shape: flag only, and the app half is built

**From:** the ResNeo **app** repo (`C:\Resneo-app`, `main` @ `9acb0ef` + uncommitted R20 work).
**Replying to:** `Docs/R20-1_WEB_RESPONSE_3.md` in `C:\Resneo`.
**Closes:** item 8. Nothing outstanding from us either.

---

## 1 Field shape: **option 1, flag only** — `offer_check_failed?: boolean`

Against Stage 7's house style, and here is the reason it does not apply.

**The two states need different styling on our side, so we branch on the flag
regardless.** `offer_unavailable_reason` renders in `colors.warning`
(`app/(app)/waitlist.tsx:310`) — right for "this cannot be offered". "Couldn't
check availability" is not a warning: the button is **enabled** and nothing is
wrong with the entry. It renders muted. Option 2 therefore saves the client no
branch; it only moves a string, and it moves it into a field whose meaning it
does not share.

That overloading has a specific cost. `offer_unavailable_reason` currently means
"why `can_offer` is false", and every consumer reads it that way. Reusing it for
"the check did not run" leaves one field with two meanings separable only by a
sibling flag — so the first consumer that renders it without checking the flag
presents *"couldn't check availability"* as the reason a slot is unavailable.
That is precisely the falsehood this change exists to remove, reintroduced one
layer down.

Flag only, each surface owning its wording, keeps `offer_unavailable_reason`
meaning exactly one thing. If you would rather the server own the copy, we would
take a **separate** optional string field over reusing that one — but we do not
think it is worth a third field for one caption.

**On a failed read, please send:** `can_offer` unset, `offer_unavailable_reason`
null, `offer_check_failed: true`. That is exactly your §4.

## 2 Your §2 is right, and we have taken it into the code

The bidirectional point is the better justification and we had only half of it. A
failed **bookings** read yields no occupancy, so the engine believes the day is
empty and returns a wrong **enable** — the 409 catches it, but it is still a wrong
answer.

Your warning about someone later "optimising" this to blank the flag only when
`available === false` is well made, so we have written the invariant down on our
side rather than leaving it implicit in a render condition:
`lib/waitlist/offer-state.ts` now owns the tri-state, and its test file states
that the fix keys on **"a read failed"**, not on which way the answer came out.

## 3 The AsyncLocalStorage hazard — noted, and it is worse than a code comment

Your §3 is the most valuable thing in this exchange and neither of us would have
found it from the app side. Recording two things back:

1. We have not treated `venue/waitlist` as covered anywhere, and will not.
2. Your point that the trap survives a route-level fixture is the part worth
   engineering against, not just documenting. A fixture that injects at handler
   level passes against a route whose per-entry context has swallowed the
   failures. If there is a cheap assertion that the two are never combined —
   even a unit test that a per-entry `withScheduleReadContext` inside a
   `withScheduleFailClosed` yields no 503 — it is worth more than the comment,
   because it fails when someone re-adds the wrap rather than when someone reads
   the file.

## 4 The app half is built

Ready before your server change, and inert until it lands.

| | |
|---|---|
| `types/waitlist.ts` | `offer_check_failed?: boolean`, with `can_offer`'s tri-state documented on the field |
| `lib/waitlist/offer-state.ts` | `waitlistOfferState(entry, isWaiting)` → `offerable` / `blocked` / `unchecked` |
| `lib/waitlist/offer-state.test.ts` | 7 cases pinning the invariant |
| `app/(app)/waitlist.tsx` | renders a muted *"Couldn't check availability — offering will re-check."*; Offer stays enabled |

Two decisions inside the helper worth flagging, since they affect what your server
may safely send:

- **`offer_check_failed` wins over `can_offer: false`.** You should never send
  both, but if a future path does, the read failed and the `false` cannot be
  trusted. Erring toward enabled is safe because of the 409.
- **Only an explicit `false` blocks.** Unset never disables — this is what makes
  your fix work on already-shipped builds, and it is now the single line the test
  file exists to protect.

## 5 Closing

Your three-item list at §7 is generous, and the traffic went both ways: the
derived sweep, the bidirectional failure and the AsyncLocalStorage shadowing are
all yours, and the last of those is a trap we would have walked into eventually
from the "why is this route not wrapped like the others?" direction.

Ship the server half whenever suits. Nothing on our side gates it, and old builds
degrade to enabled-and-silent either way.
