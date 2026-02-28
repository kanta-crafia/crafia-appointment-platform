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

const STORAGE_KEY = 'crafia-auth';

/**
 * Fetch user data directly via REST API using the access token,
 * bypassing the Supabase client's internal session state.
 * This avoids dependency on getSession() which can deadlock due to Web Locks.
 */
async function fetchUserDirect(
  userId: string,
  accessToken: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<User | null> {
  try {
    const url = `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=*&limit=1`;
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as User;
  } catch {
    return null;
  }
}

/**
 * Read stored session from localStorage.
 * Returns null if no valid session exists or if the token is expired.
 */
function readStoredSession(): {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const accessToken = parsed?.access_token;
    const refreshToken = parsed?.refresh_token;
    const userId = parsed?.user?.id;
    const expiresAt = parsed?.expires_at;
    if (!accessToken || !refreshToken || !userId) return null;
    // Check if token is expired (with 60s buffer)
    if (expiresAt && Date.now() / 1000 > expiresAt - 60) return null;
    return { accessToken, refreshToken, userId, expiresAt };
  } catch {
    return null;
  }
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

  // Track whether initAuth has successfully restored a user from localStorage.
  // When true, onAuthStateChange should NOT reset user to null on INITIAL_SESSION.
  const initAuthRestoredRef = useRef(false);

  // Track whether initAuth has completed its work
  const initAuthDoneRef = useRef(false);

  const fetchUserViaClient = useCallback(async (userId: string) => {
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

  useEffect(() => {
    let cancelled = false;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    const initAuth = async () => {
      const stored = readStoredSession();

      if (stored) {
        // Fetch user data using the stored access token via direct REST API call
        const user = await fetchUserDirect(
          stored.userId,
          stored.accessToken,
          supabaseUrl,
          supabaseAnonKey
        );

        if (cancelled) return;

        if (user) {
          // Mark that we successfully restored a user from localStorage
          initAuthRestoredRef.current = true;

          // Show UI immediately
          setState({
            session: null,
            user,
            loading: false,
            isAdmin: user.role === 'admin',
            isPartner: user.role === 'partner',
            isSubPartner: user.role === 'sub_partner',
          });

          // Initialize supabase client session in background
          try {
            const { data } = await supabase.auth.setSession({
              access_token: stored.accessToken,
              refresh_token: stored.refreshToken,
            });
            if (!cancelled && data.session) {
              setState(prev => ({
                ...prev,
                session: data.session,
              }));
            }
          } catch {
            // Non-critical - UI is already showing
          }

          initAuthDoneRef.current = true;
          return;
        }
      }

      // No stored session or stored session was invalid
      // Don't even try getSession() - it deadlocks with Web Locks.
      // If there's no valid stored session, the user is simply not logged in.
      if (!cancelled) {
        setState({
          session: null,
          user: null,
          loading: false,
          isAdmin: false,
          isPartner: false,
          isSubPartner: false,
        });
      }

      initAuthDoneRef.current = true;
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // CRITICAL: If initAuth successfully restored a user from localStorage,
      // ignore INITIAL_SESSION events with null session.
      // This prevents the Supabase client's Web Locks issue from resetting our state.
      if (event === 'INITIAL_SESSION' && !session && initAuthRestoredRef.current) {
        return; // Skip - we already have a valid user from localStorage
      }

      // For SIGNED_OUT events, always clear the state
      if (event === 'SIGNED_OUT') {
        setState({
          session: null,
          user: null,
          loading: false,
          isAdmin: false,
          isPartner: false,
          isSubPartner: false,
        });
        return;
      }

      // For events with a valid session, update the state
      if (session?.user) {
        const user = await fetchUserViaClient(session.user.id);
        if (!cancelled) {
          setState({
            session,
            user,
            loading: false,
            isAdmin: user?.role === 'admin' || false,
            isPartner: user?.role === 'partner' || false,
            isSubPartner: user?.role === 'sub_partner' || false,
          });
        }
      } else if (event !== 'INITIAL_SESSION') {
        // For non-INITIAL_SESSION events with no session, only clear if initAuth is done
        // This prevents race conditions during initialization
        if (initAuthDoneRef.current && !initAuthRestoredRef.current) {
          setState({
            session: null,
            user: null,
            loading: false,
            isAdmin: false,
            isPartner: false,
            isSubPartner: false,
          });
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUserViaClient]);

  const signIn = async (loginId: string, password: string) => {
    try {
      // Step 1: カスタムログインRPCでユーザーを検証
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

      // Step 2: Supabase Authでサインイン
      const email = loginResult.email || loginId + '@crafia.local';
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        return { error: 'ログインに失敗しました: ' + authError.message };
      }

      // Reset the restored flag since we have a fresh login
      initAuthRestoredRef.current = false;

      return { error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';
      return { error: 'ログインに失敗しました: ' + msg };
    }
  };

  const signOut = async () => {
    // Clear localStorage first to prevent stale session on next load
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
    // Reset the restored flag
    initAuthRestoredRef.current = false;
    await supabase.auth.signOut();
    setState({
      session: null,
      user: null,
      loading: false,
      isAdmin: false,
      isPartner: false,
      isSubPartner: false,
    });
  };

  const refreshUser = async () => {
    const userId = state.user?.id || state.session?.user?.id;
    if (userId) {
      const user = await fetchUserViaClient(userId);
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
