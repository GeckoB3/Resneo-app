import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, type TypographyVariant } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Named text tones map to theme colours; or pass any colour string to `color`. */
type TextTone = 'default' | 'secondary' | 'muted' | 'brand' | 'accent' | 'danger' | 'success' | 'onColor';

type TextProps = RNTextProps & {
  /** Typography variant from the theme (default: `body`). */
  variant?: TypographyVariant;
  /** Semantic tone, resolved from the active theme. */
  tone?: TextTone;
  /** Explicit colour override — wins over `tone`. */
  color?: string;
};

/**
 * Themed text primitive. Applies the Inter-based typography token + a colour.
 * Prefer this over raw <Text> so type + colour stay consistent app-wide.
 */
export function Text({ variant = 'body', tone = 'default', color, style, ...props }: TextProps) {
  const { colors } = useTheme();

  const toneColor: Record<TextTone, string> = {
    default: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    brand: colors.brand,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    onColor: colors.onColor,
  };

  return (
    <RNText
      // Honour Dynamic Type but cap the multiplier so tight line-heights and
      // fixed-width columns (time gutters, segmented controls) don't clip at the
      // largest accessibility sizes. Callers can override per-instance.
      maxFontSizeMultiplier={1.3}
      style={[typography[variant], { color: color ?? toneColor[tone] }, style]}
      {...props}
    />
  );
}
