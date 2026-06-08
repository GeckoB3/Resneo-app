import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ScreenProps = ScrollViewProps & {
  scroll?: boolean;
  padded?: boolean;
};

/**
 * Top-level screen wrapper with safe areas and optional scroll.
 * Use on every tab/stack screen for consistent layout.
 */
export function Screen({
  scroll = false,
  padded = true,
  style,
  contentContainerStyle,
  children,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const paddingStyle = padded ? styles.padded : undefined;

  if (scroll) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          contentContainerStyle={[paddingStyle, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          style={[styles.flex, style]}
          {...props}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.flex, paddingStyle, { backgroundColor: colors.background }, style]}
      edges={['top']}>
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  padded: {
    padding: spacing.base,
  },
});
