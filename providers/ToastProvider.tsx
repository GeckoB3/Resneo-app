import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

import { hapticError, hapticSuccess } from '@/lib/haptics';
import { ToastHost, ToastStateContext, type ActiveToast, type ToastOptions } from '@/providers/ToastHost';

export type { ToastOptions, ToastTone } from '@/providers/ToastHost';
export { SheetToastHost } from '@/providers/ToastHost';

type ToastContextValue = {
  show: (opts: ToastOptions) => void;
  success: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  error: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  info: (message: string, opts?: Omit<ToastOptions, 'message' | 'tone'>) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);




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
      // Toast replaces Alert.alert app-wide and is often the ONLY feedback for a
      // success/error, so announce it to VoiceOver/TalkBack — the visual bar alone
      // is silent to screen readers.
      AccessibilityInfo.announceForAccessibility(opts.message);
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

  const state = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastStateContext.Provider value={state}>
        {children}
        <ToastHost toast={toast} onAction={dismiss} onDismiss={dismiss} />
      </ToastStateContext.Provider>
    </ToastContext.Provider>
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
