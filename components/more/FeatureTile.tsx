import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { hexToRgba } from '@/lib/color';
import { useTileBasis } from '@/lib/responsive';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type FeatureTileProps = {
  icon: SymbolViewProps['name'];
  /** Hex hue for the glyph chip, colour wash and border. */
  tint: string;
  label: string;
  hint: string;
  onPress: () => void;
};

/**
 * Large "quick action" tile for the More hub's bento grid — a glyph chip on a
 * faint colour-washed card with the title and hint stacked below. Each tile owns
 * its hue so the grid reads as a set of distinct, glanceable destinations.
 *
 * Sizing is fluid: a flex basis + `flexGrow` inside a `flexWrap` row, with a
 * lone trailing tile growing to fill its row. The basis comes from the width in
 * hand (`useTileBasis`) — two across on a phone, three or four on a tablet,
 * rather than two half-window tiles each holding one line of text.
 */
export function FeatureTile({ icon, tint, label, hint, onPress }: FeatureTileProps) {
  const { colors, isDark } = useTheme();
  const flexBasis = useTileBasis();
  const washAlpha = isDark ? 0.18 : 0.07;
  const borderAlpha = isDark ? 0.34 : 0.16;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={[
        styles.tile,
        { flexBasis, backgroundColor: colors.surfaceRaised, borderColor: hexToRgba(tint, borderAlpha) },
      ]}>
      {/* Opaque card + a translucent colour wash = a tinted, still-raised surface. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(tint, washAlpha) }]} />
      <View style={styles.top}>
        <View style={[styles.glyph, { backgroundColor: tint, boxShadow: `0 4px 10px ${hexToRgba(tint, 0.4)}` }]}>
          <SymbolView name={icon} tintColor="#FFFFFF" size={20} />
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          tintColor={colors.textMuted}
          size={15}
        />
      </View>
      <View style={styles.text}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    minWidth: 150,
    minHeight: 124,
    borderRadius: radius.surface,
    borderWidth: 1,
    padding: spacing.base,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: spacing.md,
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    elevation: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  glyph: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    gap: 3,
  },
});
