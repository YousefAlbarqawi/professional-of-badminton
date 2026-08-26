import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../src/types/database';
import { PASSWORD } from './fixtures';

export type Client = SupabaseClient<Database>;

function baseClient(key: string): Client {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not set. globalSetup should have set it.');

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The anonymous role: a client with the anon key and no session at all. */
export function anonClient(): Client {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error('SUPABASE_ANON_KEY is not set.');
  return baseClient(key);
}

/**
 * The service role, used only to arrange fixtures and to read back what a
 * restricted client could not. It bypasses RLS entirely, so nothing is ever
 * asserted through it.
 */
export function serviceClient(): Client {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return baseClient(key);
}

/** A client holding a real signed-in session for one of the seeded accounts. */
export async function signIn(email: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}
