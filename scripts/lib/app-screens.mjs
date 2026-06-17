/**
 * Shared Resneo phone-screen mock-ups + design atoms (pure SVG strings).
 *
 * These render accurate mock-ups of the REAL app screens in a fixed logical
 * "screen" coordinate space (SW × SH), reusing the real design tokens
 * (theme/index.ts), Inter typography, booking status-pill colours, the
 * AppointmentBlock layout and the redesigned BookingDetailContent.
 *
 * Both store generators import these so the screenshots stay in lock-step from
 * a single source of truth:
 *   - scripts/generate-screenshots.mjs  → Google Play (phone + tablet)
 *   - scripts/generate-app-store.mjs     → Apple App Store (iPhone 6.7")
 *
 * No sharp / fs here — just strings, so importing is side-effect free.
 */

// --- Logical phone-screen content space (independent of marketing canvas) -----
export const SW = 764;
export const SH = 1528;
export const TAB_H = 96;

// --- Palette (matches theme/index.ts) -----------------------------------------
export const C = {
  navyTop: '#0A3A66',
  navyBottom: '#02152B',
  brand: '#003B6F',
  brandSubtle: '#E8EFF6',
  teal: '#00C2C7',
  white: '#FFFFFF',
  bg: '#FFFFFF',
  surface: '#F4F6F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textSec: '#475569',
  textMuted: '#64748B',
  capLight: '#CFE0F0',
  capMute: '#8FB0D0',
};

// Status pill visuals — Pending amber, Booked sky, Confirmed navy, Started emerald.
export const STATUS = {
  Pending: { bg: '#FEF3C7', bd: '#FCD34D', fg: '#B45309' },
  Booked: { bg: '#E0F2FE', bd: '#7DD3FC', fg: '#0369A1' },
  Confirmed: { bg: '#E8EFF6', bd: '#9DBBD7', fg: '#003B6F' },
  Started: { bg: '#D1FAE5', bd: '#6EE7B7', fg: '#047857' },
  Completed: { bg: '#F1F5F9', bd: '#CBD5E1', fg: '#475569' },
};
export const AVATAR_TINTS = ['#003B6F', '#00A0A4', '#3D72A0', '#007E81', '#1A5587', '#005F61'];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const tintFor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
};
export const initials = (name) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

