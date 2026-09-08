import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  TextInput,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, spacing } from '@/theme/index';

/**
 * If the padded content has not reported its new size by then, scroll anyway
 * (the native side clamps the offset, so at worst the lift is partial).
 */
const PENDING_SCROLL_FALLBACK_MS = 250;

/**
 * Gap kept between the bottom of the focused box and the keyboard. Generous on
 * purpose: it also covers the box's border, a caption/error line under it, and
 * any residual coordinate slop on unusual devices — over-lifting is harmless,
 * a covered field is not.
 */
const KEYBOARD_CLEARANCE = spacing['2xl'] + spacing.sm;

/**
 * How often to check which input is focused while the keyboard is up. Android
 * fires `keyboardDidShow` only when the keyboard APPEARS; moving focus between
 * fields with it already up sends nothing, so a half-covered field the user
 * tapped would stay half-covered without this.
 */
const FOCUS_WATCH_MS = 120;

type FocusedInput = NonNullable<ReturnType<typeof TextInput.State.currentlyFocusedInput>>;

/**
 * Keyboard-aware scrolling for a scroll body the soft keyboard OVERLAYS — the
 * tall-sheet analogue of the proven `Screen` form pattern (see
 * components/ui/Screen.tsx), also used by the booking wizard's guest-details
 * step, which sits on a plain `Screen`.
 *
 * The app runs edge-to-edge (Expo SDK 56 / new architecture), so adjustResize is
 * dead on Android. Rather than reserve a keyboard-height block on the BODY
 * (which shrinks the viewport and, when a Modal window also resizes, shows as a
 * white band above the keyboard), this lets the keyboard overlay the scroll body
 * and:
 *   1. pads the bottom of the scroll CONTENT (`spacerStyle`) by the keyboard
 *      height — scrollable room, behind the keyboard, so any field can rise above
 *      it; and
 *   2. on the keyboard SHOW event (height known) lifts the focused field by ONLY
 *      the amount it overlaps the keyboard — never to the top, never over-scrolled;
 *   3. while the keyboard stays up, lifts whichever field focus moves to.
 *
 * Coordinate spaces (the 2026-09-08 "lifts, but not enough" bug). The field is
 * measured with `measureInWindow`; the keyboard's top edge comes from the event's
 * `endCoordinates.screenY`. On iOS both are window coordinates. On Android
 * Fabric, `measureInWindow` is offset by the root's viewport offset, which RN
 * computes as location-in-window MINUS the visible display frame's top — i.e.
 * the status bar — while `screenY` is a raw screen coordinate. So on Android
 * the keyboard top is shifted up by the status bar height before comparing.
 *
 * Ordering matters for (2). A native ScrollView clamps `scrollTo` to the content
 * it has laid out NOW, so scrolling in the same tick as growing the padding is
 * thrown away whenever the body fits (or nearly fits) the viewport — the field
 * stays behind the keyboard. So the padding is applied at once (it sits behind
 * the keyboard, there is nothing to animate) and the lift waits for the scroll
 * view to report its grown content through `onContentSizeChange`, with a short
 * fallback timer in case that never fires (keyboard already up, no size change).
 *
 * Usage: put a sheet in `keyboardAvoidance="overlay"`, spread `onScroll`,
 * `onLayout` and `onContentSizeChange` (+ `scrollEventThrottle`) on the
 * ScrollView, and wrap the body in an `Animated.View style={spacerStyle}`.
 * No-op on web (events never fire).
 */
