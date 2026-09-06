import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import { hexToRgba } from '@/lib/color';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The Ask ResNeo entry at the top of More, in the slot the settings search
 * field used to hold: a question about ResNeo is now answered rather than
 * matched against a list of screen names.
 *
 * Shaped like the field it replaces (same height, same rounding, same place in
 * the rhythm) so the top of the tab still reads as "start here", with a brand
 * glyph instead of a magnifier because this one opens a conversation.
 */
export function AskResneoRow({ onPress }: { onPress: () => void }) {
  const { colors, isDark } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic
      accessibilityLabel={ASSISTANT_COPY.launcher}
      accessibilityHint={ASSISTANT_COPY.launcherHint}
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: hexToRgba(colors.brand, isDark ? 0.36 : 0.18),
        },
      ]}>
      <View style={[styles.glyph, { backgroundColor: hexToRgba(colors.brand, isDark ? 0.24 : 0.1) }]}>
        <SymbolView
          name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
          tintColor={colors.brand}
          size={19}
        />
      </View>
      <View style={styles.text}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {ASSISTANT_COPY.launcher}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {ASSISTANT_COPY.launcherHint}
        </Text>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={colors.textMuted}
        size={16}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget + 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  glyph: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
