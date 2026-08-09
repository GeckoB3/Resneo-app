/**
 * Public booking-page branding config — pure TypeScript port of the web's
 * `booking-page-theme.ts` (+ font presets), with NO DOM/web dependencies so it
 * runs unchanged in React Native.
 *
 * The mobile editor writes a `booking_page_config` blob via PATCH /api/venue;
 * the server re-sanitises and merges it. This module gives the editor the shared
 * type, the curated font + palette presets, and the colour helpers (hex
 * normalisation + the low-contrast warning) it needs.
 *
 * @see _reference/Resneo/src/lib/booking/booking-page-theme.ts
 * @see _reference/Resneo/src/lib/booking/booking-page-font-presets.ts
 */

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

export interface BookingPageSocialLinks {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  x?: string | null;
}

/** Per-member "Meet the team" profile, keyed in `team_profiles` by member id. */
export interface BookingTeamProfile {
  /** Short bio shown under the name. */
  bio?: string | null;
  /** Public photo URL (stored in the `venue-team-photos` bucket). */
  photo?: string | null;
  /**
   * Pan/zoom framing for {@link photo} inside its fixed circle. The upload is
   * never altered; `null`/absent = centred at 100%. Only meaningful while a
   * photo is set (the server sanitiser drops it otherwise).
   */
  photo_crop?: BookingPageImageFraming | null;
  /** Comma-separated specialties / focus areas. */
  specialties?: string | null;
  /** When true, hide this member from the public booking page. */
  hidden?: boolean;
}

/** Max photos in the public booking-page gallery (mirrors the server cap). */
export const BOOKING_GALLERY_MAX = 12;

// ---------------------------------------------------------------------------
// Font presets (12 curated key/label pairs)
// ---------------------------------------------------------------------------

/** Curated font-pairing presets for the booking page (keys only). */
export const BOOKING_FONT_PRESET_KEYS = [
  'default',
  'modern',
  'montserrat',
  'raleway',
  'rounded',
  'josefin',
  'elegant',
  'luxury',
  'editorial',
  'boutique',
  'spa',
  'cinzel',
] as const;
export type BookingFontPreset = (typeof BOOKING_FONT_PRESET_KEYS)[number];

export function isBookingFontPreset(value: unknown): value is BookingFontPreset {
  return typeof value === 'string' && (BOOKING_FONT_PRESET_KEYS as readonly string[]).includes(value);
}

/** Human labels for the font presets (used by the settings editor). */
export const BOOKING_FONT_PRESET_LABELS: Record<BookingFontPreset, string> = {
  default: 'Clean (Inter)',
  modern: 'Modern (Poppins)',
  montserrat: 'Classic (Montserrat)',
  raleway: 'Light (Raleway)',
  rounded: 'Rounded (Nunito)',
  josefin: 'Chic (Josefin Sans)',
  elegant: 'Elegant (Cormorant)',
  luxury: 'Luxury (Playfair Display)',
  editorial: 'Editorial (Lora)',
  boutique: 'Boutique (Great Vibes)',
  spa: 'Spa (Marcellus)',
  cinzel: 'Refined (Cinzel)',
};

/** Ordered list of `{ key, label }` for rendering a font picker. */
export const BOOKING_FONT_PRESETS: { key: BookingFontPreset; label: string }[] =
  BOOKING_FONT_PRESET_KEYS.map((key) => ({ key, label: BOOKING_FONT_PRESET_LABELS[key] }));

// Alias for the brief's naming (`FONT_PRESETS`).
export const FONT_PRESETS = BOOKING_FONT_PRESETS;

// ---------------------------------------------------------------------------
// Config blob
// ---------------------------------------------------------------------------

export interface BookingPageConfig {
  /** Brand primary as `#rrggbb`; drives the booking-page colour ramp. */
  brand_primary?: string | null;
  /** Optional accent as `#rrggbb`; falls back to the primary when unset. */
  brand_accent?: string | null;
  /** Curated heading/body font pairing. */
  font_preset?: BookingFontPreset | null;
  /** When true, the cover spans edge-to-edge; default (unset/false) is contained in the content column. */
  cover_full_width?: boolean;
  /** Short "about / welcome" text shown under the header. */
  about?: string | null;
  /** Announcement banner shown at the very top of the page. */
  announcement?: string | null;
  social_links?: BookingPageSocialLinks | null;
  /** Per-service photos for the public Services tab, keyed by service id. */
  service_photos?: Record<string, string> | null;
  /**
   * Pan/zoom framing for each service photo, keyed by the same service id. The
   * uploaded file is never altered; the public thumbnail is a fixed square, so
   * framing is all that is needed to choose what shows inside it. Absent for a
   * service → centred at 100%. (The server cascades this away with
   * `service_photos: null`, and framing for a photo-less service is pruned
   * client-side before save — see {@link servicePhotoCropsForSave}.)
   */
  service_photo_crops?: Record<string, BookingPageImageFraming> | null;
  /** When true, show a Services tab (photos + descriptions) on the public booking page. */
  show_services_tab?: boolean;
  /** When true, show a Meet the team tab on the public booking page. */
  show_team_tab?: boolean;
  /** When true, show the About tab on the public booking page (off by default for new venues). */
  show_about_tab?: boolean;
  /** Public photo gallery — ordered list of image URLs (≤ {@link BOOKING_GALLERY_MAX}). */
  gallery?: string[] | null;
  /** Per-member "Meet the team" profiles, keyed by member id. */
  team_profiles?: Record<string, BookingTeamProfile> | null;
  /** Logo pan/zoom framing inside its circular badge; `null`/absent = centred, unzoomed. */
  logo_crop?: BookingPageImageFraming | null;
  /** Free-form cover crop region as fractions of the source image; `null`/absent = whole photo. */
  cover_crop_box?: BookingPageCoverCropBox | null;
}

