# Changelog

Notable changes to the Resneo staff app, newest first.

Versions are **per platform** — iOS takes the root `version` in `app.json`, Android
takes `android.version`, and the two legitimately differ because the stores were
seeded at different points. Build numbers (`versionCode` / `buildNumber`) are
managed remotely by EAS, so they aren't listed here.

The **Play / App Store** block under each release is the copy for the store's
"What's new" field, which Google caps at **500 characters** and Apple at
**4,000** — keep it inside that or the upload is rejected. The two platforms
need **separate copy**: a feature present on one is not automatically present
on the other, and iOS 1.0.4 is the worked example.

---

## Unreleased OTA: POS app step 1 (iOS 1.2.0 / Android 1.1.2)

JavaScript only, for both runtimes; the native diff is empty (no module, no `app.json` native
config, no `eas.json` or native dependency change). Every new screen, tile, button and report tab
is behind the venue's resolved `feature_flags.resolved.pos_enabled` (POS plan §4.22, test plan
DEV-04 / APP-08). With it off, or against a web deploy that does not send it, the app is exactly
as before: "Take payment" and `/charge`, the four-option Reports control, no Checkout tile and not
one `/api/venue/pos` request; the one change every venue gets is `client_build` on push registration
(app step 2, below). Needs the web's POS Pass 1 (and Pass V, Pass 2 for app step 2, and Pass 4
and Pass LC for app step 4) on the server.

- **Foundations (P7-1).** `feature_flags.resolved.pos_enabled` is read (`lib/pos/pos-enabled.ts`).
  A sale API client (`lib/pos/api.ts`) sends `X-ResNeo-Client` (platform, store version, update
  id) and `x-pos-device` on POS requests only. React Query hooks for the bootstrap, catalogue,
  queue, sale lists, one sale and every sale write (`lib/queries/usePos.ts`): each write sends the
  sale's `version`, and a 412 `POS_SALE_STALE` swaps in the fresh sale it carries. Every write
  that creates something carries a `client_request_id` minted once per tap. Capabilities come
  from the POS bootstrap, and every action they do not allow is hidden.
- **A card collector for sales (F2).** `lib/payments/useSaleCardPayment.ts` takes Tap to Pay or
  the WisePad 3 through `POST /api/venue/pos/sales/[id]/payments` with `method: 'card_app'`, on
  the venue's existing Terminal Location. It is built beside the booking path, which is unchanged;
  the two share only the Terminal driver. It gives up after five minutes and cancels its own
  attempt (`.../payments/[paymentId]/cancel`), and also cancels after a decline or a staff cancel;
  an ambiguous confirm is never cancelled. The webhook settles the payment, never the app.
- **Checkout (P7-2).** A Checkout tile in More's workspace opens Checkout home: Ready to check
  out, Open sales (parked and part paid) and All sales with a search, New sale, and "Your sales
  and tips" for logins that may read the reports. "Check out" replaces "Take payment" on the
  booking detail and opens the booking's sale, or starts one with the rest of its visit. The sale
  screen: lines; services from the catalogue with who did them (a walk-in in their diary); custom
  items and fees; price changes with a reason; discounts with presets, held to the staff limit;
  the client; who is serving; park and resume; combine with another open sale; void; "Refund and
  cancel"; a waiting card payment can be cancelled.
- **Paying.** The amount now (the whole balance, part of it, or an even split); cash with what was
  handed over, the change and "keep the change as a tip"; the venue's other payment types with
  their reference; card by Tap to Pay or the Bluetooth reader, with the app's own tip screen first
  when tipping is on (Tap to Pay takes no on-reader tip, P7-2). Typed tips for cash and other.
- **The money after the sale (P7-3).** The completed sale with its summary and change; receipts by
  email or text, resent at any time ("No receipt sent. You can send one from the sale."); the
  refund builder (by amount or items, cards first, back to the original payment; cash or another
  type for admins only, D44); changing a tip's split (`edit_tips`) and who gets credit for a line
  (`edit_credit`).
- **Reports (P7-4).** Where `GET /api/venue/reports/pos-access` says so, Takings and Sales join the
  tabs, which become a scrollable chip row with Revenue renamed "Booked value". Elsewhere the
  four-option control is unchanged.
- **On the web.** Admins at POS venues get "Checkout settings" and "Records, reports and exports"
  under a new More group, "On the web".
- **Gift vouchers and account credit (the Pass V app step, UX spec §13.13, §20).** Everything
  follows the POS bootstrap's `vouchers` (`selling`, `redeemable`), which a server before Pass V
  does not send, so against it nothing below appears and no voucher route is called.
  - *Selling.* A "Gift vouchers" tab in Add items, while vouchers are on and set up on the web, for
    logins with `create_sale` and `take_payment`: a tile per preset and "Another amount" within the
    venue's range (`GET /api/venue/pos/voucher-settings`); who it is for, the recipient's name,
    email and a message of up to 300 characters; print or hand over, email now, or email on a date
    (8am venue time, tomorrow to a year ahead); an email for a walk-in buyer. The `gift_card` line
    shows who it is for and how it goes out, has no discount, and opens the same form to change or
    remove it before payment. The body never carries a code.
  - *Paying with a gift voucher.* The code field never autofills or suggests; it accepts any case,
    spaces and dashes, refuses a code that is not one before sending, sends the code only in the
    body of `POST /api/venue/pos/vouchers/lookup`, and clears it once the voucher is found. The
    voucher card shows its status, balance, use-by date and who it is for; the amount starts at the
    smaller of the balance and what a voucher may pay (never the sale's voucher lines,
    `vpay.notForVouchers`). Used up, cancelled, on hold and expired vouchers say so in plain words.
    "More than it holds" offers to take what is left.
  - *Account credit.* Offered when the sale's client has some, with what they have; while credit is
    on the sale, the client cannot be changed (`cpay.clientLocked`).
  - *After the sale.* The vouchers the sale made, ready or with their email date, and "Share or print
    the voucher", which downloads the PDF with the Bearer token and opens the share sheet (the
    existing `downloadAndShareFile`; no new native module).
  - *Refunds.* Voucher and credit payments are refundable, back to the voucher (or to the client's
    credit once the voucher has run out, which needs a client) and back to credit; admins may also
    refund money to credit. A voucher line refunds only what is left, and only an admin once part is
    used.
  - *The client profile.* A read-only "Credit and vouchers" card, at venues with gift vouchers on.
  - Not in this step: scanning a voucher's QR code with the camera (a keyboard-mode scanner works,
    as it types), extending an expired voucher, adding an existing voucher, goodwill credit, and
    the voucher sheet's actions. Those stay on the web.