// --- Text helper --------------------------------------------------------------
export const t = (x, y, s, w, fill, str, anchor = 'start', ls = 0) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-weight="${w}" font-size="${s}" fill="${fill}"` +
  `${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}>${esc(str)}</text>`;

// --- Icon set (stroke line icons, centred at cx,cy, box size s) ---------------
export function ic(name, cx, cy, s, c, sw = 2.2) {
  const h = s / 2;
  const S = `stroke="${c}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case 'calendar':
      return `<g ${S}><rect x="${cx - h}" y="${cy - h + s * 0.12}" width="${s}" height="${s * 0.88}" rx="${s * 0.14}"/><line x1="${cx - h + s * 0.24}" y1="${cy - h}" x2="${cx - h + s * 0.24}" y2="${cy - h + s * 0.24}"/><line x1="${cx + h - s * 0.24}" y1="${cy - h}" x2="${cx + h - s * 0.24}" y2="${cy - h + s * 0.24}"/><line x1="${cx - h}" y1="${cy - h + s * 0.38}" x2="${cx + h}" y2="${cy - h + s * 0.38}"/></g>`;
    case 'list':
      return `<g fill="${c}">${[0, 1, 2].map((i) => { const y = cy - h + s * (0.14 + 0.34 * i); return `<rect x="${cx - h}" y="${y}" width="${s * 0.18}" height="${s * 0.18}" rx="${s * 0.05}"/><rect x="${cx - h + s * 0.3}" y="${y + s * 0.03}" width="${s * 0.7}" height="${s * 0.12}" rx="${s * 0.06}"/>`; }).join('')}</g>`;
    case 'user':
      return `<g ${S}><circle cx="${cx}" cy="${cy - s * 0.16}" r="${s * 0.2}"/><path d="M ${cx - s * 0.34} ${cy + h - s * 0.02} a ${s * 0.34} ${s * 0.32} 0 0 1 ${s * 0.68} 0"/></g>`;
    case 'gear': {
      const teeth = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${cx + Math.cos(a) * s * 0.3}" y1="${cy + Math.sin(a) * s * 0.3}" x2="${cx + Math.cos(a) * s * 0.46}" y2="${cy + Math.sin(a) * s * 0.46}"/>`; }).join('');
      return `<g ${S}><circle cx="${cx}" cy="${cy}" r="${s * 0.3}"/><circle cx="${cx}" cy="${cy}" r="${s * 0.12}"/>${teeth}</g>`;
    }
    case 'phone':
      return `<g fill="${c}" transform="translate(${cx},${cy}) scale(${s / 24}) translate(-12,-12)"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></g>`;
    case 'mail':
      return `<g ${S}><rect x="${cx - h}" y="${cy - s * 0.34}" width="${s}" height="${s * 0.68}" rx="${s * 0.1}"/><path d="M ${cx - h + s * 0.06} ${cy - s * 0.26} L ${cx} ${cy + s * 0.06} L ${cx + h - s * 0.06} ${cy - s * 0.26}"/></g>`;
    case 'sliders':
      return `<g ${S}>${[-0.26, 0.0, 0.26].map((o, i) => { const y = cy + s * o; const kx = cx + (i === 0 ? -s * 0.14 : i === 1 ? s * 0.16 : -s * 0.02); return `<line x1="${cx - h}" y1="${y}" x2="${cx + h}" y2="${y}"/><circle cx="${kx}" cy="${y}" r="${s * 0.09}" fill="${c}" stroke="none"/>`; }).join('')}</g>`;
    case 'refresh':
      return `<g ${S}><path d="M ${cx - h} ${cy} a ${h} ${h} 0 1 1 ${h * 0.5} ${h * 0.86}"/><path d="M ${cx - h} ${cy - s * 0.34} L ${cx - h} ${cy + s * 0.02} L ${cx - s * 0.14} ${cy + s * 0.02}"/></g>`;
    case 'plus':
      return `<g ${S}><line x1="${cx - h}" y1="${cy}" x2="${cx + h}" y2="${cy}"/><line x1="${cx}" y1="${cy - h}" x2="${cx}" y2="${cy + h}"/></g>`;
    case 'search':
      return `<g ${S}><circle cx="${cx - s * 0.1}" cy="${cy - s * 0.1}" r="${s * 0.3}"/><line x1="${cx + s * 0.14}" y1="${cy + s * 0.14}" x2="${cx + h}" y2="${cy + h}"/></g>`;
    case 'chevR':
      return `<g ${S}><path d="M ${cx - s * 0.16} ${cy - s * 0.32} L ${cx + s * 0.18} ${cy} L ${cx - s * 0.16} ${cy + s * 0.32}"/></g>`;
    case 'chevL':
      return `<g ${S}><path d="M ${cx + s * 0.16} ${cy - s * 0.32} L ${cx - s * 0.18} ${cy} L ${cx + s * 0.16} ${cy + s * 0.32}"/></g>`;
    case 'clock':
      return `<g ${S}><circle cx="${cx}" cy="${cy}" r="${s * 0.42}"/><path d="M ${cx} ${cy - s * 0.24} L ${cx} ${cy} L ${cx + s * 0.16} ${cy + s * 0.1}"/></g>`;
    case 'check':
      return `<g ${S}><path d="M ${cx - s * 0.3} ${cy + s * 0.02} L ${cx - s * 0.06} ${cy + s * 0.26} L ${cx + s * 0.34} ${cy - s * 0.24}"/></g>`;
    case 'bell':
      return `<g ${S}><path d="M ${cx - s * 0.3} ${cy + s * 0.2} C ${cx - s * 0.3} ${cy - s * 0.3} ${cx - s * 0.16} ${cy - s * 0.42} ${cx} ${cy - s * 0.42} C ${cx + s * 0.16} ${cy - s * 0.42} ${cx + s * 0.3} ${cy - s * 0.3} ${cx + s * 0.3} ${cy + s * 0.2} Z"/><path d="M ${cx - s * 0.4} ${cy + s * 0.2} L ${cx + s * 0.4} ${cy + s * 0.2}"/><path d="M ${cx - s * 0.1} ${cy + s * 0.3} a ${s * 0.1} ${s * 0.08} 0 0 0 ${s * 0.2} 0"/></g>`;
    case 'video':
      return `<g ${S}><rect x="${cx - h}" y="${cy - s * 0.26}" width="${s * 0.66}" height="${s * 0.52}" rx="${s * 0.12}"/><path d="M ${cx + h - s * 0.34} ${cy - s * 0.06} L ${cx + h} ${cy - s * 0.22} L ${cx + h} ${cy + s * 0.22} L ${cx + h - s * 0.34} ${cy + s * 0.06} Z"/></g>`;
    case 'pin':
      return `<g ${S}><path d="M ${cx} ${cy + s * 0.42} C ${cx - s * 0.42} ${cy} ${cx - s * 0.32} ${cy - s * 0.42} ${cx} ${cy - s * 0.42} C ${cx + s * 0.32} ${cy - s * 0.42} ${cx + s * 0.42} ${cy} ${cx} ${cy + s * 0.42} Z"/><circle cx="${cx}" cy="${cy - s * 0.1}" r="${s * 0.1}"/></g>`;
    case 'card':
      return `<g ${S}><rect x="${cx - h}" y="${cy - s * 0.3}" width="${s}" height="${s * 0.6}" rx="${s * 0.1}"/><line x1="${cx - h}" y1="${cy - s * 0.08}" x2="${cx + h}" y2="${cy - s * 0.08}"/></g>`;
    case 'chat':
      return `<g ${S}><rect x="${cx - h}" y="${cy - s * 0.36}" width="${s}" height="${s * 0.52}" rx="${s * 0.16}"/><path d="M ${cx - s * 0.16} ${cy + s * 0.16} L ${cx - s * 0.28} ${cy + s * 0.38} L ${cx + s * 0.02} ${cy + s * 0.16}"/></g>`;
    default:
      return '';
  }
}

