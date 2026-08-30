/**
 * What one session cost to run. BUILD-SPEC 12.1, as amended by migration 0043.
 *
 * 12.1 derives a session's cost from three effective-dated rate tables and
 * nothing else. Real nights depart from those rates in four ways the client
 * described — an assistant coach paid above the standard fee, more or fewer
 * packs of water than usual (sometimes none), snacks and shuttlecocks bought
 * on the night, and a session that ran late and was charged for the extra
 * court time. So each of the three rated costs carries a nullable override,
 * and anything without a rate to override is an extra line.
 *
 * `*DefaultFils` is what 12.1's arithmetic produced, `*OverrideFils` is what
 * the coach typed instead or `null`, and the unqualified field is the one that
 * counts. Keeping all three means the screen can show what a number *would*
 * have been, which is the difference between "23.750" and "23.750, and the
 * rate says 18.750".
 */
import type { Fils } from '@/lib/money';
import type { Database } from '@/types/database';

export type ExtraCostKind = Database['public']['Enums']['session_extra_cost_kind'];

/** The order the picker offers them in: three named, then the escape hatch. */
export const EXTRA_COST_KINDS: readonly ExtraCostKind[] = [
  'overtime',
  'snacks',
  'shuttlecocks',
  'other',
];

/** One line of a session's extra costs. */
export interface SessionExtraCost {
  id: string;
  kind: ExtraCostKind;
  /** The coach's own note — "2 tubes", "stayed 30 min". Optional. */
  label: string | null;
  amountFils: Fils;
  createdAt: Date;
}

/** One row of `v_session_costs`, with its extra lines attached. */
export interface SessionCosts {
  sessionId: string;
  courtCostDefaultFils: Fils;
  coachFeeDefaultFils: Fils;
  waterCostDefaultFils: Fils;
  /** Null when the rate table's figure stands. */
  courtCostOverrideFils: Fils | null;
  coachFeeOverrideFils: Fils | null;
  waterCostOverrideFils: Fils | null;
  /** Override where there is one, default where there is not. */
  courtCostFils: Fils;
  coachFeeFils: Fils;
  waterCostFils: Fils;
  extrasFils: Fils;
  /** The four above, summed. What 12.3's profit is measured against. */
  costFils: Fils;
  extras: SessionExtraCost[];
}

/**
 * 12.1's three rated costs, as the editor submits them. `null` means "no
 * override" — the rate table's divided share stands — which is how the coach
 * undoes a correction, and is why all three go in one call: "clear it" and
 * "leave it alone" cannot be the same value.
 */
export interface SetSessionCostsInput {
  sessionId: string;
  courtCostFils: Fils | null;
  coachFeeFils: Fils | null;
  waterCostFils: Fils | null;
}

export interface AddSessionExtraCostInput {
  sessionId: string;
  kind: ExtraCostKind;
  amountFils: Fils;
  label: string | null;
}

export interface DeleteSessionExtraCostInput {
  id: string;
  /** Only for cache invalidation; the RPC finds it from the row. */
  sessionId: string;
}
