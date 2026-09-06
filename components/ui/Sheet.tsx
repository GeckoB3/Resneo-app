import { useEffect, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardInset } from '@/components/ui/useKeyboardInset';
import { useReduceMotion } from '@/lib/motion';
import { SHEET_MAX_WIDTH, useContentMaxWidth } from '@/lib/responsive';
import { AppLockCover } from '@/providers/AppLockProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Drag the handle/header down past this many points to dismiss the sheet. */
const DISMISS_DISTANCE = 96;
/** …or fling it down faster than this (pt/s) for a shorter drag. */
const DISMISS_VELOCITY = 800;
const DRAG_SPRING = { damping: 24, stiffness: 320, mass: 0.7 };

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
  /**
   * How the sheet yields to the soft keyboard:
   * - `'reserve'` (default): pad the body up by the keyboard height so nothing
   *   sits behind it. Right for short forms whose fields would otherwise hide.
   * - `'overlay'`: let the keyboard overlay the body and DON'T reserve space —
   *   the child is responsible for scrolling its focused field above the
   *   keyboard (e.g. `useSheetKeyboardScroll`). Use this for a tall scrollable
   *   body where reserving a keyboard-height block would otherwise show as a
   *   white band above the keyboard (the Modal window may also resize on Android,
   *   which double-counts the reserved space). See sheet-keyboard-avoidance memo.
   */
  keyboardAvoidance?: 'reserve' | 'overlay';
  children: ReactNode;
};


/**
 * Bottom sheet — the one Modal-based sheet used across the app. Theme-aware
 * scrim, drag handle, bottom safe area and keyboard avoidance; callers supply
 * the content (header, scroll body, actions).
 */
export function Sheet({
  visible,
  onClose,
  maxHeight = '90%',
  fill = false,
  keyboardAvoidance = 'reserve',
  children,
}: SheetProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(insets.bottom);
  // A sheet is one task, not a whole screen: on a tablet it stops at a card in
  // the middle instead of running the full width of the window with its title at
  // one edge and its buttons at the other. Undefined on a phone, where the cap
  // never bites.
  const sheetMaxWidth = useContentMaxWidth(SHEET_MAX_WIDTH);

  // Lift the content above the keyboard. `fill` sheets keep their fixed height
  // and shrink the body from the bottom (no top clipping); content-sized sheets
  // grow upward off the keyboard.
  //
  // `overlay` mode reserves NO keyboard space — the keyboard simply overlays the
  // body and the child scrolls its focused field above it. This avoids the
  // white band that reserving would otherwise leave above the keyboard.
  //
  // The bottom safe area is padding here rather than a native <SafeAreaView>.
  // Every sheet renders in its own Modal window, and a sheet opened from INSIDE
  // another sheet — booking detail → Modify — is a Modal within a Modal, where
  // the native view measures no safe area and contributes 0, dropping the pinned
  // action row onto the home indicator. The root SafeAreaProvider's metrics are
  // correct however deeply the Modal is nested, so they drive it instead.
  //
  // `fill` sheets also need a margin of their own. The flag used to give them 0
  // — it existed only to keep the pre-keyboard resting layout byte-identical —
  // which left their pinned footer sitting hard on the safe-area boundary.
  // Content-sized sheets are unchanged: lg + inset, exactly as before.
  const basePad = (fill ? spacing.md : spacing.lg) + insets.bottom;
  const animatedPad = useAnimatedStyle(() => ({
    paddingBottom: basePad + (keyboardAvoidance === 'overlay' ? 0 : keyboardInset.value),
  }));

  // Drag-to-dismiss: a downward pan on the handle/header translates the whole
  // sheet down; releasing past a distance/velocity threshold closes it,
  // otherwise it springs back. The translate lives on the OUTER sheet while the
  // keyboard inset lives on the INNER padding, so the two never fight. The
  // gesture is scoped to the handle region only, so scroll bodies in `fill`
  // sheets keep working untouched.
  const dragY = useSharedValue(0);

  // Reset the drag offset whenever the sheet (re)opens, so a sheet dismissed by
  // dragging doesn't reappear mid-slide on its next open.
  useEffect(() => {
    if (visible) dragY.set(0);
  }, [visible, dragY]);

  const settleBack = () => {
    'worklet';
    dragY.set(reduceMotion ? 0 : withSpring(0, DRAG_SPRING));
  };

  const panGesture = Gesture.Pan()
    // Only engage on a deliberate downward drag — a tap still fires the
    // Pressable's onPress (close), and horizontal movement is ignored.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onChange((event) => {
      // Only track downward drift; ignore upward pulls so the sheet can't lift
      // off its resting edge.
      dragY.set(Math.max(0, dragY.get() + event.changeY));
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        settleBack();
      }
    });

  const sheetTransform = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.get() }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      // A Modal runs in its OWN native window, which is not laid out edge-to-edge
      // unless told so. Without both flags the Android system navigation bar
      // flips from transparent to opaque the moment any sheet opens, and the
      // scrim stops short of it. RN warns if only one is set.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceRaised },
            sheetMaxWidth ? { maxWidth: sheetMaxWidth } : null,
            fill ? { height: maxHeight } : { maxHeight },
            sheetTransform,
          ]}>
          <Animated.View style={[fill ? styles.contentFill : styles.content, animatedPad]}>
            <GestureDetector gesture={panGesture}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Or drag down to dismiss"
                hitSlop={12}
                style={styles.handleHitArea}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </Pressable>
            </GestureDetector>
            {children}
          </Animated.View>
        </Animated.View>
        {/* The app-lock cover must be rendered INSIDE this Modal: the provider's
            own cover lives in the root view, and a Modal is a separate native
            window that no zIndex can reach over. Without this, backgrounding the
            app with a sheet open leaves client PII in the app-switcher snapshot
            and visible behind a cancelled biometric prompt. */}
        <AppLockCover />
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
    width: '100%',
    alignSelf: 'center',
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
  handleHitArea: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
});
