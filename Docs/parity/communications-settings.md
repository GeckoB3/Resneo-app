# Communications settings — parity ~62%

## App files
- C:\Resneo-app\app\(app)\manage\communications.tsx
- C:\Resneo-app\types\communications.ts
- C:\Resneo-app\lib\queries\useCommunications.ts
- C:\Resneo-app\lib\queries\keys.ts

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\CommunicationTemplatesSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\SettingsView.tsx
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\communication-policies\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\communication-preview\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\notification-settings\route.ts
- C:\Resneo-app\_reference\Resneo\src\lib\communications\policies.ts
- C:\Resneo-app\_reference\Resneo\src\lib\notifications\notification-settings.ts
- C:\Resneo-app\_reference\Resneo\src\lib\billing\sms-allowance.ts

## Summary
The app implements the core guest-communications policies page with full CRUD for the appointments_other lane: per-message enable/disable, channel (email/SMS) selection, timing steppers, and optional custom-message lines for each channel. It also has a Staff Alerts card with three toggles (daily_schedule_enabled, staff_new_booking_alert, staff_cancellation_alert). On save it calls PUT /api/venue/communication-policies and PUT /api/venue/notification-settings via react-query mutations.

The web's comms tab (CommunicationTemplatesSection) does the same for guest policies but adds three significant features not present in the app: (1) a live message Preview modal backed by POST /api/venue/communication-preview that renders a real HTML email or SMS body, (2) an Appointments Light SMS upsell banner when the venue has no Stripe subscription, and (3) multi-lane support (a 'table' lane tab for restaurant venues in addition to 'appointments_other'). The web also shows the custom-message textarea for ALL allowed channels whether or not the channel is currently active (the app only shows the textarea when the channel is selected), and uses a debounce-autosave pattern instead of an explicit Save button.

Additionally, the app's VenueNotificationSettings type is missing the post_visit_timing field that exists in the web's backend model, and the app surface conflates legacy notification-settings fields (reminder_1_*, reminder_2_*, reschedule_notification_enabled, etc.) that are present in the DB schema but are entirely absent from the app UI — meaning those DB fields are silently ignored in the app.

## Recommendation
The app's Communications page is functionally solid for the core guest-policy CRUD loop and covers ~62% of the web's surface. The highest-priority addition is the message preview feature: the backend POST /api/venue/communication-preview endpoint already supports Bearer-JWT auth, so the only work is a PreviewBottomSheet component with a WebView for email HTML and a text bubble for SMS, triggered by a 'Preview' button in each MessageCard. This alone would bring the page to near-parity for day-to-day admin use. Second, fix the medium-severity bug where side-effects (setLane, setStaffDraft, setSeeded) run during render — move them into a useEffect to eliminate the StrictMode race and the loading flicker. Third, add post_visit_timing to the VenueNotificationSettings type and expose it in the Staff Alerts card, since it is a backend field that the app currently cannot read or write. Fourth, add the Appointments Light SMS upsell banner (pure UI from VenueContext data). The table-lane gap is out of scope for an appointments-only app. UX: prioritise adding a sticky save bar (visible only when hasChanges) to avoid the scroll-to-bottom friction, and fix the 34×34 touch targets on the HoursStepper buttons to meet HIG minimums.

## Gaps (7)

### [HIGH] Message preview modal (email HTML + SMS text) — missing
- Backend: POST /api/venue/communication-preview (Bearer-JWT supported per createVenueRouteClient, already deployed)
- Web behaviour: Each message card has a 'Preview' button per channel (email / SMS). Clicking it calls POST /api/venue/communication-preview with {lane, messageKey, channel, customMessage}. The response includes rendered HTML (email) or plain text (SMS) and a previewSampleKind label. The web shows a modal with an iframe for email and a styled bubble for SMS. The app footer says 'Message previews are available on the web dashboard.'
- Mobile plan: Add a PreviewBottomSheet component (expo-router sheet or a Modal). Each MessageCard gains a 'Preview' button per active-channel row that calls a new usePreviewCommunication mutation (POST /api/venue/communication-preview). Email channel renders the html string in a WebView (expo-web-view); SMS renders plain text in a styled View. Add the hook to lib/queries/useCommunications.ts and the sheet component alongside MessageCard in communications.tsx.