- **Card payments (app step 2, POS plan P7-8 and P7-9, UX spec §13.4, §23).** Each piece follows the
  POS bootstrap's `card_methods` (`card_reader`, `send_to_phone`, `pay_link`), which a server before
  Pass 2 does not send, so against it none of this appears.
  - *The build and the phone's card capability.* `X-ResNeo-Client` on POS calls now ends `pos=2`,
    the POS app step the web compares before sending this phone a sale from its till. Every push
    registration (`POST /api/v1/me/devices`) sends the same string as `client_build`, for every
    venue (the one change outside the POS screens: a field the web stores and otherwise ignores).
    At a POS venue that takes cards in person, the registration also says `card_capability`
    (`tap_to_pay` on an iPhone XS or later or a capable Android phone, `wisepad` with a paired
    Bluetooth reader, else `none`) and `tap_to_pay_terms_accepted` (Apple's answer from the
    warm-up; Android has no terms step), and is sent again when that changes. An iPad never reports
    Tap to Pay. The app's own card payments (`card_app`) also send `reader_type`, which a server that
    does not read it yet ignores.
  - *A sale sent from the web till (plan §4.36).* The `pos_collect_request` push (Android channel
    `bookings-new`) opens the collect screen. Pushes can be late or lost, so "Waiting for you" on
    Today and a banner above every staff screen read `GET /api/venue/pos/collect-requests?mine=1`
    on opening, on coming to the foreground and every 20 seconds, only on a phone that can take a
    card here. The screen shows the amount, the sale, the till, who sent it and the client; the
    app's tip screen when the venue takes tips; then the same card screen as the app's own sale
    payments (Apple's exact name and button, the processing state, the warm-up, "How to use Tap to
    Pay on iPhone"). The button claims the payment (`POST .../payments/{id}/claim` with this phone's
    registration id, `reader_type` and the tip), reports `collecting`, and reads the card. Outcomes:
    paid; declined (the same PaymentIntent stays open, so the button tries again); a card that
    wants chip and PIN (cancel, then a pay link, or the desk's reader when there is one; never chip
    and PIN on the phone); no card in 5 minutes (cancelled with `reason: 'timed_out'`); the desk
    cancelled (read every 3 seconds); another phone took it, it was sent to someone else or nobody
    took it in time (the server's sentence); Stripe's three-business limit on an iPhone.
  - *The counter reader.* "Card reader" in the payment sheet chooses a reader (status from Stripe)
    and sends the amount (`method: 'card_reader'`), then follows
    `GET .../payments/{paymentId}/reader`: waiting, confirming, declined with "Try again" on the
    same PaymentIntent, paid, moved away, cancelled, failed or checking, in the server's words. The
    sale screen follows a reader payment already waiting and can cancel it.
  - *Pay by link or QR code.* For the whole bill or the part typed, with a tip on the client's
    phone when the venue allows it on links. The QR code is drawn on the phone; the link can be
    copied, shared, texted or emailed (the client's details filled in and editable) or cancelled.
    The sale lists links still waiting (Show QR code, Cancel link), and a visit paid in full with no
    tip offers "Send a tip link" (`amount_pence: 0`, `kind: 'tip_only'`).
  - *Cards on file.* With cards on file on, `charge_saved_card` and a client on the sale, each saved
    card is a method with when and where the client agreed; it asks first, then charges. A decline
    says why, holds the sale until "Choose another way to pay" cancels it, and offers a pay link
    when the bank wants the client to confirm. Before a Tap to Pay or WisePad 3 read, the phone is
    handed to the client, who answers "Save your card for next time?" with two equal buttons; a yes
    collects with `allowRedisplay: 'always'`, and staff are told whether the card was kept. The
    client profile lists saved cards with "Remove card" (`take_payment`).
  - *Payouts and fees, for admins.* Reports, Takings: each payout's arrival date, amount, Stripe's
    fees and status, opening to what it covered. Instant payouts are v1.x.
  - Not in this step: the Finish and pay toast, saving a card at online booking and instant payouts
    (all v1.x); asking to save the card on the counter reader (the web till's tick); a push that
    tells the phone the desk cancelled (the phone polls instead).
- **Products and stock (app step 4, the Pass 4 half: POS plan P7-12, P7-13, P7-14; UX spec §6,
  §13.6).** Everything follows what a Pass 4 server sends (the catalogue's `products`, the
  bootstrap's `track_stock_enabled`, the line's `product`), so against an older server the sale
  screen is exactly as before and the stock screens are not offered.
  - *Products at the till.* Add items gains Favourites (product options and services, or the best
    sellers until an admin chooses favourites) and Products, searched on the server. A tap adds
    one, or opens "Choose an option"; a second tap adds one more to the same line. The search field
    takes a keyboard-mode scanner (the code and Enter): the barcode is looked up exactly
    (`GET /api/venue/pos/catalogue?barcode=`), with "No product has the barcode ..." and "Search
    instead", or the server's sentence for a product the till may not sell. Each add says what
    happened, with the stock warnings (below zero, held for online orders) and the age reminder
    for an 18+ product; a venue that does not sell beyond its count is refused before anything is
    sent. Product lines show the 18+ chip and "Stock count below zero" or "{n} left", and their
    quantity can be changed. Lines carry who is serving as the seller.
  - *Refunds.* "Put back in stock" (unticked) on each product line chosen, sent as `restock`.
  - *Products and stock.* A "Products and stock" tile in More's workspace for every team member
    (read only without `manage_products`): products by name, brand, SKU or barcode, low stock and
    archived; a product with its options (price, SKU, barcodes typed or scanned, and with Track
    stock on, cost, counting, reorder level and quantity, a starting count), the VAT category,
    how it is used, "Not sold online" and "Age restricted (18+)", photos from the library or the
    camera (expo-image-picker, already in the binaries), archive, unarchive and delete. An edit
    sends only what the app shows; the description, sizes, supplier and maker's details stay as
    they were (and on the web). With Track stock on: the tiles, stock levels (all, low, out, below
    zero), adjustments with a reason (`adjust_stock`, one request id per sheet) and each option's
    movement history.
  - *Stocktakes.* Start (full, or by category or brand), count by typing, +1 or a keyboard-mode
    scanner, several people at once (read every 10 seconds), review the differences, "Update
    stock" (`commit_stocktake`, with "count anything not counted as zero" on a full count) and
    cancel. Counts are kept on the phone first (a file per stocktake, dropped at sign-out), so
    with poor signal counting carries on and they are sent, each with its own request id, when
    the phone is back online.
  - *The client page.* Lifetime and average spend, and the products they bought, from
    `GET /api/venue/guests/[guestId]/purchases` (the plan had them on the guest GET; the web
    serves them from their own route).
  - *On the web.* "Suppliers, labels and stock set-up" and "Commission rates and report" for admins.
  - Not in this step: camera scanning (expo-camera is in the binaries but no screen uses it yet),
    purchase orders, receiving and "Use stock" (P7-15, the web half is still being built), the
    `retail_low_stock` push (the web sends only the daily email) and photo reordering.
- **Loyalty cards and commission (the Pass LC app step, PLC-8; UX spec §21, §22).** Loyalty follows
  the venue's resolved `pos_loyalty_enabled`, which a server before Pass LC does not send.
  - *Reward ready.* A chip on the sale when its client has a reward waiting, listing the rewards
    with "Use the reward" (`take_payment`, `POST .../loyalty-reward` with the sale's version), or
    why a free service cannot go on yet. The discount shows in the server's words.
  - *The loyalty card* on the client page: the stamps, a reward waiting and its use-by date, the
    history, and "Add or remove stamps" for admins and `adjust_loyalty`.
  - *Your sales and tips* now reads `GET /api/venue/pos/commission/report?mine=1` for every team
    member, today, this week or this month, with their commission when they hold
    `see_own_commission`. It replaces app step 1's reading of the Takings and Sales reports.
  - "Loyalty card set-up" joins the web rows for admins while loyalty is on.
- **Camera scanning (over the air with app step 4, UX spec §13.6).** `expo-camera` with barcode
  scanning has been in the binaries since 1.1.2, so this is JavaScript only; the permission prompt
  shows the purpose string those binaries carry. A camera button sits beside every field that
  takes a code, and typing or a keyboard-mode scanner still works as before:
  - *Add items at the till:* scan one product after another; each is looked up exactly and added,
    with what happened shown over the picture (the same words and warnings as a typed scan).
  - *Stocktakes:* count by scanning, several in a row; each code counts once while it stays in
    view, so holding a box up counts it once and the next unit counts after a pause.
  - *A product's barcodes, the products search and a gift voucher's code* (its PDF carries the code
    as a QR code; the scanned code only fills the field).
  - The camera asks in plain words before the phone does ("ResNeo needs your camera to scan
    barcodes."), says how to turn it back on when it was refused, and has a torch and Cancel.
  - A UPC-A code is matched with or without the 0 an iPhone reads in front of it, at the till and
    in stocktakes, so a camera scan finds what a keyboard scanner stored.
- **Cash-up (app step 3, POS plan P7-10; UX spec §7, §13.5).** Everything follows the venue's
  Count cash in till sessions (`cash_management_enabled`, from the POS bootstrap and
  `GET /api/venue/pos/sessions`); with it off, or against a server before Pass 3, nothing below
  appears and no session route is called. P7-11 (printers, the cash drawer and personal PINs) is
  v1.x. The client build now says `pos=3`, which is what the web checks before it sends the
  cash-up reminder.
  - *The Till card on Checkout* says which tills are open or closed, and a till left open from an
    earlier day, and opens the Till screen.
  - *Opening* (`open_close_till`): the float, filled with what was left last time or the usual
    float, as one amount or counted by notes and coins (£50 to 1p, and bagged coin). One request
    id per sheet; "already open" on another device shows the server's sentence and the open till.
  - *During the day* (`paid_in_out`): paid in (bank, float, something else) and paid out (petty
    cash, supplier, staff expenses, something else), each with a note and a receipt photo from the
    library or the camera (`expo-image-picker`, in the binaries since 1.1.2; uploaded to the
    session's private `attachments` first); safe drops; tips paid out to the people with cash tips
    waiting (`GET /api/venue/pos/tips/cash-due`). Each open till lists what went in and out of
    the drawer, with the photo.
  - *Closing:* a blind count (the expected figure shows before counting only when the venue turned
    blind counts off and the person may see expected cash), the result (balanced, over or short;
    the expected figure only with `see_expected_cash`), a reason when it is out by more than the
    venue's threshold (`POS_VARIANCE_REASON_REQUIRED` goes back to it), one recount, then the cash
    to the bank and the float left, which must add up to the count.
  - *X and Z reports* on screen in the spec's order, shared as the PDF through the share sheet
    (`report.pdf`), and a Z report emailed to the admins.
  - *End of day* for admins and `see_expected_cash`: any day in the last 400, the takings tiles,
    each till counted against expected, takings by method, deposits and fees, tips by person,
    refunds, online orders waiting and cash outside a till session. The evening email switch
    stays on the web.
  - *Cash with no till open:* a cash payment or cash refund refused with
    `POS_TILL_SESSION_REQUIRED` offers "Open the till" right there (choosing the till when there
    are several), and a sale with no till is put on the till just opened, so its cash counts there.
  - *The `pos_cash_up_reminder` push* opens the Till screen (another business's reminder says to
    switch first), and "Cash-up reminders" joins Push notifications at POS venues.
- **Purchase orders, deliveries and Use stock (app step 4, the Pass 5 half: POS plan P7-15; UX
  spec §6.12 to §6.14, §13.6).** Only with Track stock on; against a server before Pass 5 the
  Orders tab answers with the server's refusal and nothing else changes. Batch and expiry are v1.x.
  - *Orders* on Products and stock: open, received, cancelled or all, with the supplier, items
    received of ordered, the expected date and the total at cost. "New order"
    (`manage_purchase_orders`): choose the supplier, then "Suggest an order" (everything from them
    at or below its reorder level, in whole packs) or "Start an empty order". Suppliers are listed
    read only; adding and changing them stays on the web.
  - *A draft:* quantities and unit costs, remove a line, "Add a product" (the supplier's products
    first, searched, typed or scanned), "Suggest an order", the expected date and notes, the total
    and the supplier's minimum; "Save order" with the version (another person's save loads theirs),
    "Send to supplier" (asks first, needs the supplier's email), "Cancel order", and the PDF
    through the share sheet.
  - *Receiving* (`receive_stock`) a sent or part received order: scan items as they are unpacked
    (typing, a keyboard-mode scanner or the camera, several in a row), each adding one to its line;
    something not on the order is offered as an extra; "Everything arrived"; the received quantity
    and unit cost per line, more than ordered with a warning; a delivery note reference; then "Add
    {count} items to stock" with one request id and the order's version. Deliveries so far are
    listed on the order.
  - *Record products used* (`record_professional_use`) from Products and stock (today's bookings,
    or none) and on the booking detail at POS venues (that booking), for products used in
    treatments, with a note.
- **Online orders (app step 5, the P7-16 part: POS plan P7-16; UX spec §8, §13.7).** Orders follow
  `manage_orders` from the POS bootstrap and the venue's resolved `pos_online_shop_enabled`; the
  routes stay open with the shop off, so the tile also shows while new paid orders wait. P7-17
  (recommendations, checkout suggestions, promotion codes, set-aside orders, ordering for a
  client) and the v1.x order jobs (return requests, lost in transit) are not here. The client
  build now says `pos=5`, which is what the web checks before it sends `shop_order_new`.
  - *An Orders tile* in More's workspace, with the count of new orders, and "Online shop settings"
    under On the web for admins while the shop is on.
  - *Orders:* to do, ready to collect, sent, done, cancelled and all, with counts; a search by
    order number, name or email; each row's status, collection or delivery, items, total, when it
    was placed and its flags (not collected by, return recorded, refund due, refunded). A pickup
    code typed or scanned from the customer's QR code opens the order with the code filled in.
  - *An order:* start preparing; mark ready (asks first, then the customer is told); mark collected
    after checking the pickup code, typed or scanned (or "They don't have the code" and a tick that
    staff checked who it is); mark dispatched with the carrier, tracking number and link (filled
    for known carriers), change tracking, mark delivered; cancel and refund in full with a reason;
    refund or return chosen items (and the delivery) to the card, putting counted items back in
    stock, with the return window warning; record a return, goods received and proof of sending.
    Items, collection or delivery, returns, payments and refunds, the customer, messages and the
    timeline follow. Every refusal shows the server's sentence.
  - *The packing slip* opens on the web, where it prints (there is no slip PDF route yet).
  - *The `shop_order_new` push* opens the order (another business's says to switch first). An
    Android "New online orders" channel with the order alert sound bundled since 1.1.2 is created
    over the air; the web still sends these pushes on `bookings-new`, so it is unused until the
    web names it.
- **The web's contract changes of 2026-10-09 (`Docs/MOBILE_API.md`, POS and retail).**
  - *Stock value tiles.* `value_cost_pence` and `value_retail_pence` are null for staff without
    `view_reports`; the "Stock value at cost" tile is hidden then, where it read £0.00.
  - *A voucher on hold.* `VOUCHER_FROZEN` now reads as the server's sentence, which names no
    reason ("An admin can check why in Gift vouchers"). The voucher look-up's new `on_hold` says
    why, and the pay panel says "payment dispute" only for `dispute`, as the web till does.
  - *Reward ready.* A "Reward ready" chip on Ready to check out rows whose `reward_ready` is true
    (`queue.chip.reward`); an older server sends nothing and shows no chip.
  - *A reused request id* (409 `CONFLICT` with `reason: 'request_reused'`, `POS_REQUEST_REUSED`
    before) shows the server's sentence, reads the sale again whatever the write was, and the
    cash, other-type and refund sheets make a new request id for the next try, so the refused id
    is never sent again (a lost answer still keeps its id). The pay link, reader, saved card and
    voucher panels already made a new id after any refusal.
  - *Checked, no change:* the app calls none of the settings lists (tills, payment types,
    discount presets, favourites, commission rates), so their 409 `CONFLICT` and the DELETE
    `version` rule do not reach it; it sends the sales list only `status=open` and a search the
    server cuts to 100 characters, so the new 400 `VALIDATION_FAILED` cannot arise; every reading
    of `balance_due_pence` already treats 0 and below as nothing due; push registration only logs
    a failure, and the device 400's new `code` and `fields` keep `details`, which the field message
    still reads.
  - *"New online orders" in Push notifications* (`shop_order_new`, one of the web's
    `STAFF_PREFERENCE_KEYS` since 2026-10-09), next to "Cash-up reminders" at venues with the
    online shop on; on unless turned off. The web now sends the push on the `shop-orders` channel
    with `order_alert.wav`, which the app step 5 channel already matches, so the order sound plays.

---

## Unreleased OTA: the web's POS Pass 0 (iOS 1.2.0 / Android 1.1.2)

JavaScript only, for both runtimes. Each change is additive: against a server without POS Pass 0
the app behaves exactly as before.

- **Cash and other payments carry a key.** Take payment sends `client_request_id` when recording
  cash or another method, and keeps the same key across a failed or timed-out attempt at the same
  booking, method and amount. A server with Pass 0 records the payment once and echoes the first
  one (`replayed: true`), so a retry after a dropped connection can no longer record it twice.
  The key is cleared on success (`lib/payments/external-payment-key.ts`).
- **Delete is hidden for bookings with payment records.** The booking detail GET now serves
  `can_delete`; when it is false (a deposit, payment or fee is on the booking) "Remove from diary"
  is not offered. The server refuses such a delete with 409 `BOOKING_HAS_MONEY` either way, and
  older builds show its sentence in their toast.
- **A swept card attempt says so.** The web cancels a card attempt left pending for an hour. If
  the collect screen is still open when that happens, staff now see "This payment timed out.
  Start it again." instead of Stripe's own error (`isServerCancelledAttempt`). A staff cancel at
  the reader is unchanged.

---

## Unreleased: iOS 1.2.0 (Android stays on 1.1.2)

A native iOS release for **Tap to Pay on iPhone**, now that Apple has granted the distribution
entitlement (2026-10-01). Android is not rebuilt: it keeps runtime 1.1.2 and its updates.

**Why it has to be a store build.** The entitlement
(`com.apple.developer.proximity-reader.payment.acceptance`) is in `ios.entitlements` in
`app.json`, so the App Store profile has to carry it. The build also compiles the
`modules/tap-to-pay-education` module (Apple's merchant education, iOS 18+) and the two
`patches/expo-modules-*` for the first time on EAS.

**The iOS runtime moves to 1.2.0.** `app.json` root `version` is 1.2.0 and `android.version`
1.1.2. From this commit on, iOS updates from `main` reach 1.2.0 installs only; iOS 1.1.2 installs
keep the 2026-10-07 update, and a fix for them is published from a branch cut before the bump.
`TAP_TO_PAY_IOS_ENABLED` is `true` in the source, in the same commit, so it can never reach an iOS
install without the entitlement.

**App changes:**

- **Tap to Pay on iPhone**, built to Apple's checklist v1.7 (PR #5, details in
  `Docs/TAP_TO_PAY.md`): a full-screen introduction with Apple's artwork, More → Tap to Pay on iPhone
  (set-up by an admin, "ask an admin" for everyone else, progress, how to use), Apple's
  terms at first use, Apple's education after the terms, the reader prepared at launch and on
  return to the app, the payment button with Apple's name and symbol, processing and outcome
  screens, receipts to share, and a notification when a payment fails while the app is in the
  background.
- Offered only on an iPhone XS or later, never on an iPad.
- Clear messages when the iPhone has no passcode, a phone call is active, or the phone or
  business has been blocked.
- Settings shows each platform's own version.

**After Apple releases it:** set `ios.latest` to `1.2.0` in the website's `app-version.json`, so
iOS 1.1.2 users are prompted to update.

### App Store: "What's new"

```
Tap to Pay on iPhone

Take contactless payments right on your iPhone, with no extra hardware. Clients can tap a contactless card, Apple Pay or another digital wallet on your iPhone to pay for their appointment. An admin turns it on in More > Tap to Pay on iPhone and accepts the terms once, then anyone at your venue can take a payment from an appointment with Take payment > Tap to Pay on iPhone. Needs iPhone XS or later.

Card readers still work as before, for cards that need to be inserted.
```

---

## OTA on iOS 1.1.2 / Android 1.1.2: first update, published 2026-10-07

The first update on runtime 1.1.2, from `3610a3c`: the four commits after the store build
(`287a871`) plus the update prompt. JavaScript only: no package, lockfile or `app.json` change
since the build. The checks are the 2026-10-07 run in `Docs/GO_LIVE_CHECK.md`.

- **R44, the web's 2026-10-01 QA fix round** (details in `Docs/APP_GAP_REPORT_R44_WEB_DELTA.md`):
  - Pausing a calendar that still has upcoming bookings warns first, with the list and what
    happens to them. Its column stays on the diary, marked Paused, on any day it has bookings, and
    takes nothing new.
  - Removing a calendar says what really happens. While it has upcoming bookings it cannot be
    removed, and the sheet lists them.
  - A collective host deleting a service that has upcoming bookings no longer takes it off the
    combined page first: a refused delete changes nothing.
- **Sheets on Android:** swipes and drags work inside sheets again, and footers clear the
  navigation bar.
- **Compliance records:** a Checkboxes answer shows its option labels.
- **Store-update prompt:** reads `app-version.json` from the website and shows "A new version is
  available" (can be put off) or "Update required". Dormant: the file says 1.1.2 on both platforms.
- **Tap to Pay on iPhone groundwork** (Apple's checklist v1.7): built but switched off on every iOS
  1.1.2 install, which has no entitlement. Shared reader code changed for Android Tap to Pay and
  the Bluetooth reader: global reader events are filtered, and the Terminal provider mounts on the
  build rather than on the venue setting, so turning in-person payments on or off no longer
  rebuilds every screen.

---

## iOS 1.1.2 / Android 1.1.2 — 2026-09-26

A native release, built from `287a871` (iOS build 24, Android build 18): Expo SDK 57, and the native pieces the
point of sale work will need, so that its app steps can ship over the air instead of waiting for a
store build. The build-day checks are in the 2026-09-26 run in `Docs/GO_LIVE_CHECK.md`.

**Why it has to be a store build.** Every item below changes native code or native config:

- **Expo SDK 56 to 57.** `expo@57.0.25`, `react-native@0.86.3` (React stays 19.2.3), Reanimated
  4.5.1, Worklets 0.10.1, Gesture Handler 2.32, Screens 4.26, and every `expo-*` package on its SDK
  57 version; `jest-expo` and `eslint-config-expo` 57, with `@react-native/jest-preset` 0.86.3 now
  declared because `jest-expo` 57 takes it as a peer. This fixes the Hermes V1 memory regression
  `expo-doctor` has flagged since 1.0.7 (fixed from `expo@57.0.9`); `expo-doctor` passes 21/21.
- **Stripe Terminal `0.0.1-beta.31` to `0.0.1-beta.33`** (native 5.8.0). On Android 12 and later a
  card payment asks for approximate location rather than precise. Details in `Docs/TAP_TO_PAY.md`.
- **Camera.** `expo-image-picker`'s plugin with a camera purpose string and no microphone, and
  `expo-camera` with barcode scanning on and the microphone off (unused until POS scanning).
  Android no longer declares `RECORD_AUDIO`: 1.1.1 did, because prebuild applies the image picker's
  plugin automatically with its defaults, which also gave 1.1.1 a generic camera string on iOS.
- **The online order sound**, `assets/sounds/order_alert.wav`, bundled through `expo-notifications`
  for the shop's order alert (POS Pass 6). Unused until then. It has to be in the binary, and an
  Android channel's sound cannot change once the channel exists.
- **Android App Link for `/account/orders`.** An order link opens the customer hub until the app
  has an Orders screen. iOS needs no build for this: its paths come from the website.
- **`eas.json` pins the iOS build image** to SDK 57's `macos-tahoe-26.5-xcode-26.6` on every
  profile, so a build cannot drift to Xcode 27, where an SDK 57 app without scene support does not
  launch.

**The runtime moves to 1.1.2.** `appVersion` stays the policy. Nothing published from this commit
on reaches a 1.1.1 install; those keep group `1f4a0bed` ("ResNeo R40 to R43 Web Parity", at
`fc2a2dd`). A fix that must reach 1.1.1 before the stores release 1.1.2 has to be published from a
branch off `fc2a2dd`.

**App changes:**

- Set up with AI: **Take a photo** in the photo panel, beside Choose photos. A refused camera says
  how to turn it on.
- `AmendHoursSheet`: the direct link is built with an `if`, because SDK 57's typed routes make the
  union from a ternary too large for `tsc` (TS2590).

### Play Store: "What's new" (453/500)

```
Set up with AI can now take a photo of your price list with your camera.

Steadier over a long day: the app moves to the newest version of the framework it is built on, which fixes a memory problem that could slow it down the longer it stayed open.

Card payments: updated card reader software, with fixes for Tap to Pay and Bluetooth readers. On Android 12 and later, taking a card payment now asks for approximate location instead of precise location.
```

### App Store: "What's new" (588/4,000)

```
Take a photo in Set up with AI

Setting up your services with AI can now use your camera: photograph a price list or a menu board and we read it for you, then you check each service before anything is added.

Steadier over a long day

The app moves to the newest version of the framework it is built on. This fixes a memory problem that could make the app slower the longer it stayed open, which matters most on a phone or iPad left at the front desk.

Card payments

Updated card reader software, with fixes for Bluetooth readers such as more accurate messages when a reader disconnects.
```

---

## OTA on iOS 1.1.1 / Android 1.1.1 — 2026-09-24 (R40 to R43)

Published as group `1f4a0bed` ("ResNeo R40 to R43 Web Parity"), from `fc2a2dd`, on both platforms.

**The web's 2026-09-23 QA round, and what the phone test found.** Details in
`Docs/APP_GAP_REPORT_R43_WEB_DELTA.md`.

- New booking inside a collective offers your own classes, events and resources again, beside the
  combined appointments; your own unlisted classes and events can be booked there.
- Full class sessions and sold-out events are shown, greyed out, instead of disappearing.
- Services with differently priced options say "from" the cheapest.
- A booking that sent a deposit or card link says it is waiting for the guest, not confirmed.
- The booking's Activity names every status change and shows arrivals.
- Undo start on a visit goes back to Booked unless the visit had been confirmed.
- Events: creating one with an open ticket works again. The switch is Show on booking page, and
  an event can be hidden while it has bookings.
- Contacts: a clearer message log, household Unlink, and field-by-field errors on contact forms.
- Compliance: expired form links are listed and resent as fresh links. The app no longer says a
  link was sent when there was no email or phone to send it to.
- Services: saving an add-on group keeps its archived options, new groups start optional, and a
  price can be cleared.
- Today can bring back a dismissed setup checklist.
- CSV exports are safe to open in a spreadsheet.

**Fixes from the 2026-09-23 device test.** Details in `Docs/APP_QA_FIXES_2026-09-23.md`.

- Modify no longer lengthens a booking that has an add-on each time it is saved, and Reschedule
  keeps a booking's add-on and custom minutes.
- A slow create is waited for longer and, if it still times out, the app checks whether the
  booking was made before suggesting another try, so it is not booked twice.
- Class bookings move to another session of the same class, and resource bookings to another
  free slot and length. Event bookings are no longer offered a move the server refuses.
- The comment typed when booking shows on the booking. A swipe No-show asks first.
- The New booking review names add-ons and prices each line with them.
- Smaller fixes: deposit wording, "1 event", Contacts with filters, Today's link to Reports,
  report dates, card-hold messages in Communications, referral explanations, event and resource
  permissions for team members, and no em-dashes in the app's wording.

**The combined booking page's own embed code and QR code** (web 2026-09-23). Details in
`Docs/APP_GAP_REPORT_R42_WEB_DELTA.md`.

- In a live collective, the Booking page screen's combined view now has **Embed on your website**
  and a **QR code** for the combined page, for the host and for members. The QR code opens the
  address guests use and is named after the collective.
- The venue's own page has the web's **What to embed** choice: your own page or the combined page.
  The QR code follows the choice.
- Manage Collective links to **Combined booking page settings**.
- "Accent colour saved." fades after a moment, as on the web.

**Set up with AI** on the Services screen (web 2026-09-22), and uploads that work again. Details in
`Docs/APP_GAP_REPORT_R41_WEB_DELTA.md`.

- Admins can set up their services from what they already have: a link to their old booking page,
  photos or screenshots of a price list, a PDF, Word, Excel or CSV file, or a typed list. The AI reads
  them, and nothing is added until each service is checked: edit, add one by one or all at once, skip,
  undo, turn an extra into an add-on, update a service they already have, or open the full form.
  Progress is kept on the phone, so the setup can be finished later.
- A venue with no services is offered the setup straight away.
- Photo, logo, cover, gallery, page and compliance uploads are sent in a form the app's network layer
  accepts; before this they could fail as if there were no connection.

Classes, events and resources on the combined booking page, and the web's review fixes for the
three (web 2026-09-21). Details in `Docs/APP_GAP_REPORT_R40_WEB_DELTA.md`.

- New Booking for a collective: the Classes, Events and Resources tabs list the items each member
  venue has put on the combined page, each marked with the venue that runs it; the booking lands
  on that venue.
- Manage Collective has a Classes, events & resources tab: hosts switch a member's class type,
  event or room on to the combined page; members can take their own off. Prices and payment rules
  stay with the venue that runs the item.
- Classes, Events and Resources show a "Listed on" badge for anything on the combined page.
- Booking types: a refused switch-off puts the switch back and shows the server's reason.
- The Classes screen no longer counts a session earlier today that has already started as upcoming.
- Class pack and course editors name sessions by day, not by a raw date.

## OTA on iOS 1.1.1 / Android 1.1.1 — 2026-09-20 (R37, R38, R39)

Venue collectives on shared services, and the web's staff booking rule (web 2026-09-17). Details in
`Docs/R37_COLLECTIVES_SHARED_SERVICES.md`.

- Staff can move bookings between any calendars at their venue, as admins can.
- Services show what the collective owns: services from the host are read-only apart from the
  calendar switches, and services that are not on the collective page show as parked.
- Dropping a booking on another venue of the collective moves it there in one step.
- Booking forms refresh their services and times when a collective service is updating or parked.
- Joining a collective on shared services sends you to the web; the leave message is accurate.
- Calendar settings only show classes, resources and events when the venue has them switched on,
  and list a collective's parked services apart from the bookable ones.
- A booking on a partner venue with a single calendar can now be dragged onto your calendars.
- Manage Collective, as on the web: under More. Hosts see each
  venue's health, what needs attention, and every service across the venues, and can choose
  calendars in bulk, preview what guests will see, and save; plus the Venues tab (invite, ask to
  host, remove, end the collective) and the History tab with filters and a CSV download. Members
  see what is on the page for them and what is parked.
- The booking page preview shows the logo beside the page name, below the cover, as the real page
  does, instead of over the cover.
- Plan & payments has an "Open Stripe dashboard" button for admins, for payouts, balance and
  transactions, as on the web.
- Venue collectives: "Manage Collective" for hosts on shared services, and the Services tab
  links to Services and Manage Collective.
- Services: badges sit on their own line, so long names are no longer cut short.

Linked accounts and collectives, and the reports the web added (web 2026-09-19). Details in
`Docs/APP_GAP_REPORT_R38_WEB_DELTA.md`.

- Link with a venue in one guided flow: pick the venue, choose the level, start a collective on a
  full link, name it, say which changes you will accept, check and send.
- Review a link request and join the collective in one go, with the same-name, own-service and
  form choices the web asks; joining a collective no longer sends you to the web.
- Hosts finish setting up a new collective in the app: services, calendars, then the address.
- Members answer a host's question about a same-named service; hosts see who still has to answer.
- The banner on the Calendar tab shows every waiting item (requests in, requests out, pending
  changes, setup to finish, a member to wait for) with a button each, and can be dismissed for a day.
- New bookings: a card on Today, and a Reports tab by day, week or month with how each came in.
- Export your data: bookings, clients or services for any dates as CSV, Excel or PDF, with a count
  before the download.
- More: the Linked venues group has three pages. The "Linked calendar" page is gone; linked
  calendars are on the Calendar tab.

The web's owner-flow sweep (web 2026-09-20). Details in `Docs/APP_GAP_REPORT_R39_WEB_DELTA.md`.

- A cancelled booking can be reinstated; the server checks the time is still free first. Cancelled
  and no-show bookings no longer show an outstanding balance.
- Compliance on a booking: "Too recent" and "Awaiting result" say why a record does not count yet;
  a form link already sent shows when it went and offers "Resend link".
- Add-on groups switched to "Pick multiple" drop the single-choice maximum of 1.
- Deleting a service that is on the collective page takes it off the page first, and says what
  happens at the other venues; hiding or showing a service confirms what it did.
- A multi-service visit's row in Appointments names every service.
- Booking prices show what the client was quoted when they booked, not the service's current
  price.
- A booking at a partner venue opened on its own names its service (it read "Service"), and the
  name updates when Modify changes the service.
- Contacts no longer reads "All 0 clients loaded" under the list, and a client's "Last visit" is
  never a date in the future.
- Android: tactile feedback now follows the phone's vibration settings. Taps, toggles and
  confirmations used a raw vibration (classed as media vibration), so they buzzed even with touch
  feedback switched off; they now go through the system's touch-feedback channel, which the
  "Touch interactions" setting and the vibration master switch control. iOS already followed
  System Haptics.

**Play / App Store (draft):** Working in a venue collective is smoother: move a booking to another
venue's calendar in one step, see which services the host manages, and get clearer messages when a
service is updating. Team members can now move bookings between any calendars at their venue.

---

## iOS 1.1.1 / Android 1.1.1 — 2026-09-15

A re-baselining release, and this time a repair as much as housekeeping. Covers
2026-09-03 → 2026-09-12 (`f6bddf1` … `d90dece`), the same commits on both
platforms. The store copy differs by one fix only iPhone and iPad needed.

**All of it is already live.** Twelve OTA updates went out on the 1.1.0 runtime
between 3 and 12 September, so every 1.1.0 install that has relaunched since runs
this code. What the build moves is the EMBEDDED bundle, and the 1.1.0 one had
stopped working against the server: it predates the visit schedule contract (web
#186–#187, R29-1) and the service-link confirmation (web #194, R35-1), so a new
install's first session could not move or modify a multi-service visit or untick
a calendar from a service, and `eas update:roll-back-to-embedded` would have put
every user back on that bundle. It also still reads the retired
`card_hold_deposits` flag, which is why the web keeps its compatibility shim.

**Nothing native changed.** Against the `ce1d85c` binaries, `app.json` differs by
its two version strings; `app.config.js`, `eas.json` and `patches/` are
unchanged; and `package.json` / `package-lock.json` add one pure-JavaScript
dependency, `libphonenumber-js`. Same `expo@56.0.16`, same `react-native@0.85.3`.

**The runtime moves to 1.1.1.** `appVersion` stays the policy (pinning the runtime
string at 1.1.0 was considered and declined). An update published from this
commit on reaches nobody until 1.1.1 is installed from a store, and the last
1.1.0 update ("ResNeo Linked venue action buttons", group `347b2217`, at
`d90dece`) stays served to 1.1.0 installs. See the 2026-09-15 run in
`Docs/GO_LIVE_CHECK.md`.

Requires no backend change.

### Play Store — "What's new" (473/500)

```
New: Ask ResNeo, a help assistant at the top of More.

Visits with several services: choose every service first, then a time the whole visit fits. Each service has its own calendar bar with its own Start and Complete, and a booking opens with a summary of each service, the total and what is still owed.

Plan a calendar's hours ahead, and change one day's hours from the calendar.

Also: a Revenue report, optional phone numbers with a country code picker, and many fixes.
```

### App Store — "What's new" (3,176/4,000)

Paragraphs are unwrapped so the block pastes straight into App Store Connect. The
first item under **Fixed** is iOS-only: iOS drops a second sheet opened over an
open one (R29-6 in `Docs/APP_GAP_REPORT_R29_WEB_DELTA.md`), which is why the Play
copy leaves it out.

```
Ask ResNeo

A help assistant at the top of More. Ask how to do something and it answers with the steps for the app, using your venue's plan and settings, and tells you when a job can only be done on the web. It can't change anything, and a question it can't answer can go to Support with the conversation attached.

Visits with several services

Choose every service first, then pick from the times when the whole visit fits. On the calendar each service now has its own bar, marked 1/2, 2/2 and so on, in its own status colour, and you start, complete, move and resize each one separately. A visit's services can be on different days or calendars. A booking opens with a summary of every service, with its time, status and price, then the total and what is still owed. The Modify form edits each service on its own.

Hours

The availability screen is organised into tabs: Calendars, Availability, Breaks, and Closures & amended hours. Plan a calendar's hours ahead from a date you choose, give a calendar different hours on particular days, and look back at past changes. The clock button on the calendar takes you straight to changing a day's hours. The calendar follows each calendar's planned and amended hours, and closures and leave are drawn in their own colours with the label you chose.

Bookings and services

A phone number is optional on staff bookings, and the phone field has a country code picker. Tick Override availability to book outside a calendar's availability on purpose. Processing time can carry on after a service ends, and services are grouped under your categories. When a booking is missing a compliance requirement, the app says which items are required and which are only advised. A calendar can stop offering a service and keep its bookings, or move them to another calendar. Card hold is an option for every venue.

Contacts and reports

A contact's Documents are now Records, with photo thumbnails, a viewer and several files uploaded at once. When the contacts list is hiding guests who have no contact details, it says so and lets you show them. Reports gain a Revenue tab and a client list.

Venues that work together

In a collective you can book for the whole collective wherever you take a booking, and linked partners' calendars sit beside your own as columns. Drop a booking on another account's calendar and the app offers to rebook it there.

Signing in

If you have more than one account, such as staff and customer, the app asks where you would like to go. Password fields have a show and hide button.

iPad

Sheets open as a card in the middle of the screen instead of stretching edge to edge, the tiles on More and Today sit three or four across, and the month picker fits in landscape.

Fixed

Saving hours could fail without a word when the change needed a "Save anyway?" confirmation. The Modify form's availability check now works while you edit. Changing your password from the app no longer fails. Bulk messages to contacts count only what was really sent, and respect each guest's marketing permission. A booking no longer counts itself as a previous visit, and the + button starts a booking on the day you are looking at.
```

**Ask ResNeo.** The help assistant the web dashboard gained is in the app, at the
top of **More** where the settings search field used to be. It answers how-to
questions from the ResNeo help centre, made specific with this venue's plan and
settings and the person's role, and it knows it is answering somebody on the app,
so the steps it gives are the app's steps and it says when a job can only be done
on the web. It cannot change anything, and a question it cannot answer can be
handed to Support with the conversation attached. The settings search went to
make room for it. The assistant is switched on server-side, so until it is turned
on for a venue the row says so and points at the Support form.

**Tablets.** Ask ResNeo answered in a phone-width column on a tablet, with the
"Was this helpful?" row and "Send this to support" hidden behind the answer. An
answer bubble was sized by its own content, and a numbered step contributes
nothing to that, so with room to spare the bubble collapsed to the longest plain
line it happened to hold — and having been measured at one width and drawn at
another, the text ran over the row underneath. The answer now fills a column of
its own, capped so a line stays readable rather than running the full width of
the window, and Support does the same. Sheets stop at a card in the middle of a
tablet instead of stretching edge to edge, and the tile grids on More and Today
lay out three or four across where there is room for them rather than two.

### Added

- **Visits across services, days and calendars.** One calendar bar per service,
  chipped "1/2", each in its own status colour and started, completed, dragged
  and resized on its own; a visit's services may sit on different days and
  calendars; the Modify sheet edits each service separately; a partner's visit
  shows every service with the same per-service actions.
- **Every service first.** The staff wizard takes all the services before a time,
  and offers only times where the whole visit fits.
- **The visit at the top of the booking panel.** Each service's time, length,
  status and price, the total, and what is owed.
- **Hours.** The availability screen as the web's four tabs; a calendar's hours
  planned ahead (schedule periods); amended hours for particular days, edited
  beside closures; past schedule changes behind a toggle; the clock button on
  every calendar view; calendars that follow their rotas and their planned and
  amended hours; closure and leave stripes in the web's colours, carrying their
  label; advice after a save when calendar and business hours disagree.
- **Bookings.** A phone is optional on every staff booking, with a country-code
  picker; "Override availability" on the staff wizard; processing time that runs
  past the end of a service; bookings nested inside a processing gap.
- **Services.** Grouped under the venue's categories in booking-page order, with a
  Categories manager; a calendar can stop offering a service and keep its
  bookings, with a per-group move to another calendar.
- **Contacts and reports.** Documents became Records (thumbnails, a viewer,
  several files at once); the contacts list says when its filter hides guests and
  offers to show them; how each booking was made, on the guest history; Revenue
  and Clients tabs in Reports, with ticket tiers, resource and table utilisation
  and the web's CSVs.
- **Collectives and linked venues.** Staff booking for a collective from every
  entry point; a partner's columns named after its calendars, and working like
  your own under a full-details-and-edit grant; a linked booking's compliance,
  guest history and Records; a drop on another account's calendar offers a rebook
  and then a cancel of the original; collective service sync and an About section
  in the combined-page manager; the Booking page screen opens on the combined
  page.
- **Sign-in.** An account chooser for a person with staff and customer (or
  superuser) accounts; a show / hide toggle on every password field.
- **Messaging.** The composer's length hint and the guest's marketing permission.

### Changed

- One bar per service replaces 1.0.7's one bar per visit, as on the web.
- Compliance never blocks staff: each unmet requirement shows as required or
  advisory, and the "Book anyway" override is gone because nothing refuses.
- Card hold is a standard payment option for every venue (the
  `card_hold_deposits` flag is retired), and the staff card-hold toggle starts
  off.
- Bulk messages from contacts go out guest by guest, respect marketing
  permission, and are branded again (email) and venue-prefixed (SMS).
- The booking wizard counts three phases instead of a growing step total; "Plan
  hours ahead" starts at the coming Monday; every two-tap confirm stays armed for
  eight seconds.

### Fixed

- iOS: saving hours that needed "Save anyway?" did nothing, because the question
  opened as a second sheet over the hours sheet and iOS dropped it.
- The Modify form's live availability check 400'd on every ordinary edit, so it
  had never worked.
- Changing your own password failed at the last step, because the staff route
  cannot serve the app's Bearer token; it now goes through `/api/account/password`.
- The contacts bulk message counted guests with no contact details, and failed
  deliveries, as sent.
- The booking confirmation never showed its deposit notice.
- A booking counted itself as a previous visit; linked bookings were missing from
  the list, week and month counts; the money block could show half a total
  mid-refresh; a partner's booking had no service name in the panel.
- "+" started a booking on today instead of the day on screen.
- Lengthening a service without touching its processing periods reverted the
  length on save.
- The guest-details fields sat under the keyboard, and the month picker overflowed
  a tablet in landscape.

---

## iOS 1.1.0 / Android 1.1.0 — 2026-08-31

The customer side of the app. Until now this was the venue app only: anybody who
signed in without a staff profile hit a dead end, and the customer portal lived
on the web.

**Native code changed, which the last few releases did not.** Two modules were
added, `@stripe/stripe-react-native` and its `react-native-webview` peer, so this
CANNOT ship as an OTA update on the 1.0.7 runtime. The minor bump is doing real
work here rather than being cosmetic: the shipped 1.0.7 binaries do not contain
the Stripe module, and the customer screens import it, so an update published to
them would fail at require time. Moving to 1.1.0 moves the runtime with it and
keeps the two apart.

**Staff should notice nothing.** The routing now decides between a staff side and
a customer side, but a staff profile resolves to the staff side exactly as
before, and the venue tabs are untouched.

**One fix that was already live in production.** Push registration was gated on
having a session and nothing else, and the app sent no audience, so somebody who
signed in without a staff profile was still registered as a STAFF device and
received a venue's booking alerts, which carry a client's name and service. That
is fixed here regardless of the customer work.

Built 2026-08-31 at `ce1d85c` (iOS build 22, Android build 16); its store copy
was not recorded here. Ask ResNeo and the tablet layout work were once listed
under this entry, but they reached users by OTA after these builds, so they now
sit under 1.1.1.

---

## iOS 1.0.7 / Android 1.0.7 — 2026-08-25

A re-baselining release. Covers 2026-08-11 → 2026-08-25 on both platforms; the
same commits ship to each, so the store copy is identical.

**Almost all of it is already live.** Seven OTA updates went out on the 1.0.6
runtime between 11 and 25 August, so most users are running this code already.
The build exists to move the EMBEDDED bundle forward: a new install was starting
24 commits behind and running that stale code for its whole first session
(expo-updates fetches in the background and applies on the next launch), and a
rollback could only fall back to that same stale bundle.

**Nothing native changed.** `package.json`, `package-lock.json`, `patches/`,
`eas.json` and the native config in `app.json` are byte-identical to what the
1.0.6 build shipped — same `expo@~56.0.16`, same `react-native@0.85.3`. The only
delta is JavaScript that has been running in production via OTA. This is the
lowest-risk build shape available.

As always, bumping both versions moves each platform's runtime version, so this
cannot be delivered as an update to anyone still on 1.0.6 (see the 2026-08-25
run, §2, in `Docs/GO_LIVE_CHECK.md`). The final 1.0.6-runtime update stays
served to stragglers.

Requires no backend change.

### Play Store — "What's new" (490/500)

```
The calendar now shows closures, staff leave and amended hours, so the diary matches what the booking engine allows.

A multi-service visit is one bar you can drag and resize as a whole, not one bar per service.

Status buttons on a booking respond instantly.

Staff can take a booking without collecting payment first, and set the amount on a group booking.

Fixed: a tapped notification could crash the app, the opening-hours editors saved incorrectly, and content sat under the home bar.
```

### App Store — "What's new" (1,309/4,000)

```
A calendar that tells the truth

Venue closures, staff leave and amended opening hours are drawn on
the diary. They were always enforced when taking a booking, but were
invisible on the one screen staff use to find space.

Visits, as one thing

Several services booked back to back for one guest now render as a
single bar spanning the whole visit, and drag and resize as one. The
booking detail reads and edits them as one visit too, and staff can
change which services a visit is made of.

Status buttons that answer

Arrived, Start and Complete now update the bar the moment you press
them, instead of after a round trip. On a multi-service booking the
whole visit moves together.

Money decisions belong to staff

A booking can be taken without collecting payment first, and the
amount on a group booking or a chain of services is yours to set.
Bookings whose deposit failed are marked as such, and the app no
longer offers deposit actions the server would refuse.

Fixed

Tapping a notification could clone the app's root screen and crash
it. The opening-hours editors did not save correctly and left out
resources. Reports, contacts, services and other pages ran their last
row under the home bar. Availability now says when it could not check
every staff member rather than quietly showing fewer slots.
```

### Added

- Venue closures, amended hours and staff leave are drawn on the calendar; the
  grid feed carries none of them, so the app resolves and renders them itself.
- Multi-service visits: one bar per visit, dragged and resized through the visit
  endpoint, read and edited as one booking, with its service list editable.
- Staff money controls on group bookings and service chains, and the ability to
  accept a booking without taking payment first.
- Linked-venue and compliance parity work from the R13–R22 web-delta audits.

### Fixed

- A tapped notification could clone the navigation root and crash the app.
- Calendar quick actions (Arrived / Start / Complete) left a spinner running
  forever where the buttons belong, then — once that was fixed — took seconds to
  settle and could visibly revert. All three causes are addressed: the shared
  mutation's per-call callbacks, the per-segment invalidation storm, and a read
  already in flight overwriting the optimistic update.
- The opening-hours editors saved incorrectly and omitted resources.
- Empty bars at the bottom of the booking and settings pages.
- Availability now reports when a pooled search could not check every member,
  instead of silently returning fewer slots.
- The deposit-payment reminder defaulted to SMS only, which meant venues without
  the SMS entitlement sent no reminder at all before a booking was released.

---

## iOS 1.0.6 / Android 1.0.6 — 2026-08-10

A correctness and layout release. Covers 2026-08-09 → 2026-08-10 on both
platforms; the same commits ship to each, so the store copy is identical.

**OTA-eligible in principle** — no dependency, native module or `app.json`
native config changed since 1.0.5, so every change here is JavaScript. Shipped
as a build by choice, not necessity. Note that bumping both versions moves each
platform's runtime version, so this release cannot be delivered as an update to
anyone still on 1.0.5 (see `Docs/GO_LIVE_CHECK.md` §2.1).

Requires no backend change — the guest-notification deferral uses
`defer_modification_guest_notification`, which the modify branch of
`PATCH /api/venue/bookings/[id]` already honours.

### Play Store — "What's new" (445/500)

```
Changing a booking's time from the Modify form now asks before emailing the guest, with notify, don't notify and undo — the same choice the calendar already gave you.

Fixed: the edit-contact form could not be scrolled and its Save button was out of reach. Six more forms had the same fault.

Fixed: content sitting under the home bar on reports, contacts, services, add-ons, booking page and team.

Also: the start time steps in 5-minute marks.
```

### App Store — "What's new" (771/4,000)

```
Changing a booking's time

Moving a booking from the Modify form used to email the guest the
instant you saved. It now asks first — notify, don't notify, or undo
the change — which is the same choice the calendar has always given
you for a dragged booking. Undo restores the whole edit, not just
the time.

Forms you couldn't finish

The edit-contact form could not be scrolled and its Save button sat
below the bottom of the screen. Six other forms had the same fault
and are fixed with it.

Room at the bottom

Reports, contact detail, services, add-ons, the booking page editor
and the team page all ran their last row of content under the home
bar. So did the Modify booking form.

Also in this release

The by-hand start time steps in 5-minute marks rather than one.
```

### Fixed

- Modifying a booking's start time emailed the guest immediately, with no
  confirmation and no way back.
- Saving the Modify form on a service with add-ons could clear the booking's
  add-ons: the form latched "already seeded" before it knew the service, so it
  sent an empty add-on list, which the server treats as "replace with none".
- The edit-contact form, and six other sheets, sized their body to their content
  — so they could not scroll and their pinned buttons were pushed off the bottom.
- Sheets opened from inside another sheet (Modify, from booking detail) lost the
  bottom safe area entirely and sat on the home indicator.
- Pushed screens never reserved the bottom safe area, so their last row of
  content ran under the home indicator.

### Changed

- The Modify form's by-hand start steps in 5 minutes and snaps to the
  `:00/:05/:10` grid; its label drops the "(by hand)" qualifier.

---

## iOS 1.0.5 / Android 1.0.5 — 2026-08-09

The two version lines converge here: Android moves 1.0.1 → 1.0.5 to sit alongside
iOS. See `Docs/GO_LIVE_CHECK.md` §183 — `android.version` remains a deliberate
override, not drift.

Covers 2026-08-06 → 2026-08-09 on iOS, and 2026-08-03 → 2026-08-09 on Android,
which was cut earlier. **Android additionally gains the refund work** iOS shipped
in 1.0.4, so the Play copy differs.

**Not OTA-eligible** — carries a native dependency (`expo-image-picker`) and the
Sentry navigation/profiling integration. Both need this build.

Requires the backend at `resneo@06d5491c` or later: multi-service calendar bars
and recorded service names read fields added there.

### Play Store — "What's new" (447/500)

```
Multi-service visits now show as one appointment on the calendar, not one bar per service.

New: staff-first booking. Guests choose a team member first, then that person's services - on your booking page and when you take a booking yourself.

New to Android: refund a payment from the booking.

Also: crop booking-page photos, cancel a card payment at the reader, close a day that already has bookings, and accuracy fixes to deposits and payments.
```

### App Store — "What's new" (819/4,000)

```
Multi-service visits

A booking with several services now shows as one appointment on the
calendar, spanning the whole visit, instead of one bar per service.

Staff-first booking

A new setting that asks who the booking is with before which service.
It applies to your public booking page and to bookings you take
yourself. Off by default — turn it on in booking settings.

Photos

Pick images from your photo library (they were previously unreachable
on iPhone), and crop and position service and team photos for your
booking page.

Also in this release

Cancel a card payment at the reader. Close a day that already has
bookings. Cancel a scheduled account deletion. Plus accuracy fixes to
deposit amounts on classes and events, cash payment records, clearing
a contact's details, and saving a resource with no price.
```

### Fixed

- Deposits on classes and events quoted the per-person figure while the server
  charged per attendee.
- A declined card was matched to its ledger row by amount and timing, which the
  app's own retry flow could defeat and silently hide a double-charge warning.
- Cash payments reported the client's stale balance, and a timeout was reported
  as a definite failure on a write with no idempotency key.
- Booking a slot did not mark availability stale, so the picker could offer a
  slot that had just gone.
- Clearing a contact field, or saving a resource with no price, was rejected.
- Push notifications kept arriving after sign-out, and Android showed full client
  detail on the lock screen.
- The app lock did not cover open sheets — the surfaces holding the most client
  data.
- Saved calendar preferences were wiped when the app opened offline.

### Removed

- Universal Links / Android App Links config. Neither association file was ever
  served, and a failed verification is worse than no claim on Android 12+. The
  `resneo://` scheme is unaffected. See `Docs/universal-links`.

## iOS 1.0.4 — 2026-08-06

App Store build 17, superseding the live **1.0.3 (build 16)**. Covers
2026-07-01 → 2026-08-05.

The feature body is the **Android 1.0.1** entry below — the two releases share
almost all of their work. This entry records the App Store copy and the ways
iOS differs.

### App Store — "What's new" (1,312/4,000)

```
In-person card payments

Take payment at the appointment with a BBPOS WisePad 3 card reader
paired to your phone. Cash and other payment types are recorded too,
refunds included, and money settles directly into your own Stripe
account — Resneo takes no cut. Every attempt is listed on the booking,
so you can see what settled and what didn't.

Card holds

Protect against no-shows by authorising a fee when the booking is
made. Switch it on under booking settings.

Compliance

Client records, patch tests and per-service requirements, with
requirement markers on the bookings that need them.

Calendar

A compact day view for busy days, wider columns on iPad, and booking
bars that are exactly as tall as the appointment is long — so
back-to-back short appointments no longer overlap.

Also new
• Fixed start times per service, instead of only an interval grid
• The appointment's location shown on the booking
• Ask for a Google review in the post-visit email
• Dismiss optional setup steps with "Not now"
• Refund a payment from any line of a multi-service visit, then take
  payment again afterwards

Fixed
• Group bookings keep attendees off each other's time
• Saving a service no longer fails with a bare "Invalid request"
• Linked-calendar slots are labelled by service when the client's
  name is hidden
```

### How iOS differs from Android 1.0.1

- **No Tap to Pay on iPhone.** Apple granted the entitlement for Development
  distribution only (Case-ID 21181959), so iOS ships the **BBPOS WisePad 3**
  Bluetooth path alone and `TAP_TO_PAY_IOS_ENABLED` is `false`. The App Store
  copy must not promise tapping a card or phone against the device — the Play
  copy below leads with exactly that, correctly for Android. Reusing it on iOS
  would advertise a feature the build cannot perform. See `Docs/TAP_TO_PAY.md`.
- **Push notifications are not new here.** They shipped on iOS in June; the
  Android entry lists them because Android was the platform catching up.
- **iOS-only reader work**, none of which Android needed: the Terminal SDK never
  requested **location** on iOS (Stripe disables card-present without it), and
  `bluetooth-central` was added to hold the reader connection when the phone
  locks mid-transaction.

### Landed after the Android build was cut

- Booking detail shows **where the appointment actually is**.
- Services can offer **fixed start times**, not just an interval grid.
- The setup checklist accepts **"Not now"** on optional steps.
- The post-visit email can **ask for a Google review**.
- **Refund a payment** sits beside the ledger on booking detail, and a refunded
  booking can be **paid again**.

### Notes for this release

- **The review notes must justify `bluetooth-central`.** Apple scrutinises
  background modes. The app holds a connection to a Bluetooth card reader that
  would otherwise drop when the phone locks mid-transaction — volunteer that
  rather than waiting to be asked.
- The **Compliance** paragraph assumes live build 16 was cut from the 1.0.3
  version bump (`2964b1b`, 2026-07-01) rather than a later commit. The compliance
  dashboard landed on 2026-07-01/02, straddling that boundary. If build 16 came
  off a later commit, compliance is already on the store and the paragraph goes.
- In-person payments additionally need the live-mode setup in
  `Docs/GO_LIVE_CHECK.md` §4: the WisePad registered to a Location on the **live**
  connected account, `in_person_payments_enabled`, and the `card_present`
  capability.
- The **"How to Tap" overlay is not required** for this submission. It is a Tap to
  Pay on iPhone obligation and returns when Tap to Pay does.

---

## Android 1.0.1 — 2026-08-02

Android build 11. Covers 2026-06-28 → 2026-08-02.

Most of this shipped on iOS too, as **1.0.4** above — but not all of it, and not
with the same card-payment story. Read the iOS entry before reusing any of this
copy.

### Play Store — "What's new" (467/500)

```
Take card payments in person: tap the client's card or phone, or pair a Bluetooth card reader. Money goes straight to your own Stripe account.

Also new
• Card holds to protect against no-shows
• Compliance records, patch tests and requirement tracking
• Compact day view on the calendar
• Push notifications on Android

Fixed
• Short appointments now show at their true length and stay resizable
• Service edits save reliably
• Card readers connect more consistently
```

### In-person card payments

The headline of this release.

- **Tap to Pay on Android**, and support for the **BBPOS WisePad 3** Bluetooth reader.
- Take payment from any appointment with an outstanding balance; cash and
  external payments are recorded too.
- Refunds, including refunding a visit payment from **any line** of a
  multi-service visit.
- Payment history on the booking, with `pending` and `failed` attempts visible.
- A collection covers the **whole visit**, and the sheet says so.
- Venue admins can switch in-person payments on **from the app** — previously
  web-dashboard only.
- Money settles **directly to the venue's own Stripe account**; ResNeo takes no cut.

Taking a payment is always the team's choice, appointment by appointment — an
appointment can still be completed with a balance outstanding.

### Card holds

Take a no-show fee authorisation at booking time, with the deposit toggle in
booking settings. Web parity across booking detail, the booking wizard, editors,
roster and reports.

### Compliance

Records, patch tests and requirement tracking, mirroring the web dashboard:
compliance settings navigation, per-service requirements, and requirement
markers on bookings.

### Calendar

- **Compact day mode**, including on linked venues.
- Booking bars match the web layout, with wider columns on tablets.
- Take payment surfaced in the toolbar; settled bookings badged.

### Notifications

Android push wired up. The Firebase client config is supplied at build time as an
EAS file secret and is never committed.

### Fixes

- Booking bars are **exactly as tall as their duration**, so back-to-back short
  appointments no longer overlap.
- The duration grip stays available on short appointments.
- Appointments can be as short as **5 minutes**, matching what services already
  allowed. (Pairs with a backend change.)
- Saving a service no longer fails with a bare "Invalid request", and validation
  errors now name the offending field. (Pairs with a backend change.)
- Card readers: fixed a connection hang, a phantom "payment still going through",
  concurrent-call failures, the Android permission check, and switching between
  Tap to Pay and a Bluetooth reader.
- Group bookings keep attendees off each other's time.
- Screenshots are allowed everywhere except the compliance screen.

### Notes for this release

- The 5-minute appointment floor and the service-save fix depend on backend
  changes deployed to `www.resneo.com`. Confirm that deploy has landed before
  publishing, or those two lines will be inaccurate for users.
- In-person payments additionally require the venue to have a Stripe connected
  account with the **card-present capability enabled in live mode** — the app's
  toggle alone is not sufficient.
