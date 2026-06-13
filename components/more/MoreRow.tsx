import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** 28pt rounded-square glyph tile — the row's leading icon. */
const TILE_SIZE = 28;

type MoreRowProps = {
  icon: SymbolViewProps['name'];
  /** Hex hue for the glyph tile. */
  tile: string;
  label: string;
  hint?: string;
  onPress: () => void;
  /** Opens an external surface — swaps the chevron for an "open" glyph. */
  external?: boolean;
  /** Renders the label in the danger colour. */
  destructive?: boolean;
  /** First row in a group — suppresses the leading hairline separator. */
  isFirst?: boolean;
  /** Optional trailing slot (e.g. a value or badge) before the chevron. */
  trailing?: ReactNode;
};

/**
 * Refined settings row — a coloured glyph tile, a title + optional hint, an
 * optional trailing slot and a chevron. Shares the app's press-spring via
 * PressableScale (with a selection tick) so rows feel tactile rather than flat.
 */
export function MoreRow({
  icon,
  tile,
  label,
  hint,
  onPress,
  external = false,
  destructive = false,
  isFirst = false,
  trailing,
}: MoreRowProps) {
  const { colors } = useTheme();

  return (
    <View>
      {!isFirst ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
      <PressableScale
        onPress={onPress}
        haptic
        accessibilityLabel={label}
        accessibilityHint={hint}
        style={styles.row}>
        <View style={[styles.tile, { backgroundColor: tile }]}>
          <SymbolView name={icon} tintColor="#FFFFFF" size={16} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyMedium" color={destructive ? colors.danger : undefined} numberOfLines={1}>
            {label}
          </Text>
          {hint ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        {trailing}
        <SymbolView
          name={
            external
              ? { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }
              : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
          }
          tintColor={colors.textMuted}
          size={external ? 14 : 16}
        />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + TILE_SIZE + spacing.md,
  },
});