### [MEDIUM] Appointments Light SMS upsell/info banner — missing
- Backend: none — pure UI derived from venue data already in VenueContext
- Web behaviour: When pricingTier === 'light' and the venue has no Stripe subscription, the web renders an info banner above the message list explaining the 100 included SMS segments per month and prompting the venue to add a card under Settings → Plan. Controlled by hasStripeSubscription prop derived from venue.stripe_subscription_id.
- Mobile plan: Read venue.pricing_tier and venue.stripe_subscription_id from useVenueContext. If pricing_tier === 'light' and !stripe_subscription_id, render an InfoBanner card (or use an existing Banner component) at the top of the ScrollView in communications.tsx, with copy matching web. No new API needed.

### [RESOLVED — WONTFIX] post_visit_timing field (select hours-after bucket)
- 2026-06-17: Investigated and deliberately NOT surfaced. `post_visit_timing` is a legacy notification-settings field that the dispatch engine never reads — `runLanePostVisit` (lib/cron/unified-scheduling-comms.ts) schedules the post-visit thank-you from the `post_visit_thankyou` communication policy's `hoursAfter`, which IS surfaced (the "Post-visit thank you" MessageCard stepper). The web dashboard has no `post_visit_timing` control either. A picker for it was briefly added to the app and then removed, since it duplicated the MessageCard timing and wrote a field with no effect. The field stays on the VenueNotificationSettings type only so the settings object round-trips faithfully. Do not re-add a UI control for it.

### [LOW] Table lane (restaurant comms policies) — missing
- Backend: GET/PUT /api/venue/communication-policies (already returns both lanes)
- Web behaviour: When the venue's primary booking model is 'table_reservation' and pricing tier is restaurant-class, the web renders a lane tab switcher ('Table bookings' / 'Appointments & other'). Each lane has its own independent set of per-message policies. The app hard-codes only the appointments_other lane and never reads or writes the 'table' lane from VenueCommunicationPolicies.
- Mobile plan: Low priority given appointments-only scope. If restaurant venues must also be supported, add a LanePicker Chip row at the top of the ScrollView, keyed on venue.booking_model from VenueContext, and make the lane variable state-driven. The useCommunicationPolicies hook already fetches both lanes.

### [LOW] Custom-message textarea shown for all allowed channels (not just active ones) — partial
- Backend: none
- Web behaviour: The web's ChannelEditor renders the custom-message textarea for every channel listed in card.allowedChannels, regardless of whether that channel is currently in policy.channels. This means the user can pre-fill a custom message for a channel they haven't yet activated. The app only renders the textarea when the channel chip is selected (policy.channels.includes(channel)).
- Mobile plan: In MessageCard in communications.tsx, remove the policy.channels.includes(channel) guard from the Input rendering conditions and instead render them for every channel in def.allowedChannels (same as web). The inputs are already inside the policy.enabled block so they only appear when the message is on.

### [LOW] Autosave / debounce pattern vs explicit Save button — partial
- Backend: none
- Web behaviour: The web uses a 350 ms debounce on every toggle/change and persists automatically with a 'Saving…/Saved/Error' indicator in the card header. No explicit Save button exists. The app uses a single 'Save changes' button that is disabled until hasChanges, which is safe but requires an extra tap for every session.
- Mobile plan: Acceptable to keep the explicit Save button on mobile (tap target ergonomics). Optional enhancement: mirror web debounce autosave by calling the mutations inside a useEffect keyed on lane/staffDraft with a debounceRef, displaying inline Saving/Saved indicators instead of the footer button. Medium complexity; low ROI on mobile.

### [LOW] Legacy reminder_1 / reminder_2 fields (notification-settings-based reminders) — missing
- Backend: PUT /api/venue/notification-settings (supports all PATCH_KEYS)
- Web behaviour: The web backend's VenueNotificationSettings (lib/notifications/notification-settings.ts) has reminder_1_enabled, reminder_1_hours_before, reminder_1_channels, reminder_2_enabled, reminder_2_hours_before, reminder_2_channels, reschedule_notification_enabled, confirmation_channels, confirmation_sms_custom_message. These are the legacy per-venue settings that pre-date the policies API. The app's type exposes only the 3 staff-alert fields. The newer CommunicationPolicies API supersedes most of these for the appointments lane, but the DB fields still exist and may affect sending logic.
- Mobile plan: Assess whether the backend cron (send-communications) still reads legacy notification_settings for any message dispatch. If yes, expose at minimum reminder_1_* and reminder_2_* in the app type and add a second reminder toggle row in the Staff Alerts card. If the policies API fully supersedes this for appointments venues, document it and leave as-is.

