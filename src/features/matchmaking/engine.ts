/**
 * The matchmaking engine. BUILD-SPEC 13.
 *
 * Pure TypeScript: no React, no Supabase, no clock beyond a time budget it is
 * allowed to inject. Give it the same input and the same seed and it gives
 * back the same board, which is what makes 19.2 testable and what lets the
 * coach see a stable lineup between two visits to the screen.
 *
 * The shape of a run, from 13.6: for each rotation pick who plays, deal them
 * onto courts by the rotation's rule, then hill climb the deal against the
 * score in `scoring.ts` until it stops improving or the budget runs out.
 */
import {
  HILL_CLIMB_MAX_ITERATIONS,
  HILL_CLIMB_TIME_BUDGET_MS,
  NEUTRAL_SWAP_INTERVAL,
  TIME_CHECK_INTERVAL,
  WEIGHTS,
  type Weights,
} from './weights';
import { seededRandom, sortByTierDescending, type Rng } from './rng';
import {
  buildConstraints,
  countViolations,
  PairHistory,
  scoreCourts,
  type Constraints,
  type ScoringContext,
} from './scoring';
import {
  type Attendee,
  type CapacityPlan,
  type Court,
  type CourtPlan,
  type Lineup,
  type LineupInput,
  type LineupWarningCode,
  type LockedCourt,
  type PairingRule,
  type Rotation,
  type RotationRule,
} from './types';

/** 13.3. `rule(index) = index % 2 === 1 ? RULE_1_SIMILAR : RULE_2_MIXED`. */
export function ruleForRotation(index: number): RotationRule {
  return index % 2 === 1 ? 'rule_1_similar' : 'rule_2_mixed';
}

/**
 * 13.7's table, as arithmetic.
 *
 * Courts fill from number 1 upward and any partial court is the last one, so
 * court 1 is always full. A remainder of two players becomes a singles court,
 * which the board draws as two tiles rather than four. A remainder of one or
 * three cannot make a court anybody would want to play on, so one player
 * rests instead and the remainder becomes two — that is where the *Ragged
 * bands* fixture's single sit-out on thirteen players comes from.
 *
 * Three players in total is the one exception: there is no fourth court-mate
 * to find, so they share one court and the board shows a warning.
 */
export function planCapacity(playerCount: number, courtCount: number): CapacityPlan {
  const capacity = Math.max(0, courtCount) * 4;
  const usable = Math.min(Math.max(0, playerCount), capacity);

  if (usable === 0) {
    return { playingCount: 0, sitOutCount: playerCount, courts: [], warnings: ['no_players'] };
  }
  if (usable === 1) {
    return {
      playingCount: 0,
      sitOutCount: playerCount,
      courts: [],
      warnings: ['too_few_players'],
    };
  }
  if (usable === 3) {
    return {
      playingCount: 3,
      sitOutCount: playerCount - 3,
      courts: [{ courtNumber: 1, size: 3 }],
      warnings: ['court_of_three'],
    };
  }

  const remainder = usable % 4;
  const playingCount = remainder === 1 || remainder === 3 ? usable - 1 : usable;
  const fullCourts = Math.floor(playingCount / 4);
  const courts: CourtPlan[] = [];
  for (let n = 1; n <= fullCourts; n += 1) courts.push({ courtNumber: n, size: 4 });
  if (playingCount % 4 === 2) courts.push({ courtNumber: fullCourts + 1, size: 2 });

  return { playingCount, sitOutCount: playerCount - playingCount, courts, warnings: [] };
}

// ── internals ────────────────────────────────────────────────────────────

interface MutableCourt {
  courtNumber: number;
  team1: string[];
  team2: string[];
}

interface SlotRef {
  court: number;
  team: 1 | 2;
  index: number;
}

function freeze(court: MutableCourt): Court {
  return {
    courtNumber: court.courtNumber,
    team1: [...court.team1],
    team2: [...court.team2],
  };
}

/**
 * Locked courts are inputs that survive regeneration (13.8), which means they
 * can outlive the bookings they name. One whose players have cancelled, or
 * which points at a court number this head count no longer fills, is dropped
 * rather than allowed to corrupt the board.
 */
