# R41: web delta since R40, "Set up with AI" on the Services screen (2026-09-23)

From the web repo (`C:\Resneo`, `staging` at `1ae17617`), for the app. The window is everything after
the last OTA (R37 + R39 on runtime 1.1.1, 2026-09-20, audited to web `8bb76297`). R40 already
covers `8bb76297..1e9eaa94` (its report was re-checked against every commit and API route in that
range, including the deleted `resources/[id]/bookings` route, which the app never called), so the
new window is `1e9eaa94..1ae17617`. The read-only web reference `_reference/Resneo` was moved to
`1ae17617` for this round.

As always, every route the app calls was asked the three questions (request schema, response shape,
new error status). Only one commit changes what the app can do.

---

## What changed on the web

| Commit | Change | App impact |
|---|---|---|
| `16b141a1` | Salon International 2026 prize draw terms (marketing page). | None. |
| `14762278` | Emails: escaped guest text, plain-text parts, one-click unsubscribe, a test per sender. Three routes the app calls changed (`/api/venue/support`, `/api/account/delete-request`, `/api/venue/delete-request`). | None: only the email bodies changed. Requests, responses and statuses are the same. |
| `600e36c7` | **Set up with AI**: admins read an old booking page, photos, a document or a typed list with `POST /api/venue/services-setup/extract`, check drafts, and add them through the ordinary routes (`Docs/ai-services-setup-plan.md` in the web repo). | **Built, below.** |
| `62595eab` | Collectives: deleting a withdrawn service releases its members' links; the replicate cron claims only live memberships; suspended members' copies stay in step. | None for the client: server and migration only. |
| `1ae17617` | Web signup: referral or sales codes kept apart from discount codes; a failed lookup says so. | None: the app has no signup. |

Web change made for this round (uncommitted in `C:\Resneo` when written): **`GET
/api/venue/services-setup` → `{ enabled }`**, the extract route's own check (admin and the AI
configured), so the app hides the entry exactly where the web does. An older server answers 404,
and the app then shows the entry to admins; the extract route's 404 `unavailable` explains if the
AI is off. `Docs/MOBILE_API.md` and `Docs/ai-services-setup-plan.md` (§6, §9) updated.

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | **Set up with AI** beside **New service**; with no services, **Add your services in minutes** with **Set up my services with AI** and **Add a service myself**; `?setup=ai` opens it (admins, where offered). | `app/(app)/manage/services.tsx`, `lib/queries/useServicesSetup.ts` |
| 2 | The three steps in one sheet, with the web's step names: **Add what you have** (link, photos, documents, typed list, a note for the AI, the OpenAI line), **We read it** (two at a time, a timer, Retry and Remove, "Also read the pages it links to"), **Check and add**. | `components/services-setup/ServicesSetupSheet.tsx`, `SourcePicker.tsx`, `SetupShell.tsx` |
| 3 | The review as on the web: summary and progress, **For every service you add** (who offers them, buffer, online payment, "Also put them on the {collective} booking page"), things noticed, currency mismatch, filters with counts, **Find a service** from 12, headings (Rename that merges, Add ready, Skip all, Bring all back, Offered by), cards (fix/check/info notes, Edit with options, heading suggestions and calendars, Skip, Add, Undo, Update my existing service, Make it an add-on, More settings), **Add all ready** with the web's confirmation, **Finish** and the finish screen. | `DraftServiceCard.tsx`, `HeadingHeader.tsx`, `ReviewSettings.tsx`, `bits.tsx` |
| 4 | The draft model ported line for line (merge by name and heading, issues, bulk readiness, payment defaults, duplicate update, summary), with the web's tests ported; the POST body is exactly what the web's `appointmentServiceFormToPayload` sends for the same draft. | `lib/services-setup/drafts.ts`, `drafts.test.ts` |
| 5 | Add-ons: **Offer it as an add-on** is a page inside the sheet (iOS cannot stack sheets); groups "{Heading} extras" created with their links, grown, and removed by Undo. | `components/services-setup/AddonPanel.tsx` |
| 6 | **More settings** hands the draft to the Services screen's own Add service form (the setup's sheet steps aside and comes back), and a saved form marks the draft added. | `app/(app)/manage/services.tsx` (`openCreateFromSetup`, `returnToSetup`) |
| 7 | Photos: the library (several at once) or a screenshot copied to the clipboard. Resized to 2,048 px and long screenshots cut into overlapping slices, sent together, with the web's numbers, in a hidden WebView canvas: the 1.1.1 build has no image library, but it has `react-native-webview`, so this ships over the air. Android's picker names ("1000039265.png") become "Photo 1", "Photo 2". | `lib/services-setup/prepare-images.ts` (+ tests), `components/services-setup/ImagePainter.tsx` |
| 8 | Progress kept per venue in a JSON file in the app's documents folder (SecureStore caps a value's size; AsyncStorage is not in the app): 14 days, cleared when nothing is pending, and at sign-out as the web's Clear-Site-Data clears it. | `lib/services-setup/setup-storage.ts`, `providers/AuthProvider.tsx` |
| 9 | Closing the sheet with something added but not read asks first (a swipe or Back closes easily on a phone). | `ServicesSetupSheet.tsx` |
| 10 | An option's full-payment error loses its em-dash (web wording). | `components/manage/VariantsEditor.tsx` |

