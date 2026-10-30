import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { hapticSelect } from '@/lib/haptics';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Whether a host's service is on the collective page (web CQ-13, owner's choice): two options, "On
 * the page" and "Not on the page", so it reads differently from a switch. Choosing the other option
 * only asks: the screen shows the question, and nothing changes until it is answered.
 */
export function OnPageControl({
  on,
  busy,
  label,
  onChange,
}: {
  on: boolean;
  /** The change is on its way: the options wait. */
  busy: boolean;
  /** What a screen reader calls the group: "On the Northside page: Balayage". */
  label: string;
  onChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}>
      {[true, false].map((option) => {
        const selected = option === on;
        return (
          <Pressable
            key={String(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: busy }}
            disabled={busy}
            onPress={() => {
              if (selected) return;
              hapticSelect();
              onChange(option);
            }}
            style={[styles.option, selected ? { backgroundColor: colors.brandSubtle, borderColor: colors.brand } : null]}>
            <Text variant="label" color={selected ? colors.brand : colors.textSecondary} numberOfLines={1}>
              {areaCopy(option ? 'svc.card.pageOn' : 'svc.card.pageOff')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  option: {
    flex: 1,
    minHeight: minTouchTarget - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
});
