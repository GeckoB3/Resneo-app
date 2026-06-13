/**
 * Google Play "Feature graphic" — 1024×500 JPEG shown at the top of the store
 * listing (and in promos). Spec: 1024×500 px, JPG or 24-bit PNG (no alpha),
 * opaque. Keep critical content out of the dead-centre (Play may overlay a
 * play-button when a promo video exists) and away from the extreme edges.
 *
 * Design: brand-navy gradient, the Resneo logo + a benefit-led headline in the
 * brand typeface (Inter), three benefit chips, and a phone mock-up showing the
 * app's day calendar with status-coloured appointment cards — the same accent
 * stripe + guest/service layout as the real AppointmentBlock — so the listing
 * both grabs attention and shows what the product does.
 *
 * Inter isn't a system font, so we register the bundled @expo-google-fonts/inter
 * TTFs via a generated fontconfig file before sharp/libvips loads.
 * Re-run: `npm run feature-graphic`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// --- Register Inter with fontconfig BEFORE sharp/libvips initialises ----------
const cwd = process.cwd().replace(/\\/g, '/');
const interDir = `${cwd}/node_modules/@expo-google-fonts/inter`;
const cacheDir = `${cwd}/node_modules/.cache/fontconfig`;
mkdirSync(cacheDir, { recursive: true });
const confPath = path.join(cacheDir, 'fonts.conf');
writeFileSync(
  confPath,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${interDir}</dir>
  <dir>C:/Windows/Fonts</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/Library/Fonts</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>`,
);
process.env.FONTCONFIG_FILE = confPath;

const sharp = (await import('sharp')).default;

const W = 1024;
const H = 500;
const OUT = 'assets/images/feature-graphic.jpg';

// --- Brand palette ------------------------------------------------------------
const NAVY_TOP = '#0A3A66';
const NAVY_BOTTOM = '#02152B';
const TEAL = '#00C2C7';
const TEAL_LIGHT = '#54DCDE';
const TEXT_LIGHT = '#CFE0F0';
const TEXT_MUTE = '#8FB0D0';
const WHITE = '#FFFFFF';
const SKY = '#0EA5C4';
const AMBER = '#F5A524';

/** Measure the rendered ink width (viewBox units) of a string in Inter. */
async function measureText(label, size, weight) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.ceil(size * 2)}">` +
    `<text x="2" y="${Math.ceil(size * 1.4)}" font-family="Inter" font-weight="${weight}" font-size="${size}" fill="#000">${label}</text></svg>`;
  const { info } = await sharp(Buffer.from(probe)).trim().png().toBuffer({ resolveWithObject: true });
  return info.width;
}

