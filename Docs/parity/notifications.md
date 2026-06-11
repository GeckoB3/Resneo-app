# notifications — parity ~42%

## App files
- app/(app)/notifications.tsx
- types/notifications.ts
- lib/queries/useNotifications.ts
- lib/queries/keys.ts
- app/(app)/(tabs)/_layout.tsx

## Web reference files (read-only)
- _reference/Resneo/src/components/linked-accounts/NotificationBell.tsx
- _reference/Resneo/src/components/linked-accounts/NotificationPrefsCard.tsx
- _reference/Resneo/src/app/api/venue/notifications/route.ts
- _reference/Resneo/src/app/api/venue/notifications/read/route.ts
- _reference/Resneo/src/app/api/venue/notifications/preferences/route.ts
- _reference/Resneo/src/lib/linked-accounts/notification-center.ts
- _reference/Resneo/src/lib/linked-accounts/notification-prefs.ts
- _reference/Resneo/src/lib/linked-accounts/notifications.ts
- _reference/Resneo/src/app/dashboard/settings/sections/LinkedAccountsSection.tsx
- _reference/Resneo/src/app/dashboard/DashboardSidebar.tsx

## Summary
The app has a dedicated full-screen notifications page (app/(app)/notifications.tsx) that fetches the in-app feed via GET /api/venue/notifications?limit=50, renders a flat list of notification rows with title, body, timestamp, actor venue name, and an unread dot indicator, supports pull-to-refresh, and provides a 'Mark all as read' button and per-item tap-to-mark-read. The web equivalent is a popover bell widget (NotificationBell.tsx) anchored to the sidebar — not a full page — that adds: date grouping (Today/Yesterday/date), compact relative timestamps, Supabase realtime channel subscription for instant delivery of new notifications, per-item deep-link navigation to the affected calendar date on click, row-level unread highlight background, and a 9+ badge cap. Additionally, the web Settings → Linked Accounts page embeds a NotificationPrefsCard (§17.4) that reads/writes GET+PATCH /api/venue/notifications/preferences to control per-category email toggles (cancel/reschedule/create/notes). The app has no equivalent for the preferences UI, no realtime push, no date grouping, no relative timestamps, and no in-app deep-link navigation from notification rows to the calendar. The unread badge on the More tab is implemented and correct.

## Recommendation
The app's notifications page has the core read/unread mechanics working but is missing four important features that collectively determine its utility. Start with (1) deep-link navigation from notification rows to the affected calendar date — the href is already returned by the API and typed in VenueNotification; add a parseNotificationRoute() helper that converts the web path (e.g. '/dashboard/calendar?date=2026-06-11') to a mobile route and call router.push() inside handleRowPress. Then add (2) optimistic local unread updates via useMutation onMutate so tapping a row removes the dot instantly. Next, implement (3) the Linked Accounts email preferences UI (§17.4): add useLinkedNotificationPrefs / useUpdateLinkedNotificationPrefs hooks against GET+PATCH /api/venue/notifications/preferences and surface four toggle rows (cancel/reschedule/create/notes) in the notifications screen or a new sub-page, admin-only, mirroring NotificationPrefsCard. Finally, improve the UX by (4) adopting date-group headers (SectionList with Today/Yesterday/date sections) and relative timestamps ('just now', '5m', '3h') — both are pure UI changes with no backend dependency. Realtime Supabase delivery is valuable but blocked on wiring up the Supabase browser client in the app; flag this as a follow-on once the client is available. The trailing-separator bug and oversized 'Mark all read' button are low-effort polish wins that should accompany any of the above changes.

## Gaps (8)

### [HIGH] Realtime notification delivery via Supabase channel — missing
- Backend: GET /api/venue/notifications — already deployed. Supabase realtime must be enabled for the account_link_notifications table.
- Web behaviour: The web bell subscribes to a postgres_changes INSERT channel `account_link_notifications` filtered by venue_id on mount (NotificationBell.tsx lines 96-115). New notifications surface instantly without waiting for the next poll. Also refreshes on every bell open. Backend: GET /api/venue/notifications (same route the app already uses).
- Mobile plan: Add a useEffect in useNotifications (or a companion hook) that, after the first successful query returns a venueId, opens a Supabase browser client subscription (supabase.channel(...).on('postgres_changes', ...).subscribe()). On INSERT, call queryClient.invalidateQueries(queryKeys.notifications.all()). Tear down on unmount. The venueId is already returned by the existing GET endpoint. Requires importing @supabase/supabase-js browser client in the app.