## Found and fixed while testing on the phone

1. **Every multipart upload in the app was refused before it was sent.** SDK 56's runtime installs
   `expo/fetch` as the global `fetch` (the app does not set `EXPO_PUBLIC_USE_RN_FETCH`), and its
   encoder refuses React Native's `{ uri, name, type }` part with "Unsupported FormDataPart
   implementation", which reached the caller as a network failure. `lib/api/form-data-file.ts`
   builds a part with `name`, `type` and `bytes()` (read through `expo-file-system`'s `File`),
   falling back to the old shape where React Native's fetch is on. Used by the setup and by the
   three older uploads: venue images (`useVenueImageUpload.ts`: logo, cover, gallery, team and
   service photos), collective page assets (`useCollectives.ts`) and compliance record files
   (`useCompliance.ts`). Proved on the device with a logo upload (then removed). **Worth checking
   whether the store build's uploads have been failing since the dependency that brought this in.**
2. **Documents in Expo Go.** The document picker's cache copy sits outside Expo Go's project folder,
   where `File` refuses to read it. On Android the setup now takes the picker's `content://` link and
   copies it into its own cache first (`stageDocument`); iOS keeps the picker's copy.

## Not done, on purpose

- **Take a photo.** The 1.1.1 build has no camera permission (no `expo-image-picker` config plugin,
  so no `NSCameraUsageDescription`), and opening the camera without it crashes on iOS. The sheet
  says to take the photo with the camera first. Adding the plugin needs a store build.
- Drag and drop (no phone equivalent).
- Help centre articles (web `resneo-app/*`) describe the app once this ships; not yet.

## Tested

- Jest: 317 suites, 3,099 tests, all passing; typecheck and lint clean. New: `drafts.test.ts` (39),
  `prepare-images.test.ts` (10), `ServicesSetupSheet.test.tsx` (5), `form-data-file.test.ts` (2).
- On the owner's Galaxy S23 Ultra (Expo Go, staging API, dev database) as sept19@resneo.com, a
  collective host: typed list, a price-list photo, a 1,080 x 4,494 screenshot (3 slices in one
  request, 36 of 36 services), a CSV and a PDF, a link that has no services (the server's advice with
  Retry and Remove); review; add one; **Update my existing service** and its Undo; **Make it an
  add-on** and its Undo (group deleted); **More settings** into the app's form and back; **Add all
  ready**; Skip and Bring back; heading Rename merging two headings; resume after the app restarted;
  **Start again**; the finish screen. New services went on the combined page, and Undo took them off
  it before deleting. Every test service, group and the logo were removed afterwards.

## To test on a device

1. iOS: the photo library (HEIC photos should arrive as JPEG), a copied screenshot, a PDF from Files,
   the sheet's keyboard behaviour on the edit fields.
2. A store (non-Expo Go) build or preview: an upload of each kind (venue image, page asset,
   compliance file, a setup document) to confirm the `bytes()` part outside Expo Go.
3. A venue with no services: the **Add your services in minutes** empty state.
4. A staff (non-admin) login: no **Set up with AI** anywhere.
