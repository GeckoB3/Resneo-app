import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess } from '@/lib/haptics';
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

type ToastContextValue = {
  show: (opts: ToastOptions) => void;
  success: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  error: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  info: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

type ActiveToast = ToastOptions & { id: number };

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
 * App-wide transient feedback. Replaces `Alert.alert(...)` for success/error
 * notices — `Alert.alert` is a no-op on react-native-web (the dev-preview
 * path), so flows that relied on it gave zero feedback there. The toast host is
 * mounted once at the app root, floats above the tab bar, auto-dismisses, and
 * is safe-area aware.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (opts: ToastOptions) => {
      clearTimer();
      idRef.current += 1;
      const next: ActiveToast = { ...opts, id: idRef.current };
      setToast(next);
      if (opts.tone === 'success') hapticSuccess();
      else if (opts.tone === 'error') hapticError();
      const ms = opts.duration ?? (opts.actionLabel ? 5000 : 3200);
      timerRef.current = setTimeout(() => {
        // Only dismiss if this toast is still the active one.
        setToast((current) => (current?.id === next.id ? null : current));
        timerRef.current = null;
      }, ms);
    },
    [clearTimer],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, opts) => show({ ...opts, message, tone: 'success' }),
      error: (message, opts) => show({ ...opts, message, tone: 'error' }),
      info: (message, opts) => show({ ...opts, message, tone: 'info' }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toast={toast} onAction={dismiss} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastHost({
  toast,
  onAction,
  onDismiss,
}: {
  toast: ActiveToast | null;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!toast) return null;

  const icon = toast.tone ? TONE_ICON[toast.tone] : null;
  const accent = toast.tone ? TONE_ACCENT[toast.tone] : null;

  return (
    <View
      style={[styles.host, { bottom: insets.bottom + spacing['3xl'] + spacing.lg }]}
      pointerEvents="box-none">
      <Animated.View
        key={toast.id}
        entering={FadeInDown.springify().damping(20).stiffness(220)}
        exiting={FadeOutDown.duration(160)}
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

/** Access the app-wide toast host. Safe to call from any screen under AppProviders. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
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