function resolveLockedCourts(
  lockedCourts: readonly LockedCourt[],
  plan: CapacityPlan,
  attendeeIds: ReadonlySet<string>,
): { locked: LockedCourt[]; dropped: boolean } {
  const fullCourtNumbers = new Set(
    plan.courts.filter((court) => court.size === 4).map((court) => court.courtNumber),
  );
  const locked: LockedCourt[] = [];
  const claimed = new Set<string>();
  const usedCourts = new Set<number>();
  let dropped = false;

  for (const court of lockedCourts) {
    const unique = [...new Set(court.bookingIds)];
    const usable =
      unique.length === 4 &&
      fullCourtNumbers.has(court.courtNumber) &&
      !usedCourts.has(court.courtNumber) &&
      unique.every((id) => attendeeIds.has(id) && !claimed.has(id));
    if (!usable) {
      dropped = true;
      continue;
    }
    usedCourts.add(court.courtNumber);
    for (const id of unique) claimed.add(id);
    locked.push({ courtNumber: court.courtNumber, bookingIds: unique });
  }

  return { locked, dropped };
}

/**
 * 13.6's `selectPlayers`, and hard constraint 6: "no player sits out twice
 * before every other player has sat out once".
 *
 * Players who have rested most go on first. 13.6's prose says to sort
 * ascending and take the top N, which would seat the same people every
 * rotation and break the constraint the same section calls unbreakable; the
 * constraint wins per Appendix B. Recorded as conflict C6.
 *
 * Ties are broken by the seeded RNG so it is not the same faces resting each
 * time the coach regenerates. Anyone on a locked court always plays.
 */
function selectPlayers(
  attendees: readonly Attendee[],
  plan: CapacityPlan,
  sitOutCounts: ReadonlyMap<string, number>,
  lockedPlayers: ReadonlySet<string>,
  rng: Rng,
): { playing: Attendee[]; sitting: string[] } {
  const required = attendees.filter((a) => lockedPlayers.has(a.bookingId));
  const optional = attendees.filter((a) => !lockedPlayers.has(a.bookingId));
  const slots = Math.max(0, plan.playingCount - required.length);

  const ordered = rng
    .shuffle(optional)
    .sort((a, b) => (sitOutCounts.get(b.bookingId) ?? 0) - (sitOutCounts.get(a.bookingId) ?? 0));

  return {
    playing: [...required, ...ordered.slice(0, slots)],
    sitting: ordered.slice(slots).map((a) => a.bookingId),
  };
}

/**
 * Split four (or three, or two) players between the two sides of one court:
 * strongest with weakest, middle two together. 13.5.
 *
 * It applies under both rules. Rule 2 differs from rule 1 in which players
 * share a court, not in how a court's four are then divided — a snake pairing
 * inside a court of four lands on exactly this split.
 */
function splitTeams(
  group: readonly string[],
  tierOf: (id: string) => number,
): { team1: string[]; team2: string[] } {
  const sorted = [...group].sort((a, b) => tierOf(b) - tierOf(a));
  if (sorted.length >= 4) {
    const [a, b, c, d] = sorted;
    if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
      return { team1: [a, d], team2: [b, c] };
    }
  }
  if (sorted.length === 3) {
    const [a, b, c] = sorted;
    if (a !== undefined && b !== undefined && c !== undefined) {
      return { team1: [a, c], team2: [b] };
    }
  }
  const [first, second] = sorted;
  return {
    team1: first === undefined ? [] : [first],
    team2: second === undefined ? [] : [second],
  };
}

/**
 * 13.6, rule 1 seeding. Sort by tier descending and deal in blocks of four:
 * the strongest four to the lowest free court, the next four to the next, and
 * so on. `sortByTierDescending` shuffles equal tiers first, which is D63's
 * "the leftover player is pushed up or down at random".
 */
function seedRule1(
  players: readonly string[],
  courtPlans: readonly CourtPlan[],
  tierOf: (id: string) => number,
  rng: Rng,
): MutableCourt[] {
  const ordered = sortByTierDescending(players, tierOf, rng);
  const courts: MutableCourt[] = [];
  let cursor = 0;
  for (const plan of courtPlans) {
    const group = ordered.slice(cursor, cursor + plan.size);
    cursor += plan.size;
    const { team1, team2 } = splitTeams(group, tierOf);
    courts.push({ courtNumber: plan.courtNumber, team1, team2 });
  }
  return courts;
}

