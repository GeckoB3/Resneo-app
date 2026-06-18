/**
 * Pure-TS port of the web embed-snippet helpers
 * (`C:\Resneo/src/lib/embed/accent-colour.ts` + `widget-frame.ts`).
 *
 * No DOM / browser APIs — safe to import in React Native and unit tests. The
 * booking-page editor uses these to render the copyable `<iframe>` website embed
 * snippet for a venue's public booking page, optionally tinted with the venue's
 * stored `embed_accent_colour`.
 *
 * Output is byte-for-byte identical to the web `buildVenueEmbedSnippet` so a
 * snippet copied from the app embeds the same widget as one copied from the web
 * dashboard.
 */

/**
 * Default `<iframe height="…">` in embed snippets and the floor for the
 * postMessage-reported height once the widget resizes itself
 * (`<script src=".../embed/resize.js">`). Mirrors the web
 * `EMBED_IFRAME_DEFAULT_HEIGHT_PX`.
 */
export const EMBED_IFRAME_DEFAULT_HEIGHT_PX = 450;

/**
 * Normalise stored or user input to 6-char lowercase hex WITHOUT the leading
 * `#`, or `null` if empty/invalid. A `#` prefix is tolerated and stripped.
 * Mirrors the web `normalizeEmbedAccentHex`.
 */
export function normalizeEmbedAccentHex(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const hex = raw.trim().replace(/^#/, '');
  if (hex === '') return null;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return hex.toLowerCase();
}

/**
 * The `?accent=<hex>` query string for the embed URL, or `''` when unset/invalid.
 * Mirrors the web `embedAccentSearchParam`.
 */
export function embedAccentSearchParam(hex: string | null | undefined): string {
  const normalised = normalizeEmbedAccentHex(hex);
  return normalised ? `?accent=${normalised}` : '';
}

/**
 * Build the public booking-page embed URL + the copy-paste `<iframe>` snippet for
 * a venue. `baseUrl` is the web origin (`getWebUrl()`), `venueSlug` the public
 * booking-page slug. The optional `accentHex` is normalised and threaded into the
 * iframe `src` as `?accent=`. Mirrors the web `buildVenueEmbedSnippet`.
 */
export function buildVenueEmbedSnippet({
  baseUrl,
  venueSlug,
  accentHex,
}: {
  baseUrl: string;
  venueSlug: string;
  accentHex?: string | null;
}): { embedUrl: string; snippet: string; accentHex: string | null } {
  const root = baseUrl.replace(/\/$/, '');
  const accent = normalizeEmbedAccentHex(accentHex);
  const embedUrl = `${root}/embed/${venueSlug}${embedAccentSearchParam(accent)}`;
  const snippet = `<iframe src="${embedUrl}" width="100%" height="${EMBED_IFRAME_DEFAULT_HEIGHT_PX}" style="border:none;overflow:hidden;" scrolling="no" id="reserveni-widget"></iframe>
<script src="${root}/embed/resize.js"></script>`;
  return { embedUrl, snippet, accentHex: accent };
}
