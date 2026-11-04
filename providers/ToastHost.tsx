/**
 * The toast bar, and the state a second host reads (split from ToastProvider 2026-11-04 so that a
 * sheet can draw it in its own window: tests across the app mock ToastProvider with `useToast`
 * alone, and a sheet importing from that module then rendered `undefined`).
 */
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { createContext, useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { motionSafe, useReduceMotion } from '@/lib/motion';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type ToastTone = 'default' | 'success' | 'error' | 'info';

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  /** Optional trailing action (e.g. Undo). */
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after this many ms (default 3200, or 5000 with an action). */
  duration?: number;
};

export type ActiveToast = ToastOptions & { id: number };

/**
 * The toast on screen now, for a second host inside a sheet (`SheetToastHost`). Kept apart from
 * the actions context so the many `useToast()` callers do not re-render on every toast.
 */
export const ToastStateContext = createContext<{ toast: ActiveToast | null; dismiss: () => void } | null>(null);

const TONE_ICON: Record<ToastTone, SymbolViewProps['name'] | null> = {
  default: null,
  success: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  error: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
};

const TONE_ACCENT: Record<ToastTone, string | null> = {
  default: null,
  success: '#34D399',
  error: '#F87171',
  info: '#60A5FA',
};


/**
 * The toast again, inside a sheet's own window. A sheet is a Modal, a separate native window that
 * the root host cannot draw over, so a toast raised with a sheet open (an error from its save, say)
 * was drawn behind it and never seen (found 2026-11-04: a refused block time left the sheet open
 * with no reason). Placed at the top so it does not cover the sheet's buttons. Renders nothing
 * outside a ToastProvider.
 */
export function SheetToastHost() {
  const state = useContext(ToastStateContext);
  if (!state) return null;
  return <ToastHost toast={state.toast} onAction={state.dismiss} onDismiss={state.dismiss} placement="top" />;
}

export function ToastHost({
  toast,
  onAction,
  onDismiss,
  placement = 'bottom',
}: {
  toast: ActiveToast | null;
  onAction: () => void;
  onDismiss: () => void;
  placement?: 'bottom' | 'top';
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  if (!toast) return null;

  const icon = toast.tone ? TONE_ICON[toast.tone] : null;
  const accent = toast.tone ? TONE_ACCENT[toast.tone] : null;

  return (
    <View
      style={[
        styles.host,
        placement === 'top' ? { top: insets.top + spacing.lg } : { bottom: insets.bottom + spacing['3xl'] + spacing.lg },
      ]}
      pointerEvents="box-none"
      testID={placement === 'top' ? 'sheet-toast' : undefined}>
      <Animated.View
        key={toast.id}
        entering={motionSafe(FadeInDown.springify().damping(20).stiffness(220), reduceMotion)}
        exiting={motionSafe(FadeOutDown.duration(160), reduceMotion)}
        style={[styles.bar, elevation.raised, { backgroundColor: colors.inverseSurface }]}
        pointerEvents="auto">
        {icon && accent ? (
          <SymbolView name={icon} tintColor={accent} size={20} style={styles.icon} />
        ) : null}
        <Text variant="bodySmall" color={colors.onInverse} numberOfLines={3} style={styles.message}>
          {toast.message}
        </Text>
        {toast.actionLabel ? (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            onPress={() => {
              toast.onAction?.();
              onAction();
            }}>
            <Text variant="label" color={colors.accent}>
              {toast.actionLabel}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onDismiss}>
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              tintColor={colors.onInverse}
              size={14}
            />
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 520,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
  },
  icon: {
    width: 20,
    height: 20,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
});
