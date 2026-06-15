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
  // Non-scroll keyboardAvoiding uses a KeyboardAvoidingView; iOS needs an
  // explicit padding behaviour, Android relies on adjustResize.
  const kavBehavior = Platform.OS === 'ios' ? 'padding' : undefined;

  if (scroll) {
    // For a scrollable form, the most reliable way to keep the FOCUSED input
    // above the keyboard is the OS-native behaviour, not a KeyboardAvoidingView
    // (which only pads the bottom and never scrolls the field into view):
    //   · iOS → automaticallyAdjustKeyboardInsets scrolls the focused field up.
    //   · Android → windowSoftInputMode=adjustResize (set in app.json) shrinks
    //     the window so the ScrollView keeps the focused field visible.
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          contentContainerStyle={[paddingStyle, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={keyboardAvoiding}
          style={[styles.flex, style]}
          {...props}>
          {children}
        </ScrollView>
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
