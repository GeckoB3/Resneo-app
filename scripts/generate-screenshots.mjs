/**
 * Google Play phone screenshots — 6 portrait 9:16 frames (1080×1920) showing
 * accurate mock-ups of the real Resneo screens, on a brand-navy marketing
 * background with a benefit caption. Spec: PNG/JPEG, ≤8 MB, 16:9 or 9:16, each
 * side 320–3840 px. Output: assets/images/screenshots/0N-*.png.
 *
 * The phone-screen mock-ups come from ./lib/app-screens.mjs (shared with the
 * Apple generator) so both stores stay in lock-step: they reuse the real design
 * tokens (theme/index.ts), Inter typography, booking status-pill colours, the
 * AppointmentBlock layout and the redesigned BookingDetailContent.
 *
 * Inter is registered via a generated fontconfig file before sharp loads.
 * Re-run: `npm run screenshots`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  C, STATUS, SW, SH, t, ic, statusPill, avatar, metaChip, card, btn, apptBlock,
  screenCalendar, screenBookings, screenDetail, screenNewBooking, screenClient, screenDeposits,
} from './lib/app-screens.mjs';

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

// --- Canvas + phone geometry --------------------------------------------------
const CW = 1080;
const CH = 1920;
const BODY = { x: 144, y: 320, w: 792, h: 1556, r: 52 };
const BEZEL = 14;
const SX = BODY.x + BEZEL; // screen origin
const SY = BODY.y + BEZEL;
// SW/SH (logical phone-screen size) + TAB_H come from ./lib/app-screens.mjs

// =============================================================================
// Compose: brand background + caption + phone + screen
// =============================================================================
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

function compose(eyebrow, lines, inner, renderW, renderH) {
  // Eyebrow sits above the headline; the headline grows downward from a fixed
  // baseline so 1- and 2-line captions never collide with the eyebrow.
  const heads = lines.map((ln, i) => t(CW / 2, 200 + i * 58, 48, 800, C.white, ln, 'middle', -0.5)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${CW} ${CH}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navyTop}"/><stop offset="1" stop-color="${C.navyBottom}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.16" r="0.5"><stop offset="0" stop-color="${C.teal}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.teal}" stop-opacity="0"/></radialGradient>
    <clipPath id="screen"><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="40"/></clipPath>
    <clipPath id="chip"><rect x="${CW / 2 - 200}" y="70" width="46" height="46" rx="11"/></clipPath>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
  </defs>
  <rect width="${CW}" height="${CH}" fill="url(#bg)"/>
  <rect width="${CW}" height="${CH}" fill="url(#glow)"/>
  <image href="data:image/png;base64,${watermarkB64}" x="${CW - 360}" y="${CH - 360}" width="460" height="460" opacity="0.05"/>
  <!-- caption -->
  <image href="data:image/png;base64,${appIconB64}" x="${CW / 2 - 200}" y="70" width="46" height="46" clip-path="url(#chip)"/>
  ${t(CW / 2 - 142, 102, 26, 800, C.white, 'Resneo', 'start', -0.4)}
  ${t(CW / 2, 150, 19, 700, C.teal, eyebrow, 'middle', 3)}
  ${heads}
  <!-- phone -->
  <rect x="${BODY.x}" y="${BODY.y + 16}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.r}" fill="#000000" opacity="0.4" filter="url(#sh)"/>
  <rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.r}" fill="#0A1424" stroke="#274A6B" stroke-width="2"/>
  <g clip-path="url(#screen)"><svg x="${SX}" y="${SY}" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}">${inner}</svg></g>
</svg>`;
}

const SCREENS = [
  { file: '01-calendar.png', eyebrow: 'CALENDAR', lines: ['Your whole day,', 'at a glance'], build: screenCalendar },
  { file: '02-bookings.png', eyebrow: 'BOOKINGS', lines: ['Every appointment,', 'organised'], build: screenBookings },
  { file: '03-booking-detail.png', eyebrow: 'BOOKING DETAILS', lines: ['A command centre', 'for every booking'], build: screenDetail },
  { file: '04-new-booking.png', eyebrow: 'NEW BOOKING', lines: ['Book a client', 'in seconds'], build: screenNewBooking },
  { file: '05-client.png', eyebrow: 'CLIENTS', lines: ['Know every client'], build: screenClient },
  { file: '06-deposits.png', eyebrow: 'DEPOSITS & REMINDERS', lines: ['Take deposits,', 'cut no-shows'], build: screenDeposits },
];

// =============================================================================
// 7-INCH TABLET — landscape 16:9 with tablet layouts (nav rail + multi-column /
// master-detail panes), so they read as a tablet, not a blown-up phone.
// =============================================================================
const LW = 2560;
const LH = 1440;
const TSW = 1664; // tablet screen (landscape ~16:10)
const TSH = 1040;
const TBODY = { x: 430, y: 300, w: 1700, h: 1076, r: 44 };
const TSX = 448;
const TSY = 318;
const NR = 104; // nav rail width
const CP = 28; // content padding

function navRail(active) {
  const items = [['calendar', 'Calendar'], ['list', 'Bookings'], ['user', 'Clients'], ['gear', 'Settings']];
  return `
    <rect x="0" y="0" width="${NR}" height="${TSH}" fill="#FFFFFF"/>
    <line x1="${NR}" y1="0" x2="${NR}" y2="${TSH}" stroke="${C.border}" stroke-width="1"/>
    ${items
      .map(([icn, lab], i) => {
        const cy = 120 + i * 122;
        const on = i === active;
        const col = on ? C.brand : '#94A3B8';
        return `${on ? `<rect x="14" y="${cy - 40}" width="${NR - 28}" height="80" rx="20" fill="${C.brandSubtle}"/>` : ''}${ic(icn, NR / 2, cy - 10, 30, col, 2.4)}${t(NR / 2, cy + 26, 12, on ? 700 : 500, col, lab, 'middle')}`;
      })
      .join('')}`;
}

// Booking hero card (identity + when + service + meta + deposit + contact +
// quick actions) — reused by the Bookings detail pane and the Detail screen.
function bookingHeroCard(x, y, w) {
  let mx = x + 28;
  const metaChips = [['clock', '1h'], ['user', '1 guest'], ['video', 'Online']]
    .map(([icn, lab]) => { const cw = 30 + lab.length * 8.6 + 18; const g = metaChip(mx, y + 248, icn, lab); mx += cw + 10; return g; })
    .join('');
  const qa = [['phone', 'Call'], ['mail', 'Email'], ['calendar', 'Resched'], ['sliders', 'Modify'], ['refresh', 'Rebook']]
    .map(([icn, lab], i) => { const slot = (w - 56) / 5; const qx = x + 28 + slot * i + slot / 2; return `<rect x="${qx - 28}" y="${y + 448}" width="56" height="56" rx="16" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>${ic(icn, qx, y + 476, 24, C.brand, 2)}${t(qx, y + 522, 13, 500, C.textSec, lab, 'middle')}`; })
    .join('');
  return `
    ${card(x, y, w, 540)}
    <rect x="${x}" y="${y}" width="6" height="540" rx="3" fill="${STATUS.Booked.fg}"/>
    ${avatar(x + 60, y + 62, 32, 'Amelia Hawthorne')}
    ${t(x + 110, y + 56, 23, 700, C.text, 'Amelia Hawthorne')}
    ${t(x + 110, y + 84, 15, 500, C.textMuted, '4 previous visits')}
    ${statusPill(x + w - 28 - (26 + 6 * 8.6), y + 44, 'Booked', 'Booked')}
    <line x1="${x + 26}" y1="${y + 118}" x2="${x + w - 26}" y2="${y + 118}" stroke="${C.border}" stroke-width="1"/>
    ${t(x + 28, y + 154, 14, 700, C.textMuted, 'FRIDAY 13 JUNE', 'start', 1)}
    ${t(x + 28, y + 198, 32, 700, C.text, '14:00 – 15:00')}
    ${t(x + 28, y + 230, 17, 500, C.textSec, 'Deep Tissue Massage · with Sarah Lin')}
    ${metaChips}
    <g><rect x="${x + 28}" y="${y + 300}" width="160" height="34" rx="17" fill="${STATUS.Pending.bg}" stroke="${STATUS.Pending.bd}" stroke-width="1"/>${t(x + 28 + 80, y + 322, 14, 600, STATUS.Pending.fg, 'Deposit pending', 'middle')}</g>
    <line x1="${x + 26}" y1="${y + 356}" x2="${x + w - 26}" y2="${y + 356}" stroke="${C.border}" stroke-width="1"/>
    ${ic('phone', x + 42, y + 390, 18, C.brand, 2.2)}${t(x + 66, y + 396, 16, 500, C.brand, '+44 7700 900123')}
    ${ic('mail', x + 42, y + 424, 18, C.brand, 2)}${t(x + 66, y + 430, 16, 500, C.brand, 'amelia.hawthorne@example.com')}
    ${qa}`;
}

function statusButtons(x, y, w) {
  return `
    ${card(x, y, w, 188)}
    ${btn(x + 24, y + 24, w - 48, 58, STATUS.Started.fg, 'Start')}
    <rect x="${x + 24}" y="${y + 100}" width="${(w - 64) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(x + 24 + (w - 64) / 4, y + 135, 16, 600, '#B45309', 'Arrived', 'middle')}
    <rect x="${x + 40 + (w - 64) / 2}" y="${y + 100}" width="${(w - 64) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(x + 40 + (w - 64) / 2 + (w - 64) / 4, y + 135, 16, 600, C.brand, 'Confirm', 'middle')}`;
}

// Master-list row (avatar + name + service·time + status), selectable.
function lRow(x, w, y, name, service, time, key, selected = false) {
  const label = key === 'Started' ? 'Started' : key;
  return `
    ${selected ? `<rect x="${x + 8}" y="${y}" width="${w - 16}" height="92" rx="14" fill="${C.brandSubtle}"/>` : ''}
    ${avatar(x + 46, y + 46, 26, name)}
    ${t(x + 88, y + 40, 18.5, 600, C.text, name)}
    ${t(x + 88, y + 66, 14.5, 500, C.textMuted, service + ' · ' + time)}
    ${statusPill(x + w - 28 - (26 + label.length * 8.6), y + 32, label, key)}
    ${selected ? '' : `<line x1="${x + 24}" y1="${y + 92}" x2="${x + w - 24}" y2="${y + 92}" stroke="${C.border}" stroke-width="1"/>`}`;
}

function tCalendar() {
  const gridLeft = NR + 96;
  const gridRight = TSW - 24;
  const colW = (gridRight - gridLeft) / 4;
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const yFor = (h, m = 0) => 250 + ((h - 8) * 60 + m) * 1.25;
  const cols = ['Sarah Lin', 'James Park', 'Aisha Khan', 'Mia Rossi'];
  const blk = (ci, h, m, dur, key, name, svc) => apptBlock(gridLeft + colW * ci + 6, yFor(h, m), colW - 12, dur * 1.25, key, name, svc, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return `
    <rect width="${TSW}" height="${TSH}" fill="#FFFFFF"/>
    ${navRail(0)}
    <rect x="${NR}" y="0" width="${TSW - NR}" height="96" fill="#FFFFFF"/>
    <line x1="${NR}" y1="96" x2="${TSW}" y2="96" stroke="${C.border}" stroke-width="1"/>
    ${ic('chevL', NR + 44, 48, 24, C.text, 2.4)}
    ${t(NR + 84, 56, 24, 800, C.text, 'Friday 13 June')}
    <circle cx="${NR + 348}" cy="48" r="5" fill="${C.teal}"/>
    ${ic('chevR', NR + 388, 48, 24, C.text, 2.4)}
    <rect x="${TSW - 384}" y="28" width="250" height="40" rx="12" fill="${C.surface}"/>
    <rect x="${TSW - 380}" y="32" width="78" height="32" rx="9" fill="#FFFFFF" stroke="${C.border}" stroke-width="1"/>${t(TSW - 341, 54, 15, 600, C.brand, 'Day', 'middle')}
    ${t(TSW - 222, 54, 15, 500, C.textMuted, 'Week', 'middle')}
    ${t(TSW - 165, 54, 15, 500, C.textMuted, 'Month', 'middle')}
    <rect x="${TSW - 110}" y="28" width="86" height="40" rx="12" fill="${C.brand}"/>${t(TSW - 67, 54, 15, 600, '#FFFFFF', 'Today', 'middle')}
    ${cols.map((n, i) => { const cx = gridLeft + colW * i; return `${i > 0 ? `<line x1="${cx}" y1="116" x2="${cx}" y2="${TSH}" stroke="#F4F7FB" stroke-width="1"/>` : ''}${avatar(cx + 36, 162, 18, n)}${t(cx + 62, 168, 16, 600, C.text, n)}`; }).join('')}
    <line x1="${gridLeft}" y1="210" x2="${gridRight}" y2="210" stroke="${C.border}" stroke-width="1"/>
    ${hours.map((h) => `${t(NR + 72, yFor(h) + 5, 14, 500, C.textMuted, String(h).padStart(2, '0'), 'end')}<line x1="${gridLeft}" y1="${yFor(h)}" x2="${gridRight}" y2="${yFor(h)}" stroke="#EEF2F7" stroke-width="1"/>`).join('')}
    ${blk(0, 9, 0, 60, 'Confirmed', 'Amelia H.', 'Deep Tissue')}
    ${blk(0, 11, 0, 90, 'Started', 'Priya S.', 'Hot Stone')}
    ${blk(0, 15, 0, 60, 'Booked', 'Chloe B.', 'Signature Facial')}
    ${blk(1, 10, 0, 60, 'Booked', 'George O.', 'Swedish')}
    ${blk(1, 13, 0, 75, 'Confirmed', 'Sam R.', 'Consultation')}
    ${blk(1, 15, 30, 90, 'Booked', 'Daniel C.', 'Sports Massage')}
    ${blk(2, 9, 30, 45, 'Pending', 'Maya I.', 'Manicure')}
    ${blk(2, 12, 0, 60, 'Confirmed', 'Liam T.', 'Deep Tissue')}
    ${blk(2, 16, 0, 60, 'Booked', 'Noah P.', 'Swedish')}
    ${blk(3, 10, 30, 60, 'Confirmed', 'Ava M.', 'Signature Facial')}
    ${blk(3, 14, 0, 90, 'Pending', 'Ivy L.', 'Hot Stone')}`;
}

function tBookings() {
  const lpw = 624;
  const lx = NR;
  const rx = NR + lpw + 1;
  const rw = TSW - rx;
  const cw = rw - CP * 2;
  const cx = rx + CP;
  const rows = [
    ['Amelia Hawthorne', 'Deep Tissue Massage', '08:00', 'Confirmed', true],
    ['George Okafor', 'Swedish Massage', '09:00', 'Booked', false],
    ['Priya Sharma', 'Hot Stone Therapy', '10:00', 'Started', false],
    ['Sam Rivera', 'Consultation', '10:00', 'Pending', false],
    ['Chloe Bennett', 'Signature Facial', '12:00', 'Confirmed', false],
    ['Daniel Cole', 'Sports Massage', '14:00', 'Booked', false],
  ];
  return `
    <rect width="${TSW}" height="${TSH}" fill="#FFFFFF"/>
    ${navRail(1)}
    <rect x="${lx}" y="0" width="${lpw}" height="${TSH}" fill="${C.surface}"/>
    <line x1="${lx + lpw}" y1="0" x2="${lx + lpw}" y2="${TSH}" stroke="${C.border}" stroke-width="1"/>
    ${t(lx + 28, 66, 26, 800, C.text, 'Appointments')}
    <rect x="${lx + 24}" y="94" width="${lpw - 48}" height="50" rx="14" fill="#FFFFFF" stroke="${C.border}" stroke-width="1"/>${ic('search', lx + 52, 119, 20, C.textMuted, 2.2)}${t(lx + 78, 126, 16, 500, C.textMuted, 'Search name, phone…')}
    ${(() => { let bx = lx + 24; return [['All', 12, true], ['Pending', 2, false], ['Confirmed', 3, false]].map(([l, n, on]) => { const w = 20 + String(l).length * 8.8 + 12 + 22 + 14; const x = bx; bx += w + 10; return `<rect x="${x}" y="164" width="${w}" height="40" rx="20" fill="${on ? C.brand : '#FFFFFF'}" stroke="${on ? C.brand : C.border}" stroke-width="1"/>${t(x + 18, 189, 14.5, 600, on ? '#FFFFFF' : C.textSec, l)}<circle cx="${x + w - 24}" cy="184" r="10" fill="${on ? '#FFFFFF' : C.borderStrong}"/>${t(x + w - 24, 188, 11, 700, on ? C.brand : C.text, String(n), 'middle')}`; }).join(''); })()}
    ${rows.map((r, i) => lRow(lx, lpw, 238 + i * 100, r[0], r[1], r[2], r[3], r[4])).join('')}
    ${bookingHeroCard(cx, 28, cw)}
    ${statusButtons(cx, 588, cw)}
    ${(() => { let yy = 804; return [['Details', '1 guest · Pending'], ['Notes', '2 notes'], ['Payments & confirmation', 'Pending']].map(([ti, su]) => { const g = `${card(cx, yy, cw, 64)}${t(cx + 24, yy + 40, 17, 600, C.text, ti)}${t(cx + cw - 56, yy + 40, 15, 500, C.textMuted, su, 'end')}${ic('chevR', cx + cw - 32, yy + 32, 18, C.textMuted, 2.2)}`; yy += 76; return g; }).join(''); })()}`;
}

function tDetail() {
  const colGap = 36;
  const lx = NR + CP;
  const totalW = TSW - NR - CP * 2;
  const colW = (totalW - colGap) / 2;
  const rxc = lx + colW + colGap;
  const detailRows = [['Party', '1 guest'], ['Service', 'Deep Tissue Massage'], ['With', 'Sarah Lin'], ['Location', 'Online'], ['Source', 'Online'], ['Reference', '#a1b2c3d4']];
  return `
    <rect width="${TSW}" height="${TSH}" fill="${C.surface}"/>
    ${navRail(1)}
    <rect x="${NR}" y="0" width="${TSW - NR}" height="92" fill="#FFFFFF"/>
    <line x1="${NR}" y1="92" x2="${TSW}" y2="92" stroke="${C.border}" stroke-width="1"/>
    ${ic('chevL', NR + 44, 46, 24, C.text, 2.4)}
    ${t(NR + 88, 54, 22, 700, C.text, 'Appointment')}
    ${btn(TSW - 270, 20, 240, 52, STATUS.Started.fg, 'Start appointment')}
    ${bookingHeroCard(lx, 116, colW)}
    ${statusButtons(lx, 676, colW)}
    ${card(rxc, 116, colW, 308)}
    ${t(rxc + 26, 160, 13, 700, C.textMuted, 'DETAILS', 'start', 1)}
    ${detailRows.map((r, i) => { const ry = 200 + i * 36; return `${t(rxc + 26, ry, 15.5, 500, C.textMuted, r[0])}${t(rxc + colW - 26, ry, 16, 500, C.text, r[1], 'end')}`; }).join('')}
    ${card(rxc, 448, colW, 176)}
    ${t(rxc + 26, 492, 13, 700, C.textMuted, 'NOTES', 'start', 1)}
    ${t(rxc + 26, 530, 15.5, 500, C.text, 'Please prepare the lavender oil.')}
    ${t(rxc + 26, 562, 15.5, 500, C.textMuted, 'Internal: regular client — loyalty rate.')}
    <g><rect x="${rxc + 26}" y="582" width="64" height="30" rx="15" fill="${C.brandSubtle}"/>${t(rxc + 58, 602, 13, 600, C.brand, 'VIP', 'middle')}</g>
    ${card(rxc, 648, colW, 256)}
    ${t(rxc + 26, 692, 13, 700, C.textMuted, 'PAYMENTS & REMINDERS', 'start', 1)}
    ${ic('card', rxc + 44, 738, 22, C.brand, 2)}${t(rxc + 78, 732, 24, 800, C.text, '£25.00')}${statusPill(rxc + colW - 26 - 96, 718, 'Pending', 'Pending')}
    ${t(rxc + 78, 762, 15, 500, C.textMuted, 'Deposit · awaiting payment')}
    ${btn(rxc + 26, 796, colW - 52, 52, C.brand, 'Send payment link')}
    ${ic('check', rxc + 38, 878, 18, STATUS.Started.fg, 2.4)}${t(rxc + 62, 884, 15, 500, C.textMuted, '24h email + 2h SMS reminders are on')}`;
}

function tNewBooking() {
  const lpw = 680;
  const rx = NR + lpw + 1;
  const rw = TSW - rx;
  const days = ['M 9', 'T 10', 'W 11', 'T 12', 'F 13', 'S 14', 'S 15'];
  const summary = [['Treatment', 'Deep Tissue Massage'], ['Duration', '60 minutes'], ['Practitioner', 'Sarah Lin'], ['Price', '£65.00'], ['Deposit', '£25.00 on booking']];
  const groups = [['MORNING', ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], 340], ['AFTERNOON', ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'], 520], ['EVENING', ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30'], 700]];
  const taken = new Set(['09:30', '11:00', '14:30', '17:30']);
  const sel = '10:30';
  const gw = (rw - CP * 2 - 2 * 20) / 3;
  return `
    <rect width="${TSW}" height="${TSH}" fill="#FFFFFF"/>
    ${navRail(1)}
    <rect x="${NR}" y="0" width="${TSW - NR}" height="92" fill="#FFFFFF"/>
    <line x1="${NR}" y1="92" x2="${TSW}" y2="92" stroke="${C.border}" stroke-width="1"/>
    ${ic('chevL', NR + 44, 46, 24, C.text, 2.4)}
    ${t(NR + 88, 54, 22, 700, C.text, 'New booking')}
    ${btn(TSW - 240, 20, 210, 52, C.brand, 'Continue · 10:30')}
    <rect x="${NR}" y="92" width="${lpw}" height="${TSH - 92}" fill="${C.surface}"/>
    <line x1="${NR + lpw}" y1="92" x2="${NR + lpw}" y2="${TSH}" stroke="${C.border}" stroke-width="1"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${NR + 28 + i * ((lpw - 56 - 24) / 4 + 8)}" y="132" width="${(lpw - 56 - 24) / 4}" height="6" rx="3" fill="${i <= 2 ? C.teal : C.border}"/>`).join('')}
    ${t(NR + 28, 184, 14, 700, C.textMuted, 'STEP 3 OF 4 · PICK A TIME', 'start', 1)}
    ${card(NR + 28, 212, lpw - 56, 152)}<rect x="${NR + 28}" y="212" width="6" height="152" rx="3" fill="${C.teal}"/>
    ${t(NR + 56, 258, 22, 700, C.text, 'Deep Tissue Massage')}
    ${t(NR + 56, 290, 16, 500, C.textSec, '60 min · £65.00')}
    ${avatar(NR + 74, 330, 18, 'Sarah Lin')}${t(NR + 102, 336, 15.5, 500, C.textMuted, 'with Sarah Lin')}
    ${t(NR + 28, 426, 17, 700, C.text, 'Service summary')}
    ${summary.map((r, i) => { const ry = 466 + i * 44; return `${t(NR + 28, ry, 15.5, 500, C.textMuted, r[0])}${t(NR + lpw - 28, ry, 16, 500, C.text, r[1], 'end')}<line x1="${NR + 28}" y1="${ry + 22}" x2="${NR + lpw - 28}" y2="${ry + 22}" stroke="${C.border}" stroke-width="1"/>`; }).join('')}
    ${t(rx + CP, 142, 24, 800, C.text, 'June 2026')}
    ${(() => { const dgw = (rw - CP * 2 - 6 * 12) / 7; return days.map((d, i) => { const x = rx + CP + i * (dgw + 12); const on = i === 4; return `<rect x="${x}" y="166" width="${dgw}" height="84" rx="14" fill="${on ? C.brand : '#FFFFFF'}" stroke="${on ? C.brand : C.border}" stroke-width="1"/>${t(x + dgw / 2, 198, 14, 600, on ? '#BBD3EA' : C.textMuted, d.split(' ')[0], 'middle')}${t(x + dgw / 2, 230, 22, 700, on ? '#FFFFFF' : C.text, d.split(' ')[1], 'middle')}`; }).join(''); })()}
    ${t(rx + CP, 306, 18, 700, C.text, 'Available times')}
    ${groups.map(([lab, list, y0]) => `${t(rx + CP, y0, 15, 700, C.textMuted, lab, 'start', 0.8)}` + list.map((s, i) => { const cx = rx + CP + (i % 3) * (gw + 20); const cy = y0 + 22 + Math.floor(i / 3) * 72; const on = s === sel; const off = taken.has(s); const fill = on ? C.brand : off ? C.surface : '#FFFFFF'; const fg = on ? '#FFFFFF' : off ? C.borderStrong : C.text; return `<rect x="${cx}" y="${cy}" width="${gw}" height="56" rx="14" fill="${fill}" stroke="${on ? C.brand : C.border}" stroke-width="1.5"/>${t(cx + gw / 2, cy + 36, 18, 600, fg, s, 'middle')}${off ? `<line x1="${cx + 24}" y1="${cy + 28}" x2="${cx + gw - 24}" y2="${cy + 28}" stroke="${C.borderStrong}" stroke-width="1.5"/>` : ''}`; }).join('')).join('')}`;
}

function tClients() {
  const lpw = 600;
  const lx = NR;
  const rx = NR + lpw + 1;
  const rw = TSW - rx;
  const cx = rx + CP;
  const cw = rw - CP * 2;
  const list = [['Amelia Hawthorne', '12 visits · VIP', true], ['George Okafor', '3 visits', false], ['Priya Sharma', '8 visits', false], ['Sam Rivera', 'First visit', false], ['Chloe Bennett', '5 visits', false], ['Daniel Cole', '2 visits', false], ['Maya Idris', '9 visits · VIP', false]];
  const tags = ['VIP', 'Allergy: nuts', 'Prefers Sarah'];
  const tw = (l) => 28 + l.length * 8.6;
  const totalTagW = tags.reduce((a, l) => a + tw(l), 0) + (tags.length - 1) * 12;
  let tgx = cx + cw / 2 - totalTagW / 2;
  const tagRow = tags.map((l) => { const w = tw(l); const g = `<rect x="${tgx}" y="262" width="${w}" height="34" rx="17" fill="${C.brandSubtle}"/>${t(tgx + w / 2, 284, 14, 600, C.brand, l, 'middle')}`; tgx += w + 12; return g; }).join('');
  const hist = [['Swedish Massage', '2 Apr 2026 · £55'], ['Signature Facial', '6 Mar 2026 · £70'], ['Hot Stone Therapy', '1 Feb 2026 · £80']];
  return `
    <rect width="${TSW}" height="${TSH}" fill="#FFFFFF"/>
    ${navRail(2)}
    <rect x="${lx}" y="0" width="${lpw}" height="${TSH}" fill="${C.surface}"/>
    <line x1="${lx + lpw}" y1="0" x2="${lx + lpw}" y2="${TSH}" stroke="${C.border}" stroke-width="1"/>
    ${t(lx + 28, 66, 26, 800, C.text, 'Clients')}
    <rect x="${lx + 24}" y="94" width="${lpw - 48}" height="50" rx="14" fill="#FFFFFF" stroke="${C.border}" stroke-width="1"/>${ic('search', lx + 52, 119, 20, C.textMuted, 2.2)}${t(lx + 78, 126, 16, 500, C.textMuted, 'Search clients…')}
    ${list.map(([n, sub, on], i) => { const y = 170 + i * 92; return `${on ? `<rect x="${lx + 8}" y="${y}" width="${lpw - 16}" height="84" rx="14" fill="${C.brandSubtle}"/>` : ''}${avatar(lx + 46, y + 42, 24, n)}${t(lx + 86, y + 38, 18, 600, C.text, n)}${t(lx + 86, y + 64, 14, 500, C.textMuted, sub)}${on ? '' : `<line x1="${lx + 24}" y1="${y + 84}" x2="${lx + lpw - 24}" y2="${y + 84}" stroke="${C.border}" stroke-width="1"/>`}`; }).join('')}
    ${card(cx, 28, cw, 300)}
    ${avatar(cx + cw / 2, 108, 46, 'Amelia Hawthorne')}
    ${t(cx + cw / 2, 200, 26, 700, C.text, 'Amelia Hawthorne', 'middle')}
    ${t(cx + cw / 2, 232, 15.5, 500, C.textMuted, '+44 7700 900123 · amelia.h@example.com', 'middle')}
    ${tagRow}
    ${card(cx, 348, cw, 120)}
    ${[['12', 'visits'], ['2 Apr', 'last visit'], ['£820', 'total spend']].map((s, i) => { const sx = cx + cw / 6 + (cw / 3) * i; return `${t(sx, 418, 26, 800, C.text, s[0], 'middle')}${t(sx, 446, 14, 500, C.textMuted, s[1], 'middle')}`; }).join('')}
    <line x1="${cx + cw / 3}" y1="388" x2="${cx + cw / 3}" y2="442" stroke="${C.border}" stroke-width="1"/>
    <line x1="${cx + (cw * 2) / 3}" y1="388" x2="${cx + (cw * 2) / 3}" y2="442" stroke="${C.border}" stroke-width="1"/>
    ${t(cx, 514, 14, 700, C.textMuted, 'UPCOMING', 'start', 1.2)}
    ${card(cx, 534, cw, 90)}<rect x="${cx}" y="534" width="6" height="90" rx="3" fill="${STATUS.Booked.fg}"/>
    ${t(cx + 28, 576, 18, 600, C.text, 'Deep Tissue Massage')}${t(cx + 28, 602, 14.5, 500, C.textMuted, 'Fri 13 Jun · 14:00 · Sarah Lin')}${ic('chevR', cx + cw - 32, 580, 18, C.textMuted, 2.2)}
    ${t(cx, 664, 14, 700, C.textMuted, 'VISIT HISTORY', 'start', 1.2)}
    ${card(cx, 684, cw, 300)}
    ${hist.map((h, i) => { const y = 734 + i * 92; return `${t(cx + 28, y, 17.5, 600, C.text, h[0])}${t(cx + 28, y + 26, 14.5, 500, C.textMuted, h[1])}${statusPill(cx + cw - 28 - (26 + 9 * 8.6), y - 22, 'Completed', 'Completed', 30)}${i < 2 ? `<line x1="${cx + 28}" y1="${y + 48}" x2="${cx + cw - 28}" y2="${y + 48}" stroke="${C.border}" stroke-width="1"/>` : ''}`; }).join('')}`;
}

function tDeposits() {
  const colGap = 36;
  const lx = NR + CP;
  const totalW = TSW - NR - CP * 2;
  const colW = (totalW - colGap) / 2;
  const rxc = lx + colW + colGap;
  const comms = [['EMAIL', 'Booking confirmation', 'Sent', 'Started', '10 Jun, 09:25'], ['SMS', 'Appointment reminder', 'Scheduled', 'Booked', 'Sends 12 Jun, 14:00'], ['EMAIL', 'Deposit request', 'Sent', 'Started', '10 Jun, 09:25']];
  const reminders = [['24h email reminder', 'Sent the day before', 222], ['2h SMS reminder', 'A nudge before the visit', 322]];
  return `
    <rect width="${TSW}" height="${TSH}" fill="${C.surface}"/>
    ${navRail(1)}
    <rect x="${NR}" y="0" width="${TSW - NR}" height="92" fill="#FFFFFF"/>
    <line x1="${NR}" y1="92" x2="${TSW}" y2="92" stroke="${C.border}" stroke-width="1"/>
    ${ic('chevL', NR + 44, 46, 24, C.text, 2.4)}
    ${t(NR + 88, 54, 22, 700, C.text, 'Payments & reminders')}
    ${t(lx, 140, 13, 700, C.textMuted, 'DEPOSIT', 'start', 1.2)}
    ${card(lx, 160, colW, 250)}
    ${ic('card', lx + 44, 220, 26, C.brand, 2)}${t(lx + 82, 214, 28, 800, C.text, '£25.00')}${t(lx + 82, 246, 15.5, 500, C.textMuted, 'Requested · awaiting payment')}${statusPill(lx + colW - 26 - 96, 200, 'Pending', 'Pending')}
    ${btn(lx + 24, 286, colW - 48, 56, C.brand, 'Send payment link')}
    <rect x="${lx + 24}" y="358" width="${(colW - 64) / 2}" height="52" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(lx + 24 + (colW - 64) / 4, 392, 16, 600, C.text, 'Record cash', 'middle')}
    <rect x="${lx + 40 + (colW - 64) / 2}" y="358" width="${(colW - 64) / 2}" height="52" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(lx + 40 + (colW - 64) / 2 + (colW - 64) / 4, 392, 16, 600, C.text, 'Waive', 'middle')}
    ${t(lx, 460, 13, 700, C.textMuted, 'SENT TO GUEST', 'start', 1.2)}
    ${card(lx, 480, colW, 300)}
    ${comms.map((c, i) => { const y = 524 + i * 88; const chW = 36 + c[0].length * 8; return `<rect x="${lx + 24}" y="${y - 22}" width="${chW}" height="28" rx="8" fill="${C.brandSubtle}"/>${t(lx + 24 + chW / 2, y - 3, 13, 700, C.brand, c[0], 'middle')}${statusPill(lx + 24 + chW + 10, y - 23, c[2], c[3], 28)}${t(lx + 24, y + 24, 15.5, 500, C.text, c[1])}${t(lx + 24, y + 48, 13.5, 500, C.textMuted, c[4])}${i < 2 ? `<line x1="${lx + 24}" y1="${y + 66}" x2="${lx + colW - 24}" y2="${y + 66}" stroke="${C.border}" stroke-width="1"/>` : ''}`; }).join('')}
    ${t(rxc, 140, 13, 700, C.textMuted, 'AUTOMATIC REMINDERS', 'start', 1.2)}
    ${card(rxc, 160, colW, 230)}
    ${reminders.map((r, idx) => `${t(rxc + 26, r[2], 17, 600, C.text, r[0])}${t(rxc + 26, r[2] + 28, 14.5, 500, C.textMuted, r[1])}<rect x="${rxc + colW - 26 - 64}" y="${r[2] - 24}" width="64" height="36" rx="18" fill="${C.teal}"/><circle cx="${rxc + colW - 26 - 22}" cy="${r[2] - 6}" r="14" fill="#FFFFFF"/>${idx === 0 ? `<line x1="${rxc + 26}" y1="${r[2] + 50}" x2="${rxc + colW - 26}" y2="${r[2] + 50}" stroke="${C.border}" stroke-width="1"/>` : ''}`).join('')}
    ${t(rxc, 440, 13, 700, C.textMuted, 'NO-SHOW PROTECTION', 'start', 1.2)}
    ${card(rxc, 460, colW, 320)}
    ${ic('check', rxc + 44, 520, 26, STATUS.Started.fg, 2.4)}${t(rxc + 84, 528, 19, 700, C.text, 'Deposit + reminders active')}
    ${t(rxc + 26, 586, 15.5, 500, C.textSec, 'Clients confirm and pay a deposit when they')}
    ${t(rxc + 26, 616, 15.5, 500, C.textSec, 'book, then get automatic reminders — cutting')}
    ${t(rxc + 26, 646, 15.5, 500, C.textSec, 'no-shows and protecting your revenue.')}
    ${t(rxc + 26, 716, 30, 800, STATUS.Started.fg, '38% fewer')}${t(rxc + 26, 748, 15.5, 500, C.textMuted, 'no-shows on average')}`;
}

function composeLandscape(eyebrow, lines, inner, renderW, renderH) {
  const heads = lines.map((ln, i) => t(LW / 2, 196 + i * 64, 56, 800, C.white, ln, 'middle', -1)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${LW} ${LH}">
  <defs>
    <linearGradient id="bgL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navyTop}"/><stop offset="1" stop-color="${C.navyBottom}"/></linearGradient>
    <radialGradient id="glowL" cx="0.5" cy="0.1" r="0.55"><stop offset="0" stop-color="${C.teal}" stop-opacity="0.3"/><stop offset="1" stop-color="${C.teal}" stop-opacity="0"/></radialGradient>
    <clipPath id="screenL"><rect x="${TSX}" y="${TSY}" width="${TSW}" height="${TSH}" rx="34"/></clipPath>
    <clipPath id="chipL"><rect x="${LW / 2 - 92}" y="64" width="52" height="52" rx="13"/></clipPath>
    <filter id="shL" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="${LW}" height="${LH}" fill="url(#bgL)"/>
  <rect width="${LW}" height="${LH}" fill="url(#glowL)"/>
  <image href="data:image/png;base64,${watermarkB64}" x="${LW - 440}" y="${LH - 360}" width="520" height="520" opacity="0.05"/>
  <image href="data:image/png;base64,${appIconB64}" x="${LW / 2 - 92}" y="64" width="52" height="52" clip-path="url(#chipL)"/>
  ${t(LW / 2 - 28, 102, 30, 800, C.white, 'Resneo', 'start', -0.4)}
  ${t(LW / 2, 150, 20, 700, C.teal, eyebrow, 'middle', 3)}
  ${heads}
  <rect x="${TBODY.x}" y="${TBODY.y + 18}" width="${TBODY.w}" height="${TBODY.h}" rx="${TBODY.r}" fill="#000000" opacity="0.4" filter="url(#shL)"/>
  <rect x="${TBODY.x}" y="${TBODY.y}" width="${TBODY.w}" height="${TBODY.h}" rx="${TBODY.r}" fill="#0A1424" stroke="#274A6B" stroke-width="2"/>
  <g clip-path="url(#screenL)"><svg x="${TSX}" y="${TSY}" width="${TSW}" height="${TSH}" viewBox="0 0 ${TSW} ${TSH}">${inner}</svg></g>
</svg>`;
}

const LANDSCAPE_SCREENS = [
  { file: '01-calendar.png', eyebrow: 'CALENDAR', lines: ["Your whole team's day"], build: tCalendar },
  { file: '02-bookings.png', eyebrow: 'BOOKINGS', lines: ['Every booking, in context'], build: tBookings },
  { file: '03-booking-detail.png', eyebrow: 'BOOKING DETAILS', lines: ['A command centre for every booking'], build: tDetail },
  { file: '04-new-booking.png', eyebrow: 'NEW BOOKING', lines: ['Book a client in seconds'], build: tNewBooking },
  { file: '05-client.png', eyebrow: 'CLIENTS', lines: ['Know every client'], build: tClients },
  { file: '06-deposits.png', eyebrow: 'DEPOSITS & REMINDERS', lines: ['Take deposits, cut no-shows'], build: tDeposits },
];

// Phone — portrait 9:16, 1080×1920.
mkdirSync('assets/images/screenshots', { recursive: true });
for (const sc of SCREENS) {
  const svg = compose(sc.eyebrow, sc.lines, sc.build(), CW * 2, CH * 2);
  await sharp(Buffer.from(svg)).resize(CW, CH).png({ compressionLevel: 9 }).toFile(`assets/images/screenshots/${sc.file}`);
}
console.log('wrote 6 phone screenshots (1080×1920) → assets/images/screenshots');

// Tablet sets — same landscape 16:9 designs, rendered at ~1.5× then downscaled
// to each device resolution. 7-inch: 2560×1440. 10-inch: 3200×1800.
const TABLET_TARGETS = [
  { dir: 'assets/images/screenshots-7in', w: 2560, h: 1440, label: '7-inch tablet' },
  { dir: 'assets/images/screenshots-10in', w: 3200, h: 1800, label: '10-inch tablet' },
];
for (const target of TABLET_TARGETS) {
  mkdirSync(target.dir, { recursive: true });
  for (const sc of LANDSCAPE_SCREENS) {
    const svg = composeLandscape(sc.eyebrow, sc.lines, sc.build(), Math.round(target.w * 1.5), Math.round(target.h * 1.5));
    await sharp(Buffer.from(svg)).resize(target.w, target.h).png({ compressionLevel: 9 }).toFile(`${target.dir}/${sc.file}`);
  }
  console.log(`wrote 6 ${target.label} screenshots (${target.w}×${target.h}) → ${target.dir}`);
}
console.log('Done.');
