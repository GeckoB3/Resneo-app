import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { hexToRgba } from '@/lib/color';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type PrimaryTileProps = {
  icon: SymbolViewProps['name'];
  /** Hex hue for the glyph chip, colour wash and border. */
  tint: string;
  label: string;
  hint: string;
  onPress: () => void;
};

/**
 * Full-width hero tile for the More hub — the single most-used destination,
 * given the most visual weight at the top of the bento. A large glyph chip with
 * a faint oversized watermark behind it, the title + hint, and a trailing
 * chevron, all on a colour-washed raised surface. Pairs with the smaller
 * two-up {@link FeatureTile}s below it to form a clear size hierarchy.
 */
export function PrimaryTile({ icon, tint, label, hint, onPress }: PrimaryTileProps) {
  const { colors, isDark } = useTheme();
  const washAlpha = isDark ? 0.2 : 0.08;
  const borderAlpha = isDark ? 0.36 : 0.18;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={[
        styles.tile,
        { backgroundColor: colors.surfaceRaised, borderColor: hexToRgba(tint, borderAlpha) },
      ]}>
      {/* Opaque card + translucent colour wash = a tinted, still-raised surface. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(tint, washAlpha) }]} />
      {/* Oversized watermark glyph bleeding off the right edge for depth. */}
      <SymbolView name={icon} tintColor={hexToRgba(tint, isDark ? 0.16 : 0.1)} size={132} style={styles.watermark} />

      <View style={[styles.glyph, { backgroundColor: tint, boxShadow: `0 6px 14px ${hexToRgba(tint, 0.42)}` }]}>
        <SymbolView name={icon} tintColor="#FFFFFF" size={26} />
      </View>
      <View style={styles.text}>
        <Text variant="subheading" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={colors.textMuted}
        size={18}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: 96,
    borderRadius: radius.surface,
    borderWidth: 1,
    padding: spacing.base,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    elevation: 2,
  },
  watermark: {
    position: 'absolute',
    right: -28,
    top: -18,
  },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
});
