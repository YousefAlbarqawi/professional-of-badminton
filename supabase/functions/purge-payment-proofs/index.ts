/**
 * purge-payment-proofs
 *
 * BUILD-SPEC 8.6's daily 04:00 job, implementing assumption A13: a CliQ
 * screenshot is deleted 365 days after it was uploaded. Long enough for any
 * dispute, short enough to limit what a breach would expose.
 *
 * ── Why this is an edge function and not a cron job ───────
 * 8.6 puts the purge in pg_cron. Storage will not allow it: any DELETE against
 * `storage.objects` that does not come through the Storage API is refused by
 * `storage.protect_delete`, whatever role issues it. So Postgres does the part
 * it can — `purge_payment_proofs()` retires the rows and returns the paths —
 * and this removes the bytes. Exactly the split `delete-account` already uses
 * for the same reason (8.7, A1).
 *
 * ── Who may call it ───────────────────────────────────────
 * The service role and nobody else. There is no user in this story: it is a
 * scheduled sweep, not an action anybody takes. The RPC underneath is revoked
 * from `anon` and `authenticated`, so a stolen anon key gets nothing even if
 * this endpoint is reached.
 *
 * ── What it returns ───────────────────────────────────────
 * Counts, so that whatever invokes it on a schedule has something to log and
 * something to alert on. A purge that silently stops running is the failure
 * mode worth catching.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROOF_BUCKET = 'payment-proofs';

/** Storage removes in batches; a year of CliQ proofs is a few thousand files. */
const BATCH = 100;

function json(body: Record<string, unknown>, status: number): Response {
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
  if (!url || !serviceRoleKey) {
    return json({ error: 'not_configured' }, 500);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (authorization !== `Bearer ${serviceRoleKey}`) {
    return json({ error: 'not_authorized' }, 401);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Retires every proof row past its purge_after date and returns their paths,
  // plus any object left unclaimed for more than a day by a CliQ booking that
  // failed after its upload (10.1, migration 0025).
  const { data, error } = await admin.rpc('purge_payment_proofs');
  if (error) {
    console.error('purge_payment_proofs failed', error);
    return json({ error: 'purge_failed' }, 500);
  }

  const paths = (data ?? []).map((row: { storage_path: string }) => row.storage_path);
  let removed = 0;
  const failures: string[] = [];

  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const { error: removeError } = await admin.storage.from(PROOF_BUCKET).remove(batch);

    if (removeError) {
      // The rows are already gone, so nothing in the app can name these files.
      // They are logged and left for the next run, which finds them again as
      // unclaimed objects rather than as expired proofs.
      console.error('payment proof removal failed', removeError);
      failures.push(...batch);
    } else {
      removed += batch.length;
    }
  }

  return json({ ok: true, retired: paths.length, removed, failed: failures.length }, 200);
});
