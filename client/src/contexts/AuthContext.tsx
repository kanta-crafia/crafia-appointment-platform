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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    isAdmin: false,
    isPartner: false,
    isSubPartner: false,
  });

  const initialized = useRef(false);

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
    if (initialized.current) return;
    initialized.current = true;

    // Timeout to prevent infinite loading if getSession hangs
    const timeout = setTimeout(() => {
      setState(prev => {
        if (prev.loading) {
          return { ...prev, loading: false };
        }
        return prev;
      });
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      if (session?.user) {
        const user = await fetchUser(session.user.id);
        updateState(session, user);
      } else {
        updateState(null, null);
      }
    }).catch(() => {
      clearTimeout(timeout);
      updateState(null, null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout);
      if (session?.user) {
        const user = await fetchUser(session.user.id);
        updateState(session, user);
      } else {
        updateState(null, null);
      }
    });

    return () => {
      clearTimeout(timeout);
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
