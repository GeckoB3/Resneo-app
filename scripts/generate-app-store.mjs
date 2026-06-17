/**
 * Apple App Store assets for Resneo — iPhone 6.7" portrait.
 *
 *   • 6 marketing screenshots (device frame + caption)    → screenshots/0N-*.png      (1284×2778)
 *   • 6 raw screenshots (full-bleed app screen, no chrome) → screenshots-raw/0N-*.png  (1284×2778)
 *   • 3 app previews (full-bleed video)                    → previews/preview-N.mp4     (886×1920)
 *
 * Sizes differ by asset TYPE — a real Apple distinction: iPhone 6.5"/6.7"
 * SCREENSHOTS are 1284×2778, but the APP PREVIEW slot for those devices wants
 * 886×1920 (same ~9:19.5 aspect, lower resolution). Screenshots must be opaque
 * (no alpha) — App Store Connect rejects transparency.
 *
 * The phone mock-ups reuse the EXACT real-app screen renderers from
 * ./lib/app-screens.mjs (same design tokens, Inter type, status-pill colours,
 * AppointmentBlock + BookingDetailContent layouts); only the marketing canvas,
 * the full-bleed framing and the preview video pipeline are new here.
 *
 * App previews are shown FULL-BLEED inside Apple's own device bezel, so each is
 * the app SCREEN only (no frame/caption); ffmpeg holds each of 3 screens then
 * slides to the next like a native push, over a silent stereo audio track (App
 * Store Connect requires an audio track). Needs ffmpeg on PATH, $FFMPEG, or the
 * WinGet Links shim; if absent the screenshots are written and previews skipped.
 *
 * Re-run: `npm run app-store`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// --- Register Inter with fontconfig BEFORE sharp/libvips initialises ----------
const cwd = process.cwd().replace(/\\/g, '/');
const cacheDir = `${cwd}/node_modules/.cache/fontconfig`;
mkdirSync(cacheDir, { recursive: true });
const confPath = path.join(cacheDir, 'fonts.conf');
writeFileSync(
  confPath,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${cwd}/node_modules/@expo-google-fonts/inter</dir>
  <dir>C:/Windows/Fonts</dir>
  <dir>/usr/share/fonts</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>`,
);
process.env.FONTCONFIG_FILE = confPath;

const sharp = (await import('sharp')).default;
import {
  C, SW, SH, t,
  screenCalendar, screenBookings, screenDetail, screenNewBooking, screenClient, screenDeposits,
} from './lib/app-screens.mjs';

// --- Apple frame sizes --------------------------------------------------------
const AW = 1284; // iPhone 6.7" SCREENSHOT frame
const AH = 2778;
const PW = 886; // iPhone 6.5"/6.7" app-PREVIEW frame — Apple uses a smaller size than screenshots
const PH = 1920;

// --- Marketing phone geometry (device frame on the brand canvas) --------------
const ABEZEL = 16;
const SCREEN_W = 960; // on-canvas phone screen (1:2 → matches logical SW:SH)
const SCREEN_H = 1920;
const ABODY = { x: (AW - (SCREEN_W + ABEZEL * 2)) / 2, y: 638, w: SCREEN_W + ABEZEL * 2, h: SCREEN_H + ABEZEL * 2, r: 64 };
const ASX = ABODY.x + ABEZEL;
const ASY = ABODY.y + ABEZEL;

// --- Brand watermark + app-icon chip (shared with the other generators) -------
const markSrc = readFileSync('assets/images/_source-icon-2.png');
async function tinted(srcBuf, hex) {
  const { width, height } = await sharp(srcBuf).metadata();
  return sharp({ create: { width, height, channels: 4, background: hex } })
    .composite([{ input: srcBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
const watermarkB64 = (await tinted(markSrc, C.white)).toString('base64');
const appIconB64 = readFileSync('assets/images/play-store-icon.png').toString('base64');

// --- Marketing compose: brand background + caption + framed phone + real screen
function compose(eyebrow, lines, inner, renderW, renderH) {
  const baseY = lines.length === 1 ? 372 : 336;
  const heads = lines.map((ln, i) => t(AW / 2, baseY + i * 72, 58, 800, C.white, ln, 'middle', -1)).join('');
  const chipX = AW / 2 - 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${AW} ${AH}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navyTop}"/><stop offset="1" stop-color="${C.navyBottom}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.12" r="0.55"><stop offset="0" stop-color="${C.teal}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.teal}" stop-opacity="0"/></radialGradient>
    <clipPath id="screen"><rect x="${ASX}" y="${ASY}" width="${SCREEN_W}" height="${SCREEN_H}" rx="46"/></clipPath>
    <clipPath id="chip"><rect x="${chipX}" y="92" width="58" height="58" rx="14"/></clipPath>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="${AW}" height="${AH}" fill="url(#bg)"/>
  <rect width="${AW}" height="${AH}" fill="url(#glow)"/>
  <image href="data:image/png;base64,${watermarkB64}" x="${AW - 380}" y="${AH - 380}" width="480" height="480" opacity="0.05"/>
  <!-- caption -->
  <image href="data:image/png;base64,${appIconB64}" x="${chipX}" y="92" width="58" height="58" clip-path="url(#chip)"/>
  ${t(chipX + 74, 133, 30, 800, C.white, 'Resneo', 'start', -0.4)}
  ${t(AW / 2, 252, 23, 700, C.teal, eyebrow, 'middle', 3.5)}
  ${heads}
  <!-- phone -->
  <rect x="${ABODY.x}" y="${ABODY.y + 18}" width="${ABODY.w}" height="${ABODY.h}" rx="${ABODY.r}" fill="#000000" opacity="0.4" filter="url(#sh)"/>
  <rect x="${ABODY.x}" y="${ABODY.y}" width="${ABODY.w}" height="${ABODY.h}" rx="${ABODY.r}" fill="#0A1424" stroke="#274A6B" stroke-width="2"/>
  <g clip-path="url(#screen)"><svg x="${ASX}" y="${ASY}" width="${SCREEN_W}" height="${SCREEN_H}" viewBox="0 0 ${SW} ${SH}">${inner}</svg></g>
</svg>`;
}

// --- Full-bleed compose: the app screen ONLY, filling a fw×fh frame -----------
// Scales the logical screen to fill the frame WIDTH, so NOTHING is cropped at the
// sides — the status-bar battery, status pills and the FAB all sit near the edges
// and must stay intact. The device is a touch taller than the 1:2 screen, so the
// small vertical remainder becomes matching-colour safe-area bands: white at the
// top (the status bar) and `bottomBg` at the bottom (tab bar / pinned bar = white;
// screens that end on the grey surface = surface). Seamless — no crop, no
// distortion. Used for raw screenshots AND preview frames.
function composeScreen(inner, fw, fh, bottomBg, renderW, renderH) {
  const scale = fw / SW;
  const sh = SH * scale;
  const oy = (fh - sh) / 2; // centre vertically → equal top/bottom safe-area bands
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${fw} ${fh}">
  <rect width="${fw}" height="${fh}" fill="${bottomBg}"/>
  <rect width="${fw}" height="${Math.ceil(oy) + 1}" fill="#FFFFFF"/>
  <svg x="0" y="${oy}" width="${fw}" height="${sh}" viewBox="0 0 ${SW} ${SH}">${inner}</svg>
</svg>`;
}

// `bottom` = colour of each screen's bottom edge, used to fill the full-bleed
// bottom safe-area band seamlessly (tab bar / pinned bar = white; screens that
// end on the grey surface = surface).
const SCREENS = [
  { file: '01-calendar.png', eyebrow: 'CALENDAR', lines: ['Your whole day,', 'at a glance'], build: screenCalendar, bottom: C.bg },
  { file: '02-bookings.png', eyebrow: 'BOOKINGS', lines: ['Every appointment,', 'organised'], build: screenBookings, bottom: C.bg },
  { file: '03-booking-detail.png', eyebrow: 'BOOKING DETAILS', lines: ['A command centre', 'for every booking'], build: screenDetail, bottom: C.bg },
  { file: '04-new-booking.png', eyebrow: 'NEW BOOKING', lines: ['Book a client', 'in seconds'], build: screenNewBooking, bottom: C.bg },
  { file: '05-client.png', eyebrow: 'CLIENTS', lines: ['Know every client'], build: screenClient, bottom: C.surface },
  { file: '06-deposits.png', eyebrow: 'DEPOSITS & REMINDERS', lines: ['Take deposits,', 'cut no-shows'], build: screenDeposits, bottom: C.surface },
];

const SHOT_DIR = 'assets/images/app-store/screenshots';
const RAW_DIR = 'assets/images/app-store/screenshots-raw';
const PREVIEW_DIR = 'assets/images/app-store/previews';
mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(PREVIEW_DIR, { recursive: true });

// Rasterise an SVG → opaque AW×AH PNG (2× supersample → downscale for crisp
// text). `.flatten()` strips alpha — App Store Connect REJECTS screenshots with
// transparency, even when every pixel is opaque — then we assert size + no-alpha.
async function writeShot(svg, out, bg) {
  await sharp(Buffer.from(svg)).resize(AW, AH).flatten({ background: bg }).png({ compressionLevel: 9 }).toFile(out);
  const m = await sharp(out).metadata();
  if (m.width !== AW || m.height !== AH) throw new Error(`${out}: expected ${AW}×${AH}, got ${m.width}×${m.height}`);
  if (m.hasAlpha) throw new Error(`${out}: still has an alpha channel — App Store will reject it`);
}

// 1) Marketing screenshots — framed phone + caption on the brand background.
for (const sc of SCREENS) {
  await writeShot(compose(sc.eyebrow, sc.lines, sc.build(), AW * 2, AH * 2), `${SHOT_DIR}/${sc.file}`, C.navyBottom);
}
console.log(`wrote 6 marketing screenshots (${AW}×${AH}, no-alpha) → ${SHOT_DIR}`);

// 2) Raw screenshots — full-bleed app screen only, no frame/background/caption.
for (const sc of SCREENS) {
  await writeShot(composeScreen(sc.build(), AW, AH, sc.bottom, AW * 2, AH * 2), `${RAW_DIR}/${sc.file}`, sc.bottom);
}
console.log(`wrote 6 raw screenshots (${AW}×${AH}, no-alpha) → ${RAW_DIR}`);

// =============================================================================
// App previews (video) — FULL-BLEED screen footage at the preview size (886×1920).
// Each of 3 screens holds, then slides to the next like a native nav push.
// =============================================================================
function findFfmpeg() {
  const cands = [
    process.env.FFMPEG,
    'ffmpeg',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
  ].filter(Boolean);
  for (const c of cands) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

const FPS = 30;
const SCENE = 6; // seconds each screen holds
const XF = 0.5; // slide-transition seconds (3×6 − 2×0.5 = 17 s, within Apple's 15–30 s)
const FRAME_DIR = `${PREVIEW_DIR}/.frames`;
const byId = Object.fromEntries(SCREENS.map((s) => [s.file.slice(0, 2), s]));

const PREVIEWS = [
  { file: 'preview-1.mp4', frames: ['01', '02', '03'] }, // run your day
  { file: 'preview-2.mp4', frames: ['04', '05', '01'] }, // book a client
  { file: 'preview-3.mp4', frames: ['06', '03', '02'] }, // get paid, cut no-shows
];

function previewArgs(frames, out) {
  const inputs = frames.flatMap((k) => ['-loop', '1', '-t', String(SCENE), '-i', `${FRAME_DIR}/frame-${k}.png`]);
  const prep = frames.map((_, i) => `[${i}:v]fps=${FPS},scale=${PW}:${PH},setsar=1[v${i}]`);
  const xfade = [
    `[v0][v1]xfade=transition=slideleft:duration=${XF}:offset=${(SCENE - XF).toFixed(2)}[x1]`,
    `[x1][v2]xfade=transition=slideleft:duration=${XF}:offset=${(2 * (SCENE - XF)).toFixed(2)}[vout]`,
  ];
  const audioLen = (3 * SCENE - 2 * XF + 1).toFixed(0);
  return [
    '-y',
    ...inputs,
    '-f', 'lavfi', '-t', audioLen, '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', [...prep, ...xfade].join(';'),
    '-map', '[vout]', '-map', `${frames.length}:a`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-profile:v', 'high', '-level', '4.0', '-b:v', '10M', '-maxrate', '14M', '-bufsize', '20M',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
    path.resolve(PREVIEW_DIR, out).replace(/\\/g, '/'),
  ];
}

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.warn(
    '\n⚠  ffmpeg not found — screenshots written, previews SKIPPED.\n' +
      '   Install (Windows): winget install Gyan.FFmpeg, then re-run `npm run app-store`.\n' +
      `   (Or set $FFMPEG to an ffmpeg binary.)`,
  );
} else {
  // Render the full-bleed source frames at preview size (only screens previews use).
  mkdirSync(FRAME_DIR, { recursive: true });
  const used = [...new Set(PREVIEWS.flatMap((p) => p.frames))];
  for (const k of used) {
    const sc = byId[k];
    const svg = composeScreen(sc.build(), PW, PH, sc.bottom, PW * 2, PH * 2);
    await sharp(Buffer.from(svg))
      .resize(PW, PH)
      .flatten({ background: sc.bottom })
      .png({ compressionLevel: 9 })
      .toFile(`${FRAME_DIR}/frame-${k}.png`);
  }
  console.log(`encoding 3 full-bleed previews (${PW}×${PH}) with ${ffmpeg} …`);
  for (const p of PREVIEWS) {
    const r = spawnSync(ffmpeg, previewArgs(p.frames, p.file), { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) {
      console.error(`✗ ${p.file} failed:\n${r.stderr?.toString().split('\n').slice(-12).join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log(`  ✓ ${PREVIEW_DIR}/${p.file}`);
    }
  }
  rmSync(FRAME_DIR, { recursive: true, force: true });
}
console.log('Done.');
