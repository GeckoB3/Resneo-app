# R38: web delta since the R37 OTA, and the linked-account setup flow (2026-09-19)

From the web repo (`C:\Resneo`, `staging` at `db6311f4`), for the app. The window is the 24 web
commits after `d0cdebcf` (the tip the R37 OTA of 2026-09-17 was audited against) up to `db6311f4`.
The app's last OTA is "ResNeo R37 Collectives on Shared Services" on runtime 1.1.1 (app commit
`0f003be`).

Everything below conditions on the server's own answers (feed keys, `collective` blocks, error
codes), so the same build works whether or not a venue has a link or a collective.

---

## What changed on the web

| Web commit | Change | App impact |
|---|---|---|
| `19d6e108`, `066b1e02`, `afab4bc0`, `537cacb2`, `4af08800` | **One guided flow to link a venue and start a collective.** `POST /api/venue/account-links/setup` (venue, level, `collective`, name, tolerated changes) with a field-level error contract; `PATCH /api/venue/account-links/[id]` accepts with `collective` (join choices in one call); `GET .../lookup?slug&collective=1` reports the venue's collective standing; the banner feed `GET /api/venue/account-links/incoming` gained `outgoingRequests`, `collectiveSetup` and `memberWaiting`; `GET /api/venue/collectives/[id]/join?with_pending_link=1` previews a join before the link exists. A collective with one venue is not live (L12). | Built (below). |
| `5a327dc6`, `86c0cc00` | **Same-name adoption.** Putting a service on the page asks a member that has one with the same name: `/api/venue/collectives/[id]/same-names`, `/adoptions`, `/adoptions/[itemId]` (GET review, POST `use_mine` or `keep_separate` with an option map); calendar groups carry `awaiting_answer`; What needs you names the member. | Built. |
| `72b13016` | Ending a collective runs the release follow-ups at once. | None: the app already calls the same route. |
| `cd5276b6` | A host's parked services say how to make them bookable; `block.venue_role`. | Built. |
| `56594a35` | **New bookings** on Home (`dashboard-home.new_bookings`) and in Reports (`GET /api/venue/reports/new-bookings`), Overview counts the same way. | Built. |
| `1c784aec`, `984d9e4b` | **Export your data**: `GET /api/venue/export?type&format&from&to[&count=1]`, CSV, Excel or PDF, every detail, the venue's own words. | Built. |
| `0965abe2`, `db6311f4` | Combined page headings come from the master service; two collective error codes. | None for the app's screens; the codes are read as the server's sentence. |
| `4483f7f6`, `abaabc79`, `b9ff2995` | Diary linked columns draw closures and amended hours; business closures confirm through the app's dialog. | None: the app's linked columns already read `calendarHours` (R26); no `window.confirm` on the app. |
| `f82875c8` | Customer sign-in link types and the app deep link. | Already shipped in app `e72a308` (2026-09-19). |
| `7b2a365a`, `4333bb1a`, `75152b62`, `03db8f7c`, `0c4748d3`, `19076487` | Import consent, super console, homepage, docs, replica bookkeeping. | None. |

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | **Link with a venue**, the web's guided flow: venue search, level (view, manage, full), a collective on a full link (blocked reasons and a live standing check from `lookup?collective=1`), name, tolerated changes, check, send, receipt. Server field errors land on their step. | `components/linked/setup/LinkSetupSheet.tsx`, `StepShell.tsx`, `ChoiceRow.tsx`, `lib/linked/setup-copy.ts` (the web's 241 copy keys), `lib/linked/link-levels.ts`, `lib/queries/useLinkedVenues.ts` (`useLinkSetup`, `useVenueLookup(slug, { collective })`) |
| 2 | **Review a link request** with the collective in one go: request, join steps (same-name services, own services, forms), check, receipt; "Accept the link only" or "Accept and join"; Decline confirms. `?review=` from the banner opens it once. | `components/linked/setup/ReviewLinkRequestSheet.tsx`, `JoinSteps.tsx`, `lib/linked/join-choices.ts` (+test), `app/(app)/linked-venues/index.tsx`, `[id].tsx` |
| 3 | **Join a collective natively** on shared services (was "open the web"): the same join steps, consent version sent. | `components/linked/setup/JoinCollectiveSheet.tsx`, `app/(app)/collectives/index.tsx`, `lib/queries/useCollectives.ts` (`useJoinPreview`) |
| 4 | **Continue setup** for a host whose collective is not live yet: intro, services (inline add, bulk offer), calendars (bulk assign and unassign), done (copy the address, open the page). `?setup=` from the banner. Cards say who is waiting for whom (host waiting, member waiting, not live, invitation pending). | `components/linked/setup/CollectiveSetupSheet.tsx`, `app/(app)/collectives/index.tsx` |
| 5 | **Same-name adoption questions** for members: a card on the Collective area lists what the host asked, a review sheet answers with `use_mine` (option map) or `keep_separate`; hosts see "awaiting {venue}" in What needs you. | `components/linked/setup/AdoptionSheets.tsx`, `app/(app)/collective-area.tsx`, `lib/collective-area/model.ts`, `copy.ts`, `lib/queries/useCollectives.ts` (`useSameNames`, `useAdoptions`, `useAdoptionReview`, `useAnswerAdoption`) |
| 6 | **Banner on the Calendar tab** reads every feed key (incoming, outgoing, pending changes, collective setup, member waiting), one row per item with its CTA and "Dismiss for 24h" (SecureStore, per item). | `components/ui/LinkedVenueBanner.tsx`, `lib/linked/banner-items.ts` (+test), `lib/linked/banner-dismissals.ts` |
| 7 | **Parked services** at the host say how to make them bookable, at a member who owns them. | `lib/services/collective-service.ts` (`block.venue_role`) |
| 8 | **New bookings**: a card on Today (today, this week, this month, by channel, a link to Reports for admins) and a Reports tab (presets, custom range with the server's limits, day/week/month grain, four tiles, stacked bars by channel, footnote, CSV via the share sheet). | `components/reports/NewBookingsCard.tsx`, `NewBookingsSection.tsx`, `lib/reports/new-bookings.ts` (+test), `lib/queries/useNewBookings.ts`, `app/(app)/today.tsx`, `app/(app)/reports.tsx` |
| 9 | **Export your data** replaces the older export card: what (bookings, clients, services), which dates (all time, month, year, custom), file type (CSV, Excel, PDF), a count before the download, the file through the OS share sheet with the Bearer token. | `components/reports/DataExportCard.tsx` (+test), `lib/queries/useExportCount.ts`, `lib/share/share-binary-file.ts` |
| 10 | **More section matches the web.** Linked venues now has three pages: Linked venues, Manage Collective, Venue collectives. The "Linked calendar" page (a duplicate of the Calendar tab's linked columns) is gone with its switcher sheet; a venue's page says linked calendars appear on the Calendar tab. The older `IncomingRequestSheet` and `LinkRequestSheet` are replaced by the flows above. | `lib/navigation/more-destinations.ts`, `app/(app)/_layout.tsx`, `app/(app)/linked-venues/[id].tsx`, deleted `app/(app)/linked-venues/calendar.tsx`, `components/linked/LinkedVenueSwitcherSheet.tsx`, `IncomingRequestSheet.tsx`, `LinkRequestSheet.tsx` |
| 11 | Stacked bar charts label each axis figure once when a small whole-number maximum rounds several grid lines to the same value. | `components/reports/SvgStackedBarChart.tsx` |

## Device pass (2026-09-19, Android, staging, sept21@resneo.com as admin, Expo Go)

Passed:

- More: the Linked venues group shows the three pages; Venue collectives lists the dissolved and
  the live collective with Host badges, member names, Manage Collective and Manage combined page.
- Link with a venue: search, pick, the lookup with collective standing (Sept 19 and Sept 20 Hair
  correctly blocked: already in their own collective), levels, check, send, receipt. The sent
  request appeared under "Sent by you"; the banner on the Calendar tab showed the waiting row with
  "View request" and "Dismiss for 24h"; View request opened the hub. The request was cancelled
  afterwards (state restored).
- Today: the New bookings card, its three presets, the Reports link.
- Reports: the New bookings tab, tiles, chart, CSV share; a walk-in created through the app counted
  as 1 (Walk-ins 1) on the tiles and the chart; the booking was cancelled and deleted afterwards
  (the "Parity Test" guest contact it created remains, as walk-ins always leave one).
- Reports: Export your data counted "1 booking in total"; the PDF download reached the share sheet.
- Manage Collective renders as the host after the model change.

Fixed during the pass: the wizard sheet had no side padding; the venue picker carried a duplicate
heading; the note label read "(optional) (optional)"; the New bookings tiles had no width so their
labels collapsed to "..."; the chart axis read "0 0 1 1 1".

Not exercised on a device (needs another login or a fresh link cycle):

1. **Member side**: review a request that carries a collective (Accept and join), the native join
   sheet, and answering an adoption question. These need the app signed in as the member
   (sept22@resneo.com) while a request from sept21 is pending, or a fresh pair of venues.
2. **Continue setup** for a host: Sept Collective is already live, so the setup wizard has nothing
   to continue; a new link plus collective from a venue with no collective would show it.
3. iOS.

## Still open

1. The items above, on a device.
2. `_reference/Resneo` is at `db6311f4`; the next audit window starts there.
3. Web migrations `20270219130000` and `20270219140000` are owed to production (web side).
