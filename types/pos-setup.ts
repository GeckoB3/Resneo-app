/**
 * The Checkout set-up wizard (POS test round 2026-10-11, Part 4, owner decisions OB1 to OB10 in the
 * web's Docs/pos-retail-plan.md "Revision 2026-10-11"; design in
 * reports/pos-qa-2026-10-11/part4-onboarding-proposal.md sections 6 and 7). Mirrored word for word
 * from the web's shared contract, `src/lib/pos/setup/types.ts`, which the database, the routes, the
 * web wizard, the practice sale, the app and "Add products with AI" share. Change it only together
 * with the web.
 *
 * The wizard is a front end on what exists: every answer is written through the existing settings
 * routes (POS settings, voucher settings, loyalty programme, commission rates, payment types,
 * readers, products, PATCH /api/venue for the in-person switch). Only progress, the practice sale,
 * "Sell products", receipt previews and the AI reader are new. Admins only.
 *
 * What the app reads (all over Bearer):
 * - `GET /api/venue/pos/setup-status` and `PATCH /api/venue/pos/setup-progress`: the set-up card on
 *   Today and in Checkout settings, and the wizard's screens (`app/(app)/checkout-setup/`).
 * - `POST /api/venue/pos/sales` with `practice: true`: W11's "Start a practice sale".
 * - `GET /api/venue/pos/receipt-preview`: W5's "Preview a receipt".
 * - `GET /api/venue/pos/settings` `business_details` (OB5) and `settings.sell_products_enabled`.
 * - `POST /api/venue/prompts/dismiss` with `{ key: 'pos_setup' }`: "Hide" on the set-up card.
 */

// ---------------------------------------------------------------------------------------------
// Steps and answers
// ---------------------------------------------------------------------------------------------

/** The wizard's screens (design 6.2), in order. W0 is `welcome`, W12 is `done`. */
export const POS_SETUP_SCREENS = [
  'welcome',
  'use',
  'pay',
  'cards',
  'tips',
  'details',
  'team',
  'products',
  'vouchers',
  'loyalty',
  'shop',
  'practice',
  'done',
] as const;
export type PosSetupScreen = (typeof POS_SETUP_SCREENS)[number];

/**
 * The steps the "Finish setting up Checkout" card counts (design 6.6), each ticked by real data,
 * never by a button press. A step that does not apply (no team, no "Sell products", an extra not
 * chosen) is left out of the count.
 */
export const POS_SETUP_STEPS = ['cards', 'tips', 'details', 'team', 'products', 'vouchers', 'loyalty', 'shop', 'practice'] as const;
export type PosSetupStepId = (typeof POS_SETUP_STEPS)[number];

/** Each step's state: `done` from data, `skipped` by the owner ("Skip for now"), else `todo`. */
export type PosSetupStepState = 'done' | 'skipped' | 'todo';

/** What the owner answered (kept so reopening the wizard fills the screens in). All optional. */
export interface PosSetupAnswers {
  /** W1: which extras and whether they sell products (the extras are switched on through Part 5's route). */
  use?: { products: boolean; vouchers: boolean; loyalty: boolean; shop: boolean };
  /** W2: the ways they take money; `count_cash` true turns cash counting on. */
  pay?: { card: boolean; cash: boolean; transfer: boolean; other_machine: boolean; count_cash: boolean | null; float_pence: number | null };
  /** W3: how cards are taken. */
  cards?: 'phone' | 'reader' | 'both' | 'links' | null;
  /** W4. */
  tips?: 'yes' | 'no' | 'unsure' | null;
  /** W6. */
  team?: { preset: 'team_member' | 'front_desk' | null; commission: boolean | null } | null;
  /** W7. */
  track_stock?: boolean | null;
}

// ---------------------------------------------------------------------------------------------
// GET /api/venue/pos/setup-status and PATCH /api/venue/pos/setup-progress (admins; web or Bearer)
// ---------------------------------------------------------------------------------------------

export interface PosSetupStepView {
  id: PosSetupStepId;
  /** Counted at all for this venue (design 6.6's conditions). */
  applies: boolean;
  state: PosSetupStepState;
}

/** A team phone for W3's live list and "Get this phone ready" (from `user_devices`). */
export interface PosSetupPhone {
  /** The person's first name or display name. */
  name: string;
  /** "iPhone 15", "Pixel 8", or a plain "phone". */
  device: string;
}

export interface PosSetupStatus {
  /** When the wizard was first opened and when it was finished (W12 reached), or null. */
  started_at: string | null;
  finished_at: string | null;
  /** Every card step, in order. */
  steps: PosSetupStepView[];
  /** Over the steps that apply. */
  done: number;
  total: number;
  /** Saved answers, for prefilling. */
  answers: PosSetupAnswers;
  /** The first screen that is neither done nor skipped, where "Continue" reopens the wizard. */
  next_screen: PosSetupScreen;
  /** Phones that can take cards now, and team phones whose app is too old for Checkout. */
  phones: { ready: PosSetupPhone[]; needs_update: PosSetupPhone[] };
  /** This admin hid the set-up card (`staff.dismissed_prompt_keys` has `pos_setup`). */
  card_hidden: boolean;
  /** Show the set-up card: Checkout on, not every applying step done, not hidden. */
  show_card: boolean;
  /** Optimistic concurrency for PATCH. */
  version: number;
}

/**
 * `PATCH /api/venue/pos/setup-progress`. Answers merge into what is saved; a step can be marked
 * skipped (or back to todo); `started`/`finished` stamp the times once. 412 `SETUP_STALE` with the
 * fresh status when `version` does not match. Answers 200 with the fresh `PosSetupStatus`.
 */
