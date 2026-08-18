/**
 * How a closure band looks in the diary.
 *
 * These overlays answer "can I put an appointment here?", so they must read
 * differently from a manual block, which is the bordered "Blocked" box. Three
 * looks, one per question the band answers:
 *
 *  - **closed** — grey wash, the same tint the venue-closed shading already
 *    uses, so out-of-hours reads the same whether it came from the venue's
 *    weekly hours or a calendar's own;
 *  - **leave** — amber, because a person being absent is a different fact from
 *    a boundary the venue may work past, and it is the one the drag refuses;
 *  - **amended hours** — brand tint, marking the window that IS worked on a day
 *    whose hours were deliberately changed.
 *
 * Shared by both day grids so a band cannot come to mean two things.
 */

import type { ThemeColors } from '@/theme/index';

export type ClosureBandLook = {
  backgroundColor: string;
  borderColor: string;
  labelColor: string;
};

function withAlpha(hex: string, alpha: number): string {
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${value}`;
}

/** The band's look, or null when this block is not a closure band. */
export function closureBandLook(
  blockType: string | null | undefined,
  colors: ThemeColors,
): ClosureBandLook | null {
  if (blockType === 'practitioner_leave') {
    return {
      backgroundColor: colors.warningSurface,
      borderColor: withAlpha(colors.warning, 0.6),
      labelColor: colors.warning,
    };
  }
  if (blockType === 'calendar_amended_hours' || blockType === 'venue_amended_hours') {
    return {
      backgroundColor: withAlpha(colors.brand, 0.1),
      borderColor: withAlpha(colors.brand, 0.5),
      labelColor: colors.brand,
    };
  }
  if (
    blockType === 'practitioner_closed' ||
    blockType === 'venue_closed' ||
    blockType === 'closed'
  ) {
    return {
      backgroundColor: withAlpha(colors.text, 0.06),
      borderColor: 'transparent',
      labelColor: colors.textMuted,
    };
  }
  return null;
}