### [HIGH] In-app deep-link navigation from notification row to affected calendar date — missing
- Backend: none — href is already returned in the API response
- Web behaviour: The web bell navigates to the notification's href field (e.g. /dashboard/calendar?date=2026-06-11) when a row is tapped (NotificationBell.tsx openItem()). The href is built by notificationHref() in notification-center.ts: if resource_type==='booking' and booking_date exists, it links to the calendar on that date; otherwise to Settings→Linked Accounts. Backend: no extra route. The href field is already returned by GET /api/venue/notifications and is present in the app's VenueNotification type.
- Mobile plan: Parse the notification's href field (e.g. '/dashboard/calendar?date=2026-06-11') to extract the date query param. On NotificationRow press (after marking read), if the href contains '/calendar?date=', use router.push('/?date=<date>') or the appropriate calendar route. If it contains 'linked-accounts', navigate to the linked accounts web-link or the relevant in-app settings page. Add a helper parseNotificationRoute(href: string): Href | null in lib/notifications/ and call it inside handleRowPress.

### [HIGH] Linked Accounts email notification preferences UI (§17.4) — missing
- Backend: GET /api/venue/notifications/preferences, PATCH /api/venue/notifications/preferences — both require Bearer JWT auth. Both endpoints exist in the web reference.
- Web behaviour: NotificationPrefsCard.tsx, embedded in Settings→Linked Accounts, provides four toggle switches (cancel / reschedule / create / notes) for per-category email notifications. It calls GET /api/venue/notifications/preferences to load current prefs and PATCH /api/venue/notifications/preferences with { [category]: boolean } to save changes. Admin only.
- Mobile plan: Add useLinkedNotificationPrefs() and useUpdateLinkedNotificationPrefs() hooks in lib/queries/useNotifications.ts calling the two preference routes. Add a new section to the notifications screen (or to a linked-accounts settings sub-page) rendered only for admins, with four Switch rows matching LINKED_NOTIFICATION_CATEGORIES. Update optimistically, revert on error. The category labels are defined in LINKED_NOTIFICATION_LABELS in the web's notification-prefs.ts — copy them into types/notifications.ts or a local constant.

### [MEDIUM] Date-group headers (Today / Yesterday / date) in notification list — missing
- Backend: none
- Web behaviour: NotificationBell.tsx groupByDay() and dayGroupLabel() group consecutive notifications by local calendar day and render a sticky section header (e.g. 'Today', 'Yesterday', '12 Jun') above each group. Backend: no change needed.
- Mobile plan: Extract the dayGroupLabel + groupByDay helpers from the web component into a util (e.g. lib/notifications/groupByDay.ts). Render a SectionList in notifications.tsx instead of a FlatList/ScrollView, where section headers are styled overline Text labels. Sections are computed from query.data?.notifications before render.

### [MEDIUM] Optimistic local unread count decrement on row tap — missing
- Backend: none — optimistic update is purely local
- Web behaviour: The web bell immediately decrements the local unread state and marks the tapped row read in local state before the POST completes (openItem() lines 183-186), keeping the UI instant. The app calls markRead.mutate() which waits for the server round-trip before invalidating the query.
- Mobile plan: Use useMutation's onMutate/onError/onSettled in useMarkNotificationsRead to apply an optimistic cache update: call queryClient.setQueryData(queryKeys.notifications.list(accessToken), ...) to mark rows read and decrement unreadCount before the POST. Revert in onError.

