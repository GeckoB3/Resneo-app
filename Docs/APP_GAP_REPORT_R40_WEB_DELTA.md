# R40: web delta since R39, classes, events and resources on the combined page (2026-09-21)

From the web repo (`C:\Resneo`, `staging` at `1e9eaa94`), for the app. The window is everything
after `8bb76297` (the tip R39 was audited against): the two staging merges `25026623` and
`a5720fae`, and `1e9eaa94` "Classes, events and resources: review fixes and collective
listings". The app's last OTA is R38 + R39 on runtime 1.1.1 (owner, 2026-09-20). The read-only
web reference `_reference/Resneo` was moved to `1e9eaa94` for this round.

The app is an API consumer, so the three questions were asked of every route it calls: did the
request schema change, did the response shape change, is there a new error status. The answers
are all additive or server-side; nothing the app sent before is refused now.

---

## What changed on the web

| Area | Change | App impact |
|---|---|---|
| Combined page: classes, events and resources (plan §4.3) | `collective_listings` points at a member's class type, event series or resource. `GET /api/booking/class-offerings`, `event-offerings`, `resource-options`, `resource-calendar` and `availability` (resource branch) accept a **collective id** and return the listed items, each tagged `venue_id`, `venue_name`, `collective_listing_id`, plus a `venues` list. `POST /api/venue/bookings` with a collective `owner_venue_id` and a `class_instance_id`, `experience_event_id` or `resource_id` resolves the listing, books at the owning venue and records `collective_id` and `collective_listing_id`. | **Free.** The app's collective form already sends the collective id to these routes (`useBookingFormVenue` sets `venueId` to the collective id), so the Classes, Events and Resources tabs now list members' items where they used to 404. Types gained the optional tags; cards and confirmation headers name the venue. |
| Host curation | `GET/POST/DELETE /api/venue/collectives/[id]/listings`; `GET /api/venue/collective-listings` for a venue's own listed items. | Built: a **Classes, events & resources** tab in Manage Collective and "Listed on {collective}" badges on the class, event and resource managers. |
| Class cart on a collective id | `POST /api/booking/class-cart/quote` and `checkout` answer 409 `COLLECTIVE_CLASS_CART_UNAVAILABLE` (decision D). | None: the app books single class sessions through `POST /api/venue/bookings`, never the cart. |
| CER-1 | Three SQL status filters used values outside the `booking_status` enum; the event roster (`experience-events/[id]/attendees`), the account by-model API and the delivery-health scan returned 500. | Fixed server-side; the app's event roster (`useExperienceEvents`) works again with no change. |
| CER-3 | Class cart routes gained the billing block and the class_session gate. | None. |
| CER-4 | One `experienceEventSchema` for both event PATCH routes; `PATCH /api/venue/experience-events/[id]` now accepts payment and booking-window fields. | Additive. The app edits through the collection PATCH and is unaffected. |
| CER-5 | Dates formatted "Mon 28 Sept" across the web's class, event and resource flows, dashboards and the guest manage page; dash placeholders replaced with words. | Mirrored where the app still printed a raw date: the class product session label. |
| CER-6 | Switched-off model pages redirect; single-event reads, the roster and the resource dry-run carry the model gate (403). | The app's class, event and resource screens already hide behind the venue's models (R37). |
| CER-7 | The class agenda and its counts ignore sessions that have already started today; the bulk scheduler skips them and reports them in `skipped`. | Mirrored in the Classes screen stats. The app's bulk scheduler already shows `skipped`. |
| CER-8 | Booking Settings put the ticks back after a refused switch-off and say so. | Mirrored: the app's Booking settings reset the switches to the saved models on a failed save; the server's sentence still shows. |
| CER-9 | The staff New Booking header is tab-aware inside a collective. | Mirrored in the app's collective note. |
| Event manager cards | Show the payment rule. | The app's event cards already did. |
| `GET /api/venue/guests` | A page past the end answers an empty page instead of PGRST103. | Additive; the clients scroller no longer sees an error at the end of the list. |
| Compliance order, cron, Stripe subscription webhook, marketing pages, native-dialog replacement | Server or web only. | None. |

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | Offering types carry the optional `venue_id`, `venue_name`, `collective_listing_id` tags and the `venues` list. | `types/booking-offerings.ts` |
| 2 | Class, event and resource cards read "· at {venue}" on the combined page; confirmation headers read "{name} at {venue}". | `components/booking-wizard/ClassBookingFlow.tsx`, `EventBookingFlow.tsx`, `ResourceBookingFlow.tsx` |
| 3 | The collective note on New Booking is tab-aware: appointments line, classes and events line, or "rooms are booked with each venue" (the app's resource flow does reach listed rooms through the public routes, so it lists them; the copy keeps the rooms sentence for the venue-only case). | `app/(app)/booking/new.tsx` |
| 4 | Manage Collective gains **Classes, events & resources**: every member's items with a switch (host) or a withdraw switch on its own items (member); the owning venue's price and rule shown read-only; the "rooms are never shared" line. | `components/collective-area/ListingsPanel.tsx`, `app/(app)/collective-area.tsx`, `lib/queries/useCollectiveListings.ts` |
| 5 | "Listed on {collective}" badges on the class types manager, the event manager and the resource manager. | `components/classes/ClassTypesManagerSheet.tsx`, `components/events/EventManagerSheet.tsx`, `components/resources/ResourceManagerSheet.tsx`; `parent_event_id` added to `ManagedEvent` |
| 6 | Class product session label formats its date. | `components/classes/ClassProductEditors.tsx` |
| 7 | Classes screen stats ignore today's started sessions. | `app/(app)/classes.tsx` |
| 8 | Booking settings reset the model switches after a refused save. | `app/(app)/manage/booking-settings.tsx` |

Typecheck clean; the jest suites around the touched areas pass (55 suites).

## Not done, on purpose

- No app equivalent of the web's own-page handover (decision F): that is the venue's public page.
- No display-order editor for listings; the web has none yet either.

## To test on a device

Sign in as sept19@resneo.com (host of "Sept 19 and Sept 20", dev database, staging API):

1. More, Manage Collective, **Classes, events & resources**: Yoga Flow, Autumn Colour Workshop and
   Treatment Room 1 show "On the combined page"; switch the room off and on again.
2. New Booking with the collective: Classes and Events tabs list the items with "at Sept 19 Hair";
   book one class date; the booking lands on Sept 19 with `collective_id` set.
3. Classes, Events, Resources managers: the "Listed on Sept 19 and Sept 20" badge on each item.
4. Venue settings, Booking types: untick Events, see the refusal, the switch returns to on.
