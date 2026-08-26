/**
 * The TanStack Query client. BUILD-SPEC 2.1: all Supabase reads and writes go
 * through it.
 *
 * Defaults are set for a small, online-only app on a phone. D78: there is no
 * offline mode, so nothing here tries to be a cache of record.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

/** Codes the server raises for a caller who simply is not allowed. */
const UNRECOVERABLE = new Set([
  'not_authenticated',
  'not_your_booking',
  'not_authorized_to_change_privileged_fields',
  'only_coach_can_create_coach',
]);

function isUnrecoverable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && UNRECOVERABLE.has(code);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that moving between tabs does not refetch, short enough
        // that occupancy and credits are never stale on screen.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => !isUnrecoverable(error) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // A mutation that failed is the player's to retry, deliberately, with
        // the button he already has. Retrying behind his back can double-book.
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();

/**
 * React Query decides whether to keep polling from the focus manager, which on
 * the web reads window focus. React Native has no window, so it is wired to
 * AppState here. Without this, `refetchInterval` would keep firing in a
 * backgrounded app — and 14.3 asks the verify screen to poll only "while
 * foregrounded".
 */
export function startFocusTracking(): () => void {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    focusManager.setFocused(state === 'active');
  });
  focusManager.setFocused(AppState.currentState === 'active');
  return () => subscription.remove();
}
