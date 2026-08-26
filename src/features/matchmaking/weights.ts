/**
 * Every number the scoring function uses, in one place, so the coach's
 * complaints can be answered by tuning constants rather than by editing the
 * algorithm. BUILD-SPEC 13.5 requires exactly that separation.
 *
 * The score is a sum of penalties and lower is better, so a negative entry is
 * a reward.
 */
import { type LineupSessionType } from './types';

export const WEIGHTS = {
  /** Per tier point of spread within a rule 1 court. */
  RULE1_COURT_SPREAD: 10,
  /** Per tier point a rule 2 team falls short of RULE2_TARGET_GAP. */
  RULE2_TEAM_GAP_SHORTFALL: 8,
  /** Per tier point of difference between the two teams on a rule 2 court. */
  RULE2_TEAM_IMBALANCE: 6,
  /** Per repeated partnership within one session. Standard sessions. D64. */
  PARTNER_REPEAT: 25,
  /** Per repeated opposition within one session. */
  OPPONENT_REPEAT: 4,
  /** Per sit-out above the minimum for that player. */
  SITOUT_UNFAIRNESS: 15,
  /** Reward for a partnership not yet seen this session. */
  UNPLAYED_PAIR_BONUS: -2,
} as const;

export type Weights = typeof WEIGHTS;

/** Tier points between partners on a rule 2 team, e.g. A- with B-. 13.5. */
export const RULE2_TARGET_GAP = 3;

/**
 * 13.5 and D64. Over six rotations with twelve players, avoiding every repeat
 * is combinatorially impossible, and the coach said repeats are acceptable
 * there. So the same penalty is prohibitive on a standard session and merely
 * discouraging on an extended one.
 */
export const PARTNER_REPEAT_EXTENDED = 8;

export function partnerRepeatWeight(
  sessionType: LineupSessionType,
  weights: Weights = WEIGHTS,
): number {
  return sessionType === 'standard' ? weights.PARTNER_REPEAT : PARTNER_REPEAT_EXTENDED;
}

/**
 * 13.6's budget, whichever comes first. Twelve to twenty players converge
 * well inside both; the caps exist so a pathological input cannot freeze the
 * coach's phone mid-session.
 */
export const HILL_CLIMB_MAX_ITERATIONS = 400;
export const HILL_CLIMB_TIME_BUDGET_MS = 150;

/**
 * 13.6: "Every 50 iterations, accept a neutral swap to escape plateaus."
 * A swap that leaves the score unchanged still moves the arrangement, which
 * is what gets the search off a flat region.
 */
export const NEUTRAL_SWAP_INTERVAL = 50;

/**
 * How often the clock is consulted inside the hill climbing loop. Reading it
 * every iteration costs more than the iterations do.
 */
export const TIME_CHECK_INTERVAL = 16;