/**
 * 13.6, rule 2 seeding. Sort by tier descending, cut into a top half and a
 * bottom half, then pair across the two halves and place two pairs per court.
 *
 * 13.6 pairs the strongest of the top half with the weakest of the bottom
 * half, working inwards, which equalises the pair sums beautifully and, on a
 * roster that arrives in two clean bands, hands every pair the wrong intra-
 * team gap: four A-with-C teams at a gap of six and four B+-with-B teams at a
 * gap of one. 13.5 scores that arrangement at 64 against an available zero,
 * and no single swap from 13.6's move set reaches the zero — undoing it takes
 * two swaps at once, so the hill climber sits in the local optimum and the
 * *Even bands* fixture in 19.2 fails.
 *
 * So both pairings of the halves are dealt, and the one 13.5 scores lower is
 * the one that gets climbed. 13.5 is the authority on what a good court looks
 * like; 13.6's snake is a heuristic for reaching it, and it stays here as one
 * of the two candidates.
 */
function seedRule2(
  players: readonly string[],
  courtPlans: readonly CourtPlan[],
  tierOf: (id: string) => number,
  rng: Rng,
  ctx: ScoringContext,
): MutableCourt[] {
  const ordered = sortByTierDescending(players, tierOf, rng);
  const half = Math.ceil(ordered.length / 2);
  const top = ordered.slice(0, half);
  const bottom = ordered.slice(half);

  const candidates = [
    buildRule2Pairs(top, bottom, 'inwards'),
    buildRule2Pairs(top, bottom, 'parallel'),
  ];
  let best: MutableCourt[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const courts = dealPairs(candidate, courtPlans);
    const score = scoreCourts(courts.map(freeze), 'rule_2_mixed', ctx);
    if (score < bestScore) {
      bestScore = score;
      best = courts;
    }
  }
  return best ?? [];
}

interface Rule2Pairs {
  pairs: [string, string][];
  singles: string[];
}

/**
 * `inwards` is 13.6's snake: strongest of the top with weakest of the bottom.
 * `parallel` walks both halves in the same direction, which is what lands on
 * RULE2_TARGET_GAP when the roster comes in bands.
 */
function buildRule2Pairs(
  top: readonly string[],
  bottom: readonly string[],
  direction: 'inwards' | 'parallel',
): Rule2Pairs {
  const pairs: [string, string][] = [];
  const singles: string[] = [];
  for (let i = 0; i < top.length; i += 1) {
    const stronger = top[i];
    if (stronger === undefined) continue;
    const weaker = direction === 'inwards' ? bottom[bottom.length - 1 - i] : bottom[i];
    if (weaker === undefined) singles.push(stronger);
    else pairs.push([stronger, weaker]);
  }
  return { pairs, singles };
}

/**
 * Two pairs make a full court, one pair makes a singles court, and the
 * three-player court takes a pair plus the odd player an odd head count
 * leaves over. The counts always line up for a plan from `planCapacity`.
 */
function dealPairs(
  { pairs, singles }: Rule2Pairs,
  courtPlans: readonly CourtPlan[],
): MutableCourt[] {
  const courts: MutableCourt[] = [];
  let p = 0;
  let s = 0;
  const takePair = (): [string, string] => pairs[p++] ?? ['', ''];
  const takeSingle = (): string => singles[s++] ?? '';

  for (const plan of courtPlans) {
    if (plan.size === 4) {
      courts.push({ courtNumber: plan.courtNumber, team1: takePair(), team2: takePair() });
    } else if (plan.size === 3) {
      courts.push({ courtNumber: plan.courtNumber, team1: takePair(), team2: [takeSingle()] });
    } else {
      const [stronger, weaker] = takePair();
      courts.push({ courtNumber: plan.courtNumber, team1: [stronger], team2: [weaker] });
    }
  }

  // Defensive: a mis-sized plan would leave a slot holding ''. It never happens
  // for a plan produced by planCapacity, and a court short beats a blank tile.
  return courts.map((court) => ({
    courtNumber: court.courtNumber,
    team1: court.team1.filter((id) => id !== ''),
    team2: court.team2.filter((id) => id !== ''),
  }));
}

function slotsOf(courts: readonly MutableCourt[], skip: ReadonlySet<number>): SlotRef[] {
  const slots: SlotRef[] = [];
  courts.forEach((court, index) => {
    if (skip.has(court.courtNumber)) return;
    court.team1.forEach((_, i) => slots.push({ court: index, team: 1, index: i }));
    court.team2.forEach((_, i) => slots.push({ court: index, team: 2, index: i }));
  });
  return slots;
}

