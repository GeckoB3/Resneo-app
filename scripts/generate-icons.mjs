/**
 * Generate the full app icon set from the Resneo logo lockup.
 *
 * Source: assets/brand/logo-lockup.png (mark + "RESNEO" wordmark, RGBA).
 * The knot+arrow mark is auto-extracted (everything left of the first
 * whitespace gap), so dropping in a higher-res lockup regenerates
 * everything at better quality: `npm run icons`.
 *
 * Outputs (assets/images/):
 *   icon.png                    1024  iOS light icon — mark on light gradient, opaque
 *   icon-dark.png               1024  iOS dark icon — mark on near-black navy, opaque
 *   icon-tinted.png             1024  iOS tinted icon — grayscale mark on transparency
 *   android-icon-foreground.png 1024  adaptive foreground — mark in the 66% safe zone
 *   android-icon-background.png 1024  adaptive background — flat #E8EFF6
 *   android-icon-monochrome.png 1024  Android 13+ themed icon — white silhouette
 *   splash-icon.png             1024  white silhouette mark (splash bg is navy #003B6F)
 *   notification-icon.png         96  white silhouette (Android status-bar rules)
 *   favicon.png                   48  mark on transparency
 */
import sharp from 'sharp';

const SRC = 'assets/brand/logo-lockup.png';
const OUT = 'assets/images';

const LIGHT_BG = [
  ['0', '#F4F8FC'],
  ['1', '#DCE8F2'],
];
const DARK_BG = [
  ['0', '#101F33'],
  ['1', '#081220'],
];
const ADAPTIVE_BG = '#E8EFF6';

function gradientSvg(size, stops) {
  const stopTags = stops
    .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stopTags}</linearGradient></defs>` +
      `<rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  );
}

/** Crop the knot+arrow mark: content left of the first ≥8px fully-transparent column gap. */
async function extractMark() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const columnHasInk = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * channels + 3] > 12) {
        columnHasInk[x] = true;
        break;
      }
    }
  }

  const firstInk = columnHasInk.indexOf(true);
  let gapStart = -1;
  let run = 0;
  for (let x = firstInk; x < width; x++) {
    if (!columnHasInk[x]) {
      run += 1;
      if (run >= 8) {
        gapStart = x - run + 1;
        break;
      }
    } else {
      run = 0;
    }
  }
  if (gapStart < 0) throw new Error('Could not find the mark/wordmark gap in the lockup');

  // Two passes — sharp orders trim before extract within one pipeline.
  const cropped = await sharp(SRC)
    .extract({ left: 0, top: 0, width: gapStart, height })
    .png()
    .toBuffer();
  return sharp(cropped).trim({ threshold: 10 }).png().toBuffer();
}

/** Keep the shape's alpha, paint every pixel white (for monochrome/splash/notification). */
async function whiteSilhouette(buf) {
  const { width, height } = await sharp(buf).metadata();
  return sharp({ create: { width, height, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: buf, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Resize the artwork to `contentWidth` and centre it on a square canvas. */
async function onCanvas(artBuf, size, contentWidth, background) {
  const art = await sharp(artBuf)
    .resize({ width: contentWidth })
    .sharpen({ sigma: 0.6 })
    .png()
    .toBuffer();
  const meta = await sharp(art).metadata();
  const base = background
    ? sharp(gradientSvg(size, Array.isArray(background) ? background : [['0', background], ['1', background]]))
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  let composed = base.composite([
    {
      input: art,
      left: Math.round((size - meta.width) / 2),
      top: Math.round((size - meta.height) / 2),
    },
  ]);
  if (background) composed = composed.flatten();
  return composed.png();
}

const mark = await extractMark();
const markWhite = await whiteSilhouette(mark);
const markGray = await sharp(mark).grayscale().png().toBuffer();

await Promise.all([
  // iOS — opaque, mark fills ~62% of the square.
  (await onCanvas(mark, 1024, 640, LIGHT_BG)).toFile(`${OUT}/icon.png`),
  (await onCanvas(mark, 1024, 640, DARK_BG)).toFile(`${OUT}/icon-dark.png`),
  (await onCanvas(markGray, 1024, 640, null)).toFile(`${OUT}/icon-tinted.png`),

  // Android adaptive — keep the mark inside the centre 66% safe zone (~676px circle).
  (await onCanvas(mark, 1024, 540, null)).toFile(`${OUT}/android-icon-foreground.png`),
  sharp(gradientSvg(1024, [['0', ADAPTIVE_BG], ['1', ADAPTIVE_BG]]))
    .flatten()
    .png()
    .toFile(`${OUT}/android-icon-background.png`),
  (await onCanvas(markWhite, 1024, 540, null)).toFile(`${OUT}/android-icon-monochrome.png`),

  // Splash — white mark on the plugin's navy background (#003B6F).
  (await onCanvas(markWhite, 1024, 512, null)).toFile(`${OUT}/splash-icon.png`),

  // Android notification icon — must be pure white-on-transparent.
  (await onCanvas(markWhite, 96, 84, null)).toFile(`${OUT}/notification-icon.png`),

  // Web favicon.
  (await onCanvas(mark, 48, 44, null)).toFile(`${OUT}/favicon.png`),
]);

console.log('Icon set written to', OUT);
