import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion, spacing } from '@/theme/index';

/**
 * Keyboard-aware scrolling for a tall sheet's scroll body — the mobile analogue
 * of the proven `Screen` form pattern (see components/ui/Screen.tsx).
 *
 * The app runs edge-to-edge (Expo SDK 56 / new architecture), so adjustResize is
 * dead on Android. Rather than reserve a keyboard-height block on the sheet BODY
 * (which shrinks the viewport and, when the Modal window also resizes, shows as a
 * white band above the keyboard), this lets the keyboard OVERLAY the scroll body
 * and:
 *   1. pads the bottom of the scroll CONTENT (`spacerStyle`) by the keyboard
 *      height — scrollable room, behind the keyboard, so any field can rise above
 *      it; and
 *   2. on the keyboard SHOW event (height known) lifts the focused field by ONLY
 *      the amount it overlaps the keyboard — never to the top, never over-scrolled.
 *
 * Usage: put the sheet in `keyboardAvoidance="overlay"`, spread `onScroll`
 * (+ `scrollEventThrottle`) on the ScrollView, and wrap the body in an
 * `Animated.View style={spacerStyle}`. No-op on web (events never fire).
 */
export function useSheetKeyboardScroll(scrollRef: RefObject<ScrollView | null>) {
  const scrollOffset = useRef(0);
  const keyboardInset = useSharedValue(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      const duration = event.duration && event.duration > 0 ? event.duration : motion.normal;
      // Scrollable room at the bottom of the content so the focused field can be
      // lifted clear of the keyboard even when it's the last thing in the body.
      keyboardInset.value = withTiming(height, { duration });

      const focused = TextInput.State.currentlyFocusedInput?.();
      if (!focused || height <= 0) return;
      // Lift the focused field only when it overlaps the keyboard. Measured from
      // the resting layout, so any over-correction merely adds margin above the
      // keyboard — the field is never hidden and the body never over-scrolls.
      const keyboardTop = Dimensions.get('window').height - height;
      focused.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + spacing.base - keyboardTop;
        if (overlap > 0) {
          scrollRef.current?.scrollTo({ y: scrollOffset.current + overlap, animated: true });
        }
      });
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
  }, [scrollRef, keyboardInset]);

  const spacerStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardInset.value }));

  return { onScroll, spacerStyle };
}
