import { useEffect, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
  type KeyboardEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Cap the sheet height (default 90%). */
  maxHeight?: DimensionValue;
  /**
   * Tall mode: pin the sheet to a fixed `maxHeight` and let the content fill it
   * (the child manages its own scrolling + horizontal padding). Use for screens
   * that need to show a long, scrollable body — e.g. the full booking detail.
   */
  fill?: boolean;
  children: ReactNode;
};

/**
 * Drives an animated keyboard inset from the OS keyboard events.
 *
 * The app's sheets are `transparent` Modals. On Android a transparent Modal's
 * window does NOT resize for the keyboard, so the stock `KeyboardAvoidingView`
 * (which measures the keyboard from window-frame changes) reports nothing and
 * inputs end up hidden behind the keyboard. Listening to the keyboard events
 * directly works on both platforms regardless of window resize behaviour, runs
 * on the UI thread via a shared value (no re-render), and is a no-op on web
 * where the events never fire — so the field is never obscured.
 *
 * The returned value already nets off the bottom safe-area inset (the sheet's
 * SafeAreaView contributes that), so callers add it straight onto a base pad.
 */
function useKeyboardInset(bottomInset: number) {
  const inset = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      const duration = event.duration && event.duration > 0 ? event.duration : motion.normal;
      inset.value = withTiming(Math.max(0, height - bottomInset), { duration });
    };
    const onHide = (event: KeyboardEvent) => {
      const duration = event?.duration && event.duration > 0 ? event.duration : motion.normal;
      inset.value = withTiming(0, { duration });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [bottomInset, inset]);

  return inset;
}

/**
 * Bottom sheet — the one Modal-based sheet used across the app. Theme-aware
 * scrim, drag handle, bottom safe area and keyboard avoidance; callers supply
 * the content (header, scroll body, actions).
 */
export function Sheet({ visible, onClose, maxHeight = '90%', fill = false, children }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(insets.bottom);

  // Lift the content above the keyboard. `fill` sheets keep their fixed height
  // and shrink the body from the bottom (no top clipping); content-sized sheets
  // grow upward off the keyboard. The base padding keeps the resting layout
  // identical to before when no keyboard is shown.
  const basePad = fill ? 0 : spacing.lg;
  const animatedPad = useAnimatedStyle(() => ({
    paddingBottom: basePad + keyboardInset.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceRaised },
            fill ? { height: maxHeight } : { maxHeight },
          ]}>
          <Animated.View style={[fill ? styles.contentFill : styles.content, animatedPad]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {children}
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.surface,
    borderTopRightRadius: radius.surface,
  },
  content: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  contentFill: {
    flex: 1,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
});
