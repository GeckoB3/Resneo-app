# Waitlist — parity ~45%

## App files
- app/(app)/waitlist.tsx
- lib/queries/useWaitlist.ts
- types/waitlist.ts
- lib/realtime/useVenueLiveSync.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/waitlist/WaitlistPageClient.tsx
- _reference/Resneo/src/app/dashboard/waitlist/page.tsx
- _reference/Resneo/src/app/api/venue/waitlist/route.ts
- _reference/Resneo/src/app/api/venue/waitlist/alerts/route.ts

## Summary
The app's waitlist screen (app/(app)/waitlist.tsx) is appointments-only by design. It renders a flat card list of waitlist entries fetched from GET /api/venue/waitlist?kind=appointment, supports Offer and Cancel actions (PATCH /api/venue/waitlist), navigates to the booking detail on Confirm, and shows a per-entry offer-expiry countdown. It has pull-to-refresh but no live Supabase realtime subscription, no Active/All filter tab, no delete action for expired/cancelled entries, no can_offer gating on the Offer button, no notify_failed warning banner, and no staff-choose waitlist alerts panel (GET/POST /api/venue/waitlist/alerts). The web reference implements all of these and also renders the `offer_unavailable_reason` tooltip. The app does correctly hardcode kind=appointment (matching the appointments-only scope) and wires haptic feedback, making it a clean subset rather than a broken implementation.

## Recommendation
The waitlist screen covers the core read-offer-cancel flow for appointment entries, but is missing five features that affect day-to-day ops: (1) the Active/All filter tab — priority one, as without it expired/cancelled entries crowd the list with no way to hide them; (2) the delete action for expired/cancelled entries — the backend DELETE route is already live, so this only needs a useDeleteWaitlistEntry mutation and a swipe-to-delete or explicit Remove button; (3) can_offer gating on the Offer button — the field is already in the API response and the type definition, it just needs to be read; (4) the notify_failed warning banner after a successful PATCH so staff know if guest notification failed; and (5) Supabase realtime subscription via the existing useVenueLiveSync hook to eliminate staleness. After those five, add the waitlist_mode awareness (affects expiry display correctness), the staff-choose alerts panel (GET/POST /api/venue/waitlist/alerts), and the guest email + joined-at display. Visual improvements — left-edge status strip, per-card loading states, and an expiry countdown ticker — round out mobile delight. All of these are self-contained UI/hook additions; no new backend routes are needed.

## Gaps (9)

### [HIGH] Active / All filter tab — missing
- Backend: none — pure client-side filter on GET /api/venue/waitlist response
- Web behaviour: The web has a TabBar with 'Active' (waiting + table-offered) and 'All' (full history) filters applied client-side on the fetched entries array. Active is the default. Entry count shown in section header.
- Mobile plan: Add a two-segment SegmentedControl or pair of Pressable tabs above the list in waitlist.tsx. Maintain a `filter` state ('active'|'all'). Filter displayed entries using the same isActiveWaitlistEntry predicate from the web (status==='waiting' for appointments only). Show entry count badge. Default to 'active'.

### [HIGH] Delete expired/cancelled entries — missing
- Backend: DELETE /api/venue/waitlist — route exists and is deployed
- Web behaviour: Web shows a trash icon button for entries with status 'expired' or 'cancelled'. Calls DELETE /api/venue/waitlist with body { id }. On success the entry is removed from the list.
- Mobile plan: Add a `useDeleteWaitlistEntry` mutation in lib/queries/useWaitlist.ts that calls apiFetch('/api/venue/waitlist', { method: 'DELETE', body: JSON.stringify({ id }) }). In waitlist.tsx, show a destructive 'Remove' button (or swipe-to-delete via Swipeable from react-native-gesture-handler) for expired/cancelled cards. Confirm with Alert.alert before firing. On success invalidate queryKeys.waitlist.all().

