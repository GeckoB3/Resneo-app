/**
 * Shared palette + sizing for the branded empty-state illustrations.
 *
 * Every illustration derives its colours from the active theme so the art reads
 * correctly in BOTH light and dark mode — we never hard-code hex that would
 * break against a dark surface. The semantic theme tokens (`brand`, `accent`,
 * `border`, `surface…`) already flip per-scheme, and the raw `brand`/`accent`
 * ramps give us a couple of fixed mid-tones for gradients that need to stay
 * on-brand regardless of scheme (mirrors how MoreHero paints its gradient).
 */
import { accent, brand } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type IllustrationPalette = {
  /** Primary navy line/stroke colour for the main shape. */
  ink: string;
  /** Soft brand fill for large bodies / cards. */
  fill: string;
  /** Hairline/detail stroke that sits quietly on the surface. */
  line: string;
  /** Teal accent for the one or two highlight marks per piece. */
  accent: string;
  /** Lighter teal wash for accent fills. */
  accentSoft: string;
  /** Page/background tint behind the scene (subtle blob). */
  backdrop: string;
  /** A near-surface colour for "paper" cut-outs that must read as empty. */
  paper: string;
  /** Gradient stops kept on-brand across light/dark (navy → teal). */
  gradFrom: string;
  gradTo: string;
  isDark: boolean;
};

/**
 * Resolve the illustration palette from the current theme. Tints lean on the
 * brand ramp directly so contrast stays balanced on light AND dark surfaces.
 */
export function useIllustrationPalette(): IllustrationPalette {
  const { colors, isDark } = useTheme();
  return {
    ink: colors.brand,
    fill: isDark ? brand[800] : brand[50],
    line: colors.border,
    accent: colors.accent,
    accentSoft: isDark ? accent[800] : accent[100],
    backdrop: isDark ? brand[900] : brand[50],
    paper: colors.surfaceRaised,
    gradFrom: isDark ? brand[500] : brand[400],
    gradTo: isDark ? accent[600] : accent[400],
    isDark,
  };
}

/** Shared props every illustration accepts. */
export type IllustrationProps = {
  /** Rendered square size in px (default 120). Art is authored on a 120 grid. */
  size?: number;
};

/** Canonical authoring grid — all illustration view-boxes are square at this. */
export const ILLO_GRID = 120;
