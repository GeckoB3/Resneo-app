# App Store review notes: iOS 1.2.0 (Tap to Pay on iPhone)

The block below goes in App Store Connect → the 1.2.0 version → **App Review Information → Notes**
(4,000 character limit; the block is about 2,900 characters with the placeholders filled in).
Fill in the four `[…]` placeholders first.

**Before submitting, set up the review account:**
- Use a staff account with the **admin** role, at a venue on the **live** project with in-person
  payments turned on and a Stripe connected account that is card-present ready. Otherwise the
  reviewer sees nothing about Tap to Pay on iPhone.
- Give it at least one appointment today with an outstanding balance (e.g. £1.00), so Take
  payment is on screen.
- Do not accept Apple's Tap to Pay terms on any phone with that account. The reviewer should see
  the full first-time flow. If they were accepted while testing, unlink at
  https://businessconnect.apple.com/taptopay/removeall (see `Docs/TAP_TO_PAY.md`).
- Turn off the app lock (Face ID) for the account. The account must sign in with a password, not
  only a magic link.

Also fill in **App Review Information → Sign-in required** with the same email and password, and
attach the video, or put its link in the notes. Apple's grant email asks for: enrolment and
accepting the terms, starting a transaction with Tap to Pay on iPhone, and a completed transaction,
filmed with a second device because the payment screens cannot be screen-recorded.

---

```
TAP TO PAY ON IPHONE

This version adds Tap to Pay on iPhone, using the Tap to Pay on iPhone entitlement granted to our team for this app (bundle ID com.resneo.app) and the Stripe Terminal SDK. It is generally available: every business that has turned on in-person card payments in ResNeo can use it. There is no other feature flag. It is offered only on iPhone XS or later; on iPad it is not shown at all.

ResNeo is a booking app for appointment businesses (salons, clinics, studios). Staff use Tap to Pay on iPhone to take payment for an appointment from the client in front of them.

DEMO ACCOUNT
Email: [review account email]
Password: [review account password]
This is an admin at a test business with in-person payments turned on and a live Stripe account. Admins accept Apple's Tap to Pay terms; other staff are told to ask an admin.

HOW TO REVIEW (on an iPhone XS or later with a passcode set and an Apple Account signed in)
1. Sign in. A full-screen introduction to Tap to Pay on iPhone appears once. Tap "Get started" to set it up, or "Not now" to skip it.
2. Set up and accept the terms: More tab > Tap to Pay on iPhone > "Set up Tap to Pay on iPhone". Apple's terms appear; accept them. Configuration progress shows, then Apple's "How to Tap" education. The same section has "How to use Tap to Pay on iPhone" at any time.
3. Take a payment: Calendar tab > today > the appointment "[appointment / client name]" > Take payment. Check the amount, then tap "Tap to Pay on iPhone" (first in the list) and present a contactless card or Apple Pay.
4. The result shows as approved or declined, with "Share receipt". The business is emailed a receipt for approved payments.

The account's Stripe account is live, so a payment is a real charge. A [£1.00] appointment is set up for this; we refund any payment made during review. A video of the full flow, filmed on a second device, is attached [or: here: link].

Tap to Pay on iPhone is prepared in the background when the app opens and returns to the foreground, with no prompts, so the payment screen appears quickly. Location permission is requested at the first payment because Stripe requires it for card-present payments.

OTHER PERMISSIONS
Bluetooth (background mode bluetooth-central): staff can also take payment with a Stripe Bluetooth card reader (BBPOS WisePad 3). The background mode keeps the reader connected if the phone locks during a payment. Card readers are paired from More > Card reader.

Payments in the app are for real-world services (appointments) and go to the business through Stripe. Businesses' ResNeo subscriptions are billed on our website, not in the app.

Contact: [name, phone, email] for any questions about the review.
```

---

**After submitting:**
- If App Review comes back with a rejection that says it is a request for information, answer in
  the same App Store Connect thread. Apple relays the reply to the reviewers.
- Refund any review payment from the booking (Take payment → refund) or the Stripe dashboard.
