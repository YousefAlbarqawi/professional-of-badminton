/**
 * Session cost reads and writes. Migration 0043.
 *
 * The read is a plain select from `v_session_costs`, which is
 * `security_invoker`, so RLS decides what comes back and staff-only is
 * enforced by 0012's policies rather than by anything here. The three writes
 * are RPCs, because `created_by` must be the caller and because the seven-day
 * lock (D39) is the server's to enforce.
 */
import { supabase } from '@/lib/supabase';
import type { Fils } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import type {
  AddSessionExtraCostInput,
  SessionCosts,
  SessionExtraCost,
  SetSessionCostsInput,
} from './costTypes';

// One literal each, not assembled from parts: the generated PostgREST types
// read the column list off the *string literal* to type the row, and anything
// it cannot read at compile time comes back as an error type instead.
const COST_COLUMNS =
  'session_id, court_cost_default_fils, coach_fee_default_fils, water_cost_default_fils, court_cost_override_fils, coach_fee_override_fils, water_cost_override_fils, court_cost_fils, coach_fee_fils, water_cost_fils, extras_fils, cost_fils';

const EXTRA_COLUMNS = 'id, kind, label, amount_fils, created_at';

/**
 * One session's costs, and every extra line on it.
 *
 * Two round trips in parallel rather than an embedded select: the view is not
 * a table, so PostgREST has no foreign key to resolve `session_extra_costs`
 * through, and the alternative is a third database object that exists only to
 * carry the join.
 */
export async function fetchSessionCosts(sessionId: string): Promise<SessionCosts> {
  const [costs, extras] = await Promise.all([
    supabase.from('v_session_costs').select(COST_COLUMNS).eq('session_id', sessionId).maybeSingle(),
    supabase
      .from('session_extra_costs')
      .select(EXTRA_COLUMNS)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ]);

  if (costs.error) throw costs.error;
  if (extras.error) throw extras.error;

  const row = costs.data;
  // A staff caller who can read the session always gets a row: the view is a
  // left join over `session_instances`. Nothing here means the session is gone.
  if (row === null) throw new Error('session_not_found');

  const lines: SessionExtraCost[] = (extras.data ?? []).map((extra) => ({
    id: extra.id,
    kind: extra.kind,
    label: extra.label,
    amountFils: extra.amount_fils as Fils,
    createdAt: parseInstant(extra.created_at),
  }));

  return {
    sessionId,
    courtCostDefaultFils: (row.court_cost_default_fils ?? 0) as Fils,
    coachFeeDefaultFils: (row.coach_fee_default_fils ?? 0) as Fils,
    waterCostDefaultFils: (row.water_cost_default_fils ?? 0) as Fils,
    courtCostOverrideFils: row.court_cost_override_fils as Fils | null,
    coachFeeOverrideFils: row.coach_fee_override_fils as Fils | null,
    waterCostOverrideFils: row.water_cost_override_fils as Fils | null,
    courtCostFils: (row.court_cost_fils ?? 0) as Fils,
    coachFeeFils: (row.coach_fee_fils ?? 0) as Fils,
    waterCostFils: (row.water_cost_fils ?? 0) as Fils,
    extrasFils: (row.extras_fils ?? 0) as Fils,
    costFils: (row.cost_fils ?? 0) as Fils,
    extras: lines,
  };
}

/**
 * All three overrides at once. A `null` clears one back to 12.1's rate.
 *
 * `set_session_costs` defaults every argument to NULL and writes all three
 * columns unconditionally, so omitting an argument and passing NULL are the
 * same call — which is why a cleared field can simply be left out. That
 * equivalence is the reason the RPC takes all three together: a setter that
 * could only be given one field would have no way to say "clear this one".
 *
 * The arguments are omitted rather than passed as `null` because the generated
 * types do not carry `| null` on a parameter with a default, and this codebase
 * does not silence that with a cast. Same as `search_players`' cursor.
 */
export async function setSessionCosts(input: SetSessionCostsInput): Promise<void> {
  const { error } = await supabase.rpc('set_session_costs', {
    p_session_id: input.sessionId,
    ...(input.courtCostFils === null ? {} : { p_court_cost_fils: input.courtCostFils }),
    ...(input.coachFeeFils === null ? {} : { p_coach_fee_fils: input.coachFeeFils }),
    ...(input.waterCostFils === null ? {} : { p_water_cost_fils: input.waterCostFils }),
  });

  if (error) throw error;
}

export async function addSessionExtraCost(input: AddSessionExtraCostInput): Promise<string> {
  const { data, error } = await supabase.rpc('add_session_extra_cost', {
    p_session_id: input.sessionId,
    p_kind: input.kind,
    p_amount_fils: input.amountFils,
    ...(input.label === null ? {} : { p_label: input.label }),
  });

  if (error) throw error;
  return data;
}

export async function deleteSessionExtraCost(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_session_extra_cost', { p_id: id });
  if (error) throw error;
}