### [LOW] Relative timestamps ('just now', '5m', '3h', '2d') instead of absolute dates — missing
- Backend: none
- Web behaviour: NotificationBell.tsx relativeTime() renders compact relative labels alongside the notification title. The app currently renders format(parseISO(iso), 'd MMM, HH:mm') — an absolute date with no relative context.
- Mobile plan: Add a relativeTime(iso: string) helper mirroring the web (< 1 min → 'just now', < 60 m → 'Xm', < 24 h → 'Xh', < 7 d → 'Xd', else short date). Replace the formatWhen call in NotificationRow with relativeTime. Show the full absolute timestamp as accessible label or secondary line.

### [LOW] Per-row unread row highlight background — missing
- Backend: none
- Web behaviour: Unread notification rows in the web bell receive a tinted background (bg-brand-50/40) in addition to the blue dot. The app only renders an unread dot with no background highlight on unread rows.
- Mobile plan: In NotificationRow, conditionally apply a backgroundColor of colors.brandSubtle (or a 6-8% tint of colors.brand) to the Pressable outer container when !notification.read. Remove on mark-read via optimistic update.

### [LOW] Fetch limit: default 30 vs app hardcodes 50 — partial
- Backend: GET /api/venue/notifications
- Web behaviour: GET /api/venue/notifications accepts a ?limit param capped at MAX_LIMIT=50 with DEFAULT_LIMIT=30. The app always fetches ?limit=50, consuming more data than the web bell default.
- Mobile plan: Keep limit=50 for the full-page feed (reasonable for a dedicated page), but document that the web bell default is 30. No change strictly required, but consider load-more pagination in the future.

## Bugs spotted
- [medium] handleRowPress does not mark a notification as read optimistically — it fires markRead.mutate() and then waits for the full query invalidation cycle. This means tapping a row does not immediately remove the unread dot; the dot persists until the refetch round-trip completes. The web bell performs an instant local state update before the POST returns. (app/(app)/notifications.tsx)
- [high] The notification href field is fetched from the API (present in VenueNotification type) but is never consumed in the UI — the row tap only marks it as read and does nothing else. Tapping a notification that references a specific booking date navigates nowhere, losing the deep-link intent of the feature. (app/(app)/notifications.tsx)
- [low] The 'Mark all as read' button is displayed as a full-width Button above the list, which draws too much visual weight. When unreadCount=0 it is correctly hidden, but when visible it occupies a full row before any notification is shown. On narrow screens this pushes the first notification below the fold. The web uses a compact inline link ('Mark all read') in the panel header. (app/(app)/notifications.tsx)
- [low] The last notification row in the Card has a borderBottomWidth hairline that renders a trailing separator at the bottom of the card, because every row has a borderBottomWidth regardless of whether it is the last item. This produces a double-border artefact where the card's own bottom border meets the row separator. (app/(app)/notifications.tsx)

## Design notes
- The notification timestamp format 'd MMM, HH:mm' (e.g. '11 Jun, 14:30') gives no relative context for very recent items. On mobile, users expect 'just now' or '5m ago' for items from the last hour — absolute times feel cold for a live feed. Adopt the web's relativeTime() pattern.
- Without date-group headers, a list of 10+ notifications from different days is hard to scan. SectionList with 'Today' / 'Yesterday' / date headers (matching the web) transforms the feed into a legible timeline and is a standard mobile pattern (iOS Messages, Slack mobile).
- The full-width secondary Button for 'Mark all N as read' is too prominent for a utility action. Consider placing it as a compact text link in the screen header (Stack.Screen headerRight) or as a small inline button aligned to the right of a section header, matching the web's style and keeping the list immediately visible.
- Unread rows have no background highlight — only an 8 pt dot to signal unread status. On AMOLED screens the dot is easy to miss. A subtle tinted row background (brand at ~6% opacity) greatly improves scannability without being garish, matching web behaviour.
- The EmptyState message reads 'Updates about linked calendars and bookings will appear here.' The web uses 'Activity from your linked venues will appear here.' — aligning to the web copy is minor but keeps terminology consistent across surfaces.
- Tapping a notification currently does nothing navigable. Users will expect a tap to take them somewhere meaningful (e.g. the calendar day of a cross-venue booking). Even a no-op tap that only marks read is confusing if the row visually appears interactive. Add navigation or remove the interactive affordance for notifications without an actionable href.
