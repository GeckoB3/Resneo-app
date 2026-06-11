# Team / staff management — parity ~10%

## App files
- C:\Resneo-app\app\(app)\manage\team.tsx
- C:\Resneo-app\lib\queries\useStaffList.ts
- C:\Resneo-app\lib\queries\useStaffMe.ts
- C:\Resneo-app\types\staff.ts
- C:\Resneo-app\types\practitioner.ts
- C:\Resneo-app\lib\queries\keys.ts
- C:\Resneo-app\app\(app)\(tabs)\settings.tsx

## Web reference files (read-only)
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\StaffSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\sections\StaffPersonalSettingsSection.tsx
- C:\Resneo-app\_reference\Resneo\src\app\dashboard\settings\types.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\invite\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\[id]\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\[id]\resend-invite\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\[id]\reset-password\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\[id]\calendar\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\change-password\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\session-settings\route.ts
- C:\Resneo-app\_reference\Resneo\src\app\api\venue\staff\me\route.ts

## Summary
The app's team.tsx renders an admin-only read-only list of staff members (avatar, name, email, role badge) with pull-to-refresh, an error/empty state, and a single "Invite and manage on web" button that opens the web dashboard in the browser. It calls GET /api/venue/staff via useStaffList and blocks non-admins entirely with an error state. The web StaffSection is a fully interactive management panel covering: invite new users (email, name, role, calendar assignments), resend invites, change own password, admin-reset any user's password, edit roles inline, remove staff, assign/unassign calendar scopes per staff member, and configure the session auto-logout timer. The web also has a separate StaffPersonalSettingsSection for non-admin staff to edit their own display name, sign-in email, phone, and password. The app implements none of these write operations in-app.

## Recommendation
The Team page is effectively read-only at 10% parity — it displays a staff list but implements none of the management operations present on the web. The highest-priority work is to make this page genuinely useful at-the-counter: (1) Add an 'Invite staff' bottom sheet calling POST /api/venue/staff/invite, including role selection and multi-calendar assignment using a new useAssignablePractitioners hook against GET /api/venue/practitioners?staff_assignable=1. (2) Add a per-row action sheet (swipe-left or long-press) covering resend invite (POST /api/venue/staff/[id]/resend-invite), role change (PATCH /api/venue/staff/[id]), admin password reset (POST /api/venue/staff/[id]/reset-password), and remove (DELETE /api/venue/staff/[id]). (3) Implement inline calendar-scope assignment via an expandable accordion on each staff row calling PATCH /api/venue/staff/[id]/calendar. In parallel, add a 'My account' screen accessible from the More-tab profile card to cover own profile editing (PATCH /api/venue/staff/me) and own password change (POST /api/venue/staff/change-password) for all staff roles — these are unblocked mutations on existing backend routes. The session timeout setting (PUT /api/venue/staff/session-settings) can be added as an admin-only 'Security' row on the Team screen with lower urgency. Fix the isAdmin dual-source-of-truth bug (use useStaffMe role, not VenueProvider role) and the web URL construction issue before shipping any new mutations, as they affect correctness of every guarded action.

## Gaps (13)

### [CRITICAL] Invite new staff member — missing
- Backend: POST /api/venue/staff/invite (requires Bearer-JWT, admin role)
- Web behaviour: Admin opens inline form, enters email, optional name, role (admin|staff), and optionally selects calendar assignments for staff-role users. Submits to POST /api/venue/staff/invite which sends a magic-link email and returns the new StaffMember with linked_calendar_ids.
- Mobile plan: Add an 'Invite staff' bottom sheet (BottomSheetModal from @gorhom/bottom-sheet or expo-router modal route /manage/team/invite). Form fields: TextInput for email (required), TextInput for name (optional), segmented role picker (Staff/Admin), and a FlatList multi-select of calendars (loaded via GET /api/venue/practitioners?staff_assignable=1) shown only when role=staff. Submit calls apiFetch POST /api/venue/staff/invite with accessToken, then invalidates queryKeys.team.list. Calendars list can be fetched with a new useAssignablePractitioners hook.

### [HIGH] Resend invitation email — missing
- Backend: POST /api/venue/staff/[id]/resend-invite (requires Bearer-JWT, admin role)
- Web behaviour: Admin taps the envelope icon on any staff row to call POST /api/venue/staff/[id]/resend-invite, which sends a new sign-in link to the staff member's email. Inline success/error feedback shown.
- Mobile plan: Add a swipe-action or long-press context menu on each staff row (or a 3-dot action sheet) exposing 'Resend invite'. Call apiFetch POST /api/venue/staff/{id}/resend-invite and show a transient success Toast/Alert. A useMutation wrapper is cleaner than an inline fetch.

### [HIGH] Admin reset another user's password — missing
- Backend: POST /api/venue/staff/[id]/reset-password (requires Bearer-JWT, admin role)
- Web behaviour: Admin taps the key icon on any staff row, a modal appears with a single 'New Password' field (min 8 chars). On submit calls POST /api/venue/staff/[id]/reset-password with { new_password }. Inline success/error feedback.
- Mobile plan: Add 'Reset password' to the per-row action sheet. Show a Modal/BottomSheet with a SecureTextInput for new password and a confirm button. Call apiFetch POST /api/venue/staff/{id}/reset-password. Reuse a shared PasswordResetSheet component.