function readSlot(courts: readonly MutableCourt[], slot: SlotRef): string {
  const court = courts[slot.court];
  if (court === undefined) return '';
  const team = slot.team === 1 ? court.team1 : court.team2;
  return team[slot.index] ?? '';
}

function writeSlot(courts: MutableCourt[], slot: SlotRef, value: string): void {
  const court = courts[slot.court];
  if (court === undefined) return;
  const team = slot.team === 1 ? court.team1 : court.team2;
  team[slot.index] = value;
}

function swapSlots(courts: MutableCourt[], a: SlotRef, b: SlotRef): void {
  const first = readSlot(courts, a);
  const second = readSlot(courts, b);
  writeSlot(courts, a, second);
  writeSlot(courts, b, first);
}

function sameSide(a: SlotRef, b: SlotRef): boolean {
  return a.court === b.court && a.team === b.team;
}

/**
 * Drag the seed onto the right side of the hard constraints before scoring
 * starts.
 *
 * The dealing steps know nothing about never_pair and always_pair, so a fresh
 * seed can break either. A greedy pass over every legal swap fixes what is
 * fixable; what is left is genuinely unsatisfiable — an always_pair where one
 * of the two is on somebody else's locked court, say — and the hill climber
 * is told to hold the line rather than make it worse.
 */
function repairConstraints(
  courts: MutableCourt[],
  constraints: Constraints,
  playing: ReadonlySet<string>,
): void {
  const slots = slotsOf(courts, constraints.lockedCourtNumbers);
  for (let pass = 0; pass < 4; pass += 1) {
    let violations = countViolations(courts.map(freeze), constraints, playing);
    if (violations === 0) return;
    let improved = false;
    for (let i = 0; i < slots.length && !improved; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i];
        const b = slots[j];
        if (a === undefined || b === undefined || sameSide(a, b)) continue;
        swapSlots(courts, a, b);
        const next = countViolations(courts.map(freeze), constraints, playing);
        if (next < violations) {
          violations = next;
          improved = true;
          break;
        }
        swapSlots(courts, a, b);
      }
    }
    if (!improved) return;
  }
}

export interface HillClimbBudget {
  maxIterations: number;
  timeBudgetMs: number;
  now: () => number;
}

/**
 * 13.6's hill climb. Up to 400 iterations or 150 milliseconds, whichever
 * comes first: swap two players on different unlocked courts or on opposite
 * sides of one court, rescore, keep the swap if it improved, and every
 * fiftieth iteration take a neutral swap to get off a plateau.
 *
 * Deliberately not simulated annealing. The search space is small, and 13.6
 * is explicit that the coach overrides anything he dislikes anyway.
 */
/**
 * Returns the number of iterations actually run, so a caller can tell a full
 * climb apart from one the 150ms budget cut short. See `Lineup.hillClimbIterations`.
 */
function hillClimb(
  courts: MutableCourt[],
  rule: RotationRule,
  ctx: ScoringContext,
  constraints: Constraints,
  playing: ReadonlySet<string>,
  rng: Rng,
  budget: HillClimbBudget,
): number {
  const slots = slotsOf(courts, constraints.lockedCourtNumbers);
  if (slots.length < 2) return 0;

  let bestScore = scoreCourts(courts.map(freeze), rule, ctx);
  let violations = countViolations(courts.map(freeze), constraints, playing);
  const deadline = budget.now() + budget.timeBudgetMs;

  let i = 0;
  for (; i < budget.maxIterations; i += 1) {
    if (i % TIME_CHECK_INTERVAL === 0 && budget.now() >= deadline) break;

    const a = slots[rng.int(slots.length)];
    const b = slots[rng.int(slots.length)];
    if (a === undefined || b === undefined || sameSide(a, b)) continue;

    swapSlots(courts, a, b);
    const frozen = courts.map(freeze);
    const nextViolations = countViolations(frozen, constraints, playing);
    if (nextViolations > violations) {
      swapSlots(courts, a, b);
      continue;
    }

    const nextScore = scoreCourts(frozen, rule, ctx);
    const neutralAllowed = (i + 1) % NEUTRAL_SWAP_INTERVAL === 0;
    const accept =
      nextViolations < violations ||
      nextScore < bestScore ||
      (neutralAllowed && nextScore === bestScore);

    if (accept) {
      bestScore = nextScore;
      violations = nextViolations;
    } else {
      swapSlots(courts, a, b);
    }
  }
  return i;
}

