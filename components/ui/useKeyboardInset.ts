import { useEffect } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { motion } from '@/theme/index';

/**
 * Drives an animated keyboard inset from the OS keyboard events.
 *
 * The app runs edge-to-edge on the new architecture, so on Android the window
 * does NOT resize for the soft keyboard: the stock `KeyboardAvoidingView`
 * (which measures the keyboard from window-frame changes) reports nothing and
 * inputs end up hidden behind the keyboard. The same is true inside a
 * transparent Modal, which is what every sheet in the app is. Listening to the
 * keyboard events directly works on both platforms regardless of window resize
 * behaviour, runs on the UI thread through a shared value (no re-render, so
 * Android never drops TextInput focus on Fabric), and is a no-op on web where
 * the events never fire.
 *
 * The returned value already nets off the bottom safe-area inset (the caller's
 * base pad carries that), so callers add it straight onto a base pad.
 */
export function useKeyboardInset(bottomInset: number): SharedValue<number> {
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
