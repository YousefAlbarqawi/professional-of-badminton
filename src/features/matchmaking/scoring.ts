/**
 * The score a lineup is judged by, and the hard constraints it may never
 * break. BUILD-SPEC 13.4 and 13.5.
 *
 * Everything here is pure and stateless except `PairHistory`, which is the
 * running record of who has already partnered or opposed whom this session.
 * Lower scores are better; the whole score is a sum of penalties, with one
 * reward for a partnership nobody has played yet.
 */
import { partnerRepeatWeight, RULE2_TARGET_GAP, WEIGHTS, type Weights } from './weights';
import {
  type Court,
  type LineupSessionType,
  type LockedCourt,
  type PairingRule,
  type RotationRule,
} from './types';

/** Order-independent key for a pair of booking ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Who has partnered whom, and who has opposed whom, so far in this session.
 * D64 is about partnerships specifically; oppositions are the much weaker
 * secondary signal that stops the same four people meeting every rotation.
 */
export class PairHistory {
  private readonly partners = new Map<string, number>();
  private readonly opponents = new Map<string, number>();

  partnerCount(a: string, b: string): number {
    return this.partners.get(pairKey(a, b)) ?? 0;
  }

  opponentCount(a: string, b: string): number {
    return this.opponents.get(pairKey(a, b)) ?? 0;
  }

  record(courts: readonly Court[]): void {
    for (const court of courts) {
      for (const team of [court.team1, court.team2]) {
        for (let i = 0; i < team.length; i += 1) {
          for (let j = i + 1; j < team.length; j += 1) {
            const a = team[i];
            const b = team[j];
            if (a === undefined || b === undefined) continue;
            const key = pairKey(a, b);
            this.partners.set(key, (this.partners.get(key) ?? 0) + 1);
          }
        }
      }
      for (const a of court.team1) {
        for (const b of court.team2) {
          const key = pairKey(a, b);
          this.opponents.set(key, (this.opponents.get(key) ?? 0) + 1);
        }
      }
    }
  }
}

/**
 * The hard constraints of 13.4, precomputed into shapes a hot loop can ask
 * cheap questions of.
 */
export interface Constraints {
  /** Pair keys that must never be teammates. 13.4 rule 5. */
  neverPairs: ReadonlySet<string>;
  /** Booking id to the partner it must play with. 13.4 rule 4, both ways. */
  alwaysPartner: ReadonlyMap<string, string>;
  /** Court numbers the coach has locked. 13.4 rule 3. */
  lockedCourtNumbers: ReadonlySet<number>;
  /** Every booking id sitting on a locked court. */
  lockedPlayers: ReadonlySet<string>;
}

export function buildConstraints(
  lockedCourts: readonly LockedCourt[],
  pairingRules: readonly PairingRule[],
): Constraints {
  const neverPairs = new Set<string>();
  const alwaysPartner = new Map<string, string>();
  for (const rule of pairingRules) {
    if (rule.bookingIdA === rule.bookingIdB) continue;
    if (rule.kind === 'never_pair') {
      neverPairs.add(pairKey(rule.bookingIdA, rule.bookingIdB));
    } else {
      // A chain of always_pair rules cannot be honoured by a team of two, so
      // the first rule naming a player wins and later ones are ignored. The
      // admin UI is what stops the coach creating one.
      if (!alwaysPartner.has(rule.bookingIdA) && !alwaysPartner.has(rule.bookingIdB)) {
        alwaysPartner.set(rule.bookingIdA, rule.bookingIdB);
        alwaysPartner.set(rule.bookingIdB, rule.bookingIdA);
      }
    }
  }

  const lockedCourtNumbers = new Set<number>();
  const lockedPlayers = new Set<string>();
  for (const court of lockedCourts) {
    lockedCourtNumbers.add(court.courtNumber);
    for (const id of court.bookingIds) lockedPlayers.add(id);
  }

  return { neverPairs, alwaysPartner, lockedCourtNumbers, lockedPlayers };
}

/**
 * How many hard constraints this arrangement breaks.
 *
 * 13.4 says a violating candidate is discarded rather than penalised, and
 * that is what the hill climber does: it refuses any swap that raises this
 * count. Counting rather than returning a boolean is what lets it also climb
 * *out* of a seed that was unsatisfiable to begin with — a locked court whose
 * four players include one half of a never_pair, for instance, which no
 * arrangement can fix and which must not stop the rest of the board from
 * being improved.
 */