### [HIGH] can_offer gating on the Offer button — missing
- Backend: GET /api/venue/waitlist — already returns can_offer and offer_unavailable_reason
- Web behaviour: The GET /api/venue/waitlist response includes `can_offer: boolean` and `offer_unavailable_reason: string | null` per entry (computed by findAppointmentWaitlistAvailability). The web disables the Offer button and shows the reason string when can_offer===false.
- Mobile plan: The WaitlistEntry type already has can_offer? in types/waitlist.ts but it is never read in waitlist.tsx. Add logic: disable the Offer Button when entry.can_offer===false, and show a Text caption with entry.offer_unavailable_reason below the card detail rows. This is a pure UI change.

### [MEDIUM] notify_failed warning after offering a spot — missing
- Backend: PATCH /api/venue/waitlist — already returns notify_failed in response
- Web behaviour: The PATCH /api/venue/waitlist response includes `notify_failed?: boolean`. When true the web shows an inline error banner: 'Spot offered, but we could not send email or SMS to the guest. Contact them directly.'
- Mobile plan: In useUpdateWaitlistEntry mutation response type, add notify_failed?: boolean. In the onSuccess handler in waitlist.tsx, check data.notify_failed and display a persistent warning Alert.alert or an inline toast/banner so staff know to contact the guest manually.

### [MEDIUM] Realtime live-sync subscription — missing
- Backend: none — requires Supabase realtime enabled for waitlist_entries (should already be enabled); needs venueId available in the screen
- Web behaviour: The web calls useVenuePostgresLiveSync subscribing to waitlist_entries table filtered by venue_id. Shows a 'Live'/'Reconnecting' pill in the header. The app already has a functionally equivalent useVenueLiveSync hook in lib/realtime/useVenueLiveSync.ts that mirrors this.
- Mobile plan: Fetch venueId from useVenue() or useStaffMe(). Call useVenueLiveSync({ venueId, onRefresh: () => void query.refetch(), subscriptions: [{ table: 'waitlist_entries', filter: `venue_id=eq.${venueId}` }] }) in WaitlistScreen. Show a small status dot (green=live, amber=reconnecting) in the screen header/subtitle to match web UX. This replaces the existing pull-to-refresh-only approach.

### [MEDIUM] Staff-choose waitlist alerts panel — missing
- Backend: GET /api/venue/waitlist/alerts and POST /api/venue/waitlist/alerts — both routes exist in the reference
- Web behaviour: The web exposes GET /api/venue/waitlist/alerts returning open slot opportunities for staff_choose waitlist mode. POST /api/venue/waitlist/alerts with { id, action: 'offer'|'dismiss' } offers to or dismisses specific guests. The alerts are shown on the dashboard as inline banners.
- Mobile plan: Add useWaitlistAlerts() query hook calling GET /api/venue/waitlist/alerts. In waitlist.tsx, if waitlist_mode==='staff_choose' (from GET /api/venue/waitlist response already returned as waitlist_mode), render an 'Alerts' section above the main list. Each alert card shows the slot date/time, matching_waitlist_count, and Offer/Dismiss buttons wired to POST /api/venue/waitlist/alerts. This is only visible when the venue is in staff_choose mode.

### [MEDIUM] waitlist_mode awareness (notify_in_order vs staff_choose) — missing
- Backend: GET /api/venue/waitlist — already returns waitlist_mode
- Web behaviour: GET /api/venue/waitlist returns `waitlist_mode` string. The web uses this to decide whether to show the offer-expiry timestamp on each entry (shown only for notify_in_order mode). The app already receives this field in WaitlistResponse but ignores it entirely.
- Mobile plan: Store `query.data?.waitlist_mode` in a local variable. Pass it to offerExpiryLabel: only render the 'Offer expires in…' text when waitlist_mode==='notify_in_order'. This is a small UI correctness fix with no new API calls.

### [LOW] guest_email display — missing
- Backend: none — field is already in WaitlistEntry type and API response
- Web behaviour: The web's WaitlistEntrySubtitle renders guest_email as one of the subtitle dot-separated parts when present.
- Mobile plan: In the card rendering in waitlist.tsx, add a Text row for entry.guest_email alongside the existing guest_phone row. Simple UI addition.