## Bugs spotted
- [resolved 2026-06-17] (was: VenueNotificationSettings missing post_visit_timing). The field is now on the type and round-trips correctly. It is intentionally NOT surfaced in the UI — the dispatch cron ignores post_visit_timing and uses the post_visit_thankyou policy's hoursAfter instead. See the WONTFIX gap entry above. (C:\Resneo-app\types\communications.ts)
- [medium] Race condition in seeding logic: the block 'if (policiesQuery.data && settingsQuery.data && !seeded)' calls setSeeded, setLane, and setStaffDraft in the render path (not in a useEffect). In React StrictMode / concurrent mode this runs in the render function itself, which is a side-effect during render. If React double-invokes the component, seeded will be set before state actually commits, potentially causing one of the three setX calls to be dropped. Should be moved to a useEffect with a dependency array. (C:\Resneo-app\app\(app)\manage\communications.tsx)
- [low] The loading condition on line 403 includes a compound expression that is always truthy when policiesQuery.data and settingsQuery.data are set: '((policiesQuery.data && settingsQuery.data) && (!lane || !staffDraft))'. Because seeding happens in the render body this can evaluate to true for one extra render cycle — causing a flicker back to the DetailSkeleton after data has loaded. The loading state should instead be: 'policiesQuery.isLoading || settingsQuery.isLoading' alone, and the seeding side-effect should be in useEffect. (C:\Resneo-app\app\(app)\manage\communications.tsx)
- [low] The MessageCard only renders the SMS custom-message Input when policy.channels.includes('sms'), but the web also shows the textarea when the channel exists in allowedChannels regardless of current selection (to allow pre-filling). This means any existing smsCustomMessage value is invisible and cannot be cleared if the user has previously deselected SMS — they would need to re-enable SMS to see or delete the stored text. (C:\Resneo-app\app\(app)\manage\communications.tsx)
- [low] The app's HoursStepper hard-clamps the minimum to 1 (Math.max(1, ...)), but does not prevent the user from typing values outside 1–168 into the underlying Input when it is rendered as an editable field. The web uses a NumericInput with min/max attributes enforced by the component. The HoursStepper only shows +/- buttons, so this is contained — but if the component is ever replaced with a text input, there is no input validation. (C:\Resneo-app\app\(app)\manage\communications.tsx)

## Design notes
- The ScrollView containing 12+ message cards creates a very long page. Consider collapsing message cards into an Accordion (expand on tap) or grouping them into sections (e.g. 'Confirmations & deposits', 'Reminders', 'Post-visit') to reduce scroll distance. The web renders them as a flat list but benefits from a wide viewport where all cards are visible at once.
- The HoursStepper (−/+ buttons) works well for mobile but the numeric label ('24h') has a fixed minWidth: 44 and no minimum touch target on the text itself. Ensure the +/- buttons satisfy the 44×44 pt minimum — currently they are 34×34 pt, which is below Apple HIG minimums.
- The 'Save changes' button at the bottom of a very long scroll is hard to discover after editing a card near the top of the list. Consider a sticky bottom bar that appears only when hasChanges is true, similar to a native iOS toolbar, so users do not have to scroll to the bottom to save.
- The footnote 'Message previews are available on the web dashboard.' is a low-value placeholder that will become inaccurate once message preview is implemented in-app. Remove it or replace with a proper action once the preview feature lands.
- Non-admin users see all cards in a disabled state with Switches greyed out, but the footnote 'Only admins can change these settings.' is the only indication. Consider adding a subtle locked badge or tinting the card headers for non-admins, to make the read-only state immediately legible.
- The SMS custom-message Input includes a character count in the helper text ('Kept short — counts toward the SMS length. 0/320') but the count is computed inline in the JSX string rather than from the Input's built-in maxLength/counter prop. The displayed count only updates if the user types; if a value is pre-loaded from the server, the initial count shows 0 until the user types. The length expression '(policy.smsCustomMessage ?? "").length' should be evaluated at render time — this is actually fine as written, but the helper string must be a static prop, not a template literal, to avoid prop churn on every render.