export function countViolations(
  courts: readonly Court[],
  constraints: Constraints,
  playing: ReadonlySet<string>,
): number {
  let violations = 0;
  const teamOf = new Map<string, string>();

  for (const court of courts) {
    const teams: readonly (readonly string[])[] = [court.team1, court.team2];
    for (let t = 0; t < teams.length; t += 1) {
      const team = teams[t];
      if (team === undefined) continue;
      for (const id of team) teamOf.set(id, `${court.courtNumber}:${t}`);
      for (let i = 0; i < team.length; i += 1) {
        for (let j = i + 1; j < team.length; j += 1) {
          const a = team[i];
          const b = team[j];
          if (a === undefined || b === undefined) continue;
          if (constraints.neverPairs.has(pairKey(a, b))) violations += 1;
        }
      }
    }
  }

  // Rule 4 binds only when both are on court. One of the two resting is not a
  // violation, it is just a rotation they do not share.
  for (const [a, b] of constraints.alwaysPartner) {
    if (a > b) continue;
    if (!playing.has(a) || !playing.has(b)) continue;
    if (teamOf.get(a) !== teamOf.get(b)) violations += 1;
  }

  return violations;
}

export interface ScoringContext {
  tierOf: (bookingId: string) => number;
  history: PairHistory;
  sessionType: LineupSessionType;
  weights: Weights;
}

function tiersOf(ctx: ScoringContext, ids: readonly string[]): number[] {
  return ids.map((id) => ctx.tierOf(id));
}

/**
 * 13.5. Rule 1 is judged on how tight the court is; rule 2 on whether each
 * team pairs a stronger with a weaker player and the two teams still meet as
 * equals. Repeat penalties apply under both rules, because D64 is about the
 * session, not about one rule.
 */
export function scoreCourt(court: Court, rule: RotationRule, ctx: ScoringContext): number {
  const { weights } = ctx;
  const team1 = tiersOf(ctx, court.team1);
  const team2 = tiersOf(ctx, court.team2);
  const all = [...team1, ...team2];
  if (all.length === 0) return 0;

  let penalty = 0;

  if (rule === 'rule_1_similar') {
    const spread = Math.max(...all) - Math.min(...all);
    penalty += spread * weights.RULE1_COURT_SPREAD;
  } else {
    for (const team of [team1, team2]) {
      // A singles side has no intra-team gap to measure.
      const a = team[0];
      const b = team[1];
      if (a === undefined || b === undefined) continue;
      const gap = Math.abs(a - b);
      const shortfall = Math.max(0, RULE2_TARGET_GAP - gap);
      penalty += shortfall * weights.RULE2_TEAM_GAP_SHORTFALL;
    }
    const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);
    const imbalance = Math.abs(sum(team1) - sum(team2));
    penalty += imbalance * weights.RULE2_TEAM_IMBALANCE;
  }

  const repeatWeight = partnerRepeatWeight(ctx.sessionType, weights);
  for (const team of [court.team1, court.team2]) {
    const a = team[0];
    const b = team[1];
    if (a === undefined || b === undefined) continue;
    const seen = ctx.history.partnerCount(a, b);
    if (seen > 0) penalty += seen * repeatWeight;
    else penalty += weights.UNPLAYED_PAIR_BONUS;
  }

  for (const a of court.team1) {
    for (const b of court.team2) {
      penalty += ctx.history.opponentCount(a, b) * weights.OPPONENT_REPEAT;
    }
  }

  return penalty;
}

export function scoreCourts(
  courts: readonly Court[],
  rule: RotationRule,
  ctx: ScoringContext,
): number {
  return courts.reduce((total, court) => total + scoreCourt(court, rule, ctx), 0);
}

/**
 * 13.5's SITOUT_UNFAIRNESS, "per sit-out above the minimum for that player".
 *
 * Measured on the counts this rotation would leave behind, against the
 * luckiest player in the session, so the penalty is zero exactly when
 * everybody has rested the same number of times.
 */
export function sitOutPenalty(
  sitOuts: readonly string[],
  sitOutCounts: ReadonlyMap<string, number>,
  attendeeIds: readonly string[],
  weights: Weights = WEIGHTS,
): number {
  if (attendeeIds.length === 0) return 0;
  const resting = new Set(sitOuts);
  const projected = attendeeIds.map(
    (id) => (sitOutCounts.get(id) ?? 0) + (resting.has(id) ? 1 : 0),
  );
  const minimum = Math.min(...projected);
  const excess = projected.reduce((total, count) => total + (count - minimum), 0);
  return excess * weights.SITOUT_UNFAIRNESS;
}
