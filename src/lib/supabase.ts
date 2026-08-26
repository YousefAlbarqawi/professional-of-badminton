/**
 * The Supabase client. One instance for the whole app.
 *
 * Screens never import this. Every read goes through a TanStack Query hook in
 * `features/*\/queries.ts` and every write through a mutation, per CLAUDE.md;
 * this module is what those files talk to.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { config } from './config';
import { secureTokenStore } from './secureStorage';
import type { Database } from '@/types/database';

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * The key Supabase derives from the project URL, mirrored here so sign out can
 * prove the store is empty afterwards rather than trusting that it is.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(
  config.supabaseUrl === '' ? 'http://localhost' : config.supabaseUrl,
).hostname.replace(/\./g, '-')}-auth-token`;

export const supabase: AppSupabaseClient = createClient<Database>(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      storage: secureTokenStore,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // There is no browser and no URL to read a session out of. D79.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

/**
 * Supabase refreshes tokens on a timer, and a timer in a backgrounded React
 * Native app is not reliable. Tying the timer to the foreground means a player
 * who returns after an hour has a valid token by the time he taps anything.
 */
function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
}

let subscription: { remove: () => void } | null = null;

/** Called once from the app root. Returns the teardown. */
export function startAuthAutoRefresh(): () => void {
  if (subscription === null) {
    subscription = AppState.addEventListener('change', handleAppStateChange);
    if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();
  }
  return () => {
    subscription?.remove();
    subscription = null;
    void supabase.auth.stopAutoRefresh();
  };
}