// --- Shared UI atoms (screen-space 0..SW × 0..SH) -----------------------------
export function statusBar() {
  return `
    <rect x="0" y="0" width="${SW}" height="56" fill="#FFFFFF"/>
    <rect x="${SW / 2 - 58}" y="14" width="116" height="30" rx="15" fill="#0A1424"/>
    ${t(34, 37, 21, 700, C.text, '9:41')}
    <g fill="${C.text}">
      <rect x="${SW - 96}" y="22" width="22" height="14" rx="3"/>
      <rect x="${SW - 70}" y="18" width="26" height="18" rx="3"/>
      <rect x="${SW - 40}" y="20" width="30" height="14" rx="3" fill="none" stroke="${C.text}" stroke-width="2"/>
      <rect x="${SW - 36}" y="23" width="20" height="8" rx="1.5"/>
    </g>`;
}

export function tabBar(active) {
  const tabs = [
    { ic: 'calendar', label: 'Calendar' },
    { ic: 'list', label: 'Bookings' },
    { ic: 'user', label: 'Clients' },
    { ic: 'gear', label: 'Settings' },
  ];
  const y0 = SH - TAB_H;
  const colW = SW / 4;
  return `
    <rect x="0" y="${y0}" width="${SW}" height="${TAB_H}" fill="#FFFFFF"/>
    <line x1="0" y1="${y0}" x2="${SW}" y2="${y0}" stroke="${C.border}" stroke-width="1"/>
    ${tabs
      .map((tab, i) => {
        const cx = colW * i + colW / 2;
        const col = i === active ? C.brand : '#94A3B8';
        return `${ic(tab.ic, cx, y0 + 32, 28, col, 2.4)}${t(cx, y0 + 70, 15, i === active ? 600 : 500, col, tab.label, 'middle')}`;
      })
      .join('')}`;
}

export function statusPill(x, y, label, key, h = 30) {
  const s = STATUS[key] ?? STATUS.Completed;
  const w = 26 + label.length * 8.6;
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${s.bg}" stroke="${s.bd}" stroke-width="1"/>${t(x + w / 2, y + h / 2 + 5, 14.5, 600, s.fg, label, 'middle')}</g>`;
}

