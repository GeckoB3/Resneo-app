/**
 * Google Play Store listing icon — the 512×512 "hi-res icon" uploaded to the
 * Play Console. This is SEPARATE from the on-device adaptive launcher icon
 * (assets/images/android-icon-*.png, wired in app.json); the store listing
 * icon is not bundled in the app and must be supplied to Google Play directly.
 *
 * Spec: https://developer.android.com/distribute/google-play/resources/icon-design-specifications
 *   - 512×512 px, 32-bit PNG, sRGB colour space, ≤ 1024 KB
 *   - Full square — DO NOT round the corners (Play masks ~30% corner radius)
 *   - NO drop shadow on the final asset (Play applies its own elevation)
 *   - Avoid transparency — must be opaque (transparent areas show Play's UI bg)
 *   - Shape-critical logos sit on the keyline grid (centred, not full-bleed)
 *
 * Source: assets/images/_source-icon-2.png — the clean knot+arrow mark on a
 * transparent background. The mark sits on the brand light gradient at ~63% of
 * the canvas, matching the iOS icon (assets/images/icon.png) so the app reads
 * the same on both stores. Re-run after dropping in new art: `npm run play-icon`.
 */
import sharp from 'sharp';

const SRC = 'assets/images/_source-icon-2.png';
const OUT = 'assets/images/play-store-icon.png';
const SIZE = 512;
/** Keyline: the logo fills ~63% of the square, centred, with even padding. */
const MARK_WIDTH = Math.round(SIZE * 0.63);
/** Brand light gradient — identical to the iOS icon background. */
const BG_TOP = '#F4F8FC';
const BG_BOTTOM = '#DCE8F2';

const background = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${BG_TOP}"/>` +
    `<stop offset="1" stop-color="${BG_BOTTOM}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/></svg>`,
);

// Trim the transparent surround to the mark's true bounding box, then size it
// to the keyline width so the padding is exact regardless of the source margins.
const mark = await sharp(SRC)
  .trim({ threshold: 10 })
  .resize({ width: MARK_WIDTH })
  .sharpen({ sigma: 0.5 })
  .png()
  .toBuffer();
const meta = await sharp(mark).metadata();

await sharp(background)
  .composite([
    {
      input: mark,
      left: Math.round((SIZE - meta.width) / 2),
      top: Math.round((SIZE - meta.height) / 2),
    },
  ])
  // Guarantee a fully opaque, 32-bit (RGBA) sRGB PNG — no transparency, no
  // rounded corners, no drop shadow.
  .flatten({ background: BG_TOP })
  .ensureAlpha(1)
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('Google Play store icon written to', OUT);
