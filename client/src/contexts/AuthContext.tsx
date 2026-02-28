import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, getSessionFromStorage, type User } from '@/lib/supabase';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    isAdmin: false,
    isPartner: false,
    isSubPartner: false,
  });

  const fetchUser = useCallback(async (userId: string) => {
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

  const updateState = useCallback((session: Session | null, user: User | null) => {
    setState({
      session,
      user,
      loading: false,
      isAdmin: user?.role === 'admin',
      isPartner: user?.role === 'partner',
      isSubPartner: user?.role === 'sub_partner',
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      // Strategy: Use a race between getSession() and a fast localStorage fallback.
      // supabase-js v2 uses Web Locks API (navigator.locks) which can deadlock
      // on page reload due to orphaned locks. getSession() may hang for 5-10+ seconds.
      // We use localStorage as an immediate fallback to show the UI quickly,
      // then let getSession() update the state when it eventually resolves.

      const storedSession = getSessionFromStorage();

      // If we have a stored session, immediately fetch user data and show UI
      // This avoids waiting for getSession() which may be blocked by Web Locks
      if (storedSession) {
        const user = await fetchUser(storedSession.userId);
        if (!cancelled && user) {
          // Show the UI immediately with the stored session info
          // We pass null for session since we don't have the full Session object,
          // but the user data is enough to render the dashboard
          setState({
            session: null, // Will be updated when getSession() resolves
            user,
            loading: false,
            isAdmin: user.role === 'admin',
            isPartner: user.role === 'partner',
            isSubPartner: user.role === 'sub_partner',
          });
        }
      }

      // Also start getSession() in the background - it will update with the real session
      // when the Web Lock is eventually acquired (or times out and force-acquires)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.user) {
          const user = await fetchUser(session.user.id);
          if (!cancelled) {
            updateState(session, user);
          }
        } else if (!storedSession) {
          // Only set to logged-out if we didn't have a stored session either
          if (!cancelled) {
            updateState(null, null);
          }
        }
      } catch {
        // getSession() failed - if we already showed UI from localStorage, keep it
        if (!cancelled && !storedSession) {
          updateState(null, null);
        }
      }
    };

    // Safety timeout: if everything hangs for 15 seconds, force loading to false
    const safetyTimeout = setTimeout(() => {
      setState(prev => {
        if (prev.loading) {
          return { ...prev, loading: false };
        }
        return prev;
      });
    }, 15000);

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      clearTimeout(safetyTimeout);

      if (session?.user) {
        const user = await fetchUser(session.user.id);
        if (!cancelled) {
          updateState(session, user);
        }
      } else {
        if (!cancelled) {
          updateState(null, null);
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [fetchUser, updateState]);

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

      // Step 2: Supabase Authでサインイン（emailベースで内部的に認証）
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
    // Clear localStorage first to prevent stale session on next load
    try {
      localStorage.removeItem('crafia-auth');
    } catch {
      // Ignore localStorage errors
    }
    await supabase.auth.signOut();
    updateState(null, null);
  };

  const refreshUser = async () => {
    if (state.session?.user) {
      const user = await fetchUser(state.session.user.id);
      updateState(state.session, user);
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
