import { describe, it, expect } from 'vitest';

/**
 * AuthContext & Supabase session management tests
 * These tests verify the timeout and error handling logic
 * without requiring a real Supabase connection.
 */

describe('withTimeout utility', () => {
  // Replicate the withTimeout function from AuthContext
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  }

  it('should return result when promise resolves before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('success'),
      1000
    );
    expect(result).toBe('success');
  });

  it('should return null when promise times out', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });
    const result = await withTimeout(slowPromise, 100);
    expect(result).toBeNull();
  });

  it('should return null when promise hangs indefinitely', async () => {
    const hangingPromise = new Promise<string>(() => {
      // Never resolves
    });
    const result = await withTimeout(hangingPromise, 100);
    expect(result).toBeNull();
  });
});

describe('Session error detection', () => {
  const sessionErrorMessages = [
    'JWT expired',
    'Invalid Refresh Token: Refresh Token Not Found',
    'refresh_token_not_found',
    'invalid claim: missing sub claim',
    'PGRST301',
  ];

  const nonSessionErrors = [
    'Network error',
    'PGRST116',
    'relation "users" does not exist',
    'timeout',
  ];

  function isSessionError(message: string): boolean {
    return (
      message.includes('JWT expired') ||
      message.includes('Invalid Refresh Token') ||
      message.includes('refresh_token_not_found') ||
      message.includes('invalid claim: missing sub claim') ||
      message.includes('PGRST301')
    );
  }

  it('should detect session-related errors', () => {
    for (const msg of sessionErrorMessages) {
      expect(isSessionError(msg)).toBe(true);
    }
  });

  it('should not flag non-session errors', () => {
    for (const msg of nonSessionErrors) {
      expect(isSessionError(msg)).toBe(false);
    }
  });
});

describe('Auth state transitions', () => {
  interface AuthState {
    session: unknown;
    user: unknown;
    loading: boolean;
    isAdmin: boolean;
    isPartner: boolean;
    isSubPartner: boolean;
  }

  const PARTNER_ROLES = ['partner', 'sub_partner', 'tier3_partner', 'tier4_partner'];
  function isPartnerRole(role?: string): boolean {
    return PARTNER_ROLES.includes(role as string);
  }

  function computeState(session: unknown, user: { role?: string } | null): AuthState {
    return {
      session,
      user,
      loading: false,
      isAdmin: user?.role === 'admin' || false,
      isPartner: isPartnerRole(user?.role) || false,
      isSubPartner: user?.role === 'sub_partner' || user?.role === 'tier3_partner' || user?.role === 'tier4_partner' || false,
    };
  }

  it('should set loading to false after state update', () => {
    const state = computeState(null, null);
    expect(state.loading).toBe(false);
  });

  it('should detect admin role', () => {
    const state = computeState({ user: { id: '1' } }, { role: 'admin' });
    expect(state.isAdmin).toBe(true);
    expect(state.isPartner).toBe(false);
    expect(state.isSubPartner).toBe(false);
  });

  it('should detect partner role', () => {
    const state = computeState({ user: { id: '2' } }, { role: 'partner' });
    expect(state.isAdmin).toBe(false);
    expect(state.isPartner).toBe(true);
    expect(state.isSubPartner).toBe(false);
  });

  it('should detect sub_partner role', () => {
    const state = computeState({ user: { id: '3' } }, { role: 'sub_partner' });
    expect(state.isAdmin).toBe(false);
    expect(state.isPartner).toBe(true);
    expect(state.isSubPartner).toBe(true);
  });

  it('should detect tier3_partner role', () => {
    const state = computeState({ user: { id: '4' } }, { role: 'tier3_partner' });
    expect(state.isAdmin).toBe(false);
    expect(state.isPartner).toBe(true);
    expect(state.isSubPartner).toBe(true);
  });

  it('should detect tier4_partner role', () => {
    const state = computeState({ user: { id: '5' } }, { role: 'tier4_partner' });
    expect(state.isAdmin).toBe(false);
    expect(state.isPartner).toBe(true);
    expect(state.isSubPartner).toBe(true);
  });

  it('should handle null user gracefully', () => {
    const state = computeState(null, null);
    expect(state.isAdmin).toBe(false);
    expect(state.isPartner).toBe(false);
    expect(state.isSubPartner).toBe(false);
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
  });
});

