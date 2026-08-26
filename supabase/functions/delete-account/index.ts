/**
 * delete-account
 *
 * BUILD-SPEC 8.7 and 14.14, implementing assumption A1.
 *
 * The player calls this with his own access token and nothing else. There is no
 * id in the request body on purpose: the only account this function can ever
 * delete is the one the presented token belongs to.
 *
 * Order matters. The database work runs first and is one transaction, so a
 * failure leaves the account untouched rather than half deleted. Storage
 * objects go next, because their rows are already gone and nothing else will
 * ever name them. The auth user goes last, because it is the step that cannot
 * be undone and the step that makes signing in impossible.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROOF_BUCKET = 'payment-proofs';

interface Failure {
  error: string;
}

function json(body: Failure | { ok: true }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceRoleKey || !anonKey) {
    return json({ error: 'not_configured' }, 500);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'not_authenticated' }, 401);
  }

  // Who is asking. The token is verified by Auth, not parsed here.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json({ error: 'not_authenticated' }, 401);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1 to 3: future bookings cancelled with credits returned, profile
  // anonymised, device tokens and proof rows gone. Returns the storage paths
  // the rows were pointing at.
  const { data: proofPaths, error: rpcError } = await admin.rpc('anonymise_player_account', {
    p_player_id: userId,
  });

  if (rpcError) {
    console.error('anonymise_player_account failed', rpcError);
    return json({ error: 'deletion_failed' }, 500);
  }

  const paths: string[] = Array.isArray(proofPaths) ? proofPaths : [];
  if (paths.length > 0) {
    const { error: storageError } = await admin.storage.from(PROOF_BUCKET).remove(paths);
    if (storageError) {
      // The rows are already gone, so nothing in the app can reach these
      // objects any more, and the daily purge job sweeps the bucket. Losing the
      // account over an orphaned image would be the worse outcome.
      console.error('payment proof removal failed', storageError);
    }
  }

  // 4. The auth user. After this the account cannot sign in.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('auth user deletion failed', deleteError);
    return json({ error: 'deletion_failed' }, 500);
  }

  return json({ ok: true }, 200);
});
