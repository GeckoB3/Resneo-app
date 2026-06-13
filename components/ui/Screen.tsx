import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ScreenProps = ScrollViewProps & {
  scroll?: boolean;
  padded?: boolean;
  /**
   * Wrap content in a KeyboardAvoidingView so inputs and the primary action stay
   * above the on-screen keyboard. Opt-in (forms) — most screens don't need it.
   */
  keyboardAvoiding?: boolean;
};

/**
 * Top-level screen wrapper with safe areas and optional scroll.
 * Use on every tab/stack screen for consistent layout.
 */
export function Screen({
  scroll = false,
  padded = true,
  keyboardAvoiding = false,
  style,
  contentContainerStyle,
  children,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const paddingStyle = padded ? styles.padded : undefined;
  // Let Android's native windowSoftInputMode (adjustResize) handle the inset;
  // iOS needs an explicit padding behaviour.
  const kavBehavior = Platform.OS === 'ios' ? 'padding' : undefined;

  if (scroll) {
    const scrollView = (
      <ScrollView
        contentContainerStyle={[paddingStyle, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        style={[styles.flex, style]}
        {...props}>
        {children}
      </ScrollView>
    );
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView style={styles.flex} behavior={kavBehavior}>
            {scrollView}
          </KeyboardAvoidingView>
        ) : (
          scrollView
        )}
      </SafeAreaView>
    );
  }

  const inner = <View style={styles.flex}>{children}</View>;
  return (
    <SafeAreaView
      style={[styles.flex, paddingStyle, { backgroundColor: colors.background }, style]}
      edges={['top']}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView style={styles.flex} behavior={kavBehavior}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
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