describe('Cached user fallback on fetchUser failure', () => {
  /**
   * Simulates the updateStateWithUser logic from AuthContext.
   * When session exists but fetchUser returns null, the cached user should be used
   * to prevent role flip (admin -> partner).
   */
  interface User {
    id: string;
    role: string;
  }

  interface Session {
    user: { id: string };
  }

  const PARTNER_ROLES_2 = ['partner', 'sub_partner', 'tier3_partner', 'tier4_partner'];
  function isPartnerRole2(role?: string): boolean {
    return PARTNER_ROLES_2.includes(role as string);
  }

  function updateStateWithUser(
    session: Session | null,
    user: User | null,
    cachedUser: User | null
  ): { user: User | null; isAdmin: boolean; isPartner: boolean; isSubPartner: boolean } {
    // If session exists but user fetch failed, keep the cached user
    if (session && !user && cachedUser && cachedUser.id === session.user?.id) {
      user = cachedUser;
    }

    return {
      user,
      isAdmin: user?.role === 'admin' || false,
      isPartner: isPartnerRole2(user?.role) || false,
      isSubPartner: user?.role === 'sub_partner' || user?.role === 'tier3_partner' || user?.role === 'tier4_partner' || false,
    };
  }

  it('should use cached admin user when fetchUser fails', () => {
    const session: Session = { user: { id: 'admin-1' } };
    const cachedUser: User = { id: 'admin-1', role: 'admin' };
    const result = updateStateWithUser(session, null, cachedUser);
    expect(result.user).toEqual(cachedUser);
    expect(result.isAdmin).toBe(true);
    expect(result.isPartner).toBe(false);
  });

  it('should use cached partner user when fetchUser fails', () => {
    const session: Session = { user: { id: 'partner-1' } };
    const cachedUser: User = { id: 'partner-1', role: 'partner' };
    const result = updateStateWithUser(session, null, cachedUser);
    expect(result.user).toEqual(cachedUser);
    expect(result.isPartner).toBe(true);
    expect(result.isAdmin).toBe(false);
  });

  it('should use cached sub_partner user when fetchUser fails', () => {
    const session: Session = { user: { id: 'sub-1' } };
    const cachedUser: User = { id: 'sub-1', role: 'sub_partner' };
    const result = updateStateWithUser(session, null, cachedUser);
    expect(result.user).toEqual(cachedUser);
    expect(result.isSubPartner).toBe(true);
    expect(result.isAdmin).toBe(false);
  });

  it('should NOT use cached user when session user ID differs', () => {
    const session: Session = { user: { id: 'new-user' } };
    const cachedUser: User = { id: 'old-user', role: 'admin' };
    const result = updateStateWithUser(session, null, cachedUser);
    expect(result.user).toBeNull();
    expect(result.isAdmin).toBe(false);
  });

  it('should NOT use cached user when no session', () => {
    const cachedUser: User = { id: 'admin-1', role: 'admin' };
    const result = updateStateWithUser(null, null, cachedUser);
    expect(result.user).toBeNull();
    expect(result.isAdmin).toBe(false);
  });

  it('should use fresh user when fetchUser succeeds', () => {
    const session: Session = { user: { id: 'admin-1' } };
    const freshUser: User = { id: 'admin-1', role: 'admin' };
    const cachedUser: User = { id: 'admin-1', role: 'admin' };
    const result = updateStateWithUser(session, freshUser, cachedUser);
    expect(result.user).toEqual(freshUser);
    expect(result.isAdmin).toBe(true);
  });

  it('should handle no cached user on first load', () => {
    const session: Session = { user: { id: 'admin-1' } };
    const result = updateStateWithUser(session, null, null);
    expect(result.user).toBeNull();
    expect(result.isAdmin).toBe(false);
  });
});
