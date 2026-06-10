/**
 * Resneo mobile design tokens.
 *
 * Brand mirrors the Resneo web app design system:
 *   ResNeo Night (navy #003B6F)  +  Neo Teal (#00C2C7).
 *
 * Every screen and primitive sources colour, spacing, radius, typography,
 * elevation and motion from here so the app stays visually consistent and
 * easy to re-theme. Light/dark are full mappings of the same token set.
 */

import type { TextStyle, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Spacing — multiples of 4 (see .cursorrules)
// ---------------------------------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// ---------------------------------------------------------------------------
// Radius — softer corners than the old theme, matching the web's rounded cards.
// `lg`/`full` are kept for backwards compatibility with existing components.
// ---------------------------------------------------------------------------
export const radius = {
  sm: 8,
  md: 12,
  card: 16,
  lg: 16,
  surface: 20,
  xl: 24,
  pill: 9999,
  full: 9999,
} as const;

/** Minimum touch target per Apple HIG — important at a busy salon counter. */
export const minTouchTarget = 44;

// ---------------------------------------------------------------------------
// Brand ramps (from the web design system)
// ---------------------------------------------------------------------------
/** ResNeo Night — primary navy. `brand[600]` (#003B6F) is the core brand colour. */
export const brand = {
  50: '#E8EFF6',
  100: '#C6D8E9',
  200: '#9DBBD7',
  300: '#6E9AC2',
  400: '#3D72A0',
  500: '#1A5587',
  600: '#003B6F',
  700: '#00305C',
  800: '#00264A',
  900: '#001B36',
} as const;

/** Neo Teal — accent. `accent[500]` (#00C2C7) is the core accent colour. */
export const accent = {
  50: '#E6FBFB',
  100: '#C2F4F5',
  200: '#8FEAEB',
  300: '#54DCDE',
  400: '#22CDD1',
  500: '#00C2C7',
  600: '#00A0A4',
  700: '#007E81',
  800: '#005F61',
  900: '#004244',
} as const;

// ---------------------------------------------------------------------------
// Semantic colour palettes (light + dark)
// Keep ALL existing keys so current primitives keep compiling, plus new ones.
// ---------------------------------------------------------------------------
export const lightColors = {
  // Brand
  brand: brand[600],
  brandPressed: brand[700],
  brandSubtle: brand[50],
  brandBorder: brand[100],
  onBrand: '#FFFFFF',
  // Accent (teal is light — use dark text on top)
  accent: accent[500],
  accentPressed: accent[600],
  accentSubtle: accent[50],
  onAccent: brand[800],
  // Surfaces
  background: '#FFFFFF',
  surface: '#F4F6F9',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F4F6F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  onColor: '#FFFFFF',
  // Status
  danger: '#DC2626',
  dangerSurface: '#FEE2E2',
  onDanger: '#FFFFFF',
  success: '#059669',
  successSurface: '#D1FAE5',
  warning: '#D97706',
  warningSurface: '#FEF3C7',
  info: brand[500],
  infoSurface: brand[50],
  // Misc
  overlay: 'rgba(15, 23, 42, 0.45)',
  skeleton: '#E2E8F0',
  tabIcon: '#94A3B8',
  tabIconActive: brand[600],
} as const;

/** Widened colour map — values are plain strings (light/dark share these keys). */
export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  // Brand (lift navy for legibility on dark surfaces)
  brand: '#4F8FCB',
  brandPressed: '#6E9AC2',
  brandSubtle: '#0E2438',
  brandBorder: '#1E3A52',
  onBrand: '#04101F',
  // Accent
  accent: '#22CDD1',
  accentPressed: '#54DCDE',
  accentSubtle: '#06302F',
  onAccent: '#001A1B',
  // Surfaces
  background: '#0B1220',
  surface: '#111A2B',
  surfaceRaised: '#16223A',
  surfaceSunken: '#0B1220',
  border: '#233047',
  borderStrong: '#33415C',
  // Text
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#7C8AA0',
  onColor: '#F1F5F9',
  // Status
  danger: '#F87171',
  dangerSurface: '#3B1A1A',
  onDanger: '#FFFFFF',
  success: '#34D399',
  successSurface: '#0E2A22',
  warning: '#FBBF24',
  warningSurface: '#2C2410',
  info: '#4F8FCB',
  infoSurface: '#0E2438',
  // Misc
  overlay: 'rgba(0, 0, 0, 0.6)',
  skeleton: '#233047',
  tabIcon: '#7C8AA0',
  tabIconActive: '#4F8FCB',
};

// ---------------------------------------------------------------------------
// Typography — Inter (loaded in app/_layout.tsx via @expo-google-fonts/inter).
//
// With custom fonts the WEIGHT is encoded in the family name (e.g.
// `Inter_600SemiBold`), so we set `fontFamily` rather than `fontWeight` — this
// renders consistently across iOS and Android.
// ---------------------------------------------------------------------------
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

type TypographyToken = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform'
>;

export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypographyToken>;

export type TypographyVariant = keyof typeof typography;

// ---------------------------------------------------------------------------
// Elevation — two shadow tiers mirroring the web's --ds-shadow-* tokens.
// `boxShadow` renders on iOS/Android (new architecture) and web without the
// deprecated `shadow*` props; `elevation` keeps the Android fallback.
// ---------------------------------------------------------------------------
type Elevation = Pick<ViewStyle, 'boxShadow' | 'elevation'>;

export const elevation = {
  none: { boxShadow: 'none', elevation: 0 },
  card: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)', elevation: 2 },
  raised: { boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)', elevation: 8 },
} as const satisfies Record<string, Elevation>;

// ---------------------------------------------------------------------------
// Motion — animation durations (ms). Pair with Reanimated for sheets/FAB/etc.
// ---------------------------------------------------------------------------
export const motion = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const;

export const theme = {
  spacing,
  radius,
  minTouchTarget,
  brand,
  accent,
  lightColors,
  darkColors,
  fonts,
  typography,
  elevation,
  motion,
} as const;
