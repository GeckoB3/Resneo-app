# booking-detail — parity ~94%

> Re-audited 2026-06-15 against current source. The previous estimate (~78%) predated the
> booking-detail rebuild. Most gaps it listed (notes editing, deposit refund gating, rebook,
> inline message composer, the two setState-in-render bugs) are now fixed. Three genuine gaps
> remain; the rest is parity or out of scope (appointments-only).

## App files
- C:\Resneo-app\app\(app)\booking\[id].tsx
- C:\Resneo-app\components\bookings\BookingDetailContent.tsx
- C:\Resneo-app\components\bookings\BookingDetailSheet.tsx
- C:\Resneo-app\components\bookings\ModifyBookingSheet.tsx
- C:\Resneo-app\components\bookings\EditBookingSheet.tsx
- C:\Resneo-app\components\bookings\DepositSheet.tsx
- C:\Resneo-app\components\bookings\GroupVisitCards.tsx
- C:\Resneo-app\components\bookings\ComplianceCard.tsx
- C:\Resneo-app\components\bookings\BookingSwipeRow.tsx
- C:\Resneo-app\lib\booking\booking-status-actions.ts
- C:\Resneo-app\lib\booking\booking-staff-indicators.ts
- C:\Resneo-app\lib\booking\booking-timeline.ts
- C:\Resneo-app\lib\rebook-bootstrap.ts
- C:\Resneo-app\lib\queries\useBookingDetail.ts
- C:\Resneo-app\lib\queries\useBookingMutations.ts
- C:\Resneo-app\lib\queries\useGuestMutations.ts
- C:\Resneo-app\lib\queries\useVenueSettings.ts
- C:\Resneo-app\types\booking-detail.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\components\booking\BookingDetailContent.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\BookingDetailExpandedContent.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\bookings\ExpandedBookingContent.tsx
- C:\Resneo-app\_reference\Resneo\src\components\booking\CustomerProfileNotesCard.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\check-in\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\deposit\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\bookings\[id]\message\route.ts
- C:\Resneo-app\_reference\Resneo\src\lib\table-management\booking-status.ts

## Summary
The booking-detail screen is one of the most complete pages in the app. The shared
**BookingDetailContent** body (used by both the full-screen `/booking/[id]` route and the inline
**BookingDetailSheet**) covers: guest hero header with call/email and a visit count; full booking
metadata; add-ons + price breakdown; attendance pills/toggles gated by `booking-staff-indicators`
helpers; a **Notes** card with an **Edit** sheet; lazy guest-history accordion; feature-flagged
compliance card; activity timeline; a **Payments & confirmation** card; status action buttons
(primary / revert / destructive with an arm-to-confirm pattern); reschedule and full
**ModifyBookingSheet** (live availability validation); **DepositSheet**; an inline message composer;
and a **Rebook** quick-action.

The web gaps the prior brief listed are now closed: booking notes are **editable** via
EditBookingSheet → `useUpdateBookingDetails` (PATCH bookings/[id]); the **deposit refund** is gated
purely on `deposit_status === 'Paid'` with the old isAdmin gate removed; **rebook bootstrap** writes
a one-shot payload (`lib/rebook-bootstrap.ts`, expo-secure-store key `resneo_staffRebook_v1`) and
navigates to the wizard; the **message composer is inline** (`MessageGuestCompose`, channel chips +
persistent draft) rather than a throwaway modal; status changes apply an **optimistic overlay**
(`useUpdateBookingStatus` onMutate/onError/onSuccess); and the two **setState-during-render**
anti-patterns in ModifyBookingSheet / EditBookingSheet are refactored to `useEffect` seeding. Group
**visits** (multi-service + group-people) render read-only via GroupVisitCards.

Three genuine gaps remain: (1) **no-show time guard** — nothing prevents marking No-Show before the
booking start time; (2) **"Open in Contacts"** is missing from the guest hero header (it exists only
inside the history accordion); (3) the **guest-history list is capped at 5 rows**. A fourth, minor
nuance: the guest-level `customer_profile_notes` field is shown read-only — booking notes and guest
tags are editable, but that specific web field (CustomerProfileNotesCard) is not yet wired to an
input.

## Recommendation
Priorities:
1. **No-show time guard (HIGH)** — port a `canMarkNoShowForSlot`-style check. The data is already
   on hand: booking `booking_date` / `booking_time` and the venue `no_show_grace_minutes` setting
   (editable in venue-profile; exposed via `useVenueSettings`). Add the check in
   `handleActionPress` (BookingDetailContent.tsx:757) on the `target === 'No-Show'` branch, and the
   swipe path (BookingSwipeRow.tsx:73). Use the existing arm/confirm + `toast` pattern (the file
   already avoids `Alert.alert`, which is a web no-op). Backend `validateNoShowGracePeriod` is the
   only enforcement today.
2. **"Open in Contacts" header link (LOW–MEDIUM)** — add a contact deep-link next to the guest name
   in the hero header (BookingDetailContent.tsx:798-811), mirroring the proven
   `router.push('/client/${booking.guest_id}')` already used at line 257. `booking.guest_id` is
   always present.
3. **Guest-history cap (LOW)** — the query already fetches 10 rows (line 214) but the UI renders
   `.slice(0, 5)` (line 218). Render all fetched rows, or add a "View all" routing to `/client/<id>`.

Optional: wire the guest-level `customer_profile_notes` to an editable input (web's
CustomerProfileNotesCard). `useUpdateGuest` already accepts `customer_profile_notes`
(useGuestMutations.ts) — it is used today for tags but not for this field.

## Gaps (3)

