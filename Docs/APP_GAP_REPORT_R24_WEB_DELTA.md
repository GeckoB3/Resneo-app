# R24: app-vs-web delta audit

**Range:** `resneo` **`main`** `09a7174a..100bc729`: 3 commits, 199 files, +8708/−2247 (45 of the
files are tests).
**Audited against:** `Resneo-app` @ `20bab97` plus the uncommitted card-hold retirement work of
2026-09-05 (19 files, see Part 8). Audit date 2026-09-05.
**Range shape:** `09a7174a` is a direct ancestor of `100bc729`. `9067e597` (#174, collectives no
longer dissolve before the invitee accepts) and `227c78bd` (#175, bookings nested in a processing
gap) are ordinary PR merges; `100bc729` "Staging (#176)" is a squash whose body reads as twelve
granular changes. `origin/staging` was force-reset to `100bc729` after the squash and the web
working copy had `main` and `staging` at the same commit, so there is no unreleased web work behind
this range. Every claim below was checked in code on both sides, never from the plan docs (see
`plan-docs-vs-shipped-code`). Web's own `Docs/MOBILE_API.md` says every API change is additive for
the app, and that held up: nothing in the range breaks an endpoint the app calls.

Eight strands in this range:

1. **Card holds for every venue (#176)**: the `card_hold_deposits` flag retired; a compat shim
   keeps serving the key for the app. The app half was built the same day (Part 8).
2. **Staff booking for a venue collective (#176, spec §8.7)**: a member venue books for the whole
   collective from every staff entry point; four staff routes learned to resolve a collective id;
   the staff catalogue lists members' own services; a new `staff-collective` route tells the diary
   where a New booking goes.
3. **Linked accounts and collectives review (#174, #176)**: suspended links keep a membership,
   open invitations keep a new collective alive, partner reschedules are validated, archived
   services flagged on the linked feed, the combined-page config is served as the live page
   resolves it, adopted addresses shown, a Booking page settings notice, resources no longer
   listed as calendars.
4. **Contacts (#176)**: Records split from Preferences; documents and photos as thumbnails with an
   in-app viewer; multi-file upload; 10 MB cap and a type allowlist (route, picker and bucket);
   photos downscaled before upload; the same Records section in the booking panel.
5. **Compliance through a link (#176)**: the booking and guest compliance routes read a linked
   booking's records across a link that shares full details and personal data; shown read-only.
6. **Calendar (#175, #176)**: bookings nested inside another booking's processing gap; the Filter
   menu remembered per venue with Reset and an only-calendars-working-today toggle; move or
   stretch a booking outside hours by holding it; the notify/undo prompt as a bottom bar.
7. **Planned hours (#176)**: ended changes behind a "past changes" toggle; a full timeline prunes
   the oldest ended change; the planning calendar shows venue closures.
8. **Waitlist alerts (#176)**: the freed-slot check used a status that is not in the enum, so every
   check failed and every alert stayed open; fixed, parallelised, today-onward only.

Plus super-admin KPIs, the Import AI model change, help articles, an onboarding step, a seed
script and toast positioning, none of which reach the app.

**Verdict: one large feature gap (R24-1, staff booking for a collective, which the app has every
piece of plumbing for and none of the routing), one medium feature gap (R24-2, contact Records),
five small ones (R24-3 to R24-7), one item blocked on a web-side feed change (R24-6), and one
already built (R24-8). No live regression: the app keeps working for a venue in a collective, it
just books it the old single-partner way.**

**Build status (2026-09-05, same day): R24-1, R24-2, R24-3, R24-4, R24-5 and R24-7 built and
shipped in the R24 OTA; R24-8 was already built. R24-6 was handed to the web
(`Docs/R24-6_WEB_HANDOVER.md`), the feed change landed on web `main` in #178 the same evening,
and the app half was built that evening (Part 6). #178 also withdrew the members' own services
from the collective staff catalogue, and R24-1 was trimmed to match (Part 1). Typecheck, lint and
the full jest suite pass. Needs a device pass, above all on the collective booking path (a venue
in a live collective: New, Walk-in, an own-column slot, a partner-column slot, a visit, a group)
and on the nested bars (a booking taken inside a colour's processing gap, on the day grid, the
multi-column grid and a partner column).**

---

## Part 1: R24-1, staff booking for a venue collective

**Severity: HIGH (feature).** A venue in a live collective books combined offerings at collective
prices, across every member's calendars, from the web diary and the web New booking page. On the
app the same venue's New, Walk-in and slot taps open the own-venue form, and a partner column opens
the single-partner form with that venue's own services only. Nothing breaks; the collective simply
does not exist on mobile.

**BUILT 2026-09-05.** `lib/queries/useStaffCollective.ts` reads the staff-collective route;
`lib/linked/collective-booking-target.ts` is the web's `collectiveTargetFor` rule plus the route
params; `useBookingFormVenue` grew a collective branch (`isCollective`, the host's two flow flags
from the virtual venue, appointment surface alone); the wizard asks the catalogue with
`include_hidden` in collective mode and sends `staff=1` on the chain route (`useChainAvailability`,
`TimeSlotStep.staffSession`); the pooled row honours the catalogue's per-service `any_available`
(`PractitionerStep`, `StaffPickerStep`, `AppointmentServiceOption.anyAvailable`); the calendar
tab's New, Walk-in and own-column slots route through `collectiveParamsFor`, and the linked slot
sheet carries a `collective` target (calendar tab and the linked calendar screen); `/booking/new`
says "Booking for {name}: every member venue's calendars and the combined services." Types:
`LinkedVenueProfileResponse.collective`, `StaffCollectiveSummary`, catalogue `venue_only`,
`any_available`, `owning_venue_id`, `owning_venue_name`. Tests: the routing helper, the hook, the
form-venue hook's three branches, the chain path's `staff=1`, the slot sheet's collective case.
Not needed: name qualification (the server already suffixes duplicate names with the venue).

**Trimmed 2026-09-05 evening (web #178, `4463ac38`).** The web withdrew the members' own services
from the collective staff catalogue the same day it had added them: `venue_only`, the "{Venue}
only" headings and the synthetic "Other services" heading are gone, `includeMemberOwnServices`
left the bridge and the eight routes, and every service a collective resolves is one of its
combined offerings. The `staff=1` hint on the chain route and the `staff: true` flag are still
accepted but no longer read. The app dropped its side of that: `useChainAvailability` lost its
`staff` option (and the query-key scope), `TimeSlotStep` its `staffSession` prop,
`ServiceBookingFlow` the `staffSession={isCollective}` pass, and the catalogue type its
`venue_only` marker. Kept: the catalogue is still asked with `include_hidden` in collective mode
(the hidden add-on groups are still served to a member session), the per-offering
`any_available` gate, and the practitioners' `owning_venue_id` / `owning_venue_name`.

### What web changed

The whole feature reuses the single-partner path (`linkedOwnerVenueId`) with the collective id as
the target. The staff routes resolve it through `resolveStaffCollectiveScope` in
`src/lib/linked-accounts/collective-staff-scope.ts`: a live collective (`status = 'active'`,
`page_mode = 'unified_catalog'`) that the caller's venue is an active member of, with at least two
currently eligible members (the same gate the combined public page applies). Membership already
implies full mutual write links, so there is no per-link grant check on this path.

- **`GET /api/venue/staff-collective`** (new): `{ collective: null }` or
  `{ collective: { id, name, host_venue_id, member_venue_ids, calendar_ids } }` where
  `calendar_ids` is every active people calendar of the eligible members. Catalog cache headers.
- **`GET /api/venue/linked-calendar/venue-profile?venueId=<collective id>`** answers the
  collective's virtual venue: `venue.id` is the collective id, `venue.is_collective: true`,
  `booking_model: 'unified_scheduling'`, `enabled_models: []`, `currency`, and a new
  `collective: { id, member_venue_ids }` object. 404 when the page is not available. A partner
  venue id answers exactly as before.
- **`GET /api/venue/appointment-calendar`** and **`GET /api/venue/appointment-availability`**
  accept the collective id as `owner_venue_id` and delegate to the bridge's month and day loaders
  with `audience: 'staff'`, `includeMemberOwnServices: true`, honouring `variant_id`,
  `addon_ids`, `duration_minutes`, `exclude_booking_id` and `any_available`.
- **`POST /api/venue/bookings`** with `owner_venue_id = <collective id>`: requires both
  `practitioner_id` and `appointment_service_id` (400 "Choose a calendar and a service."), resolves
  the pick through `resolveCombinedBookingTarget` (400 "That service is not currently bookable on
  this calendar."), rewrites the request to the OWNING venue and the real source service, and
  continues down the existing linked-create path (scope check, audit and owner email, now
  registered with `after()`). An offering is attributed with `collective_id` and
  `collective_service_item_id`; a member's own service books as a plain booking. The collective's
  duration override is applied before the variant; its price override stands in for the base price
  only when no variant is chosen.
- **`GET /api/booking/appointment-catalog?venue_id=<collective id>&include_hidden=true`** with a
  member venue's Bearer now returns hidden add-on groups AND every member's own services (each
  `venue_only: true`, `id === source_service_id`) under a `"{Venue} only"` category per member
  (host first, `sort_order` from 100000), a calendar with no offering included. Offerings the host
  left without a heading get an "Other services" category (`collective:<id>`, sort order just
  before the venue-only groups) so the combined offerings always list first. Practitioners carry
  `owning_venue_id` and `owning_venue_name`; every service carries `any_available` (the offering's
  `allow_any_available`, or the member venue's flag for its own services).
- **`GET /api/booking/availability?...&staff=1`** and **`POST /api/booking/validate-appointment-slot`
  with `staff: true`**: the public routes the staff form shares widen the catalogue to members'
  own services only after verifying a member session on the request. The visit and group creates
  (`create-multi-service`, `create-group` with `venue_id = <collective id>`) do the same when
  `source` is `phone` or `walk-in`; a group whose people resolve to different owning venues is
  refused with 409 "Everyone in a group booking needs to be with the same venue. Please book the
  other people separately."; both record the cross-venue audit and notification for a staff actor
  (`recordStaffCollectiveCrossVenueCreate`).
- **Diary routing** (`PractitionerCalendarView.tsx`, `collectiveTargetFor`): a slot on any column
  whose venue is in `member_venue_ids` AND whose calendar is in `calendar_ids` opens the collective
  form with that calendar preselected (own columns included); the toolbar's New and Walk-in open
  it over the whole collective; a partner column that books through the collective loses its own
  "New booking" header button; a partner outside the collective, or a calendar with no combined
  offering, keeps the per-venue form. The calendar page resolves the collective on the server so
  the button never flashes.
- **Staff form** (`NewBookingPageClient`, `StaffSurfaceBookingStack`): heading "New Booking" with
  "Booking for {name}: every member venue's calendars and the combined services." underneath;
  appointment surface only; the guest is matched or created in the owning venue, as a combined-page
  booking is. What the venue sees afterwards is unchanged: the booking shows on the partner's
  linked column and under Linked / All in the list.

### What the app has

- No collective awareness anywhere on the booking path: `grep collective` over the calendar tab,
  `LinkedVenueProvider`, `useLinkedVenues` and `useBookingFormVenue` finds nothing. The app knows
  collectives only on the Linked venues screens (create, manage, invite).
- `lib/queries/useBookingFormVenue.ts` frames any linked profile as one venue: `pricingTier: null`,
  `anyAvailableEnabled: false`, `staffFirstEnabled: false`, `enabledModels` from the profile. With
  the collective profile's `enabled_models: []` + `booking_model: 'unified_scheduling'` the tabs
  logic in `app/(app)/booking/new.tsx` would already show the appointment tab alone, which is right.
- `useAppointmentCatalog` always sends the Bearer (2026-09-03) but `ServiceBookingFlow` passes
  `includeHidden: !isLinked`, so a collective catalogue would be requested without
  `include_hidden` and never receive the members' own services.
- `useMonthAvailability` and `useAppointmentAvailability` already send `owner_venue_id`; with a
  collective id they would work unchanged. `useChainAvailability` and `useRescheduleSlots` (public
  route) send no `staff=1`.
- `ConfirmStep`, the class/event/resource flows and `GroupBookingFlow` already send
  `owner_venue_id`; `useCreateMultiServiceBooking` and `useCreateGroupBooking` send the form's
  `venueId` as `venue_id` with `source`. With the collective id as the form's venue these work.
- Calendar tab: the toolbar and FAB push `/booking/new` with no owner (own venue); a linked-column
  slot opens `LinkedSlotSheet`, which pushes `/booking/new?ownerVenueId=<partner>` (single-partner
  mode). The "All" view renders each linked venue as ONE column (`linked:<venueId>`), so a linked
  slot tap knows the venue and time but not the calendar; the single-venue linked view
  (`LinkedVenueCalendarGrid`) has per-calendar columns.
- `ServicePickerStep` groups by `service.category` and sorts by the category's `sort_order`
  (`compareByCategoryThenServiceOrder`), so the "Other services" and "{Venue} only" headings come
  through with no picker change.
- Types: `LinkedVenueProfileResponse` has no `collective`; `AppointmentCatalogService` has no
  `venue_only` or `any_available`; `AppointmentCatalogPractitioner` has no `owning_venue_*`.

### Build

1. **`lib/queries/useStaffCollective.ts`**: `GET /api/venue/staff-collective` with the Bearer,
   `staleTime` 60 s, refetch on focus, `keepPreviousData`. Shape as above. Tests.
2. **Types**: `LinkedVenueProfileResponse.collective?: { id; member_venue_ids }` and
   `venue.is_collective`; `AppointmentCatalogService.venue_only?`, `.any_available?`;
   `AppointmentCatalogPractitioner.owning_venue_id?`, `.owning_venue_name?`.
3. **`useBookingFormVenue`**: when the profile carries `collective`, return `isCollective: true`,
   `venueId = collective.id`, `venueName = venue_name`, `timeZone` from `venue.timezone`,
   `servicesLayout` from `venue.booking_page_config`; `staffFirstEnabled` from
   `venue.feature_flags?.resolved?.staff_first_booking_flow` when the virtual venue carries the
   host's flags (verify the payload at build; fall back to false); `anyAvailableEnabled` per
   service from the catalogue's `any_available` rather than a venue flag.
4. **`ServiceBookingFlow`**: `includeHidden: !isLinked || isCollective`; pass `staff=1` on
   `useChainAvailability` and `useRescheduleSlots` when `isCollective`; qualify practitioner names
   with `owning_venue_name` when two calendars share a name (web's public page does the same);
   offer the pooled option only for services whose `any_available` is true in collective mode.
5. **Calendar tab**: read `useStaffCollective()`. Port `collectiveTargetFor(columnVenueId,
   calendarId)` as a pure helper with tests. Toolbar New, Walk-in and the FAB push
   `/booking/new` with `ownerVenueId = collective.id` and `ownerVenueName` when a collective is
   live; an own-column slot whose calendar is in `calendar_ids` adds `practitionerId`; a linked
   slot (`LinkedSlotSheet`) passes the collective id instead of the partner id when the partner is a
   member, keeping the partner id otherwise. The single-venue linked grid preselects the tapped
   calendar. Keep `ownerVenueId` on the wizard as the one carrier, so `ConfirmStep`, the visit and
   group creates need no change.
6. **Header copy** on `/booking/new` in collective mode: title "New Booking" and the subtitle
   "Booking for {name}: every member venue's calendars and the combined services." (exact web
   copy, no em-dashes). Appointment tab only (already the case via the profile).
7. **Errors**: the two new 400s and the group 409 are plain `error` strings; the app's
   `ApiError.message` path shows them. Nothing to add.
8. **Bookings tab**: nothing. Web confirmed the list is unchanged (Linked, My venue and All
   already answer).
9. **Tests**: `useBookingFormVenue` collective branch; the routing helper; `ServicePickerStep`
   with a venue-only category; a `ServiceBookingFlow` test that the catalogue is requested with
   `include_hidden` in collective mode.

Effort: two to three days. No native change.

---

## Part 2: R24-2, contact Records: thumbnails, viewer, multi-upload, limits

**Severity: MEDIUM (feature).** The web contact panel now has a Preferences section and a Records
section; Records is a thumbnail grid of documents and photos with an in-app viewer, and the same
section sits in the booking panel below Payments. The app has a flat "Documents" list that opens
every file in the system browser.

**BUILT 2026-09-05.** `lib/guests/guest-document-limits.ts` (the cap, the allowlist, the
extension fallback, `checkGuestDocument`, `documentKind`, `formatFileSize`; tests).
`useUploadGuestDocument` now reads the file first, checks it, signs with the resolved type and
PUTs with the server's `mime_type`; `fetchDocumentDownloadUrl` takes `intent`;
`GuestDocumentRow` gained `preview_url` and `uploaded_at`. `DocumentsSection` is rebuilt as the
Records card: a thumbnail grid, a photo viewer sheet, PDFs in the in-app browser, other files
downloaded, "Add photos" (photo library, several at once, re-encoded at quality 0.8, which is the
downscale) and "Add files" (the Files browser filtered to the allowlist, several at once),
per-file progress and refusal sentences, the web's helper and empty-state copy. The same card
sits in the booking detail below Payments for an own-venue booking with a guest. Deliberately not
added: a native image-manipulation dependency, so a HEIC picked through the Files browser uploads
as is (it is on the allowlist).

### What web changed

- **Limits, shared by picker, sign route and bucket** (`src/lib/guests/guest-document-limits.ts`,
  migration `20270205120000_guest_documents_limits.sql`): `GUEST_DOCUMENT_MAX_BYTES` = 10 MB;
  allowlist jpeg, png, webp, gif, heic, heif, PDF, Word (doc, docx), Excel (xls, xlsx), with an
  extension fallback when the client reports no type or `application/octet-stream`.
  `POST .../documents/sign` refuses with 400 `{ error, code: 'document_type' | 'document_size' }`
  (the size message: "That file is larger than 10 MB. Photos are resized automatically, so this is
  usually a PDF or scan that needs compressing first.") and returns the `mime_type` it recorded,
  which the client must send as the PUT's `Content-Type`. The bucket refuses the PUT as backstop.
- **List**: `GET .../documents` rows gain `preview_url` (a 15-minute signed URL for photos and
  PDFs, `null` otherwise) and `uploaded_at`.
- **Download**: `GET .../documents/[id]/download?intent=view` audits `guest_document_view`
  instead of `guest_document_download`.
- **Photos downscaled in the browser** before upload (`downscale-image.ts`: jpeg, png, webp, heic,
  heif re-encoded to JPEG when large), so a 6 MB phone photo lands as roughly 400 KB.
- **UI** (`ContactDocumentsSection.tsx`, `GuestRecordsSection.tsx`): "Add documents or photos"
  (multiple), progress "Uploading 2 of 3…", helper "Photos, PDFs, Word and Excel files up to 10 MB
  each. Photos are resized on upload. Photos and PDFs open here for viewing; other files
  download.", a thumbnail grid, a viewer dialog for photos and PDFs, download for the rest,
  "Remove this file? This cannot be undone.". The contact panel's accordion is now "Preferences"
  (marketing consent, household) and "Records" (documents and photos, with a file count summary).
  `ExpandedBookingContent.tsx` shows the same Records accordion for own-venue bookings with a guest
  (not for a linked booking).

### What the app has

- `components/clients/DocumentsSection.tsx`: single-file `expo-document-picker` with no type
  filter and no size check; sends the picker's `mimeType` or `application/octet-stream`; opens
  files with `Linking.openURL` on the download URL; list rows with name, date, size, category.
  The app's contact screen already keeps marketing preferences and documents in separate cards,
  so the Preferences/Records split exists in substance.
- `lib/queries/useGuestDocuments.ts`: the three-step upload; `GuestDocumentRow` lacks
  `preview_url` and `uploaded_at`; the PUT sends the caller's mime type rather than the server's.
- `components/bookings/BookingDetailContent.tsx` has no documents section.
- The server's new refusals surface as `ApiError.message` in the upload error line, so a large or
  disallowed file is refused readably today. HEIC from an iPhone is on the allowlist. No regression.

### Build

1. **`lib/guests/guest-document-limits.ts`**: port `GUEST_DOCUMENT_MAX_BYTES`, the allowlist,
   the extension map, `resolveGuestDocumentMimeType` and `checkGuestDocument` with the web's
   messages. Tests.
2. **Picker**: `expo-document-picker` with `type` set to the allowlist and `multiple: true`, plus
   an "Add photos" path through `expo-image-picker` (already a dependency) with
   `allowsMultipleSelection` and `quality` about 0.8, which yields a resized JPEG and covers the
   downscale for the common case. A HEIC picked through the document picker is uploaded as is
   (state this in the helper copy). If a true downscale for every source is wanted, add
   `expo-image-manipulator`, which is a native dependency and needs a build.
3. **Upload**: check every file with `checkGuestDocument` before signing; send the sign
   response's `mime_type` as the PUT `Content-Type`; per-file progress "Uploading n of m…".
4. **List and viewer**: add `preview_url` and `uploaded_at` to the row type; a thumbnail grid
   (`expo-image` for photos, a glyph for PDF and other); tapping a photo or PDF opens a viewer
   Sheet with a fresh URL from `?intent=view` (photo via `expo-image`, PDF via
   `react-native-webview`, already a dependency); other files keep the download path.
5. **Copy**: card title "Documents and photos" under a "Records" heading; the helper line and the
   remove confirmation above; empty state "No documents or photos yet."
6. **Booking detail**: a Records section below Payments for an own-venue booking with a guest,
   reusing the same component; not shown for linked bookings.

Effort: one day, plus the native-dependency decision in step 2.

---

## Part 3: R24-3, combined page manager and the Booking page settings notice

**Severity: LOW (feature).** Small web-side additions around the combined page that the app's
collective screens do not mirror.

**BUILT 2026-09-05.** `lib/linked/collective-page.ts` (`collectiveAdoptedSlug`,
`collectivePublicPath`, `settingsCollectiveNote`; tests); `CollectiveMemberView.venueSlug` and the
two host flags on `CollectiveView`; the collectives list's "View combined booking page" opens the
adopted address; the manager's adopt option says "Customers reach it at /book/{slug}."; the
"Settings that follow the host venue" card in the combined-page editor; `CombinedPageNotice` at
the top of Booking page settings (host: Manage combined page; member: Open Linked venues).
`useCollectives` takes `enabled` so non-admins never ask.

### What web changed

- `CollectiveView.members[].venueSlug` added; the manager's page link and the panel's "View
  combined booking page" open `/book/{member slug}` when `slugStrategy === 'adopt_member'`,
  otherwise `/book/c/{slug}`; the adopt option says "Customers reach it at /book/{slug}."
- `CollectiveView.bookingPageConfig` is now the EFFECTIVE config (host tabs and About content
  filled in until the host saves its own), so editors that seed toggles from it read inherited
  tabs as on.
- A "Settings that follow the host venue" note in the manager (any-available and staff-first from
  the host's Booking settings; address, phone, website, hours, currency and wording from the host's
  Profile; prices and notice from each member's own service; the sign-in gate when any member
  requires it), and editor hints saying address and phone come from the host venue.
- `CombinedPageNotice` at the top of Settings > Booking page for a venue in a live collective:
  "This venue is part of {name}" with host or member copy, an adopted-address variant, and
  buttons "Manage combined page" (host) and "Open Linked accounts".
- Resources no longer appear as calendars in the manager (server-side, in
  `fetchAppointmentCatalog`); a dissolved collective the venue never joined is hidden from its
  list (server-side); a refused create keeps the typed details (the app's `CreateCollectiveSheet`
  already resets only on success).

### What the app has

- `app/(app)/collectives/index.tsx` opens `/book/c/${slug}` always; `types/collectives.ts` has
  `slugStrategy` and `adoptedVenueId` but no `venueSlug` on members.
- `components/linked/CombinedPageConfigEditor.tsx` seeds `show_*_tab === true` from
  `bookingPageConfig`, so with the effective config it now reads inherited tabs correctly with no
  change. No host-inherited note; the app's `CollectiveView` type lacks
  `hostAnyAvailablePractitioner` and `hostStaffFirstBookingFlow` (the server has carried them
  since the manager was built).
- `app/(app)/manage/booking-page.tsx` has no collective notice.

### Build

1. `CollectiveMemberView.venueSlug: string | null`; resolve the adopted member's slug for the
   "View combined booking page" link and the manage screen's page link.
2. Booking page settings: when `useCollectives()` (or `useStaffCollective()` from R24-1) reports a
   live collective the venue belongs to, render a notice card at the top with the web copy
   (host and member variants, the adopted-address line) and buttons to `/collectives/[id]`
   (host) or `/linked-venues` (member).
3. `CombinedPageConfigEditor`: the "Settings that follow the host venue" note and the two editor
   hints; add the two host flag fields to the type.

Effort: half a day.

---

## Part 4: R24-4, compliance read through a link

**Severity: LOW (feature).** On the web a linked booking's detail panel now shows the owner
venue's compliance state read-only. The app's linked booking sheet has no compliance section.

**BUILT 2026-09-05.** `useLinkedBookingCompliance` (the two refusals come back as notes, not
errors) and `LinkedComplianceSection` (read-only requirement states and records with the "Held by
the linked venue" note) in `LinkedBookingDetailSheet` for `full_details` links that share
personal data; `BookingComplianceResponse.linked`; the pill and date helpers exported from
`ComplianceCard`.

### What web changed

- `GET /api/venue/bookings/[id]/compliance` looks the booking up owner-first (the caller's venue
  filter is gone), then `resolveComplianceReadScope` (`src/lib/compliance/linked-read.ts`): the
  caller's own venue reads as before; another venue's booking reads only through a link whose
  grant is `full_details` with `pii`, gated on the OWNER's plan and flag
  (`requireCompliancePlanForVenue`), audited as `viewed_booking` with resource type
  `compliance_booking`. Otherwise 403 `{ error: 'This link does not share compliance records for
  that venue.', code: 'linked_no_pii' }`. The response carries `linked: boolean`.
- `GET /api/venue/guests/[guestId]/compliance?owner_venue_id=<uuid>` does the same for the guest.
- `ComplianceSection.tsx` in read-only mode hides capture, send and record actions, shows "Held by
  the linked venue and shown here read only. To capture, send or open a record, use that venue's
  dashboard.", and turns the two expected refusals into notes instead of the refresh error ("That
  venue does not use compliance records, so there is nothing to show here." for a 403 "Feature not
  available").

### What the app has

`components/linked/LinkedBookingDetailSheet.tsx` shows the linked booking's details, notes and
inline management; no compliance. `useBookingCompliance` calls the booking route with no owner
parameter (correct: the route resolves the owner itself now).

### Build

A read-only compliance block in `LinkedBookingDetailSheet` for `full_details` + `pii` grants:
`useBookingCompliance(booking.id)`, render requirement states and records with no actions, the
"Held by the linked venue" note, and the two refusal notes keyed on `code === 'linked_no_pii'`
and the 403 "Feature not available" message. Add `linked?: boolean` to
`BookingComplianceResponse`. Half a day.

---

## Part 5: R24-5, calendar filter: only calendars working today, and Reset

**Severity: LOW (feature).** The web Filter menu is remembered per venue in a cookie, has a Reset
button, and in day view a toggle that hides columns with no working hours on the selected date.

**BUILT 2026-09-05.** `lib/calendar/calendar-has-hours-on-date.ts`
(`calendarHasAvailableHoursOnDate` for own columns, `calendarWorksOnDate` as the template-only
answer; tests); `CalendarPrefs.workingHoursOnly`, persisted and hydrated with the other prefs; a
"Working today" / "Working this day" chip beside "All" in the wide-day filter row. Linked columns
answer from the weekly template their owner shares (`openRangesForDate`). Never a blank grid: if
nobody works, every column stays.

### What web changed

`calendar-filter-preferences.ts` (per-venue cookie: visible calendars, visible linked columns,
status filter, `workingHoursOnly`), `calendar-works-on-date.ts`:
`calendarHasAvailableHoursOnDate` for own columns (rota-resolved hours minus leave, minus venue
closures and opening hours; staff "block time" deliberately not subtracted) and
`calendarWorksOnDate` for linked columns (template and days off only, since a partner shares its
weekly hours but not its leave or closures).

### What the app has

The wide-day column filter (`visibleIds`, own and `linked:<venueId>` ids) is persisted per venue
in SecureStore already, and the "All" chip clears it (that is the Reset). There is no
working-today toggle. The calendar tab has no status filter by decision (`calendar-no-status-filter`),
so that part of the web filter is not a gap.

### Build

`lib/calendar/calendar-has-hours-on-date.ts` porting both helpers on the app's resolvers
(`effectiveWorkingHoursForDate`, the leave helpers in `schedule-closures.ts`, `venue-closures.ts`,
opening hours); a `workingHoursOnly` boolean in `CalendarPrefs`; a toggle row in the column filter,
day view only; linked columns use the template-only helper on the feed's `practitioners[].workingHours`.
Half a day.

---

## Part 6: R24-6, bookings nested inside a processing gap

**Severity: LOW, and buildable app-side only once the grid feed carried the snapshot.** Web's `booking-cluster-layout.ts` draws a
booking that sits entirely inside another booking's processing gap INSIDE the host bar, indented
5 px, with the host's text and action tray laid out around it; anything else still splits into
lanes. The web diary computes each booking's gaps from its stored `processing_time_blocks`
snapshot, falling back to the service's (and variant's) pattern.

**HANDED OVER 2026-09-05, DELIVERED in web #178** (`4463ac38`; `getCalendarGrid` in
`src/lib/unified-availability.ts`, granular commit `e116f8d8`; section "Processing snapshot on
calendar-grid rows" in the web's `Docs/MOBILE_API.md`). Each `GET /api/venue/calendar-grid`
booking row now carries `appointment_service_id`, `service_item_id`, `service_variant_id` (null
when absent) and `processing_time_blocks` (`[{ id, start_minute, duration_minutes }]`, minutes
from the booking's start; a stored snapshot wins even when empty, and only a missing one is null).

**BUILT 2026-09-05 (evening).** Two new modules under `lib/calendar/`:
`booking-cluster-layout.ts` is the web module ported in wall-clock minutes
(`layoutOverlapClusters` with the #177 rules: a booking nests when it starts inside a host's gap
and stays inside it for as long as the host lasts, may run on past the host's end, one level deep,
two non-overlapping nested bars may share a host, and the host's lane stays reserved until the
last nested bar ends; `hostRegionsAroundNested`; `NESTED_BOOKING_INSET_PX`), with the web's test
cases. `processing-gaps.ts` resolves a booking's blocks (the snapshot wins even when empty, else
the service's pattern or the chosen option's, through a `ProcessingPatternLookup`), turns them
into clipped wall-clock gap ranges, unions a visit's segments, and subtracts the gaps from the
drag conflict ranges (the server takes a booking inside a gap, so the guard must not refuse it).
`types/calendar-grid.ts` has the four fields. `CalendarDayGrid` and `AllCalendarsDayGrid` take
a `processingPatternFor` lookup (the multi-column grid also per column, for a partner venue) and
lay bars out with `layoutOverlapClusters` instead of `computeLaneLayouts`; `computeBlockHeights`
keeps the degenerate floor. `AppointmentBlock` draws each gap as a lighter band with hairline
edges (the web's hatch has no plain-View equivalent) under the text and, on a host, keeps its text
and buttons to the region above the first nested bar; a nested bar is indented 5 px, gets a larger
radius, a left shadow and a higher z-order, on `DraggableAppointmentBlock` and on the read-only
linked bar alike. Sources: the calendar tab feeds `useManagedServices` patterns for own columns
and each partner's `services[]` (now typed with `variants[].processingTimeBlocks` and
`isActive`) for linked columns; `LinkedVenueCalendarGrid` does the same on the linked screens;
`linkedGridBooking` copies the service and variant ids with a null snapshot. An older backend
sends none of the fields, so every booking reads as gap-free and the grid draws what it drew
before. The week grid stays lanes only. Tests: the ported layout suite,
`processing-gaps.test.ts`, and three grid cases in `CalendarDayGrid.overlap.test.tsx` (nests
full width with the band at the right offset, re-lanes when the booking spills past the gap,
reads the gap from the pattern when there is no snapshot).

### What the app has

The app's day grid paints no processing gaps at all (`grep processing` over `components/calendar`,
`lib/calendar` and `types/calendar-grid.ts` finds nothing), and `GET /api/venue/calendar-grid`
rows carry only `startTime`, `endTime`, status, attendance, payment state, `group_booking_id` and
`person_label`: no service id, variant id or processing snapshot. `computeLaneLayouts` is lanes
only. A booking taken in a gap therefore renders as an ordinary side-by-side overlap: correct, just
less informative.

### Build

Two steps, the first on the web (both done 2026-09-05):

1. **Web handover**: add `appointment_service_id`, `service_item_id`, `service_variant_id` and the
   `processing_time_blocks` snapshot to the calendar-grid rows (additive).
2. **App**: derive gaps per bar (snapshot, else the pattern from `useManagedServices`), paint a
   hatched processing band, and port `layoutOverlapClusters` (nesting, `hostRegionsAroundNested`)
   into the lane layout. About a day once the feed carries the fields.

Web also dropped the dashed-and-hatched styling on linked bars, relying on the column header alone,
and added a pale hairline ring around every bar. The app's amber linked columns are a recorded
decision (`calendar-nested-scrollviews`); leave them.

---

## Part 7: R24-7, planned hours list shows ended changes

**Severity: LOW.** Web's schedule timeline lists the change running now and any still to come; a
change whose `until` is before today stays in the stored timeline and moves behind "Show N past
changes". A full timeline (50 periods) now drops the change that ended longest ago instead of
refusing the save; the planning calendar shows venue closures and pages back.

**BUILT 2026-09-05.** `schedulePeriodHasEnded` in `lib/calendar/working-hours-rota.ts` (test);
the availability screen lists the change running now and any still to come, with a per-calendar
"Show N past changes" / "Hide past changes" toggle.

### What the app has

`app/(app)/availability.tsx` renders every period of `scheduleForRow(p)` under "This week ·
{source}", ended ones included. Editing planned hours and rotas is web-only by decision (the row
says so), and the app has no planning calendar, so pruning and closures on the planning calendar
have no app surface.

### Build

`schedulePeriodHasEnded(period, todayYmd)` in `lib/calendar/working-hours-rota.ts` (the day-number
helpers are there); list current and upcoming periods, a "Show N past changes" toggle for the
rest. An hour.

---

## Part 8: R24-8, card holds for every venue: BUILT 2026-09-05

The web retired the `card_hold_deposits` flag (key, schema, env override, settings and super UI,
editor gating, engines and create routes) and serves `feature_flags.resolved.card_hold_deposits:
true` on `GET /api/venue` and `GET`/`PATCH /api/venue/feature-flags` purely for the app; a PATCH
that sends the key is stripped. The app removed every read and the Booking settings toggle the
same day (`Docs/CARD_HOLD_FLAG_RETIREMENT_WEB_HANDOVER.md` tells the web when the shim can go: only
once the app build without the reads is the minimum in use). The zero-fee safety rule remains on
every engine, so `card_hold` in a public payload still implies a positive fee.

---

## Landed for free / no gap

- **Linked-calendar feed services**: now read from `service_items` (the legacy table was empty for
  every venue, so the list used to come back empty), archived services kept with `isActive: false`,
  and `variants` with processing patterns. The app sizes linked bars from `bookingEndTime` and
  books into partners through the public catalogue, so it never reads this list. Add `isActive`
  and `variants` to `LinkedService` for contract fidelity only.
- **Partner reschedules validated**: `PATCH /api/venue/linked-calendar/booking` runs the owner's
  availability check and keeps the booking's length when only the start moves; a refusal is a 409
  with a reason, which `LinkedBookingDetailSheet` already shows through `ApiError.message`.
- **Suspended links hold a membership; open invitations keep a new collective alive; a dissolved
  collective the venue never joined is hidden; duplicate dissolved names tolerated; the merged
  catalogue memoised ten seconds per process; no email per offering added to the combined page;
  resources not listed as calendars**: all server-side. The app's invite-accept flow benefits from
  the dissolve fix without change.
- **Effective combined-page config**: served by the collectives list; the app editor seeds from it
  correctly by construction.
- **Waitlist alerts**: the check used status `'Arrived'`, which is not in the `booking_status`
  enum; it is `'Seated'` now, checks run side by side and only from the venue's today. The app's
  banner reads the same route and simply gets right answers now.
- **Diary interactions**: hold-to-stretch the day grid to 00:00 to 24:00, the drop saved with a
  warning toast, closed stripes clipped to the drawn range, the notify/skip/undo prompt as a bottom
  bar, the dragged bar left as a faded origin marker, the action tray moving below the text on
  narrow lanes. The app already allows an outside-hours drop (amber) with `allow_outside_hours`
  and `allow_during_breaks`, its window control widens the grid, and it shows a notify/undo sheet
  after a move. Interaction polish only; no capability gap.
- **Staff form warm-up** (`staff-surface-warm.ts`, slot cache, staff-first warm cap): web
  performance.
- **Public compliance `booking-requirements` resolving a collective**: the app never calls it.
- **`create` route**: the collective override is now applied before the variant on single creates
  (server), and card-hold flag checks are gone from every create route (server; the app is built).
- **Super KPIs, support-session email removal, Import AI model, help articles, onboarding
  ServicesStep, the seed script, the sidebar's combined-page link, toast bottom offset**: web-only.

## Web handover items from this audit

1. Calendar-grid rows: add the service and variant ids and the `processing_time_blocks` snapshot
   (unblocks R24-6). Done in web #178; the app half is built.
2. Delete the card-hold compatibility shim once the app build without the reads is the minimum in
   use (existing handover doc).

## Suggested order

1. **R24-1** (two to three days): the largest, and the app has all the plumbing.
2. **R24-2** (one day, plus the native-dependency decision).
3. **R24-3**, **R24-7**, **R24-5** (half a day each; R24-3 can reuse R24-1's hook).
4. **R24-4** (half a day).
5. **R24-6** after the web feed change (delivered in #178 the same evening; built).

## Device pass findings (2026-09-05)

1. **Linked columns were named after the venue.** On the combined day grid a linked venue was one
   column headed with the venue's name ("light2"), where the web diary draws one column per
   calendar the partner shares, headed with the calendar's name ("Jenny"; `LinkedColumn` in
   `PractitionerCalendarView.tsx`, keyed `linked:<venueId>:<practitionerId>`). Fixed the same
   evening: `linkedVenueColumns` in `lib/linked/linked-calendar-view.ts` splits a partner into
   per-calendar columns (each with its own template for the closed shading and the working-today
   filter; an inactive calendar only while it holds a booking; a venue-level column only for
   bookings naming no listed calendar), the header shows the venue under the calendar's name, a
   tap on the column carries the calendar into the booking form, and the bar keeps the bare
   service. The wide-day filter chips still toggle a partner as a whole; the phone's single-venue
   view and the linked calendar screen keep their merged per-venue grid.