export interface PosSetupProgressPatch {
  version: number;
  answers?: PosSetupAnswers;
  step?: { id: PosSetupStepId; state: 'skipped' | 'todo' };
  started?: true;
  finished?: true;
}

// ---------------------------------------------------------------------------------------------
// The practice sale (OB4)
// ---------------------------------------------------------------------------------------------

/**
 * `POST /api/venue/pos/sales` accepts `practice: true` (admins). The sale is a walk-in with nobody
 * attached, takes the next sale number like any sale, and is marked `practice` on `pos_sales`.
 * - The database refuses any `pos_payments` row on it; the routes answer 409 `POS_PRACTICE_SALE`.
 * - Only products and custom items can be added (a service would create a diary booking); adding a
 *   service answers 409 `POS_PRACTICE_SALE`.
 * - It is left out of every sale list, count and report by default.
 * - "Finish practice" voids it with the reason `POS_PRACTICE_VOID_REASON`, which only a practice
 *   sale may use; the daily job voids any practice sale left open for more than an hour.
 */
export const POS_PRACTICE_VOID_REASON = 'Practice';
export const POS_PRACTICE_SALE_CODE = 'POS_PRACTICE_SALE';

/**
 * `GET /api/venue/pos/receipt-preview` (admins): a receipt as the client would see it, built from
 * the venue's settings and a sample bill, or from a practice sale with `?sale_id=`. Nothing is sent,
 * and it carries no sale number. `html` is the email body the client would get; `text` the plain
 * version.
 */
export interface PosReceiptPreviewResponse {
  practice: boolean;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------------------------
// "Sell products" (OB3) and business details (OB5)
// ---------------------------------------------------------------------------------------------

/**
 * `venue_pos_settings.sell_products_enabled` (default true, so every POS venue stays as it is): a
 * fourth simple-mode switch in the Features card. Off hides Products and Stock in the menu, the
 * Products tab in the till's Add items, and W7. It is part of GET/PATCH /api/venue/pos/settings and
 * of the bootstrap's `settings`.
 */
export const SELL_PRODUCTS_SETTING = 'sell_products_enabled';

/**
 * OB5: the receipt's business details follow the venue profile. The profile (`venues.name`,
 * `address`, `email`, `phone`) is the source; `venue_pos_settings.trading_name`, `business_address`,
 * `public_contact_email` and `public_contact_phone` hold a receipt-only value only where the venue
 * set one (null means "use the profile"). Legal name, VAT, company number and registered office stay
 * Checkout's own. Issued receipts and VAT invoices keep their snapshot.
 *
 * GET /api/venue/pos/settings gains `business_details` for the screens.
 */
export type BusinessDetailSource = 'profile' | 'receipts';

export interface PosBusinessDetailsView {
  name: { value: string; source: BusinessDetailSource };
  address: { value: string | null; source: BusinessDetailSource };
  email: { value: string | null; source: BusinessDetailSource };
  phone: { value: string | null; source: BusinessDetailSource };
}

// ---------------------------------------------------------------------------------------------
// "Add products with AI" (OB7)
// ---------------------------------------------------------------------------------------------

/**
 * `GET /api/venue/retail/products/ai-extract` answers `{ enabled }`: on wherever OPENAI_API_KEY is
 * set, unless PRODUCTS_AI_SETUP_ENABLED=false (OB7; owner, 2026-10-11: on by default). `POST` reads
 * ONE source per call (photos as data URLs, a PDF/spreadsheet/Word file, a link read through
 * `safeFetchPublicUrl`, or typed text) and stores nothing; the screens review the drafts and add
 * each through the ordinary products route. Admins and staff who can manage products.
 * Rate-limited per venue and per IP like the services set-up.
 */
export interface ProductAiExtractRequest {
  kind: 'images' | 'file' | 'link' | 'text';
  /** For `images`: data URLs (JPEG/PNG/WebP), at most 10, each at most 5 MB after decoding. */
  images?: string[];
  /** For `file`: one data URL (PDF, XLSX, CSV, DOCX), at most 10 MB. */
  file?: { name: string; data_url: string };
  url?: string;
  text?: string;
}

export type ProductAiDraftLevel = 'ready' | 'check' | 'fix';

export interface ProductAiDraft {
  /** Stable within one answer, for the review list. */
  key: string;
  name: string;
  brand: string | null;
  category: string | null;
  /** Sizes or shades become options; one option when none. */
  // eslint-disable-next-line @typescript-eslint/array-type -- word for word the web's contract
  options: Array<{ name: string | null; price_pence: number | null; cost_pence: number | null; barcode: string | null }>;
  /** A guess: salon sizes (a litre) suggest for treatments only (backbar). */
  usage: 'retail' | 'backbar' | 'both';
  level: ProductAiDraftLevel;
  /** Plain sentences on why it needs a check or a fix, for the owner. */
  notes: string[];
  /** A product with this name (and brand) already exists. */
  duplicate_of: string | null;
}

export interface ProductAiExtractResponse {
  drafts: ProductAiDraft[];
  /** The AI's notes about the source (for example "Some prices looked like trade prices"). */
  notes: string[];
}

/** The review-and-add flow both the Products page and W7 open (web: ProductsAiImport). */
export interface ProductsAiImportProps {
  /** Called after products were added, with how many. */
  onAdded: (count: number) => void;
  onClose: () => void;
}
