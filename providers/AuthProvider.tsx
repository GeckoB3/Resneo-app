import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getAuthCallbackRedirectUrl } from '@/lib/auth/redirect';
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

      setSession(data.session ?? null);
      setIsLoading(false);
    }

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
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

      // Recovery link opens the app at /callback (add URL in Supabase redirect allow-list).
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: getAuthCallbackRedirectUrl(),
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

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[AuthProvider] signOut failed:', error.message);
    }
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
      signInWithEmail,
      signInWithPassword,
      requestPasswordReset,
      signOut,
    }),
    [session, isLoading, initError, signInWithEmail, signInWithPassword, requestPasswordReset, signOut],
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
