import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * One choice in a wizard: a card with a radio dot or a checkbox, a title, an optional summary and
 * optional bullet lines. The web wizards use `<label><input type="radio">`; this is that row on a
 * phone, with the whole card as the touch target.
 */
export function ChoiceRow({
  kind = 'radio',
  selected,
  title,
  summary,
  bullets,
  note,
  disabled = false,
  onPress,
  children,
}: {
  kind?: 'radio' | 'checkbox';
  selected: boolean;
  title: string;
  summary?: string | null;
  bullets?: readonly string[];
  /** A short line under the summary, in the warning tone (e.g. "Collective ready", "Already on the page"). */
  note?: string | null;
  disabled?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityState={{ selected: kind === 'radio' ? selected : undefined, checked: kind === 'checkbox' ? selected : undefined, disabled }}
      accessibilityLabel={title}
      disabled={disabled}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected ? colors.brandSubtle : colors.surface,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}>
      <View
        style={[
          kind === 'radio' ? styles.radio : styles.checkbox,
          {
            borderColor: selected ? colors.brand : colors.borderStrong,
            backgroundColor: selected && kind === 'checkbox' ? colors.brand : 'transparent',
          },
        ]}>
        {selected && kind === 'radio' ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
        {selected && kind === 'checkbox' ? (
          <Text variant="caption" color={colors.onBrand} style={styles.checkmark}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text variant="bodyMedium">{title}</Text>
        {summary ? (
          <Text variant="caption" tone="secondary">
            {summary}
          </Text>
        ) : null}
        {bullets?.map((b) => (
          <Text key={b} variant="caption" tone="secondary">
            {`• ${b}`}
          </Text>
        ))}
        {note ? (
          <Text variant="caption" color={colors.warning}>
            {note}
          </Text>
        ) : null}
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: {
    lineHeight: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