### [HIGH] No-show time guard — prevent marking No-Show before the booking start time — missing
- Backend: PATCH /api/venue/bookings/[id] enforces a grace period server-side (`validateNoShowGracePeriod`); the UI should pre-validate.
- Web behaviour: Web's status handler calls `canMarkNoShowForSlot(bookingDate, bookingTime, grace)` (from lib/table-management/booking-status.ts). If the booking hasn't started, it shows "No-show can only be marked after the booking start time" and aborts.
- App state: No `canMarkNoShowForSlot` equivalent exists anywhere (grep clean). `handleActionPress` (BookingDetailContent.tsx:757-771) arms a tap-to-confirm then calls `onStatusChange('No-Show')` with **no date/time comparison**; `bookingDetailActions(status, isTableReservation)` (booking-status-actions.ts:37) takes no date/time. The swipe path (BookingSwipeRow.tsx:73) has the same gap. A `no_show_grace_minutes` venue setting exists and is editable (venue-profile) but is never read client-side.
- Mobile plan: Add a guard helper (booking date/time vs now + `no_show_grace_minutes` from `useVenueSettings`). In `handleActionPress`, on the No-Show branch, block with a toast when too early. Apply the same in BookingSwipeRow.

### [LOW] "Open in Contacts" link in the guest hero header — missing
- Backend: none
- Web behaviour: Web shows an "Open in Contacts" link next to the guest name in the header (→ /dashboard/contacts?guest=<guestId>).
- App state: The only `/client/<id>` link is the **"View contact"** button **inside** the guest-history accordion (BookingDetailContent.tsx:257). The hero header (lines 798-859) has avatar / name / visit count / status pill but no contact deep-link.
- Mobile plan: Add a small icon/text link next to the guest name in the hero header calling `router.push('/client/${booking.guest_id}')` (mirror line 257).

### [LOW] Guest-history list capped at 5 rows — present
- Backend: GET /api/venue/guests/[guestId] — already fetched with limit 10
- Web behaviour: Web shows all returned history rows in the guest-bookings accordion.
- App state: GuestHistoryBody fetches `bookingHistoryLimit: 10` (BookingDetailContent.tsx:214) but renders `.slice(0, 5)` (line 218) with no "View all". The 6th–10th visits are dropped.
- Mobile plan: Render all fetched rows, or add a "View all" affordance routing to `/client/<id>` (the "View contact" button at line 253 already exists for that route).

## Partial / nuance

### [LOW] Guest-level `customer_profile_notes` not inline-editable — partial
- Backend: PATCH /api/venue/guests/[guestId] — `useUpdateGuest` already accepts `customer_profile_notes` (useGuestMutations.ts)
- Web behaviour: Web's CustomerProfileNotesCard edits the guest's `customer_profile_notes` inline.
- App state: **Booking** notes (special requests, internal notes, dietary/occasion for tables) are fully editable via EditBookingSheet → `useUpdateBookingDetails`, and guest **tags** are editable via GuestTagsEditor → `useUpdateGuest({ tags })`. But the guest-level `customer_profile_notes` field is shown **read-only** as the "Guest profile" NoteBlock (BookingDetailContent.tsx:1175) — no input is bound to it. So the broad "notes are read-only" gap is closed; only this one web field is not yet wired.
- Mobile plan: Optional. Bind an input to `customer_profile_notes` (reuse `useUpdateGuest`, which already supports the field).

## Out of scope
- **Check-in toggle** (POST bookings/[id]/check-in). `checked_in_at` is shown read-only (BookingDetailContent.tsx:1105); no `useCheckInBooking` mutation. Event/class/resource flow — out of scope for appointments-only.
- **CDE context card** (resource/event/class). No `cde_context` on the BookingDetail type; appointments-only.
- **Group-booking authoring mode** (web-gated to `!isStaff`). Read-only group **visit** display (per-person + multi-service) already exists via GroupVisitCards; authoring a group booking is out of scope.

## Bugs spotted
All bugs the previous brief listed are resolved:
- setState-during-render in **ModifyBookingSheet** — now seeded in `useEffect(..., [target?.id])` (ModifyBookingSheet.tsx:130-148, add-ons at 237-261) — fixed.
- setState-during-render in **EditBookingSheet** — now seeded in `useEffect(..., [target?.id])` (EditBookingSheet.tsx:52-69) — fixed.
- **DepositSheet** showing Refund regardless of status / behind an isAdmin gate — now: send-link/cash/waive render only when `status !== 'Paid' && status !== 'Refunded'` (DepositSheet.tsx:93); **Refund renders only when `status === 'Paid'`** (DepositSheet.tsx:120); the isAdmin/canRefund prop is gone. The cancelled-booking refund banner also guards `deposit_status === 'Paid'` (BookingDetailContent.tsx:1274) — fixed.
- Attendance buttons mis-rendering for Completed — gating now flows through `canShow*StaffAttendanceConfirmationAction` (booking-staff-indicators.ts), which excludes Completed / Seated / terminal statuses — resolved.

The only remaining functional risk is the missing no-show time guard, tracked as a gap above.

## Design notes
- Timeline, Payments & confirmation, and SMS/Email sections are now **CollapsibleCard**s (default-collapsed unless they have content / a pending deposit), so the default scroll height is compact — the old "always-visible cards make the page long" concern is addressed.
- The message composer is inline (`MessageGuestCompose`) with channel chips and an 8s auto-dismiss feedback line; drafts persist while the card is open.
- Status/attendance/deposit actions use an arm-to-confirm pattern (tap, then "Tap to confirm") instead of `Alert.alert`, which is a no-op on web preview.
- Consider grouping secondary actions (Reschedule / Modify / Rebook) to reduce vertical button stacking on small phones, and surfacing a "Deposit pending" amber pill near the status pill in the hero header.
- The guest hero avatar uses initials; web uses a brand gradient circle — a small visual-polish opportunity.
