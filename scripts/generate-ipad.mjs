/**
 * Apple App Store iPad assets for Resneo — iPad Pro 12.9" LANDSCAPE.
 *
 *   • 6 raw screenshots (full-bleed tablet UI) → screenshots-ipad/0N-*.png  (2732×2048)
 *   • 3 raw app previews (full-bleed video)    → previews-ipad/preview-N.mp4 (1600×1200)
 *
 * iPad is 4:3 — a totally different shape from the phone (~9:19.5). So these are
 * NOT scaled phone screens: they reuse the genuine tablet LAYOUTS (a left nav rail
 * + master-detail / multi-column panes) and are reflowed to fill the 4:3 height
 * (more calendar hours, more list rows, extra cards). Design atoms (tokens, Inter,
 * status pills, AppointmentBlock, BookingDetailContent) come from
 * ./lib/app-screens.mjs so they match the real app.
 *
 * Screenshots are 2732×2048 (iPad 12.9"); also valid: 2048×2732, 2064×2752,
 * 2752×2064. App previews use Apple's smaller iPad size (1600×1200 landscape).
 * Screenshots are flattened (no alpha — App Store Connect rejects transparency).
 *
 * Re-run: `npm run app-store:ipad`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
import { C, STATUS, t, ic, statusPill, avatar, metaChip, card, btn, apptBlock } from './lib/app-screens.mjs';

// --- iPad frame sizes ---------------------------------------------------------
const IPAD_W = 2732; // 12.9" landscape SCREENSHOT
const IPAD_H = 2048;
const PREV_W = 1600; // 12.9" landscape app-PREVIEW (Apple uses a smaller size)
const PREV_H = 1200;

// --- Tablet logical canvas — 4:3 to match iPad (1664 × 1248) -------------------
const TSW = 1664;
const TSH = 1248;
const NR = 104; // nav rail width
const CP = 28; // content padding

// --- Tablet atoms (nav rail + reusable cards), full-height aware ---------------
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

// A simple titled section card with rows (label left, value right) — used to
// fill the taller 4:3 panes with real, on-brand content.
function infoCard(x, y, w, h, title, rows) {
  return `${card(x, y, w, h)}${t(x + 26, y + 40, 13, 700, C.textMuted, title, 'start', 1)}${rows
    .map((r, i) => { const ry = y + 84 + i * 40; return `${t(x + 26, ry, 15.5, 500, C.textMuted, r[0])}${t(x + w - 26, ry, 16, 500, C.text, r[1], 'end')}${i < rows.length - 1 ? `<line x1="${x + 26}" y1="${ry + 20}" x2="${x + w - 26}" y2="${ry + 20}" stroke="${C.border}" stroke-width="1"/>` : ''}`; })
    .join('')}`;
}

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

// =============================================================================
// iPad screens (4:3, reflowed to fill 1664×1248)
// =============================================================================
function tCalendar() {
  const gridLeft = NR + 96;
  const gridRight = TSW - 24;
  const colW = (gridRight - gridLeft) / 4;
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // extended to fill 4:3 height
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
    ${blk(0, 18, 0, 60, 'Confirmed', 'Ruby N.', 'Swedish')}
    ${blk(1, 10, 0, 60, 'Booked', 'George O.', 'Swedish')}
    ${blk(1, 13, 0, 75, 'Confirmed', 'Sam R.', 'Consultation')}
    ${blk(1, 15, 30, 90, 'Booked', 'Daniel C.', 'Sports Massage')}
    ${blk(1, 19, 0, 60, 'Pending', 'Theo W.', 'Deep Tissue')}
    ${blk(2, 9, 30, 45, 'Pending', 'Maya I.', 'Manicure')}
    ${blk(2, 12, 0, 60, 'Confirmed', 'Liam T.', 'Deep Tissue')}
    ${blk(2, 16, 0, 60, 'Booked', 'Noah P.', 'Swedish')}
    ${blk(2, 18, 30, 90, 'Started', 'Ella F.', 'Hot Stone')}
    ${blk(3, 10, 30, 60, 'Confirmed', 'Ava M.', 'Signature Facial')}
    ${blk(3, 14, 0, 90, 'Pending', 'Ivy L.', 'Hot Stone')}
    ${blk(3, 18, 0, 60, 'Booked', 'Jack S.', 'Sports Massage')}
    ${blk(3, 20, 0, 60, 'Confirmed', 'Mia K.', 'Swedish')}`;
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
    ['Liam Turner', 'Deep Tissue Massage', '15:00', 'Confirmed', false],
    ['Ava Mitchell', 'Signature Facial', '16:00', 'Booked', false],
    ['Noah Price', 'Swedish Massage', '17:00', 'Pending', false],
    ['Ella Fraser', 'Hot Stone Therapy', '18:30', 'Booked', false],
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
    ${(() => { let yy = 804; return [['Details', '1 guest · Pending'], ['Notes', '2 notes'], ['Payments & confirmation', 'Pending'], ['SMS / Email guest', '1 sent'], ['Activity log', '5 events']].map(([ti, su]) => { const g = `${card(cx, yy, cw, 64)}${t(cx + 24, yy + 40, 17, 600, C.text, ti)}${t(cx + cw - 56, yy + 40, 15, 500, C.textMuted, su, 'end')}${ic('chevR', cx + cw - 32, yy + 32, 18, C.textMuted, 2.2)}`; yy += 76; return g; }).join(''); })()}`;
}

function tDetail() {
  const colGap = 36;
  const lx = NR + CP;
  const totalW = TSW - NR - CP * 2;
  const colW = (totalW - colGap) / 2;
  const rxc = lx + colW + colGap;
  const detailRows = [['Party', '1 guest'], ['Service', 'Deep Tissue Massage'], ['With', 'Sarah Lin'], ['Location', 'Online'], ['Source', 'Online'], ['Reference', '#a1b2c3d4']];
  const activity = [['Booked online', 'Mon 9 Jun · 18:42'], ['Deposit requested', 'Tue 10 Jun · 09:25'], ['Confirmation sent', 'Tue 10 Jun · 09:25'], ['Reminder scheduled', 'Sends 12 Jun · 14:00']];
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
    ${card(lx, 884, colW, 320)}
    ${t(lx + 26, 928, 13, 700, C.textMuted, 'ACTIVITY', 'start', 1)}
    ${activity.map((a, i) => { const ay = 968 + i * 56; return `<circle cx="${lx + 34}" cy="${ay - 5}" r="5" fill="${C.teal}"/>${i < activity.length - 1 ? `<line x1="${lx + 34}" y1="${ay + 2}" x2="${lx + 34}" y2="${ay + 50}" stroke="${C.border}" stroke-width="1.5"/>` : ''}${t(lx + 58, ay, 15.5, 600, C.text, a[0])}${t(lx + colW - 26, ay, 14.5, 500, C.textMuted, a[1], 'end')}`; }).join('')}
    ${card(rxc, 116, colW, 308)}
    ${t(rxc + 26, 160, 13, 700, C.textMuted, 'DETAILS', 'start', 1)}
    ${detailRows.map((r, i) => { const ry = 200 + i * 36; return `${t(rxc + 26, ry, 15.5, 500, C.textMuted, r[0])}${t(rxc + colW - 26, ry, 16, 500, C.text, r[1], 'end')}`; }).join('')}
    ${card(rxc, 448, colW, 176)}
    ${t(rxc + 26, 492, 13, 700, C.textMuted, 'NOTES', 'start', 1)}
    ${t(rxc + 26, 530, 15.5, 500, C.text, 'Please prepare the lavender oil.')}
    ${t(rxc + 26, 562, 15.5, 500, C.textMuted, 'Internal: regular client — loyalty rate.')}
    <g><rect x="${rxc + 26}" y="582" width="64" height="30" rx="15" fill="${C.brandSubtle}"/>${t(rxc + 58, 602, 13, 600, C.brand, 'VIP', 'middle')}</g>
    ${card(rxc, 648, colW, 240)}
    ${t(rxc + 26, 692, 13, 700, C.textMuted, 'PAYMENTS & REMINDERS', 'start', 1)}
    ${ic('card', rxc + 44, 738, 22, C.brand, 2)}${t(rxc + 78, 732, 24, 800, C.text, '£25.00')}${statusPill(rxc + colW - 26 - 96, 718, 'Pending', 'Pending')}
    ${t(rxc + 78, 762, 15, 500, C.textMuted, 'Deposit · awaiting payment')}
    ${btn(rxc + 26, 792, colW - 52, 52, C.brand, 'Send payment link')}
    ${infoCard(rxc, 912, colW, 292, 'GUEST', [['Visits', '12'], ['Last visit', '2 Apr 2026'], ['Total spend', '£820'], ['No-shows', '0'], ['Tags', 'VIP · Allergy: nuts']])}`;
}

function tNewBooking() {
  const lpw = 680;
  const rx = NR + lpw + 1;
  const rw = TSW - rx;
  const days = ['M 9', 'T 10', 'W 11', 'T 12', 'F 13', 'S 14', 'S 15'];
  const summary = [['Treatment', 'Deep Tissue Massage'], ['Duration', '60 minutes'], ['Practitioner', 'Sarah Lin'], ['Price', '£65.00'], ['Deposit', '£25.00 on booking']];
  const groups = [['MORNING', ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], 340], ['AFTERNOON', ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'], 560], ['EVENING', ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30'], 780], ['NIGHT', ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30'], 1000]];
  const taken = new Set(['09:30', '11:00', '14:30', '17:30', '20:30']);
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
    ${t(NR + 28, 736, 17, 700, C.text, 'Add-ons')}
    ${[['Aromatherapy', '+£12'], ['Hot towels', '+£6'], ['Extend 30 min', '+£30']].map((a, i) => { const ay = 778 + i * 58; return `<rect x="${NR + 28}" y="${ay - 26}" width="${lpw - 56}" height="48" rx="12" fill="#FFFFFF" stroke="${C.border}" stroke-width="1"/>${t(NR + 48, ay + 4, 15.5, 600, C.text, a[0])}${t(NR + lpw - 48, ay + 4, 15.5, 600, C.brand, a[1], 'end')}`; }).join('')}
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
  const list = [['Amelia Hawthorne', '12 visits · VIP', true], ['George Okafor', '3 visits', false], ['Priya Sharma', '8 visits', false], ['Sam Rivera', 'First visit', false], ['Chloe Bennett', '5 visits', false], ['Daniel Cole', '2 visits', false], ['Maya Idris', '9 visits · VIP', false], ['Liam Turner', '4 visits', false], ['Ava Mitchell', '6 visits', false], ['Noah Price', '1 visit', false]];
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
    ${hist.map((h, i) => { const y = 734 + i * 92; return `${t(cx + 28, y, 17.5, 600, C.text, h[0])}${t(cx + 28, y + 26, 14.5, 500, C.textMuted, h[1])}${statusPill(cx + cw - 28 - (26 + 9 * 8.6), y - 22, 'Completed', 'Completed', 30)}${i < 2 ? `<line x1="${cx + 28}" y1="${y + 48}" x2="${cx + cw - 28}" y2="${y + 48}" stroke="${C.border}" stroke-width="1"/>` : ''}`; }).join('')}
    ${card(cx, 1008, cw, 196)}
    ${t(cx + 26, 1052, 13, 700, C.textMuted, 'PREFERENCES & NOTES', 'start', 1)}
    ${t(cx + 26, 1092, 15.5, 500, C.textSec, 'Prefers a quiet room and herbal tea.')}
    ${t(cx + 26, 1124, 15.5, 500, C.textSec, 'Always books with Sarah; sensitive to strong scents.')}
    ${t(cx + 26, 1168, 14.5, 600, C.brand, 'Edit notes')}`;
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
    ${infoCard(lx, 800, colW, 404, 'PAYMENT HISTORY', [['Deposit · 12 Mar', '£25.00'], ['Balance · 12 Mar', '£40.00'], ['Deposit · 2 Apr', '£25.00'], ['Balance · 2 Apr', '£30.00'], ['Refund · 18 Apr', '−£25.00'], ['Total collected', '£820.00']])}
    ${t(rxc, 140, 13, 700, C.textMuted, 'AUTOMATIC REMINDERS', 'start', 1.2)}
    ${card(rxc, 160, colW, 230)}
    ${reminders.map((r, idx) => `${t(rxc + 26, r[2], 17, 600, C.text, r[0])}${t(rxc + 26, r[2] + 28, 14.5, 500, C.textMuted, r[1])}<rect x="${rxc + colW - 26 - 64}" y="${r[2] - 24}" width="64" height="36" rx="18" fill="${C.teal}"/><circle cx="${rxc + colW - 26 - 22}" cy="${r[2] - 6}" r="14" fill="#FFFFFF"/>${idx === 0 ? `<line x1="${rxc + 26}" y1="${r[2] + 50}" x2="${rxc + colW - 26}" y2="${r[2] + 50}" stroke="${C.border}" stroke-width="1"/>` : ''}`).join('')}
    ${t(rxc, 440, 13, 700, C.textMuted, 'NO-SHOW PROTECTION', 'start', 1.2)}
    ${card(rxc, 460, colW, 744)}
    ${ic('check', rxc + 44, 520, 26, STATUS.Started.fg, 2.4)}${t(rxc + 84, 528, 19, 700, C.text, 'Deposit + reminders active')}
    ${t(rxc + 26, 586, 15.5, 500, C.textSec, 'Clients confirm and pay a deposit when they')}
    ${t(rxc + 26, 616, 15.5, 500, C.textSec, 'book, then get automatic reminders — cutting')}
    ${t(rxc + 26, 646, 15.5, 500, C.textSec, 'no-shows and protecting your revenue.')}
    <line x1="${rxc + 26}" y1="700" x2="${rxc + colW - 26}" y2="700" stroke="${C.border}" stroke-width="1"/>
    ${[['38% fewer', 'no-shows on average'], ['£1,240', 'deposits collected this month'], ['96%', 'reminders delivered']].map((s, i) => { const sy = 770 + i * 130; return `${t(rxc + 26, sy, 34, 800, STATUS.Started.fg, s[0])}${t(rxc + 26, sy + 34, 15.5, 500, C.textMuted, s[1])}${i < 2 ? `<line x1="${rxc + 26}" y1="${sy + 64}" x2="${rxc + colW - 26}" y2="${sy + 64}" stroke="${C.border}" stroke-width="1"/>` : ''}`; }).join('')}`;
}

// =============================================================================
// Compose (raw full-bleed — the tablet screen fills the 4:3 frame exactly) + I/O
// =============================================================================
const composeScreen = (inner, renderW, renderH) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${TSW} ${TSH}">${inner}</svg>`;

const SCREENS = [
  { file: '01-calendar.png', build: tCalendar },
  { file: '02-bookings.png', build: tBookings },
  { file: '03-booking-detail.png', build: tDetail },
  { file: '04-new-booking.png', build: tNewBooking },
  { file: '05-client.png', build: tClients },
  { file: '06-deposits.png', build: tDeposits },
];

const SHOT_DIR = 'assets/images/app-store/screenshots-ipad';
const PREVIEW_DIR = 'assets/images/app-store/previews-ipad';
mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(PREVIEW_DIR, { recursive: true });

// Render → opaque IPAD_W×IPAD_H PNG (2× logical supersample → downscale, crisp).
for (const sc of SCREENS) {
  const svg = composeScreen(sc.build(), TSW * 2, TSH * 2);
  const out = `${SHOT_DIR}/${sc.file}`;
  await sharp(Buffer.from(svg)).resize(IPAD_W, IPAD_H).flatten({ background: '#FFFFFF' }).png({ compressionLevel: 9 }).toFile(out);
  const m = await sharp(out).metadata();
  if (m.width !== IPAD_W || m.height !== IPAD_H) throw new Error(`${sc.file}: expected ${IPAD_W}×${IPAD_H}, got ${m.width}×${m.height}`);
  if (m.hasAlpha) throw new Error(`${sc.file}: has an alpha channel — App Store will reject it`);
}
console.log(`wrote 6 iPad screenshots (${IPAD_W}×${IPAD_H}, no-alpha) → ${SHOT_DIR}`);

// =============================================================================
// iPad app previews — full-bleed, hold each of 3 screens then slide (native push).
// =============================================================================
function findFfmpeg() {
  const cands = [process.env.FFMPEG, 'ffmpeg', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')].filter(Boolean);
  for (const c of cands) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  return null;
}

const FPS = 30;
const SCENE = 6;
const XF = 0.5;
const FRAME_DIR = `${PREVIEW_DIR}/.frames`;
const byId = Object.fromEntries(SCREENS.map((s) => [s.file.slice(0, 2), s]));
const PREVIEWS = [
  { file: 'preview-1.mp4', frames: ['01', '02', '03'] },
  { file: 'preview-2.mp4', frames: ['04', '05', '01'] },
  { file: 'preview-3.mp4', frames: ['06', '03', '02'] },
];

function previewArgs(frames, out) {
  const inputs = frames.flatMap((k) => ['-loop', '1', '-t', String(SCENE), '-i', `${FRAME_DIR}/frame-${k}.png`]);
  const prep = frames.map((_, i) => `[${i}:v]fps=${FPS},scale=${PREV_W}:${PREV_H},setsar=1[v${i}]`);
  const xfade = [
    `[v0][v1]xfade=transition=slideleft:duration=${XF}:offset=${(SCENE - XF).toFixed(2)}[x1]`,
    `[x1][v2]xfade=transition=slideleft:duration=${XF}:offset=${(2 * (SCENE - XF)).toFixed(2)}[vout]`,
  ];
  const audioLen = (3 * SCENE - 2 * XF + 1).toFixed(0);
  return [
    '-y', ...inputs,
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
  console.warn('\n⚠  ffmpeg not found — iPad screenshots written, previews SKIPPED. Install: winget install Gyan.FFmpeg');
} else {
  mkdirSync(FRAME_DIR, { recursive: true });
  for (const k of [...new Set(PREVIEWS.flatMap((p) => p.frames))]) {
    const svg = composeScreen(byId[k].build(), PREV_W * 2, PREV_H * 2);
    await sharp(Buffer.from(svg)).resize(PREV_W, PREV_H).flatten({ background: '#FFFFFF' }).png({ compressionLevel: 9 }).toFile(`${FRAME_DIR}/frame-${k}.png`);
  }
  console.log(`encoding 3 iPad previews (${PREV_W}×${PREV_H}) with ${ffmpeg} …`);
  for (const p of PREVIEWS) {
    const r = spawnSync(ffmpeg, previewArgs(p.frames, p.file), { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) { console.error(`✗ ${p.file} failed:\n${r.stderr?.toString().split('\n').slice(-12).join('\n')}`); process.exitCode = 1; }
    else { console.log(`  ✓ ${PREVIEW_DIR}/${p.file}`); }
  }
  rmSync(FRAME_DIR, { recursive: true, force: true });
}
console.log('Done.');
