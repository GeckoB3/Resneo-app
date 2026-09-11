/**
 * How a closure band looks in the diary.
 *
 * These overlays answer "can I put an appointment here?", so they must read
 * differently from a manual block, which is the bordered "Blocked" box. One
 * look per single cause, the web's tints (`calendarBlockShellClass` /
 * `calendarBlockAccentColor`, 2026-09-10):
 *
 *  - **venue closed** — rose: the business is shut but the calendar would work;
 *  - **calendar unavailable** — sky: the business is open but the calendar is
 *    not working;
 *  - **both closed**, and a **linked venue's** own closed hours — slate;
 *  - **leave** — violet, a person being absent, the one band the drag refuses;
 *  - **break** — amber.
 *
 * Amended hours get no band (web retired its own): the grid follows the
 * resolved hours, so the open part of an amended day looks like any other
 * working day. Shared by every grid so a band cannot come to mean two things.
 *
 * The web is light-only; the dark looks keep each accent and swap the wash
 * for a translucent tint of it, so the five causes stay as distinct at night.
 */

export type ClosureBandLook = {
  backgroundColor: string;
  borderColor: string;
  labelColor: string;
  /** The web's solid accent for the cause (a legend swatch, a header dot). */
  accent: string;
};

type Palette = { light: ClosureBandLook; dark: ClosureBandLook };

function withAlpha(hex: string, alpha: number): string {
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${value}`;
}

function palette(accent: string, light: { bg: string; border: string; label: string }, darkLabel: string): Palette {
  return {
    light: { backgroundColor: light.bg, borderColor: light.border, labelColor: light.label, accent },
    dark: {
      backgroundColor: withAlpha(accent, 0.18),
      borderColor: withAlpha(accent, 0.5),
      labelColor: darkLabel,
      accent,
    },
  };
}

/** Tailwind's rose-50 / rose-200 / rose-950 on rose-600 (web `venue_closed`). */
const VENUE_CLOSED = palette('#E11D48', { bg: '#FFF1F2', border: '#FECDD3', label: '#4C0519' }, '#FDA4AF');
/** sky-50 / sky-200 / sky-950 on sky-600 (web `practitioner_closed`). */
const CALENDAR_CLOSED = palette('#0284C7', { bg: '#F0F9FF', border: '#BAE6FD', label: '#082F49' }, '#7DD3FC');
/** slate-200 / slate-300 / slate-900 on slate-400 (web: both shut, or a linked venue's hours). */
const BOTH_CLOSED = palette('#94A3B8', { bg: '#E2E8F0', border: '#CBD5E1', label: '#0F172A' }, '#CBD5E1');
/** violet-50 / violet-200 / violet-950 on violet-600 (web `practitioner_leave`). */
const LEAVE = palette('#7C3AED', { bg: '#F5F3FF', border: '#DDD6FE', label: '#2E1065' }, '#C4B5FD');
/** amber-50 / amber-200 / amber-950 on amber-600 (web breaks). */
const BREAK = palette('#D97706', { bg: '#FFFBEB', border: '#FDE68A', label: '#451A03' }, '#FCD34D');

const LOOKS: Record<string, Palette> = {
  venue_closed: VENUE_CLOSED,
  practitioner_closed: CALENDAR_CLOSED,
  venue_and_calendar_closed: BOTH_CLOSED,
  linked_venue_closed: BOTH_CLOSED,
  // The app's older single-cause name for a closed band, kept for a cached feed.
  closed: BOTH_CLOSED,
  practitioner_leave: LEAVE,
  break: BREAK,
};

/** The band's look, or null when this block is not a closure band. */
export function closureBandLook(
  blockType: string | null | undefined,
  isDark = false,
): ClosureBandLook | null {
  const entry = blockType ? LOOKS[blockType] : undefined;
  if (!entry) return null;
  return isDark ? entry.dark : entry.light;
}