/** Paint a mark's alpha shape a single flat colour (for the faint watermark). */
async function tinted(srcBuf, hex) {
  const { width, height } = await sharp(srcBuf).metadata();
  return sharp({ create: { width, height, channels: 4, background: hex } })
    .composite([{ input: srcBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

const markSrc = readFileSync('assets/images/_source-icon-2.png');
const appIconB64 = readFileSync('assets/images/play-store-icon.png').toString('base64');
const watermarkB64 = (await tinted(markSrc, WHITE)).toString('base64');

// --- Phone mock-up: a day calendar with status-coloured appointment cards -----
function apptCard(x, y, w, h, accent, name, service) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${accent}"/>
      <text x="${x + 14}" y="${y + 21}" font-family="Inter" font-weight="700" font-size="12.5" fill="#0F2238">${name}</text>
      <text x="${x + 14}" y="${y + 38}" font-family="Inter" font-weight="500" font-size="10.5" fill="#64748B">${service}</text>
    </g>`;
}

function gridLine(y) {
  return `<line x1="744" y1="${y}" x2="906" y2="${y}" stroke="#EEF2F7" stroke-width="1"/>`;
}
function gridLabel(y, label) {
  return `<text x="720" y="${y + 4}" font-family="Inter" font-weight="500" font-size="10" fill="#94A3B8">${label}</text>`;
}

const phone = `
  <g transform="rotate(-5 805 280)">
    <!-- soft drop shadow -->
    <rect x="690" y="86" width="250" height="470" rx="42" fill="#000000" opacity="0.38" filter="url(#blur)"/>
    <!-- body + screen -->
    <rect x="684" y="64" width="250" height="470" rx="42" fill="#050E1C" stroke="#274A6B" stroke-width="1.5"/>
    <rect x="696" y="76" width="226" height="446" rx="30" fill="#F5F8FC"/>
    <g clip-path="url(#screen)">
      <!-- header -->
      <text x="716" y="112" font-family="Inter" font-weight="800" font-size="17" fill="#0F2238">Friday 13 Jun</text>
      <rect x="852" y="96" width="52" height="22" rx="11" fill="${TEAL}"/>
      <text x="878" y="111" font-family="Inter" font-weight="700" font-size="11" fill="#04212A" text-anchor="middle">Today</text>
      <line x1="716" y1="128" x2="906" y2="128" stroke="#E2E8F0" stroke-width="1"/>
      <!-- time grid -->
      ${gridLine(168)}${gridLine(228)}${gridLine(300)}${gridLine(372)}${gridLine(444)}
      ${gridLabel(168, '09')}${gridLabel(228, '10')}${gridLabel(300, '11')}${gridLabel(372, '12')}${gridLabel(444, '13')}
      <!-- appointment cards -->
      ${apptCard(744, 150, 162, 50, TEAL, 'Amelia H.', 'Deep Tissue Massage')}
      ${apptCard(744, 232, 162, 50, SKY, 'George O.', 'Swedish Massage')}
      ${apptCard(744, 314, 162, 62, AMBER, 'Priya S.', 'Hot Stone · 60 min')}
      ${apptCard(744, 404, 162, 44, TEAL, 'Sam R.', 'Consultation')}
      <!-- bottom nav hint -->
      <rect x="696" y="486" width="226" height="36" fill="#FFFFFF"/>
      <line x1="716" y1="486" x2="906" y2="486" stroke="#EEF2F7" stroke-width="1"/>
      <circle cx="740" cy="504" r="4" fill="${TEAL}"/>
      <circle cx="800" cy="504" r="4" fill="#CBD5E1"/>
      <circle cx="860" cy="504" r="4" fill="#CBD5E1"/>
    </g>
  </g>`;

// --- Benefit chips (auto-sized to their text so nothing overflows) ------------
const CHIP_FONT = 14.5;
const CHIP_GAP = 12;
const CHIP_LABELS = ['Fewer no-shows', 'Happier clients', 'Less admin'];

function chip(x, y, w, label) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="36" rx="18" fill="#0E2C4E" stroke="#1E4A74" stroke-width="1"/>
      <circle cx="${x + 19}" cy="${y + 18}" r="4.5" fill="${TEAL}"/>
      <text x="${x + 34}" y="${y + 23}" font-family="Inter" font-weight="600" font-size="${CHIP_FONT}" fill="${TEXT_LIGHT}">${label}</text>
    </g>`;
}

const chipWidths = await Promise.all(CHIP_LABELS.map((l) => measureText(l, CHIP_FONT, 600)));
let chipX = 64;
const chipsSvg = CHIP_LABELS.map((label, i) => {
  // 34px lead-in (left pad + teal dot + gap) + measured text + 18px right pad.
  const w = Math.round(34 + chipWidths[i] + 18);
  const g = chip(chipX, 404, w, label);
  chipX += w + CHIP_GAP;
  return g;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY_TOP}"/>
      <stop offset="1" stop-color="${NAVY_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.74" cy="0.28" r="0.6">
      <stop offset="0" stop-color="${TEAL}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="appchip"><rect x="64" y="40" width="60" height="60" rx="15"/></clipPath>
    <clipPath id="screen"><rect x="696" y="76" width="226" height="446" rx="30"/></clipPath>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="17"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <image href="data:image/png;base64,${watermarkB64}" x="-120" y="210" width="430" height="430" opacity="0.05"/>

  <!-- Logo lockup -->
  <image href="data:image/png;base64,${appIconB64}" x="64" y="40" width="60" height="60" clip-path="url(#appchip)"/>
  <text x="138" y="81" font-family="Inter" font-weight="800" font-size="34" fill="${WHITE}" letter-spacing="-0.5">Resneo</text>

  <!-- Headline -->
  <text x="62" y="222" font-family="Inter" font-weight="800" font-size="58" fill="${WHITE}" letter-spacing="-1.5">Bookings made</text>
  <text x="62" y="288" font-family="Inter" font-weight="800" font-size="58" fill="${WHITE}" letter-spacing="-1.5">effortless<tspan fill="${TEAL}">.</tspan></text>

  <!-- Subline -->
  <text x="64" y="336" font-family="Inter" font-weight="500" font-size="21" fill="${TEXT_LIGHT}">Calendar, clients, deposits &amp; reminders.</text>
  <text x="64" y="365" font-family="Inter" font-weight="500" font-size="21" fill="${TEXT_LIGHT}">All in one beautifully simple app.</text>

  <!-- Benefit chips -->
  ${chipsSvg}

  ${phone}
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H)
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toFile(OUT);

console.log('Feature graphic written to', OUT);
