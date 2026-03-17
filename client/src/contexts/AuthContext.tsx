import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, type User } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPartner: boolean;
  isSubPartner: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (loginId: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Timeout wrapper: resolves with null if the promise doesn't settle in `ms` */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    isAdmin: false,
    isPartner: false,
    isSubPartner: false,
  });

  // Track if we've already initialized to prevent double-init
  const initRef = useRef(false);

  const fetchUser = useCallback(async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error || !data) return null;
      return data as User;
    } catch {
      return null;
    }
  }, []);

  const updateStateWithUser = useCallback((session: Session | null, user: User | null) => {
    setState({
      session,
      user,
      loading: false,
      isAdmin: user?.role === 'admin' || false,
      isPartner: user?.role === 'partner' || false,
      isSubPartner: user?.role === 'sub_partner' || false,
    });
  }, []);

  useEffect(() => {
    // Prevent double-init in React StrictMode
    if (initRef.current) return;
    initRef.current = true;

    let cancelled = false;

    const initAuth = async () => {
      try {
        // Wrap getSession in a timeout to prevent indefinite hangs
        const result = await withTimeout(
          supabase.auth.getSession(),
          5000 // 5 second timeout
        );

        if (cancelled) return;

        if (!result) {
          // Timeout — treat as no session
          console.warn('[Auth] getSession timed out, treating as unauthenticated');
          updateStateWithUser(null, null);
          return;
        }

        const session = result.data?.session;

        if (session?.user) {
          const user = await fetchUser(session.user.id);
          if (!cancelled) {
            updateStateWithUser(session, user);
          }
        } else {
          if (!cancelled) {
            updateStateWithUser(null, null);
          }
        }
      } catch (err) {
        console.error('[Auth] initAuth error:', err);
        if (!cancelled) {
          updateStateWithUser(null, null);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // Handle token refresh failures — force logout
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('[Auth] Token refresh failed, signing out');
        updateStateWithUser(null, null);
        return;
      }

      if (event === 'SIGNED_OUT') {
        updateStateWithUser(null, null);
        return;
      }

      if (session?.user) {
        const user = await fetchUser(session.user.id);
        if (!cancelled) {
          updateStateWithUser(session, user);
        }
      } else if (event === 'INITIAL_SESSION' && !session) {
        // No session on initial load
        if (!cancelled) {
          updateStateWithUser(null, null);
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUser, updateStateWithUser]);

  // Periodic session health check — detect expired tokens
  useEffect(() => {
    if (!state.session) return;

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          console.warn('[Auth] Session expired during health check, signing out');
          updateStateWithUser(null, null);
        }
      } catch {
        // Network error — don't sign out, just log
        console.warn('[Auth] Session health check failed (network?)');
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [state.session, updateStateWithUser]);

  const signIn = async (loginId: string, password: string) => {
    try {
      // Step 1: Validate credentials via custom RPC
      const { data: loginResult, error: rpcError } = await supabase.rpc('custom_login', {
        p_login_id: loginId,
        p_password: password,
      });

      if (rpcError) {
        return { error: 'ログインに失敗しました: ' + rpcError.message };
      }

      if (loginResult?.error) {
        return { error: loginResult.error };
      }

      if (!loginResult?.success) {
        return { error: 'ユーザーIDまたはパスワードが正しくありません' };
      }

      // Step 2: Sign in via Supabase Auth
      const email = loginResult.email || loginId + '@crafia.local';
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        return { error: 'ログインに失敗しました: ' + authError.message };
      }

      return { error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';
      return { error: 'ログインに失敗しました: ' + msg };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Force clear even if signOut fails
    }
    updateStateWithUser(null, null);
  };

  const refreshUser = async () => {
    const userId = state.user?.id || state.session?.user?.id;
    if (userId) {
      const user = await fetchUser(userId);
      setState(prev => ({
        ...prev,
        user,
        isAdmin: user?.role === 'admin' || false,
        isPartner: user?.role === 'partner' || false,
        isSubPartner: user?.role === 'sub_partner' || false,
      }));
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
