/**
 * The two server calls this feature makes.
 * BUILD-SPEC section 18, 8.7.
 */
import { supabase } from '@/lib/supabase';

import type { DeviceTokenRegistration } from './types';

/**
 * Stores this phone against the signed-in account.
 *
 * An RPC rather than an upsert, for the reason migration 0034 gives: the token
 * is unique across the whole table, so the row a sign-in collides with may
 * belong to somebody else — a shared phone, or a reinstall the OS handed the
 * same token back to. The `player_id = auth.uid()` update policy refuses
 * exactly that row, and leaving it would send this player's notifications to
 * the last person who used the phone. The function reassigns it, and the only
 * account it can ever register a token against is the caller's own.
 */
export async function registerDeviceToken(registration: DeviceTokenRegistration): Promise<void> {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: registration.token,
    p_platform: registration.platform,
    p_locale: registration.locale,
  });

  if (error) throw error;
}

/**
 * Asks the `send-push` edge function to drain the outbox.
 *
 * It carries no audience and no message, deliberately: the function reads what
 * the database enqueued and nothing a phone tells it (8.4, and the header of
 * `supabase/functions/send-push/index.ts`). All this is is a nudge, so that a
 * push goes out in the seconds after the event rather than on the next
 * scheduled drain.
 *
 * Never throws. The announcement is already published and the booking is
 * already cancelled by the time this runs; a failed nudge delays a
 * notification, and turning that into a visible failure would suggest the
 * thing the coach just did had not happened.
 */
export async function drainPushQueue(): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: {} });
  } catch {
    // Left for the next drain.
  }
}
