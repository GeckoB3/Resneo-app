import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { unregisterDevice } from '@/lib/push/registerDevice';
import { ANALYTICS_EVENTS, identify, resetAnalytics, track } from '@/lib/analytics';
import { setAccessTokenRefresher } from '@/lib/api/client';
import { getAuthCallbackRedirectUrl, getPasswordResetRedirectUrl } from '@/lib/auth/redirect';
import { setObservabilityUser } from '@/lib/observability';
import { setQueryAuthScope } from '@/lib/queries/keys';
import { queryClient } from '@/lib/queries/queryClient';
import { getSupabase } from '@/lib/supabase';
import {
  signInEmailSchema,
  signInPasswordSchema,
} from '@/lib/validation/auth';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  initError: string | null;
  /** True when the session was lost unexpectedly (expiry/revocation), not via signOut(). */
  sessionExpired: boolean;
  /** Clear the sessionExpired flag once the notice has been shown. */
  acknowledgeSessionExpiry: () => void;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * Global auth state backed by Supabase + expo-secure-store (via getSupabase()).
 * Listens to onAuthStateChange so magic-link callbacks update the session automatically.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  // True only while an explicit signOut() is in flight, so the resulting
  // SIGNED_OUT event isn't mistaken for an unexpected expiry/revocation.
  const isExplicitSignOutRef = useRef(false);

  useEffect(() => {
    let supabase: SupabaseClient;
    try {
      supabase = getSupabase();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Supabase is not configured.';
      setInitError(message);
      setIsLoading(false);
      return;
    }

    let active = true;

    async function loadInitialSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (error) {
        console.warn('[AuthProvider] getSession failed:', error.message);
      }

      const userId = data.session?.user?.id ?? null;
      setSession(data.session ?? null);
      setObservabilityUser(userId);
      setQueryAuthScope(userId);
      identify(userId);
      setIsLoading(false);
    }

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const userId = nextSession?.user?.id ?? null;
      setSession(nextSession);
      setObservabilityUser(userId);
      setQueryAuthScope(userId);
      identify(userId);

      if (userId) {
        if (event === 'SIGNED_IN') {
          track(ANALYTICS_EVENTS.signInSucceeded);
        }
      } else if (event === 'SIGNED_OUT') {
        // A SIGNED_OUT we didn't initiate means the refresh token was revoked
        // or expired — flag it so the UI can prompt a friendly re-login.
        if (!isExplicitSignOutRef.current) {
          setSessionExpired(true);
        }
        isExplicitSignOutRef.current = false;
      }
      setIsLoading(false);
    });

    // ── Keep the session alive across background → foreground ────────────────
    // React Native freezes JS timers while the app is backgrounded, so
    // Supabase's auto-refresh ticker stops and the in-memory access token can
    // expire. Supabase assumes "always foreground" on native and REQUIRES the
    // host app to drive refresh from the platform's foreground signal (see the
    // startAutoRefresh docs in @supabase/auth-js). Without this, the first
    // calendar/bookings fetch after resuming raced an expired Bearer token →
    // 401 "unauthorised access" until the ticker eventually caught up.
    //
    // startAutoRefresh() runs an immediate refresh tick, so returning to the
    // foreground proactively refreshes a near/already-expired token and emits
    // TOKEN_REFRESHED (updating useAccessToken) before queries refetch. Native
    // only — on web Supabase manages this itself via the Page Visibility API.
    let appStateSub: { remove: () => void } | undefined;
    if (Platform.OS !== 'web') {
      const syncAutoRefresh = (state: AppStateStatus) => {
        if (state === 'active') {
          void supabase.auth.startAutoRefresh();
        } else {
          void supabase.auth.stopAutoRefresh();
        }
      };
      // Align with the current state on mount (cold start is normally active).
      syncAutoRefresh(AppState.currentState);
      appStateSub = AppState.addEventListener('change', syncAutoRefresh);
    }

    // Safety net for the resume race: if a request still goes out with a token
    // that expired while backgrounded, apiFetch asks for a fresh one and retries
    // once. getSession() refreshes an expired token but returns the SAME token
    // when it's still valid — so a "valid session but not venue staff" 401
    // returns null here and is NOT retried (the staff gate still redirects).
    setAccessTokenRefresher(async (expiredToken) => {
      try {
        const {
          data: { session: refreshedSession },
        } = await supabase.auth.getSession();
        const next = refreshedSession?.access_token ?? null;
        return next && next !== expiredToken ? next : null;
      } catch {
        return null;
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      appStateSub?.remove();
      setAccessTokenRefresher(null);
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    try {
      const supabase = getSupabase();
      const parsed = signInEmailSchema.safeParse({ email });
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email.' };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          // Opens this app via resneo://callback when the user taps the email link.
          emailRedirectTo: getAuthCallbackRedirectUrl(),
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send magic link.';
      return { error: message };
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const supabase = getSupabase();
      const parsed = signInPasswordSchema.safeParse({ email, password });
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Check your email and password.' };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        return { error: error.message };
      }

      // Best-effort: backfill any guest/staff rows matched only by email to the
      // now-authenticated user (matches the web resolve-next flow). Never block
      // sign-in on a claim failure — staff are normally already linked by id.
      try {
        const { error: claimError } = await supabase.rpc('claim_user_account');
        if (claimError) {
          console.warn('[AuthProvider] claim_user_account:', claimError.message);
        }
      } catch (claimCaught) {
        console.warn(
          '[AuthProvider] claim_user_account threw:',
          claimCaught instanceof Error ? claimCaught.message : claimCaught,
        );
      }

      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in.';
      return { error: message };
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const supabase = getSupabase();
      const parsed = signInEmailSchema.safeParse({ email });
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email.' };
      }

      // Recovery link opens the app at /callback, which verifies the link and then
      // routes to the set-password screen (add URL in Supabase redirect allow-list).
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: getPasswordResetRedirectUrl(),
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not send reset link.';
      return { error: message };
    }
  }, []);

  const acknowledgeSessionExpiry = useCallback(() => setSessionExpired(false), []);

  const signOut = useCallback(async () => {
    // Mark this as a deliberate sign-out so the SIGNED_OUT event above isn't
    // surfaced as a "session expired" notice.
    isExplicitSignOutRef.current = true;
    track(ANALYTICS_EVENTS.signedOut);
    const supabase = getSupabase();
    // Detach this device's push registration FIRST — the DELETE is scoped to
    // auth.uid(), so it is a no-op once the token below is revoked. Leaving the
    // row behind sends the next person to sign in on this device the previous
    // venue's booking alerts, client names and all.
    const { data: sessionData } = await supabase.auth.getSession();
    await unregisterDevice(sessionData.session?.access_token ?? null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[AuthProvider] signOut failed:', error.message);
    }
    resetAnalytics();
    // Drop all cached venue data so a subsequent user can never transiently see
    // the previous user's bookings/clients before their own queries load.
    queryClient.clear();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      initError,
      sessionExpired,
      acknowledgeSessionExpiry,
      signInWithEmail,
      signInWithPassword,
      requestPasswordReset,
      signOut,
    }),
    [
      session,
      isLoading,
      initError,
      sessionExpired,
      acknowledgeSessionExpiry,
      signInWithEmail,
      signInWithPassword,
      requestPasswordReset,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read auth state anywhere under AppProviders. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