### [LOW] joined-at timestamp display — missing
- Backend: none — created_at is already in WaitlistEntry type
- Web behaviour: The web shows 'Joined Mon, 9 Jun 2025, 10:32' (formatJoinedWaitlistAt) as part of the subtitle for every entry.
- Mobile plan: Add a formatted 'Joined [date]' Text caption in each card using entry.created_at, using a date formatting helper equivalent to formatJoinedWaitlistAt.

## Bugs spotted
- [high] The Offer button is never disabled when can_offer===false. The API returns can_offer:false and offer_unavailable_reason for appointment entries where no slot is available, but the app ignores both fields entirely. Pressing Offer in this state will trigger PATCH /api/venue/waitlist which will itself call offerAppointmentWaitlistEntryManually and return a 4xx error — so the mutation will throw, but the user has no pre-emptive visual hint and may tap repeatedly. (app/(app)/waitlist.tsx)
- [medium] The `act` function passes the same `loading` flag (`busy = update.isPending`) for ALL cards simultaneously. If one mutation is pending, every card's buttons become disabled, not just the one being acted on. For a list with multiple entries this blocks any parallel action even on unrelated entries. (app/(app)/waitlist.tsx)
- [low] The `offerExpiryLabel` function is called twice in render for offered entries (line 156 checks the result, line 159 calls it again). This is minor redundancy but should be extracted to a variable to avoid double Date.now() evaluation and ensure consistency. (app/(app)/waitlist.tsx)
- [low] The waitlist screen always queries kind='appointment' regardless of venue. If the venue also has table waitlist enabled (waitlist_kind='table' entries), those entries will simply never appear in the app, but more importantly the screen will show 'No waitlist entries' when there are active table entries. The comment says this is intentional but the empty state message is misleading in that scenario ('Guests waiting for a slot will appear here'). (app/(app)/waitlist.tsx)

## Design notes
- The card list has no visual status-colour strip along the left edge, unlike the web's ScheduleRow which uses a coloured left strip to immediately convey status at a glance. Adding a 3-4px left border or strip to each Card keyed to the same STATUS colours (amber=waiting, brand=offered, emerald=confirmed, slate=expired, rose=cancelled) would greatly improve scannability on mobile.
- The 'Offer' and 'Cancel' buttons are always full-width equal flex inside a row, making 'Cancel' visually equal weight to 'Offer'. The web uses a ghost/secondary style for Cancel to de-emphasise it. The app's Button component supports variant='ghost' — Cancel already uses it correctly, but consider making Offer a bolder brand colour and Confirm a success/green colour to match web intent.
- There is no per-card loading state — the entire list disables while any mutation runs (see bug above). On a typical phone network, mutations can take 500–1500ms. Each card should show its own ActivityIndicator on the action row while its specific mutation is pending.
- An offer-expiry countdown (e.g. '1h 42m remaining') is valuable but the label only recalculates on re-render/refresh. Consider a 1-minute setInterval refresh of the expiry labels using a useEffect so the countdown visibly ticks without requiring a manual pull-to-refresh.
- The pull-to-refresh is the only refresh mechanism. Even short network interruptions cause the list to go stale. Wiring the existing useVenueLiveSync hook (already available in lib/realtime/) would make the list feel live. The hook has a 30s polling fallback which alone would reduce staleness substantially.
- Empty state message ('Guests waiting for a slot will appear here') appears even when the user has never scrolled, hiding that there is no Active/All filter. Adding filter tabs first (so users can switch to 'All' to see history) and updating the empty state message per filter would avoid confusion.
- There is no visible indication that the list was last-refreshed or is stale, unlike the web's Live/Reconnecting pill. Even a small coloured dot in the navigation bar (green/amber) would reassure venue staff that they are seeing up-to-date data.