// ---------------------------------------------------------------------------
// Field limits (mirror the server sanitiser)
// ---------------------------------------------------------------------------

export const BOOKING_ABOUT_MAX = 2000;
export const BOOKING_ANNOUNCEMENT_MAX = 300;
export const BOOKING_SOCIAL_MAX = 300;

// ---------------------------------------------------------------------------
// Logo framing (pan/zoom inside the circular badge)
// Port of web `booking-page-image-framing.ts`. {x,y} 0–100 (50 = centred),
// zoom 0.5–3. Render helpers return plain numbers so this stays RN-free.
// ---------------------------------------------------------------------------

export interface BookingPageImageFraming {
  /** Horizontal position 0–100 (50 = centred). */
  x?: number;
  /** Vertical position 0–100 (50 = centred). */
  y?: number;
  /** Scale 0.5–3 (>1 zooms in). */
  zoom?: number;
}

export const LOGO_ZOOM_MIN = 0.5;
export const LOGO_ZOOM_MAX = 3;

function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Fill in defaults + clamp to valid ranges. */
export function resolveLogoFraming(
  f: BookingPageImageFraming | null | undefined,
): Required<BookingPageImageFraming> {
  return {
    x: typeof f?.x === 'number' ? clampNum(f.x, 0, 100) : 50,
    y: typeof f?.y === 'number' ? clampNum(f.y, 0, 100) : 50,
    zoom: typeof f?.zoom === 'number' ? clampNum(f.zoom, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX) : 1,
  };
}

/** Collapse a centred/unzoomed framing to `null` (matches the server sanitiser). */
export function normalizeLogoFraming(
  f: BookingPageImageFraming | null | undefined,
): BookingPageImageFraming | null {
  const r = resolveLogoFraming(f);
  const x = round1(r.x);
  const y = round1(r.y);
  const zoom = round1(r.zoom);
  if (x === 50 && y === 50 && zoom === 1) return null;
  return { x, y, zoom };
}

/**
 * RN transform values for a `contentFit="cover"` Image that fills a `frameWidth`
 * × `frameHeight` px frame — mirrors the web `translate((x-50)%, (y-50)%)
 * scale(zoom)`, where each translate % is of the element box on that axis. RN
 * transforms are centre-origin.
 */
export function framingTransform(
  f: BookingPageImageFraming | null | undefined,
  frameWidth: number,
  frameHeight: number,
): { translateX: number; translateY: number; scale: number } {
  const { x, y, zoom } = resolveLogoFraming(f);
  return {
    translateX: ((x - 50) / 100) * frameWidth,
    translateY: ((y - 50) / 100) * frameHeight,
    scale: zoom,
  };
}

/** {@link framingTransform} for the square/circular frames (logo, team photo). */
export function logoFramingTransform(
  f: BookingPageImageFraming | null | undefined,
  frameSize: number,
): { translateX: number; translateY: number; scale: number } {
  return framingTransform(f, frameSize, frameSize);
}

/**
 * The `service_photo_crops` value a config PATCH should carry, given the photo
 * map it will be saved alongside. Framing is only meaningful for a service that
 * currently has a photo (mirrors the web editor's `servicePhotoCropsForConfig`),
 * and a centred/unzoomed framing collapses away entirely. Returns `null` when
 * nothing survives — the server deletes the key on `null`, matching the web save.
 */
