# venue-profile — parity ~22%

## App files
- app/(app)/manage/venue-profile.tsx
- lib/queries/useVenueSettings.ts
- lib/queries/useVenue.ts
- types/venue.ts
- providers/VenueProvider.tsx
- components/ui/Input.tsx
- lib/api/client.ts

## Web reference files (read-only)
- _reference/Resneo/src/app/dashboard/settings/page.tsx
- _reference/Resneo/src/app/dashboard/settings/SettingsView.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/VenueProfileSection.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/ProfileSection.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/StaffPersonalSettingsSection.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/VenueSlugField.tsx
- _reference/Resneo/src/app/dashboard/settings/sections/BookingPageSection.tsx
- _reference/Resneo/src/app/dashboard/settings/types.ts
- _reference/Resneo/src/app/api/venue/route.ts
- _reference/Resneo/src/app/api/venue/logo/route.ts
- _reference/Resneo/src/app/api/venue/cover/route.ts
- _reference/Resneo/src/app/api/venue/slug-available/route.ts

## Summary
The app's venue-profile screen (manage/venue-profile.tsx) implements only the core text-field subset of the web's Settings > Profile tab: business name, a single concatenated address field, phone (plain string, no E.164 normalisation), email, and website URL. It sends a PATCH /api/venue with these five fields and refreshes the venue query on success. The web's Settings > Profile tab is a fully featured multi-section page with: (1) structured 4-part address parsing (building name / street / town / postcode); (2) E.164 phone normalisation with country-code picker; (3) Zod validation on every field including website URL normalisation; (4) additional profile fields — cuisine type, price band (restaurant), no-show grace period, kitchen email, timezone selector; (5) personal account / password-change section (ProfileSection / StaffPersonalSettingsSection) for the logged-in staff member; (6) venue slug / booking-page-address editor with live availability check (GET /api/venue/slug-available); (7) logo and cover photo upload (POST /api/venue/logo, POST /api/venue/cover); (8) booking-page branding (BookingPageSection — full drag/crop/framing, font preset, colours, social links, about text, announcement, gallery); (9) website-embed widget and QR code (WidgetSection); (10) autosave-on-blur rather than an explicit Save button. The app provides roughly the bare-minimum text editing and an explicit save button; everything else is absent.

## Recommendation
The app's venue-profile screen delivers only name / address / phone / email / website, and even these have gaps: the address is a single blob (web uses 4 structured sub-fields), phone is not E.164-normalised (will silently fail backend validation for many common UK formats), and there is no client-side validation before the server round-trip. The most impactful first step is to fix the phone number bug (critical for any admin who enters a local-format number) and add no_show_grace_minutes and timezone — both are operationally important for appointments and already accepted by PATCH /api/venue. The structured address split is the next highest-value change as it enables usable address capture on small keyboards. After those three, add the booking-page slug editor (GET /api/venue/slug-available + PATCH /api/venue) since venue identity depends on it. Logo and cover-photo upload can follow — POST /api/venue/logo and POST /api/venue/cover are both deployed and Bearer-JWT-authenticated, so they need only expo-image-picker + FormData wiring in the app. The personal account / password section should live in a separate account-settings screen but is needed for staff who manage their own credentials on mobile. The booking-page branding Studio (booking_page_config), website widget, and QR code are suitably deferred to a web link-out for now given their complexity. All of the above (except the Studio) require only already-deployed backend routes with Bearer-JWT auth.

## Gaps (13)

### [HIGH] Structured address fields (building name, street, town, postcode as separate inputs) — partial
- Backend: PATCH /api/venue — already deployed; accepts a single combined address string.
- Web behaviour: Web parses venue.address with parseAddress() into 4 sub-fields (address_name, address_street, address_town, address_postcode), renders each as a separate labelled input, then re-joins with buildAddress() before sending to PATCH /api/venue (field: address).
- Mobile plan: Add a parseAddress() util (port C:/Resneo-app/_reference/Resneo/src/lib/venue/address-format.ts) to lib/venue/addressFormat.ts. Replace the current multiline single Input for address in venue-profile.tsx with four labelled Input components. On save, reassemble with buildAddress() before including in the PATCH payload. No new backend route required.

