/**
 * Who is signed in, for the whole tree.
 *
 * The session itself lives in expo-secure-store and is restored by the
 * Supabase client on start; this is the React-shaped view of it. It holds no
 * copy of anything — every value here is derived from the one auth state
 * Supabase reports — so there is no second source of truth to drift.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { startAuthAutoRefresh, supabase } from '@/lib/supabase';

import { getSession, signOut as signOutRequest, toAuthUser } from './api';
import type { AuthStatus, AuthUser } from './types';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  session: Session | null;
  /** Ends the session on this device and empties the cache behind it. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    // The restore and the subscription both run. The subscription catches
    // every later change — a refresh, a revocation, a sign out on this device;
    // the restore is what decides the very first screen.
    void getSession()
      .then((restored) => {
        if (!isMounted) return;
        setSession(restored);
        setStatus(restored === null ? 'signed_out' : 'signed_in');
      })
      .catch(() => {
        // A store that cannot be read is a player who has to sign in again.
        // It is not a reason to hold the app on a splash screen.
        if (!isMounted) return;
        setSession(null);
        setStatus('signed_out');
      });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setStatus(nextSession === null ? 'signed_out' : 'signed_in');

      if (event === 'SIGNED_OUT') {
        // Nothing cached was read with the anonymous key. Leaving a profile or
        // a booking list behind would show it to whoever signs in next.
        queryClient.clear();
      }
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, [queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    await signOutRequest();
    // onAuthStateChange clears the cache, but only if the listener is still
    // attached. Doing it here too makes sign out unconditional.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, user: toAuthUser(session), signOut }),
    [session, signOut, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth() must be called inside an AuthProvider');
  return value;
}

export default AuthProvider;