export function servicePhotoCropsForSave(
  crops: Record<string, BookingPageImageFraming> | null | undefined,
  photos: Record<string, string> | null | undefined,
): Record<string, BookingPageImageFraming> | null {
  const out: Record<string, BookingPageImageFraming> = {};
  for (const [id, crop] of Object.entries(crops ?? {})) {
    if (!photos?.[id]?.trim()) continue;
    const framed = normalizeLogoFraming(crop);
    if (framed) out[id] = framed;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Pointer-drag px → 0–100 position delta over a viewport of `sizePx`. */
export function framingPanDelta(deltaPx: number, sizePx: number): number {
  return deltaPx * (100 / Math.max(sizePx, 1));
}

// ---------------------------------------------------------------------------
// Cover crop box — port of web `booking-page-cover.ts`. Fractions 0–1 of the
// source image; `ar` = natural width ÷ height. `null` = whole photo.
// ---------------------------------------------------------------------------

export interface BookingPageCoverCropBox {
  /** Left edge as a fraction of source width (0–1). */
  x: number;
  /** Top edge as a fraction of source height (0–1). */
  y: number;
  /** Crop width as a fraction of source width (>0–1). */
  w: number;
  /** Crop height as a fraction of source height (>0–1). */
  h: number;
  /** Source aspect ratio (natural width ÷ height). */
  ar: number;
}

const FULL_FRAME_EPS = 0.999;
const MIN_CROP_FRACTION = 0.02;
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Clamp + validate a crop box; full-frame collapses to `null` (whole photo). */
export function sanitizeCoverCropBox(raw: unknown): BookingPageCoverCropBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const read = (k: string): number =>
    typeof src[k] === 'number' && Number.isFinite(src[k]) ? (src[k] as number) : Number.NaN;
  const ar = read('ar');
  if (!(ar > 0) || !Number.isFinite(ar)) return null;
  const x = clamp01(read('x'));
  const y = clamp01(read('y'));
  let w = read('w');
  let h = read('h');
  if (!(w > 0) || !(h > 0)) return null;
  w = Math.min(clamp01(w), 1 - x);
  h = Math.min(clamp01(h), 1 - y);
  if (w < MIN_CROP_FRACTION || h < MIN_CROP_FRACTION) return null;
  if (x === 0 && y === 0 && w >= FULL_FRAME_EPS && h >= FULL_FRAME_EPS) return null;
  return { x: round4(x), y: round4(y), w: round4(w), h: round4(h), ar: round4(ar) };
}

/** Visible cover aspect ratio (width ÷ height) for a crop box. */
export function coverDisplayAspect(box: BookingPageCoverCropBox): number {
  return (box.w / box.h) * box.ar;
}

/**
 * Layout numbers to render exactly the crop region in RN: a container at
 * `containerAspect`, with the image absolutely positioned at `image*Pct` and
 * sized to `imageWidthPct`/`imageAspect` so the crop fills the container.
 * (Components build the RN styles from these so this module stays RN-free.)
 */
export function coverCropLayout(box: BookingPageCoverCropBox): {
  containerAspect: number;
  imageTopPct: number;
  imageLeftPct: number;
  imageWidthPct: number;
  imageAspect: number;
} {
  return {
    containerAspect: round4(coverDisplayAspect(box)),
    imageTopPct: round4(-(box.y / box.h) * 100),
    imageLeftPct: round4(-(box.x / box.w) * 100),
    imageWidthPct: round4(100 / box.w),
    imageAspect: box.ar,
  };
}

/** Default banner aspect (width÷height) when there's no crop/measurement yet. */
export const BOOKING_COVER_DEFAULT_ASPECT = 16 / 9;

// ---------------------------------------------------------------------------
// Quick palettes (6 one-click {primary, accent} pairs)
// ---------------------------------------------------------------------------

/** One-click colour palettes shown in the settings editor. */
export const BOOKING_THEME_PRESETS: {
  key: string;
  label: string;
  primary: string;
  accent: string;
}[] = [
  { key: 'navy', label: 'ResNeo Navy', primary: '#003b6f', accent: '#00c2c7' },
  { key: 'forest', label: 'Forest', primary: '#14532d', accent: '#65a30d' },
  { key: 'plum', label: 'Plum', primary: '#6b21a8', accent: '#db2777' },
  { key: 'charcoal', label: 'Charcoal', primary: '#1f2937', accent: '#f59e0b' },
  { key: 'rose', label: 'Rose', primary: '#9f1239', accent: '#fb7185' },
  { key: 'ocean', label: 'Ocean', primary: '#0e7490', accent: '#22d3ee' },
];

// ---------------------------------------------------------------------------
// Colour helpers (pure)
// ---------------------------------------------------------------------------

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

/** Normalise any input to `#rrggbb` lowercase, or null when invalid/empty. */
export function normalizeHexColor(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = HEX_RE.exec(trimmed);
  if (!m) return null;
  return `#${m[1]!.toLowerCase()}`;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Relative luminance (sRGB) for contrast decisions. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(aHex: string, bHex: string): number {
  const la = relativeLuminance(hexToRgb(aHex));
  const lb = relativeLuminance(hexToRgb(bHex));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Readable text colour (#fff or near-black) for a solid background. */
export function readableTextColor(bgHex: string): string {
  return contrastRatio(bgHex, '#ffffff') >= contrastRatio(bgHex, '#0f172a') ? '#ffffff' : '#0f172a';
}

/**
 * True when white text on this background is hard to read (a brand primary
 * that's too light for the page's solid buttons). The editor surfaces this as a
 * low-contrast warning.
 */
export function primaryNeedsDarkText(primaryHex: string): boolean {
  return contrastRatio(primaryHex, '#ffffff') < 3.5;
}
