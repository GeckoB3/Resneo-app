# R42: web delta since R41, the combined page's embed code and QR code (2026-09-23)

From the web repo (`C:\Resneo`, `staging` at `50d32e2b`), for the app. R41 covered web
`1e9eaa94..1ae17617`, so this round is `1ae17617..50d32e2b` (five commits). The read-only web
reference `_reference/Resneo` was moved to `50d32e2b`.

Every route the app calls was asked the usual three questions (request schema, response shape,
new error status). No route changed. One commit changes what an admin can do.

---

## What changed on the web

| Commit | Change | App impact |
|---|---|---|
| `ea80dab2` | Staff sign-in: a newly invited member's first dashboard load no longer bounces to signup. The email fallback accepts the caller's own claim as well as unclaimed rows, and "not staff" is no longer cached. | None. Server only. The app's Bearer requests use the same lookup (`getVenueStaff`), so an invitee signing in to the app first gets the fix too: a 401 from `/api/venue/staff/me` no longer sticks for 30 seconds. |
| `fa9c120f` | `GET /api/venue/services-setup` → `{ enabled }` (made for R41). | Already used by the app since R41. |
| `4a05756e` | **The combined booking page gets its own embed code and QR code**: Settings, Booking Page's combined scope shows "Share & embed" locked to the collective (host and members, when it is active with two or more active members); `buildCollectiveEmbedSnippet`; the QR code is named after the page it opens; Manage Collective links to "Combined booking page settings". | **Built, below.** |
| `01403a68` | Embeds keep the widget in view between steps and pin the service bar to the visible edge of the host page. All in `public/embed/resize.js` (served from resneo.com) and the embed routes. | None. The paste-in code is unchanged, so codes copied from the app get it too. |
| `50d32e2b` | The Aura demo site (`/embed-test-page`). | None. |

## Done in the app

| # | Change | Where |
|---|---|---|
| 1 | `buildCollectiveEmbedSnippet` (`/embed/c/{slug}`, same accent parameter), sharing one builder with the venue snippet as the web now does. A half-typed accent is left out. | `lib/embed/embedSnippet.ts` (+ tests) |
| 2 | The Booking page screen's **combined view** now ends with **Embed on your website** and **QR code** for the combined page, for the host and for members, once the collective is active with two or more active members (`combinedScopeEmbedTarget`). The embed copy names the collective; the accent caption adds the web's line about the combined page's own colour and the shared setting. | `app/(app)/manage/booking-page.tsx`, `components/bookingPage/EmbedAndQrSection.tsx`, `lib/linked/collective-page.ts` |
| 3 | The own page's **What to embed** choice (web `WidgetSection`, never built in the app: R7 left it optional): "My venue only ({venue})" or "Venue collective: {name}" for each active collective the venue is an active member of with two or more active members (`collectiveEmbedOptions`, no page-mode check, as on the web). The code and the QR code follow the choice. | same |
| 4 | The QR code opens the address guests use (an adopted member's `/book/{slug}` included) and is named after the page it opens; its caption says "the combined booking page" when it opens one. | `components/bookingPage/BookingPageQrCard.tsx` (`label`, `combined`) |
| 5 | Manage Collective: **Combined booking page settings** under the intro opens the Booking page screen, which opens on the combined page while the collective is live. | `app/(app)/collective-area.tsx`, `lib/collective-area/copy.ts` |
| 6 | The embed card moved out of the screen into one component used by both scopes; the colour input became `components/bookingPage/ColourField.tsx`. The accent stays one venue setting, autosaved by the screen, so both scopes edit the same value. | `EmbedAndQrSection.tsx`, `ColourField.tsx` |
| 7 | "Accent colour saved." fades after 2.5 s, as on the web (it stayed forever, and read as stale after switching scope). Two em-dashes in the QR card's messages went ("The QR code is still loading. Try again in a moment.", "Booking QR code for {page}"). | `booking-page.tsx`, `BookingPageQrCard.tsx` |

## Tested

- Jest: new and updated tests in `embedSnippet.test.ts` (+3), `collective-page.test.ts` (+3),
  `BookingPageQrCard.test.tsx` (+1), `booking-page.test.tsx` (+7: combined embed and QR, a member,
  an adopted address, the shared accent, the What to embed choice, the fading confirmation, a
  page that is not live). Typecheck and lint clean.
- On the owner's Galaxy S23 Ultra (Expo Go, staging API, dev database) as sept19@resneo.com, the host
  of "Sept 19 and Sept 20":
  - Combined view: the embed card shows `/embed/c/sept-19-and-sept-20`; an accent typed there saved
    and appeared in the code; **Copy code** copied it; the QR code was compared module by module
    with the `qrcode` package's matrix for `/book/c/sept-19-and-sept-20` (0 of 1,089 modules
    differ) and is captioned with the collective's name; **Share QR code** opened the share sheet
    with the image (closed without sending).
  - Own page: **What to embed** listed "My venue only (Sept 19 Hair)" and the collective; the accent
    set in the combined view was there; choosing the collective switched the code to `/embed/c/…`
    and the QR code to the combined address (0 modules differ), and back to `/book/sept-19-hair`
    (0 differ).
  - The accent was cleared again afterwards; the confirmation faded.
  - Manage Collective: **Combined booking page settings** opened the Booking page on the combined
    view; Back returned.

## To test on a device

1. A member venue's login (sept20@resneo.com): the combined view's embed and QR code (read-only
   manager above them).
2. A collective that adopted a member's address: the QR code opens that member's `/book/{slug}`.
3. iOS: the share sheet's title reads "Booking QR code for {page}".