### [HIGH] E.164 phone normalisation and country-code picker — partial
- Backend: PATCH /api/venue — already deployed; backend calls normalizeToE164 itself and returns 400 for invalid numbers.
- Web behaviour: Web uses PhoneWithCountryField + normalizeToE164('GB') to normalise the phone number before sending to PATCH /api/venue. The API then validates the E.164 form and rejects invalid numbers (HTTP 400). The app sends the raw string the user typed, which may fail backend validation or store un-normalised data.
- Mobile plan: Add a lightweight phone normalisation util (libphonenumber-js is already available in the project or add it). Add a country-code prefix picker using a RN Picker or BottomSheet. Alternatively, present the input with keyboardType='phone-pad' plus a helper label '+ country code' and validate on save. The API normalises server-side anyway, so validation feedback is the main UX win.

### [HIGH] No-show grace period field (no_show_grace_minutes, 10–60 minutes) — missing
- Backend: PATCH /api/venue — already deployed; accepts no_show_grace_minutes.
- Web behaviour: Web renders a numeric input for no_show_grace_minutes (min 10, max 60) within the VenueProfileSection. Value saved to PATCH /api/venue with field no_show_grace_minutes. Controls when staff can mark a booking as no-show.
- Mobile plan: Add a numeric Input (keyboardType='number-pad') labelled 'No-show grace period (minutes)' with min/max validation (10–60) below the website field in venue-profile.tsx. Add no_show_grace_minutes to the state and include it in the PATCH payload. Seed from venue.no_show_grace_minutes (add to VenueBootstrap type or read from the raw GET /api/venue response).

### [HIGH] Logo upload (POST /api/venue/logo) — missing
- Backend: POST /api/venue/logo — deployed; requires Bearer-JWT auth and admin role.
- Web behaviour: Web's BookingPageSection uploads a logo image via POST /api/venue/logo (multipart form, field 'file', max 5 MB, JPEG/PNG/WebP). The returned URL is then PATCHed to /api/venue as logo_url.
- Mobile plan: Add a logo upload control to venue-profile.tsx using expo-image-picker (already standard in Expo SDK 56). On image selection, POST multipart FormData to /api/venue/logo with Authorization: Bearer <token>. On success, PATCH /api/venue with { logo_url: <returnedUrl> } and refresh the venue query. Show a thumbnail preview of the current logo_url.

### [HIGH] Booking page slug / address editor with live availability check — missing
- Backend: GET /api/venue/slug-available and PATCH /api/venue — both deployed; require Bearer-JWT auth.
- Web behaviour: Web's VenueSlugField renders an inline slug editor prefixed '/book/', validates format, calls GET /api/venue/slug-available?slug=<value> with 420 ms debounce, shows checking/current/available/taken hints, and saves to PATCH /api/venue on change. Conflict (HTTP 409) produces a field error.
- Mobile plan: Add a slug Input to venue-profile.tsx with a '/book/' prefix label (use a row layout). Add useEffect with 450 ms debounce calling GET /api/venue/slug-available. Show availability hints as caption text below the Input. Save with the rest of the form on 'Save changes' press. Add slug to UpdateVenueInput in useVenueSettings.ts.

### [MEDIUM] Website URL validation and normalisation (add https:// if scheme missing) — partial
- Backend: PATCH /api/venue — already deployed; backend rejects invalid URLs.
- Web behaviour: Web uses isValidWebsiteUrlInput() + normalizeWebsiteUrlForStorage() before sending to PATCH /api/venue. Invalid URLs are shown as a field error before the request is made. The API also validates server-side (returns 400 for invalid website_url). The app sends the raw string with no client-side check.
- Mobile plan: Add a simple URL validation helper in lib/validation/url.ts (allow bare domains without scheme; mirror isValidWebsiteUrlInput). Show an inline error under the Website Input before allowing save. This is pure UI — no backend changes needed.