### [HIGH] Edit staff member role (admin/staff toggle) — missing
- Backend: PATCH /api/venue/staff/[id] (requires Bearer-JWT, admin role)
- Web behaviour: Admin taps shield icon on a row, inline select appears. On change calls PATCH /api/venue/staff/[id] with { role }. Backend prevents self-role-change. Success updates the list optimistically.
- Mobile plan: In the per-row action sheet add 'Change role'. Show an ActionSheet or segmented picker with Admin/Staff. On confirm call apiFetch PATCH /api/venue/staff/{id} with { role } and invalidate queryKeys.team.list. Disable the option for the current user's own row.

### [HIGH] Remove (delete) a staff member — missing
- Backend: DELETE /api/venue/staff/[id] (requires Bearer-JWT, admin role)
- Web behaviour: Admin taps the trash icon, a confirmation modal appears. On confirm calls DELETE /api/venue/staff/[id]. Backend prevents self-deletion. Row is removed from list on success.
- Mobile plan: In the per-row action sheet add 'Remove member' (destructive). Show an Alert.alert confirmation. On confirm call apiFetch DELETE /api/venue/staff/{id} and remove the entry from the cached TeamListResponse via queryClient.setQueryData.

### [HIGH] Assign/unassign calendars to staff members — missing
- Backend: PATCH /api/venue/staff/[id]/calendar and GET /api/venue/practitioners?staff_assignable=1 (both Bearer-JWT, admin role)
- Web behaviour: For each staff-role member, admin sees a checklist of active bookable calendars (GET /api/venue/practitioners?staff_assignable=1). Toggling a checkbox immediately calls PATCH /api/venue/staff/[id]/calendar with { calendar_ids: [...] }. All/None shortcuts exist. Inactive assigned calendars surfaced with a warning.
- Mobile plan: Expand each staff row (accordion / chevron tap) to reveal a calendar assignment sub-section. Render a FlatList of checkboxes using practitioners from a new useAssignablePractitioners hook. On toggle debounce/coalesce changes and call apiFetch PATCH /api/venue/staff/{id}/calendar. Show a spinner per row while saving. Display an amber warning line for inactive assigned calendars.

### [HIGH] Own password change (any staff user) — missing
- Backend: POST /api/venue/staff/change-password (requires valid Supabase session, no admin check)
- Web behaviour: Any staff user (not just admin) can change their own password. 'Change Password' button expands a form with New Password and Confirm Password fields (min 8 chars). On submit calls POST /api/venue/staff/change-password with { new_password }. Success toast shown.
- Mobile plan: Add a 'Change password' row to the More/Settings screen (visible to all staff). Route to /manage/my-account or surface as a modal. Form: two SecureTextInput fields (New / Confirm). On submit call apiFetch POST /api/venue/staff/change-password. Show success feedback and dismiss.

### [HIGH] Own profile edit (name, email, phone) — non-admin staff — missing
- Backend: PATCH /api/venue/staff/me (requires Bearer-JWT)
- Web behaviour: Non-admin staff see StaffPersonalSettingsSection on the settings page: form with Display name, Sign-in email (required), Phone (with country-code field, normalised to E164). PATCH /api/venue/staff/me with { name, email, phone }. Server validates email uniqueness and updates auth user's email. Client refreshes session after email change.
- Mobile plan: Add a 'My profile' row to the More/Settings tab (visible to all roles) navigating to /manage/my-account. Screen: TextInput for name, TextInput for email (email keyboard), PhoneInput for phone. Submit calls apiFetch PATCH /api/venue/staff/me. After a successful email change, call supabase.auth.refreshSession() to prevent stale JWT issues.

### [MEDIUM] Session auto-logout timer (admin security settings) — missing
- Backend: GET /api/venue/staff/session-settings and PUT /api/venue/staff/session-settings (Bearer-JWT, admin for PUT)
- Web behaviour: Admin-only section. GET /api/venue/staff/session-settings returns current session_timeout_minutes. A dropdown (30 min to 7 days) + Save button calls PUT /api/venue/staff/session-settings with { session_timeout_minutes }. Saved pill confirmation shown.
- Mobile plan: Add a 'Security' section to the Team screen (admin only) or as a subsection on a dedicated admin settings screen. Use a Picker/ActionSheet for the timeout values. Load current value via apiFetch GET /api/venue/staff/session-settings and save via PUT. Show a brief 'Saved' toast.

### [MEDIUM] Plan staff limit enforcement with upgrade prompt — missing
- Backend: POST /api/venue/staff/invite returns { error, code: 'PLAN_STAFF_LIMIT' } on 403 when limit is hit
- Web behaviour: Web reads the venue's pricing_tier, computes staffCap via planStaffLimit(), and hides the 'Add User' button when the cap is reached. Shows an amber banner with the limit and a link to Settings → Plan to upgrade.
- Mobile plan: After loading the staff list, compare members.length against a plan-derived cap. A simpler approach: handle the PLAN_STAFF_LIMIT error code returned by the invite API and show an Alert explaining the limit. The full cap check can be computed by passing venue.pricing_tier through planStaffLimit() (already used in web lib/plan-limits.ts).

