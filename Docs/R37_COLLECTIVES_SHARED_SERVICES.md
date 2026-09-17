# R37: venue collectives on shared services, and the staff booking rule (2026-09-17)

From the web repo (`C:\Resneo`, `staging` at `9b26b3aa`), for the app. The web moved venue
collectives to **shared services** (plan `Docs/collective-one-venue-plan.md`, W1 to W21 and W9) and
migrated the staging collective `plus-1` on 2026-09-17. Production collectives are still on the
older model until each is migrated. Everything below conditions on the server's own answers
(`collective` blocks, `serviceModel`, error codes), so the same build works on both models.

The web's own list for the app is `Docs/MOBILE_API.md`, "Venue collectives: what changes for the
app". This note records what the app did about it.

---

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | **Staff move bookings between any calendars at their venue**, as admins do. Web's rule of 2026-09-17 replaces the own-venue leg of C8: assigned calendars limit calendar setup (hours, services, classes, events, resources), never bookings. The diary's R16-1 gate and ModifyBookingSheet's picker narrowing are gone, with `lib/calendar/managed-calendars.ts`. | `app/(app)/(tabs)/index.tsx`, `components/bookings/ModifyBookingSheet.tsx` |
| 2 | **Services screen reads the `collective` block.** Badges (Collective, From {host}, Parked, Retired; Updating, Hidden at {venue}, Could not update) and the sentences under an expanded row. A host's service at a member has no Edit or Delete; every role gets the calendar switches for it, admins included. | `lib/services/collective-service.ts`, `app/(app)/manage/services.tsx`, `types/services-manage.ts` |
| 3 | **412 `STALE_RESOURCE` on a calendar toggle** refetches the services and says the list changed. | `lib/queries/useToggleCalendarService.ts`, `lib/api/client.ts` (`isStaleResource`, `apiErrorCode`) |
| 4 | **Collective refusals refresh the booking form.** 409 `COLLECTIVE_SERVICE_UPDATING` (web D33: a venue's copy still catching up) and `COLLECTIVE_SERVICE_PARKED` invalidate the catalogue and both availability caches; staff read the server's sentence. | `lib/queries/invalidateAvailability.ts`, `lib/queries/useValidateAppointmentSlot.ts` |
| 5 | **Moving a booking to another venue of the collective** is one step: dropping it on a calendar at another member venue asks "Move this booking to {venue}?" and POSTs `/api/venue/bookings/{id}/move-venue`. Refusals (payment, forms, visit, service, time) are shown as sent. Outside a collective the web #190 rebook sheet stays. | `lib/queries/useMoveBookingToVenue.ts`, `lib/calendar/cross-venue-rebook.ts`, diary |
| 6 | **Joining needs the web.** The one-tap accept's 409 `COLLECTIVE_CONSENT_REQUIRED` opens "Open ResNeo on the web to join". | `app/(app)/collectives/index.tsx`, `lib/linked/collective-membership-copy.ts` |
| 7 | **Leave text** no longer says the own booking page is unaffected on shared services (web D3). | same |
| 8 | **Collective manager on shared services**: the Services tab points to the Services screen and the web's Collective area instead of the older offering builder; the host note and the member summary say the host sets services, prices and forms, and that sign-in follows the host (D32, D54). | `components/linked/CollectiveManagerPanel.tsx`, `CombinedPageConfigEditor.tsx`, `CombinedPageMemberSummary.tsx` |
| 9 | **Calendar settings follow the venue's booking models.** Classes, resources and events show only while switched on; a leftover room is not a calendar (resolved as web `resolveActiveBookingModels`). | `lib/booking/venue-models.ts`, `components/availability/BookableCalendarsManager.tsx`, `app/(app)/availability.tsx` |

## Still open

1. **Device test** of all of the above against staging (plus1 and light3 are on shared services).
2. **A member's online meeting link and "Before the appointment" note** for a host's service are
   edited on the web only. The app shows the service read-only.
3. **The member's "What needs you" strip** (connect Stripe, turn on forms) is web-only; the app
   shows the reason under the service instead.
4. **Sync badges** in `components/linked/CollectiveCatalogueBuilder.tsx` and
   `lib/linked/service-sync-view.ts` go when the web retires the older model (its W14 / contract
   pass C2), which also drops `sync_state`, `synced_at` and `synced_from_service_id` from service
   rows. The app reads none of those columns today.
5. **Store copy** for the next release (see `CHANGELOG.md`, Unreleased).