export interface GenerateOptions {
  /** Injected so tests can assert the time cap without waiting for it. */
  now?: () => number;
  maxIterations?: number;
  timeBudgetMs?: number;
  weights?: Weights;
}

/**
 * Build a whole session's board. 13.6.
 *
 * The returned lineup is what gets written to `court_assignments`; the
 * warnings are what the board says out loud when the head count is awkward.
 */
export function generateLineup(input: LineupInput, options: GenerateOptions = {}): Lineup {
  const seen = new Set<string>();
  const attendees = input.attendees.filter((a) => {
    if (seen.has(a.bookingId)) return false;
    seen.add(a.bookingId);
    return true;
  });
  const attendeeIds = new Set(attendees.map((a) => a.bookingId));
  const tiers = new Map(attendees.map((a) => [a.bookingId, a.tierValue]));
  const tierOf = (id: string): number => tiers.get(id) ?? 0;

  const plan = planCapacity(attendees.length, input.courtCount);
  const { locked, dropped } = resolveLockedCourts(input.lockedCourts, plan, attendeeIds);
  const warnings: LineupWarningCode[] = [...plan.warnings];
  if (dropped) warnings.push('locked_court_dropped');

  if (attendees.length === 0 || input.rotationCount <= 0) {
    return { rotations: [], warnings, hillClimbIterations: 0 };
  }

  const applicableRules: PairingRule[] = input.pairingRules.filter(
    (rule) => attendeeIds.has(rule.bookingIdA) && attendeeIds.has(rule.bookingIdB),
  );
  const constraints = buildConstraints(locked, applicableRules);
  const lockedByCourt = new Map(locked.map((court) => [court.courtNumber, court.bookingIds]));

  const weights = options.weights ?? WEIGHTS;
  const budget: HillClimbBudget = {
    maxIterations: options.maxIterations ?? HILL_CLIMB_MAX_ITERATIONS,
    timeBudgetMs: options.timeBudgetMs ?? HILL_CLIMB_TIME_BUDGET_MS,
    now: options.now ?? Date.now,
  };

  const rng = seededRandom(input.seed ?? Date.now());
  const history = new PairHistory();
  const sitOutCounts = new Map<string, number>(attendees.map((a) => [a.bookingId, 0]));
  const rotations: Rotation[] = [];
  let hillClimbIterations = 0;

  for (let index = 1; index <= input.rotationCount; index += 1) {
    const rule = ruleForRotation(index);
    const { playing, sitting } = selectPlayers(
      attendees,
      plan,
      sitOutCounts,
      constraints.lockedPlayers,
      rng,
    );
    const playingIds = new Set(playing.map((a) => a.bookingId));

    const freeCourtPlans = plan.courts.filter(
      (court) => !constraints.lockedCourtNumbers.has(court.courtNumber),
    );
    const freePlayers = playing
      .map((a) => a.bookingId)
      .filter((id) => !constraints.lockedPlayers.has(id));

    const ctx: ScoringContext = {
      tierOf,
      history,
      sessionType: input.sessionType,
      weights,
    };

    const seeded =
      rule === 'rule_1_similar'
        ? seedRule1(freePlayers, freeCourtPlans, tierOf, rng)
        : seedRule2(freePlayers, freeCourtPlans, tierOf, rng, ctx);

    for (const [courtNumber, bookingIds] of lockedByCourt) {
      const { team1, team2 } = splitTeams(bookingIds, tierOf);
      seeded.push({ courtNumber, team1, team2 });
    }
    seeded.sort((a, b) => a.courtNumber - b.courtNumber);

    repairConstraints(seeded, constraints, playingIds);
    hillClimbIterations += hillClimb(seeded, rule, ctx, constraints, playingIds, rng, budget);

    const courts = seeded.map(freeze);
    rotations.push({ index, rule, courts, sitOuts: sitting });

    history.record(courts);
    for (const id of sitting) sitOutCounts.set(id, (sitOutCounts.get(id) ?? 0) + 1);
  }

  return { rotations, warnings, hillClimbIterations };
}