export function useSheetKeyboardScroll(scrollRef: RefObject<ScrollView | null>) {
  const insets = useSafeAreaInsets();
  const insetTop = useRef(insets.top);
  useEffect(() => {
    insetTop.current = insets.top;
  }, [insets.top]);

  const scrollOffset = useRef(0);
  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);
  /** Target offset waiting for the padded content to be laid out. */
  const pendingScrollY = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** JS-side mirror of the inset target (reading a shared value from JS is a sync hop). */
  const appliedInset = useRef(0);
  /** Keyboard top edge, in `measureInWindow` space, while the keyboard is up. */
  const keyboardTop = useRef<number | null>(null);
  const lastFocused = useRef<FocusedInput | null>(null);
  const focusWatch = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyboardInset = useSharedValue(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    layoutHeight.current = event.nativeEvent.layout.height;
  }, []);

  const clearPending = useCallback(() => {
    pendingScrollY.current = null;
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, []);

  const stopFocusWatch = useCallback(() => {
    if (focusWatch.current) {
      clearInterval(focusWatch.current);
      focusWatch.current = null;
    }
    lastFocused.current = null;
  }, []);

  /** Largest reachable offset, or Infinity when the sizes are not known yet. */
  const maxScrollY = useCallback(() => {
    if (!layoutHeight.current || !contentHeight.current) return Number.POSITIVE_INFINITY;
    return Math.max(0, contentHeight.current - layoutHeight.current);
  }, []);

  const scrollToClamped = useCallback(
    (y: number) => {
      const target = Math.max(0, Math.min(y, maxScrollY()));
      if (target > scrollOffset.current) {
        scrollRef.current?.scrollTo({ y: target, animated: true });
      }
    },
    [maxScrollY, scrollRef],
  );

  /**
   * Lift `input` clear of the keyboard whose top edge is `top`. `waitForGrowth`
   * defers the scroll until the padded content has been laid out (see above).
   */
  const liftInput = useCallback(
    (input: FocusedInput, top: number, waitForGrowth: boolean) => {
      // Measured from the resting layout, so any over-correction merely adds
      // margin above the keyboard — the field is never hidden and the body never
      // over-scrolls.
      input.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + KEYBOARD_CLEARANCE - top;
        if (overlap <= 0) return;
        const target = scrollOffset.current + overlap;
        clearPending();
        if (!waitForGrowth || target <= maxScrollY()) {
          // The content is already tall enough (or will not grow): go now.
          scrollToClamped(target);
          return;
        }
        pendingScrollY.current = target;
        pendingTimer.current = setTimeout(() => {
          if (pendingScrollY.current === null) return;
          const y2 = pendingScrollY.current;
          clearPending();
          scrollToClamped(y2);
        }, PENDING_SCROLL_FALLBACK_MS);
      });
    },
    [clearPending, maxScrollY, scrollToClamped],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      const pending = pendingScrollY.current;
      if (pending === null) return;
      // Wait until the grown content can actually reach the target; the fallback
      // timer covers the case where it never can (then the clamp applies).
      if (pending > maxScrollY()) return;
      clearPending();
      scrollToClamped(pending);
    },
    [clearPending, maxScrollY, scrollToClamped],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    /** The keyboard's top edge in the space `measureInWindow` reports in. */
    const keyboardTopFor = (event: KeyboardEvent, height: number) => {
      const screenY = event.endCoordinates?.screenY;
      const top =
        typeof screenY === 'number' && screenY > 0
          ? screenY
          : Dimensions.get('window').height - height;
      if (Platform.OS !== 'android') return top;
      // Android Fabric measures relative to the visible display frame (below the
      // status bar); the event's screenY is a raw screen coordinate. Take the
      // larger of the two status-bar readings: the safe-area top is 0 when the
      // app is not edge-to-edge, the resource height can undershoot a cutout.
      const statusBar = Math.max(StatusBar.currentHeight ?? 0, insetTop.current);
      return top - statusBar;
    };

    const startFocusWatch = () => {
      if (focusWatch.current) return;
      focusWatch.current = setInterval(() => {
        const top = keyboardTop.current;
        if (top === null) return;
        const focused = TextInput.State.currentlyFocusedInput?.() ?? null;
        if (!focused || focused === lastFocused.current) return;
        lastFocused.current = focused;
        liftInput(focused, top, false);
      }, FOCUS_WATCH_MS);
    };

    const onShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      // Scrollable room at the bottom of the content so the focused field can be
      // lifted clear of the keyboard even when it's the last thing in the body.
      // Applied without animation: it is behind the keyboard, and the lift below
      // needs the full padding laid out before it can scroll into it.
      const insetGrows = height > appliedInset.current;
      appliedInset.current = height;
      keyboardInset.value = height;
      if (height <= 0) return;

      const top = keyboardTopFor(event, height);
      keyboardTop.current = top;
      startFocusWatch();

      const focused = TextInput.State.currentlyFocusedInput?.() ?? null;
      lastFocused.current = focused;
      if (!focused) return;
      liftInput(focused, top, insetGrows);
    };
    const onHide = (event: KeyboardEvent) => {
      clearPending();
      stopFocusWatch();
      keyboardTop.current = null;
      appliedInset.current = 0;
      const duration = event?.duration && event.duration > 0 ? event.duration : motion.normal;
      keyboardInset.value = withTiming(0, { duration });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
      clearPending();
      stopFocusWatch();
    };
  }, [keyboardInset, clearPending, liftInput, stopFocusWatch]);

  const spacerStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardInset.value }));

  return { onScroll, onLayout, onContentSizeChange, spacerStyle };
}