### [MEDIUM] Display linked calendar names per staff member — missing
- Backend: GET /api/venue/staff already returns linked_calendar_ids and linked_practitioner_name — no additional route needed
- Web behaviour: Web GET /api/venue/staff returns linked_calendar_ids and linked_practitioner_name (a comma-joined summary) for each staff member, which is displayed in the staff row.
- Mobile plan: TeamMember in useStaffList already includes calendar_names (optional array). Render a secondary line below the email showing the calendar names if present, e.g. 'Manages: Alice, Bob'. The API response from GET /api/venue/staff includes linked_practitioner_name and linked_calendar_ids.

### [LOW] Role permissions reference panel — missing
- Backend: none
- Web behaviour: A static informational box below the staff list explains Admin vs Staff permissions and the invite flow. Purely presentational.
- Mobile plan: Add a collapsible or always-visible InfoBox component below the staff list explaining Admin (full access) vs Staff (calendar-scoped) permissions. Pure UI, no API needed.

### [LOW] Display joined date per staff member — missing
- Backend: GET /api/venue/staff (already called by useStaffList) — created_at is in TeamMember type
- Web behaviour: Each staff row on the web shows 'Joined [date]' using created_at from the GET /api/venue/staff response.
- Mobile plan: created_at is already in the TeamMember type and returned by the API. Add a formatted date line below the email in each row using toLocaleDateString with the same en-GB locale used on web.

## Bugs spotted
- [medium] The team screen shows a generic 'Team list is only available to venue admins' error state for non-admin staff and renders nothing useful. Non-admin users legitimately land on this screen from the More tab (the Team menu row is admin-gated in settings.tsx, so this scenario shouldn't arise in normal navigation — but if it does, the error message is confusing rather than gracefully absent). More importantly, the isAdmin check is derived from venue.current_user_role rather than the actual staff profile returned by /api/venue/staff/me (which is already loaded into useStaffMe). This creates a dual source of truth and the isAdmin flag will be incorrect if the VenueProvider bootstrap has stale or missing role data. (C:\Resneo-app\app\(app)\manage\team.tsx)
- [low] useStaffList receives `enabled = true` by default and gates on `isAdmin` at the call site in team.tsx — but the queryKey is queryKeys.team.list(accessToken) with no role indicator. If a non-admin user somehow reaches this screen and the query is enabled=false, the cache entry is still keyed the same way as an admin's. A subsequent admin login in the same React Query instance on the same device (e.g. after role upgrade) would return stale 'disabled' cache rather than fetching fresh data. The key should include the user's role or the enabled flag should cleanly prevent any cache population. (C:\Resneo-app\lib\queries\useStaffList.ts)
- [low] The openWebStaff function in team.tsx constructs the URL as `${getApiUrl()}/dashboard/settings` which points to the web dashboard settings root, not a team-specific page. If the web URL structure changes or getApiUrl() returns a backend API origin (not the dashboard origin), the link lands on the wrong page or fails silently. The URL should be constructed via the same webDashboardUrl helper used in settings.tsx and should point to the staff-specific anchor (e.g. /dashboard/settings#staff or with a ?tab=staff parameter when the web supports it). (C:\Resneo-app\app\(app)\manage\team.tsx)

## Design notes
- The current read-only list has no per-row actions. On mobile, a swipe-left gesture (SwipeableRow) or a long-press ActionSheet is the natural pattern for per-member actions (resend invite, change role, reset password, remove). Avoid a cluttered icon row like the web — consolidate into a single action sheet triggered by a trailing '...' button or swipe.
- The 'Invite & manage on web' button sits below the list but is easily missed when the list is long. Elevate invite as a prominent floating action button (FAB) in the bottom-right corner (admin only) to match native iOS/Android patterns for adding list items.
- Calendar assignment for staff members involves a checklist that can be long. On mobile, use an expandable accordion per staff row rather than showing all checkboxes inline — collapsed by default, expandable via a chevron tap. This avoids the 'max-h-52 overflow-y-auto' web pattern that doesn't translate to native scroll.
- The web shows a 'joined' date for each staff member but the app omits it. On a narrow mobile row, this can be tucked as a tertiary caption line (below the email) without cluttering the row.
- The session timeout security section is admin-only and deals with a venue-wide policy setting, which is less frequently needed. On mobile this is better placed in a dedicated 'Security' subsection of the admin settings area rather than inline on the team list screen.
- Password change and profile edit are personal actions that belong in a 'My account' screen accessible from the More tab profile header (tapping the user's own avatar card), rather than embedded in the team management list. This mirrors native app conventions (e.g., iOS Settings → your name card at the top).
- The current avatar in each staff row uses initials only. Adding a coloured ring to distinguish the current logged-in user from others ('You' label) would improve orientation, especially in large teams.
- Pull-to-refresh is correctly implemented; ensure the RefreshControl uses the brand tint color from the theme rather than the default grey to maintain visual consistency.
