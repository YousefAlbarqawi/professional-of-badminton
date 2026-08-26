/**
 * The Supabase client, stubbed.
 *
 * The real module builds a client at import time and, with `autoRefreshToken`
 * on, that client starts a repeating timer in its constructor — which keeps the
 * Jest process alive long after the last test. Unit tests reach the server
 * through a feature's `api.ts` and mock that instead; nothing in a unit test
 * should ever hold a socket.
 *
 * Enable with `jest.mock('@/lib/supabase')` at the top of a test file.
 */
export const AUTH_STORAGE_KEY = 'sb-test-auth-token';

export const supabase = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    signOut: jest.fn(async () => ({ error: null })),
    startAutoRefresh: jest.fn(async () => undefined),
    stopAutoRefresh: jest.fn(async () => undefined),
  },
  from: jest.fn(),
  functions: { invoke: jest.fn(async () => ({ data: null, error: null })) },
};

export const startAuthAutoRefresh = jest.fn(() => () => undefined);