### [MEDIUM] Timezone selector — missing
- Backend: PATCH /api/venue — already deployed; accepts timezone.
- Web behaviour: Web renders a text input for timezone (defaulting to 'Europe/London') in VenueProfileSection. Value saved to PATCH /api/venue with field timezone.
- Mobile plan: Add a Picker or BottomSheet-based timezone selector in venue-profile.tsx. A reasonable MVP is a text Input pre-filled with venue.timezone and validated against a short list of IANA timezone strings. Include timezone in the PATCH payload. The timezone field is important for appointment slots.

### [MEDIUM] Cover photo upload (POST /api/venue/cover) — missing
- Backend: POST /api/venue/cover — deployed; requires Bearer-JWT auth and admin role.
- Web behaviour: Web's BookingPageSection uploads a cover photo via POST /api/venue/cover (multipart form, field 'file', max 5 MB). The returned URL is PATCHed to /api/venue as cover_photo_url.
- Mobile plan: Same pattern as logo upload. Add a cover photo Image picker in venue-profile.tsx. Use expo-image-picker, POST to /api/venue/cover, PATCH /api/venue with cover_photo_url. Show a thumbnail of the current cover.

### [MEDIUM] Personal account / password change section (staff login settings) — missing
- Backend: POST /api/venue/staff/me and Supabase auth.updateUser — deployed.
- Web behaviour: Web's Profile tab shows StaffPersonalSettingsSection (appointments product admins) or ProfileSection (other roles) allowing staff to update their display name, email, phone, and password via Supabase auth.updateUser and POST /api/venue/staff/me. This is personal-account config, separate from venue-wide settings.
- Mobile plan: Create a separate app screen app/(app)/manage/account-settings.tsx for personal account settings (or add a section at the bottom of venue-profile.tsx). Implement name, email, phone, and password-change fields calling Supabase supabase.auth.updateUser for password and POST /api/venue/staff/me for name/phone. This page exists in the 'More' navigation; its implementation is also absent.

### [LOW] Booking page branding (BookingPageSection: colours, font preset, about text, announcement, social links, gallery, team profiles, show_services/team/about tabs) — missing
- Backend: PATCH /api/venue — deployed; accepts booking_page_config.
- Web behaviour: Web's Booking Page tab renders BookingPageEditor with full WYSIWYG branding controls. Saves to PATCH /api/venue with booking_page_config (brand_primary, brand_accent, about, announcement, font_preset, social_links, show_services_tab, show_team_tab, etc.).
- Mobile plan: Given complexity, this is best deferred to a web link-out from the app. The existing footnote already says 'Logo, cover photo and booking-page branding are managed on the web dashboard.' A deeper native implementation can follow if priority is raised. At minimum, add a 'Open Booking Page Settings' button that links to the web dashboard URL.

### [LOW] Website embed widget and QR code (WidgetSection) — missing
- Backend: none — pure UI using venue.slug and publicBaseUrl.
- Web behaviour: Web's Booking Page tab includes a WidgetSection showing the iframe embed snippet for the venue's booking page, embed accent colour picker, and a QR code download. Pure display/copy-to-clipboard; no new API calls beyond the venue slug.
- Mobile plan: Add a 'Website embed & QR' section to a future booking-page settings screen in the app. Generate the embed snippet from the venue slug. Use expo-clipboard for copy-to-clipboard. QR code can be generated with react-native-qrcode-svg. Low priority given admin nature.

### [LOW] Cuisine type and price band fields (restaurant venues only) — missing
- Backend: PATCH /api/venue — deployed; accepts cuisine_type, price_band.
- Web behaviour: Web renders cuisine_type (free text) and price_band (dropdown: £/££/£££) for non-appointments-product venues in VenueProfileSection. Saved to PATCH /api/venue.
- Mobile plan: These fields are restaurant-only and the app is appointments-focused. Conditionally render them in venue-profile.tsx only when venue.pricing_tier indicates a restaurant product. Add a Picker or SegmentedControl for price_band, and a plain Input for cuisine_type.

### [LOW] Kitchen email field (restaurant venues only) — missing
- Backend: PATCH /api/venue — deployed; accepts kitchen_email.
- Web behaviour: Web shows a kitchen_email field in VenueProfileSection for non-appointments venues. Saved to PATCH /api/venue.
- Mobile plan: Restaurant-only; conditionally render when not an appointments-product venue. Add an email-address Input and include kitchen_email in the PATCH payload.