export function avatar(cx, cy, r, name) {
  const bg = tintFor(name);
  return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>${t(cx, cy + r * 0.34, r * 0.82, 600, '#FFFFFF', initials(name), 'middle')}</g>`;
}

export function metaChip(x, y, icon, label) {
  const w = 30 + label.length * 8.4 + 18;
  return `<g><rect x="${x}" y="${y}" width="${w}" height="34" rx="17" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>${ic(icon, x + 19, y + 17, 15, C.textSec, 1.8)}${t(x + 34, y + 22, 14.5, 500, C.textSec, label)}</g>`;
}

export const card = (x, y, w, h, fill = '#FFFFFF', r = 18) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${C.border}" stroke-width="1"/>`;

export const btn = (x, y, w, h, fill, label, fg = '#FFFFFF', r = 14) =>
  `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>${t(x + w / 2, y + h / 2 + 6, 17, 600, fg, label, 'middle')}</g>`;

// Appointment block — accent stripe + guest + service + time (AppointmentBlock).
export function apptBlock(x, y, w, h, key, name, service, time) {
  const s = STATUS[key] ?? STATUS.Booked;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${s.bg}"/>
    <rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${s.fg}"/>
    ${t(x + 22, y + 32, 18, 700, C.text, name)}
    ${t(x + 22, y + 56, 15, 500, C.textSec, service)}
    ${h >= 92 ? t(x + 22, y + 82, 14, 500, C.textMuted, time) : ''}</g>`;
}

// Booking list row — avatar + name + service·time + status pill.
export function bookingRow(y, name, service, time, key) {
  return `<g>
    ${avatar(60, y + 40, 28, name)}
    ${t(108, y + 34, 18.5, 600, C.text, name)}
    ${t(108, y + 60, 15, 500, C.textMuted, `${service} · ${time}`)}
    ${statusPill(SW - 24 - (26 + key.length * 8.6), y + 26, key === 'Started' ? 'Started' : key, key)}
    <line x1="40" y1="${y + 88}" x2="${SW - 40}" y2="${y + 88}" stroke="${C.border}" stroke-width="1"/>
  </g>`;
}

// =============================================================================
// SCREENS — each returns inner SVG in 0..SW × 0..SH
// =============================================================================

export function screenCalendar() {
  const gutterX = 56;
  const colX = 96;
  const colW = SW - colX - 28;
  const rows = [['08', 250], ['09', 340], ['10', 430], ['11', 520], ['12', 610], ['13', 700], ['14', 790], ['15', 880], ['16', 970], ['17', 1060]];
  const grid = rows.map(([lab, y]) => `${t(gutterX, y + 5, 15, 500, C.textMuted, lab, 'middle')}<line x1="${colX}" y1="${y}" x2="${SW - 28}" y2="${y}" stroke="#EEF2F7" stroke-width="1"/>`).join('');
  const blocks = `
    ${apptBlock(colX, 256, colW, 78, 'Confirmed', 'Amelia Hawthorne', 'Deep Tissue Massage', '08:00 – 09:00')}
    ${apptBlock(colX, 346, colW, 78, 'Booked', 'George Okafor', 'Swedish Massage', '09:00 – 10:00')}
    ${apptBlock(colX, 436, colW / 2 - 6, 122, 'Started', 'Priya Sharma', 'Hot Stone', '10:00 – 11:30')}
    ${apptBlock(colX + colW / 2 + 6, 436, colW / 2 - 6, 78, 'Pending', 'Sam Rivera', 'Consultation', '10:00')}
    ${apptBlock(colX, 614, colW, 78, 'Confirmed', 'Chloe Bennett', 'Signature Facial', '12:00 – 13:00')}
    ${apptBlock(colX, 794, colW, 122, 'Booked', 'Daniel Cole', 'Sports Massage', '14:00 – 15:30')}
    ${apptBlock(colX, 974, colW, 78, 'Pending', 'Maya Idris', 'Manicure', '16:00')}`;
  return `
    <rect width="${SW}" height="${SH}" fill="#FFFFFF"/>
    ${statusBar()}
    <!-- header -->
    ${ic('chevL', 44, 104, 26, C.text, 2.4)}
    ${t(SW / 2, 112, 22, 700, C.text, 'Friday 13 June', 'middle')}
    <circle cx="${SW / 2 + 96}" cy="106" r="5" fill="${C.teal}"/>
    ${ic('chevR', SW - 44, 104, 26, C.text, 2.4)}
    <!-- segmented Day/Week/Month -->
    <rect x="40" y="148" width="${SW - 80}" height="48" rx="12" fill="${C.surface}"/>
    <rect x="46" y="154" width="${(SW - 92) / 3}" height="36" rx="9" fill="#FFFFFF" stroke="${C.border}" stroke-width="1"/>
    ${t(46 + (SW - 92) / 6, 178, 16, 600, C.brand, 'Day', 'middle')}
    ${t(46 + (SW - 92) / 2, 178, 16, 500, C.textMuted, 'Week', 'middle')}
    ${t(46 + ((SW - 92) * 5) / 6, 178, 16, 500, C.textMuted, 'Month', 'middle')}
    <!-- grid + blocks -->
    ${grid}
    ${blocks}
    ${tabBar(0)}`;
}

export function screenBookings() {
  const rowsY = 470;
  return `
    <rect width="${SW}" height="${SH}" fill="#FFFFFF"/>
    ${statusBar()}
    ${t(40, 122, 30, 800, C.text, 'Appointments')}
    ${ic('plus', SW - 60, 110, 26, C.white, 3)}
    <circle cx="${SW - 60}" cy="110" r="26" fill="${C.teal}"/>
    ${ic('plus', SW - 60, 110, 24, '#04212A', 3)}
    <!-- search -->
    <rect x="40" y="150" width="${SW - 80}" height="52" rx="14" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>
    ${ic('search', 72, 176, 22, C.textMuted, 2.2)}
    ${t(98, 183, 17, 500, C.textMuted, 'Search name, phone, email…')}
    <!-- filter chips (auto-laid-out, even gaps) -->
    ${(() => {
      let cx = 40;
      return [['All', 12, true], ['Pending', 2, false], ['Booked', 4, false], ['Confirmed', 3, false], ['Started', 1, false]]
        .map(([label, n, on]) => {
          const w = 20 + String(label).length * 8.8 + 12 + 22 + 16;
          const x = cx;
          cx += w + 12;
          return `<rect x="${x}" y="226" width="${w}" height="44" rx="22" fill="${on ? C.brand : C.surface}" stroke="${on ? C.brand : C.border}" stroke-width="1"/>${t(x + 20, 253, 15.5, 600, on ? '#FFFFFF' : C.textSec, label)}<circle cx="${x + w - 27}" cy="248" r="11" fill="${on ? '#FFFFFF' : C.borderStrong}"/>${t(x + w - 27, 253, 12, 700, on ? C.brand : C.text, String(n), 'middle')}`;
        })
        .join('');
    })()}
    <!-- stats bar -->
    <line x1="0" y1="296" x2="${SW}" y2="296" stroke="${C.border}" stroke-width="1"/>
    <text x="40" y="340" font-family="Inter" font-size="17"><tspan font-weight="700" fill="${C.text}">12 today</tspan><tspan font-weight="500" fill="${C.textMuted}">  ·  £640 expected  ·  3 pending</tspan></text>
    <line x1="0" y1="372" x2="${SW}" y2="372" stroke="${C.border}" stroke-width="1"/>
    <!-- date header -->
    ${t(40, 430, 14, 700, C.textMuted, 'TODAY · FRIDAY 13 JUNE', 'start', 1.2)}
    <!-- rows -->
    ${bookingRow(rowsY + 0, 'Amelia Hawthorne', 'Deep Tissue Massage', '08:00', 'Confirmed')}
    ${bookingRow(rowsY + 96, 'George Okafor', 'Swedish Massage', '09:00', 'Booked')}
    ${bookingRow(rowsY + 192, 'Priya Sharma', 'Hot Stone Therapy', '10:00', 'Started')}
    ${bookingRow(rowsY + 288, 'Sam Rivera', 'Consultation', '10:00', 'Pending')}
    ${bookingRow(rowsY + 384, 'Chloe Bennett', 'Signature Facial', '12:00', 'Confirmed')}
    ${bookingRow(rowsY + 480, 'Daniel Cole', 'Sports Massage', '14:00', 'Booked')}
    ${tabBar(1)}`;
}

export function screenDetail() {
  const px = 40;
  const pw = SW - 80;
  const hy = 150; // hero top
  const hh = 540; // hero height (sized to fit all content)
  const metaChips = (() => {
    let mx = px + 24;
    return [['clock', '1h'], ['user', '1 guest'], ['video', 'Online']]
      .map(([icn, lab]) => {
        const w = 30 + lab.length * 8.6 + 18;
        const g = metaChip(mx, hy + 226, icn, lab);
        mx += w + 10;
        return g;
      })
      .join('');
  })();
  const quickActions = [['phone', 'Call'], ['mail', 'Email'], ['calendar', 'Resched'], ['sliders', 'Modify'], ['refresh', 'Rebook']]
    .map(([icn, lab], i) => {
      const slot = (pw - 48) / 5;
      const qx = px + 24 + slot * i + slot / 2;
      return `<rect x="${qx - 26}" y="${hy + 430}" width="52" height="52" rx="15" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>${ic(icn, qx, hy + 456, 22, C.brand, 2)}${t(qx, hy + 500, 13, 500, C.textSec, lab, 'middle')}`;
    })
    .join('');
  const hero = `
    ${card(px, hy, pw, hh)}
    <rect x="${px}" y="${hy}" width="6" height="${hh}" rx="3" fill="${STATUS.Booked.fg}"/>
    ${avatar(px + 56, hy + 58, 30, 'Amelia Hawthorne')}
    ${t(px + 100, hy + 52, 22, 700, C.text, 'Amelia Hawthorne')}
    ${t(px + 100, hy + 78, 14.5, 500, C.textMuted, '4 previous visits')}
    ${statusPill(px + pw - 24 - (26 + 6 * 8.6), hy + 38, 'Booked', 'Booked')}
    <line x1="${px + 22}" y1="${hy + 108}" x2="${px + pw - 22}" y2="${hy + 108}" stroke="${C.border}" stroke-width="1"/>
    ${t(px + 24, hy + 142, 13.5, 700, C.textMuted, 'FRIDAY 13 JUNE', 'start', 1)}
    ${t(px + 24, hy + 182, 30, 700, C.text, '14:00 – 15:00')}
    ${t(px + 24, hy + 212, 17, 500, C.textSec, 'Deep Tissue Massage · with Sarah Lin')}
    ${metaChips}
    <g><rect x="${px + 24}" y="${hy + 278}" width="156" height="32" rx="16" fill="${STATUS.Pending.bg}" stroke="${STATUS.Pending.bd}" stroke-width="1"/>${t(px + 24 + 78, hy + 299, 14, 600, STATUS.Pending.fg, 'Deposit pending', 'middle')}</g>
    <line x1="${px + 22}" y1="${hy + 334}" x2="${px + pw - 22}" y2="${hy + 334}" stroke="${C.border}" stroke-width="1"/>
    ${ic('phone', px + 38, hy + 368, 18, C.brand, 2.2)}${t(px + 62, hy + 374, 16, 500, C.brand, '+44 7700 900123')}
    ${ic('mail', px + 38, hy + 402, 18, C.brand, 2)}${t(px + 62, hy + 408, 16, 500, C.brand, 'amelia.hawthorne@example.com')}
    ${quickActions}`;
  const ay = hy + hh + 16; // actions card top
  const ah = 188;
  const actions = `
    ${card(px, ay, pw, ah)}
    ${btn(px + 22, ay + 22, pw - 44, 56, STATUS.Started.fg, 'Start')}
    <rect x="${px + 22}" y="${ay + 96}" width="${(pw - 66) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(px + 22 + (pw - 66) / 4, ay + 130, 16, 600, '#B45309', 'Arrived', 'middle')}
    <rect x="${px + 44 + (pw - 66) / 2}" y="${ay + 96}" width="${(pw - 66) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(px + 44 + (pw - 66) / 2 + (pw - 66) / 4, ay + 130, 16, 600, C.brand, 'Confirm', 'middle')}`;
  const collapse = (yy, title, summary) => `
    ${card(px, yy, pw, 64)}
    ${t(px + 24, yy + 40, 17, 600, C.text, title)}
    ${t(px + pw - 58, yy + 40, 15, 500, C.textMuted, summary, 'end')}
    ${ic('chevR', px + pw - 34, yy + 32, 18, C.textMuted, 2.2)}`;
  let cy = ay + ah + 16;
  const sections = [
    ['Details', '1 guest · Pending'],
    ['Notes', '2 notes'],
    ['Payments & confirmation', 'Pending'],
    ['SMS / Email guest', '1 sent'],
  ]
    .map(([ti, su]) => { const g = collapse(cy, ti, su); cy += 78; return g; })
    .join('');
  return `
    <rect width="${SW}" height="${SH}" fill="${C.surface}"/>
    ${statusBar()}
    ${ic('chevL', 44, 104, 26, C.text, 2.4)}
    ${t(SW / 2, 112, 20, 700, C.text, 'Appointment', 'middle')}
    ${ic('calendar', SW - 44, 104, 22, C.textMuted, 2.2)}
    ${hero}
    ${actions}
    ${sections}
    <!-- pinned primary action -->
    <rect x="0" y="${SH - 122}" width="${SW}" height="122" fill="#FFFFFF"/>
    <line x1="0" y1="${SH - 122}" x2="${SW}" y2="${SH - 122}" stroke="${C.border}" stroke-width="1"/>
    ${btn(40, SH - 100, SW - 80, 62, STATUS.Started.fg, 'Start appointment')}`;
}

export function screenNewBooking() {
  const px = 40;
  const pw = SW - 80;
  const days = ['M 9', 'T 10', 'W 11', 'T 12', 'F 13', 'S 14', 'S 15'];
  const selected = '10:30';
  const taken = new Set(['09:30', '11:00', '14:30', '17:30']);
  const gw = (pw - 48) / 3;
  const slotAt = (s, col, cy) => {
    const cx = px + col * (gw + 24);
    const on = s === selected;
    const off = taken.has(s);
    const fill = on ? C.brand : off ? C.surface : '#FFFFFF';
    const fg = on ? '#FFFFFF' : off ? C.borderStrong : C.text;
    const bd = on ? C.brand : C.border;
    return `<rect x="${cx}" y="${cy}" width="${gw}" height="58" rx="14" fill="${fill}" stroke="${bd}" stroke-width="1.5"/>${t(cx + gw / 2, cy + 37, 18, 600, fg, s, 'middle')}${off ? `<line x1="${cx + 22}" y1="${cy + 29}" x2="${cx + gw - 22}" y2="${cy + 29}" stroke="${C.borderStrong}" stroke-width="1.5"/>` : ''}`;
  };
  const group = (label, list, y0) =>
    `${t(px, y0, 15, 700, C.textMuted, label, 'start', 0.8)}` +
    list.map((s, i) => slotAt(s, i % 3, y0 + 22 + Math.floor(i / 3) * 74)).join('');
  return `
    <rect width="${SW}" height="${SH}" fill="${C.surface}"/>
    ${statusBar()}
    ${ic('chevL', 44, 104, 26, C.text, 2.4)}
    ${t(SW / 2, 112, 20, 700, C.text, 'New booking', 'middle')}
    <!-- progress -->
    ${[0, 1, 2, 3].map((i) => `<rect x="${40 + i * ((SW - 80 - 24) / 4 + 8)}" y="146" width="${(SW - 80 - 24) / 4}" height="6" rx="3" fill="${i <= 2 ? C.teal : C.border}"/>`).join('')}
    ${t(40, 196, 14, 700, C.textMuted, 'STEP 3 OF 4 · PICK A TIME', 'start', 1)}
    <!-- service summary -->
    ${card(px, 220, pw, 132, '#FFFFFF')}
    <rect x="${px}" y="220" width="6" height="132" rx="3" fill="${C.teal}"/>
    ${t(px + 28, 264, 20, 700, C.text, 'Deep Tissue Massage')}
    ${t(px + 28, 294, 16, 500, C.textSec, '60 min · £65.00')}
    ${avatar(px + 44, 322, 18, 'Sarah Lin')}
    ${t(px + 72, 328, 15.5, 500, C.textMuted, 'with Sarah Lin')}
    <!-- date strip -->
    ${t(px, 404, 17, 700, C.text, 'June 2026')}
    ${days
      .map((d, i) => {
        const dgw = (pw - 6 * 12) / 7;
        const x = px + i * (dgw + 12);
        const on = i === 4;
        return `<rect x="${x}" y="424" width="${dgw}" height="74" rx="14" fill="${on ? C.brand : '#FFFFFF'}" stroke="${on ? C.brand : C.border}" stroke-width="1"/>${t(x + dgw / 2, 452, 13, 600, on ? '#BBD3EA' : C.textMuted, d.split(' ')[0], 'middle')}${t(x + dgw / 2, 482, 20, 700, on ? '#FFFFFF' : C.text, d.split(' ')[1], 'middle')}`;
      })
      .join('')}
    <!-- slots -->
    ${t(px, 556, 18, 700, C.text, 'Available times')}
    ${group('MORNING', ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], 596)}
    ${group('AFTERNOON', ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'], 784)}
    ${group('EVENING', ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30'], 972)}
    <!-- continue -->
    <rect x="0" y="${SH - 122}" width="${SW}" height="122" fill="#FFFFFF"/>
    <line x1="0" y1="${SH - 122}" x2="${SW}" y2="${SH - 122}" stroke="${C.border}" stroke-width="1"/>
    ${btn(40, SH - 100, SW - 80, 62, C.brand, 'Continue · 10:30')}`;
}

export function screenClient() {
  const px = 40;
  const pw = SW - 80;
  // Centred tag row
  const tags = ['VIP', 'Allergy: nuts', 'Prefers Sarah'];
  const tagW = (l) => 28 + l.length * 8.6;
  const totalTagW = tags.reduce((a, l) => a + tagW(l), 0) + (tags.length - 1) * 12;
  let tgx = SW / 2 - totalTagW / 2;
  const tagRow = tags
    .map((l) => { const w = tagW(l); const g = `<rect x="${tgx}" y="390" width="${w}" height="34" rx="17" fill="${C.brandSubtle}"/>${t(tgx + w / 2, 412, 14, 600, C.brand, l, 'middle')}`; tgx += w + 12; return g; })
    .join('');
  // Two contact-action buttons (centred icon + label group)
  const abw = (pw - 48 - 16) / 2;
  const actBtn = (x, icn, lab) => {
    const gw = 20 + 12 + lab.length * 9.5;
    const gx = x + abw / 2 - gw / 2;
    return `<rect x="${x}" y="442" width="${abw}" height="54" rx="14" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>${ic(icn, gx + 10, 469, 20, C.brand, 2)}${t(gx + 32, 475, 16.5, 600, C.brand, lab)}`;
  };
  // Evenly-spaced stat columns
  const stat = (cx, big, small) => `${t(cx, 620, 27, 800, C.text, big, 'middle')}${t(cx, 648, 14.5, 500, C.textMuted, small, 'middle')}`;
  const histRow = (y, name, date, last) =>
    `${t(px + 28, y, 17.5, 600, C.text, name)}${t(px + 28, y + 26, 14.5, 500, C.textMuted, date)}${statusPill(px + pw - 28 - (26 + 9 * 8.6), y - 22, 'Completed', 'Completed', 30)}${last ? '' : `<line x1="${px + 28}" y1="${y + 48}" x2="${px + pw - 28}" y2="${y + 48}" stroke="${C.border}" stroke-width="1"/>`}`;
  return `
    <rect width="${SW}" height="${SH}" fill="${C.surface}"/>
    ${statusBar()}
    ${ic('chevL', 44, 104, 26, C.text, 2.4)}
    ${t(SW / 2, 112, 20, 700, C.text, 'Client', 'middle')}
    <!-- profile card -->
    ${card(px, 150, pw, 380)}
    ${avatar(SW / 2, 236, 46, 'Amelia Hawthorne')}
    ${t(SW / 2, 326, 24, 700, C.text, 'Amelia Hawthorne', 'middle')}
    ${t(SW / 2, 356, 15.5, 500, C.textMuted, '+44 7700 900123 · amelia.h@example.com', 'middle')}
    ${tagRow}
    ${actBtn(px + 24, 'phone', 'Call')}
    ${actBtn(px + 24 + abw + 16, 'chat', 'Message')}
    <!-- stats -->
    ${card(px, 550, pw, 132)}
    ${stat(px + pw / 6, '12', 'visits')}
    ${stat(px + pw / 2, '2 Apr', 'last visit')}
    ${stat(px + (pw * 5) / 6, '£820', 'total spend')}
    <line x1="${px + pw / 3}" y1="592" x2="${px + pw / 3}" y2="646" stroke="${C.border}" stroke-width="1"/>
    <line x1="${px + (pw * 2) / 3}" y1="592" x2="${px + (pw * 2) / 3}" y2="646" stroke="${C.border}" stroke-width="1"/>
    <!-- upcoming -->
    ${t(px, 730, 14, 700, C.textMuted, 'UPCOMING', 'start', 1.2)}
    ${card(px, 750, pw, 96)}
    <rect x="${px}" y="750" width="6" height="96" rx="3" fill="${STATUS.Booked.fg}"/>
    ${t(px + 28, 792, 18, 600, C.text, 'Deep Tissue Massage')}
    ${t(px + 28, 818, 14.5, 500, C.textMuted, 'Fri 13 Jun · 14:00 · Sarah Lin')}
    ${ic('chevR', px + pw - 34, 798, 18, C.textMuted, 2.2)}
    <!-- history -->
    ${t(px, 894, 14, 700, C.textMuted, 'VISIT HISTORY', 'start', 1.2)}
    ${card(px, 914, pw, 286)}
    ${histRow(962, 'Swedish Massage', '2 Apr 2026 · £55', false)}
    ${histRow(1056, 'Signature Facial', '6 Mar 2026 · £70', false)}
    ${histRow(1150, 'Hot Stone Therapy', '1 Feb 2026 · £80', true)}
    <!-- preferences -->
    ${t(px, 1248, 14, 700, C.textMuted, 'PREFERENCES & NOTES', 'start', 1.2)}
    ${card(px, 1268, pw, 196)}
    ${t(px + 28, 1312, 15.5, 500, C.textSec, 'Prefers a quiet room and herbal tea.')}
    ${t(px + 28, 1348, 15.5, 500, C.textSec, 'Always books with Sarah; sensitive to')}
    ${t(px + 28, 1380, 15.5, 500, C.textSec, 'strong scents.')}
    ${t(px + 28, 1428, 14.5, 600, C.brand, 'Edit notes')}`;
}

export function screenDeposits() {
  const px = 40;
  const pw = SW - 80;
  const toggle = (y, label, sub, on) => `
    ${t(px + 24, y, 17, 600, C.text, label)}
    ${t(px + 24, y + 26, 14.5, 500, C.textMuted, sub)}
    <rect x="${px + pw - 24 - 64}" y="${y - 22}" width="64" height="36" rx="18" fill="${on ? C.teal : C.borderStrong}"/>
    <circle cx="${px + pw - 24 - (on ? 22 : 42)}" cy="${y - 4}" r="14" fill="#FFFFFF"/>`;
  const comm = (y, ch, msg, statusLabel, toneKey, when, last = false) => {
    const chW = 36 + ch.length * 8;
    return `
    <rect x="${px + 24}" y="${y - 22}" width="${chW}" height="28" rx="8" fill="${C.brandSubtle}"/>${t(px + 24 + chW / 2, y - 3, 13, 700, C.brand, ch, 'middle')}
    ${statusPill(px + 24 + chW + 10, y - 23, statusLabel, toneKey, 28)}
    ${t(px + 24, y + 26, 15.5, 500, C.text, msg)}
    ${t(px + 24, y + 50, 13.5, 500, C.textMuted, when)}
    ${last ? '' : `<line x1="${px + 24}" y1="${y + 70}" x2="${px + pw - 24}" y2="${y + 70}" stroke="${C.border}" stroke-width="1"/>`}`;
  };
  return `
    <rect width="${SW}" height="${SH}" fill="${C.surface}"/>
    ${statusBar()}
    ${ic('chevL', 44, 104, 26, C.text, 2.4)}
    ${t(SW / 2, 112, 20, 700, C.text, 'Payments & reminders', 'middle')}
    <!-- deposit card -->
    ${t(px, 176, 14, 700, C.textMuted, 'DEPOSIT', 'start', 1.2)}
    ${card(px, 196, pw, 280)}
    ${ic('card', px + 44, 252, 26, C.brand, 2)}
    ${t(px + 80, 246, 28, 800, C.text, '£25.00')}
    ${t(px + 80, 276, 15.5, 500, C.textMuted, 'Requested · awaiting payment')}
    ${statusPill(px + pw - 24 - 96, 232, 'Pending', 'Pending')}
    ${btn(px + 24, 314, pw - 48, 56, C.brand, 'Send payment link')}
    <rect x="${px + 24}" y="386" width="${(pw - 72) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(px + 24 + (pw - 72) / 4, 420, 16, 600, C.text, 'Record cash', 'middle')}
    <rect x="${px + 48 + (pw - 72) / 2}" y="386" width="${(pw - 72) / 2}" height="56" rx="14" fill="#FFFFFF" stroke="${C.borderStrong}" stroke-width="1.5"/>${t(px + 48 + (pw - 72) / 2 + (pw - 72) / 4, 420, 16, 600, C.text, 'Waive', 'middle')}
    <!-- reminders card -->
    ${t(px, 528, 14, 700, C.textMuted, 'AUTOMATIC REMINDERS', 'start', 1.2)}
    ${card(px, 548, pw, 250)}
    ${toggle(596, '24h email reminder', 'Sent the day before', true)}
    <line x1="${px + 24}" y1="636" x2="${px + pw - 24}" y2="636" stroke="${C.border}" stroke-width="1"/>
    ${toggle(696, '2h SMS reminder', 'A nudge before the visit', true)}
    <!-- comms log -->
    ${t(px, 850, 14, 700, C.textMuted, 'SENT TO GUEST', 'start', 1.2)}
    ${card(px, 870, pw, 320)}
    ${comm(916, 'EMAIL', 'Booking confirmation', 'Sent', 'Started', '10 Jun, 09:25')}
    ${comm(1016, 'SMS', 'Appointment reminder', 'Scheduled', 'Booked', 'Sends 12 Jun, 14:00')}
    ${comm(1116, 'EMAIL', 'Deposit request', 'Sent', 'Started', '10 Jun, 09:25', true)}`;
}
