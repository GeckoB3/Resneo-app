import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A loyalty card's stamps as a row of circles, filled for each stamp (web `LoyaltyStamps`; the same
 * drawing as the client profile's card in components/clients/LoyaltyCardSection.tsx). The progress
 * words are the accessible name, so a screen reader hears "2 of 6 visits".
 */
export function LoyaltyStamps({ count, needed, label }: { count: number; needed: number; label?: string }) {
  const { colors } = useTheme();
  const total = Math.max(1, Math.min(needed, 20));
  const filled = Math.max(0, Math.min(count, total));
  return (
    <View style={styles.stamps} accessible accessibilityRole="image" accessibilityLabel={label ?? `${filled} of ${total} visits`}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          testID={i < filled ? 'stamp-filled' : 'stamp-empty'}
          style={[styles.stamp, { borderColor: colors.brand, backgroundColor: i < filled ? colors.brand : 'transparent' }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stamp: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 2 },
});
