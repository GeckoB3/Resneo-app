/**
 * Shared shapes for the AI services setup ("Set up with AI").
 *
 * @see _reference/Resneo/src/lib/services-setup/types.ts
 * @see _reference/Resneo/Docs/ai-services-setup-plan.md
 *
 * The server reads what the owner gives it (a link, a photo, a document, a spreadsheet or
 * pasted text) and returns `ExtractedService` rows. Nothing is saved on the server: the
 * wizard turns each row into a draft the owner checks, and each approved draft is created
 * through the ordinary `POST /api/venue/appointment-services`, so an AI-made service passes
 * exactly the validation a hand-made one does.
 */

/** How the source was given to us. `document` is a Word file, `pdf` includes a linked PDF. */
export type ServicesSetupSourceKind = 'url' | 'image' | 'pdf' | 'document' | 'spreadsheet' | 'text';

/** What the source said about the price, so the review can explain what it did with it. */
export type ExtractedPriceKind = 'fixed' | 'from' | 'free' | 'on_request' | 'not_stated';

export interface ExtractedOption {
  name: string;
  /** Minutes as stated in the source, or null when it gave none. */
  duration_minutes: number | null;
  /** Integer minor units (pence), or null when the source gave none. */
  price_pence: number | null;
  description: string | null;
}

export interface ExtractedService {
  name: string;
  /** The heading the service sat under in the source, or an existing category it matches. */
  category: string | null;
  /** Only ever copied from the source, never written by the AI. */
  description: string | null;
  /** Minutes as stated in the source (the longer end of a range), or null. */
  duration_minutes: number | null;
  /** Best estimate when the source gave no length; equals `duration_minutes` when it did. */
  suggested_duration_minutes: number;
  /** Integer minor units (pence), or null when the source gave none. */
  price_pence: number | null;
  price_kind: ExtractedPriceKind;
  /** Choices a client picks between (hair length, session length), each with its own price or length. */
  options: ExtractedOption[];
  /** Short plain-English notes for the owner, e.g. "Includes 30 minutes of development time". */
  notes: string[];
  /** An extra that is usually added to another service ("add a toner"). */
  looks_like_addon: boolean;
}

/** POST /api/venue/services-setup/extract success body. */
export interface ServicesSetupExtractResponse {
  ok: true;
  /** `followed`: pages read after the link the owner gave (its price page, its booking page). */
  source: { kind: ServicesSetupSourceKind; label: string; followed: string[] };
  services: ExtractedService[];
  currency: string | null;
  warnings: string[];
}

/** Error codes the wizard turns into specific advice (the route's `code`). */
export type ServicesSetupErrorCode =
  | 'unavailable'
  | 'rate_limited'
  | 'invalid_request'
  | 'file_too_large'
  | 'unsupported_file'
  | 'unreadable_file'
  | 'invalid_url'
  | 'blocked_url'
  | 'page_unreachable'
  | 'page_unreadable'
  | 'nothing_found'
  | 'ai_failed';

/** GET /api/venue/services-setup (web 2026-09-23): is the setup offered to this user? */
export interface ServicesSetupAvailability {
  enabled: boolean;
}
