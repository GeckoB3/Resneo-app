import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type BookingWizardHeaderProps = {
  /**
   * Whether the user can step back a page within the form. When false nothing
   * renders: on page one the ✕ in the route's own chrome is the only way out.
   */
  canGoBack: boolean;
  /** Step back one page within the form. */
  onBack: () => void;
};

/**
 * The "back a page" control shared by every booking flow.
 *
 * It used to set a native header (arrow left, ✕ right) on the booking route.
 * That header cost the first step a full row of nothing but two icons, so the
 * route now draws its own compact chrome (the booking-type tabs and the ✕ on
 * one line) and this renders inline: a small "Back" row above the step strip,
 * only on the pages that can go back. Nothing on page one.
 */
export function BookingWizardHeader({ canGoBack, onBack }: BookingWizardHeaderProps) {
  const { colors } = useTheme();
  if (!canGoBack) return null;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
        <Text variant="label" color={colors.brand}>
          ‹ Back
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  back: {
    minHeight: 32,
    justifyContent: 'center',
  },
});
