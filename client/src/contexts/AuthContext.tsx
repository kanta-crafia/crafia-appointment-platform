import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, type User, type UserRole } from '@/lib/supabase';
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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
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
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as User;
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const user = await fetchUser(session.user.id);
        updateState(session, user);
      } else {
        updateState(null, null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const user = await fetchUser(session.user.id);
        updateState(session, user);
      } else {
        updateState(null, null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUser, updateState]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
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
