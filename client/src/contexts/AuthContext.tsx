import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    isAdmin: false,
    isPartner: false,
    isSubPartner: false,
  });

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
    let cancelled = false;

    // Initialize auth state
    const initAuth = async () => {
      try {
        // With Web Locks disabled (noOpLock), getSession() should not deadlock
        const { data: { session } } = await supabase.auth.getSession();

        if (cancelled) return;

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
        console.error('initAuth error:', err);
        if (!cancelled) {
          updateStateWithUser(null, null);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === 'SIGNED_OUT') {
        updateStateWithUser(null, null);
        return;
      }

      if (session?.user) {
        const user = await fetchUser(session.user.id);
        if (!cancelled) {
          updateStateWithUser(session, user);
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUser, updateStateWithUser]);

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
