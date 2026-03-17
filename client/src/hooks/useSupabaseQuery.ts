import { useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Supabaseクエリのエラーをチェックし、セッション切れの場合はログアウトを促す
 */
export function useSupabaseErrorHandler() {
  const { signOut } = useAuth();
  const hasShownSessionError = useRef(false);

  const handleError = useCallback((error: unknown, context?: string) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const prefix = context ? `[${context}] ` : '';

    // Check for auth/session-related errors
    if (
      errorMessage.includes('JWT expired') ||
      errorMessage.includes('Invalid Refresh Token') ||
      errorMessage.includes('refresh_token_not_found') ||
      errorMessage.includes('invalid claim: missing sub claim') ||
      errorMessage.includes('PGRST301') // PostgREST auth error
    ) {
      if (!hasShownSessionError.current) {
        hasShownSessionError.current = true;
        toast.error('セッションの有効期限が切れました', {
          description: '再度ログインしてください',
          duration: 5000,
        });
        // Auto sign out after a brief delay
        setTimeout(() => {
          signOut();
          hasShownSessionError.current = false;
        }, 1500);
      }
      return true; // Indicates session error
    }

    console.error(`${prefix}Supabase error:`, errorMessage);
    return false; // Not a session error
  }, [signOut]);

  return { handleError };
}

/**
 * Wraps a Supabase query function with error handling and session expiry detection.
 * Returns a wrapped version of the fetch function.
 */
export function useWrappedFetch() {
  const { handleError } = useSupabaseErrorHandler();

  const wrappedFetch = useCallback(async <T>(
    fetchFn: () => Promise<T>,
    context?: string
  ): Promise<T | null> => {
    try {
      return await fetchFn();
    } catch (error) {
      handleError(error, context);
      return null;
    }
  }, [handleError]);

  return { wrappedFetch };
}