## Bugs spotted
- [medium] State seeding via render (not useEffect): the block `if (venue && !seeded) { setSeeded(true); setName(venue.name ?? ''); ... }` at lines 33-40 calls multiple setState setters directly inside the render function body. In React 18 / RN 0.85, this causes a double-render and a React warning about updating state during render. It should be in a useEffect that depends on venue.id. (app/(app)/manage/venue-profile.tsx)
- [high] Phone number is saved as typed (raw string) without E.164 normalisation. The backend's PATCH /api/venue calls normalizeToE164 and returns HTTP 400 if the number is not valid. Users entering numbers without country code (e.g. '07700 900123') will receive a silent 400 error which is caught and surfaced only as 'Could not save venue details.' — no guidance to correct the input. (app/(app)/manage/venue-profile.tsx)
- [medium] VenueBootstrap type (types/venue.ts) does not include no_show_grace_minutes, timezone, cuisine_type, price_band, kitchen_email, or slug beyond the minimal bootstrap fields. The venue-profile screen seeds from venue.* but those fields are undefined in the VenueBootstrap type even though GET /api/venue returns them. TypeScript will not catch usage errors for these fields and runtime seeding will silently leave them as empty strings even if values exist. (types/venue.ts)
- [low] UpdateVenueInput in useVenueSettings.ts does not include no_show_grace_minutes, timezone, cuisine_type, price_band, kitchen_email, or slug. If these are added to the form without updating the input type, TypeScript will infer them as never-assigned unknowns, producing silent type holes. (lib/queries/useVenueSettings.ts)
- [low] The 'saved' feedback logic (`saved && !hasChanges`) creates a flash: the `saved` flag is set true synchronously in handleSave's try block, then `hasChanges` re-evaluates to false on the same render cycle. But if the user starts typing again immediately after save, `hasChanges` becomes true again and the green 'Saved.' message disappears before the user reads it. A short timeout-based clear (e.g. 2500 ms) would be more reliable. (app/(app)/manage/venue-profile.tsx)

## Design notes
- The address is a single multiline Input. On mobile this leads to confused data entry — the user sees a freeform blob of text like '12 Main St, Belfast, BT1 1AA' with no field structure. Web breaks this into four labelled fields (building name, street, town, postcode) with individual keyboard hints. Mobile should adopt the same structured layout — it is especially important for onboarding and SMS/email footers that depend on the address components.
- There is no inline field validation before the Save button is pressed. The web uses Zod + react-hook-form to surface errors per-field in real time. On mobile, surfacing errors only after a server round-trip (and only as a single inline error block) creates a poor UX loop. Add client-side validation per field (at minimum: name required, email format, phone format, website format).
- The Save button is disabled only when no text has changed from the seeded value. If the user edits a field and the edit happens to match the original value exactly (e.g. corrects a typo back to the original), `hasChanges` is false and the Save button is disabled even though the user intended to confirm. This is the classic form fingerprint issue. The web solves this with a payload fingerprint; the app should too.
- The footnote 'Logo, cover photo and booking-page branding are managed on the web dashboard.' is shown as a plain muted caption. This should be an actionable CTA — a tappable 'Open web dashboard' link (using Linking.openURL) so the user can navigate directly without leaving the app empty-handed.
- The scroll view has no keyboard-avoiding behaviour for the bottommost fields (website URL). On small devices (SE-size) the Save button can be hidden behind the soft keyboard. Wrap the ScrollView content in a KeyboardAvoidingView or use ScrollView's automaticallyAdjustKeyboardInsets={true} prop.
- The page has no current-values display for logo or cover photo. Even if uploading is deferred to the web, showing a thumbnail of the current logo_url (Image component) alongside the footnote would give the user confirmation that their branding is set and meaningful.
- Input labels use Text variant='label' with tone='secondary' — visually correct, but there is no asterisk or 'required' indicator on the Business name field, which is the only required field per the backend schema (min 1). Adding a subtle '*' or '(required)' hint prevents empty-name saves and the resulting error.
