import { useCallback, useEffect, useRef } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ScreenProps = ScrollViewProps & {
  scroll?: boolean;
  padded?: boolean;
  /**
   * Wrap content in a KeyboardAvoidingView so inputs and the primary action stay
   * above the on-screen keyboard. Opt-in (forms) — most screens don't need it.
   */
  keyboardAvoiding?: boolean;
  /**
   * Reserve the bottom safe area (the home-indicator strip). On by default,
   * because a PUSHED screen sits against the physical bottom edge and nothing
   * else clears it — leave it off and the last row of content runs under the
   * indicator.
   *
   * The four TAB screens pass `false`: they sit above the tab bar, which already
   * carries the inset via `tabBarStyle.paddingBottom` in (tabs)/_layout.tsx, so
   * reserving it here too would leave a dead strip above the bar. Default-on is
   * the safe way round — a forgotten tab screen wastes space, a forgotten pushed
   * screen hides content.
   */
  bottomInset?: boolean;
};

/**
 * Top-level screen wrapper with safe areas and optional scroll.
 * Use on every tab/stack screen for consistent layout.
 */
export function Screen({
  scroll = false,
  padded = true,
  keyboardAvoiding = false,
  bottomInset = true,
  style,
  contentContainerStyle,
  children,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingStyle = padded ? styles.padded : undefined;
  const safeBottom = bottomInset ? insets.bottom : 0;

  /**
   * Add the safe area to whatever bottom padding is already in play, rather than
   * replacing it — a caller that asked for room at the end of a list still gets
   * it, and still clears the indicator. Applied last so it always wins.
   */
  const withSafeBottom = useCallback(
    (base: ScrollViewProps['style'] | ScrollViewProps['contentContainerStyle']) => {
      const flat = StyleSheet.flatten(base) ?? {};
      const existing =
        typeof flat.paddingBottom === 'number'
          ? flat.paddingBottom
          : typeof flat.padding === 'number'
            ? flat.padding
            : 0;
      return { paddingBottom: existing + safeBottom };
    },
    [safeBottom],
  );
  // Non-scroll keyboardAvoiding uses a KeyboardAvoidingView; iOS needs an
  // explicit padding behaviour, Android relies on adjustResize.
  const kavBehavior = Platform.OS === 'ios' ? 'padding' : undefined;

  // Manual keyboard avoidance for the scrollable form variant. The app runs
  // edge-to-edge (Expo SDK 56 / new architecture), so on Android the window no
  // longer resizes for the soft keyboard — windowSoftInputMode=adjustResize and
  // the stock KeyboardAvoidingView both measure nothing, leaving inputs behind
  // the keyboard (the same reason Sheet drives its own inset — see Sheet.tsx).
  // We instead listen to the OS keyboard events and (a) pad the scroll content
  // by the keyboard height through a Reanimated shared value — no re-render, so
  // Android never drops TextInput focus on Fabric — and (b) scroll the focused
  // field above the keyboard when the padding alone would leave it covered
  // (small screens / tall forms). No-op on web, where the events never fire.
  const keyboardInset = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const basePad = (padded ? spacing.base : 0) + safeBottom;

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    if (!scroll || !keyboardAvoiding) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      const duration = event.duration && event.duration > 0 ? event.duration : motion.normal;
      keyboardInset.value = withTiming(height, { duration });

      // Lift the focused field above the keyboard when the inset alone leaves it
      // covered. Measured against the resting layout, so any over-correction
      // only ever adds margin above the keyboard — the field is never hidden.
      const focused = TextInput.State.currentlyFocusedInput?.();
      if (focused) {
        const keyboardTop = Dimensions.get('window').height - height;
        focused.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + spacing.base - keyboardTop;
          if (overlap > 0) {
            scrollRef.current?.scrollTo({ y: scrollOffset.current + overlap, animated: true });
          }
        });
      }
    };
    const onHide = (event: KeyboardEvent) => {
      const duration = event?.duration && event.duration > 0 ? event.duration : motion.normal;
      keyboardInset.value = withTiming(0, { duration });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scroll, keyboardAvoiding, keyboardInset]);

  const animatedContent = useAnimatedStyle(() => ({
    paddingBottom: basePad + keyboardInset.value,
  }));

  if (scroll) {
    // Keyboard-aware scrollable form: the content lives in an inner Animated.View
    // whose bottom padding grows with the keyboard, lifting the centred form into
    // the space above it (and giving the ScrollView room to scroll the focused
    // field up). The padding sits on the inner view rather than the ScrollView's
    // contentContainer so the slack collapses into the bottom, keeping the form
    // top-aligned and fully scrollable when it overflows.
    if (keyboardAvoiding) {
      return (
        <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
          <ScrollView
            ref={scrollRef}
            style={[styles.flex, style]}
            contentContainerStyle={styles.grow}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            {...props}
            onScroll={handleScroll}>
            <Animated.View style={[styles.grow, paddingStyle, contentContainerStyle, animatedContent]}>
              {children}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            paddingStyle,
            contentContainerStyle,
            withSafeBottom([paddingStyle, contentContainerStyle]),
          ]}
          keyboardShouldPersistTaps="handled"
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
      style={[
        styles.flex,
        paddingStyle,
        { backgroundColor: colors.background },
        style,
        withSafeBottom([paddingStyle, style]),
      ]}
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
  grow: {
    flexGrow: 1,
  },
  padded: {
    padding: spacing.base,
  },
});
