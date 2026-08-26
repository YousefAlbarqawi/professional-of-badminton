/**
 * The matchmaking engine's vocabulary. BUILD-SPEC 13.1 and 13.2.
 *
 * Nothing in this folder imports React, Supabase, or any other feature. The
 * engine is a pure function of its input, and the seed makes it a
 * reproducible one. The API layer is what turns database rows into a
 * `LineupInput` and a `Lineup` back into `court_assignments`.
 */

/** 13.3. Odd rotations are rule 1, even rotations rule 2. D59, D62. */
export type RotationRule = 'rule_1_similar' | 'rule_2_mixed';

/**
 * Mirrors the `session_type` enum without importing it. The engine only cares
 * about this to pick the partner-repeat weight (13.5), and a structural union
 * keeps the module free of cross-feature imports.
 */
export type LineupSessionType = 'standard' | 'extended';

export interface Attendee {
  bookingId: string;
  displayName: string;
  /** 1 = C-, 9 = A+. An unrated player arrives here as 5 (B). 13.1, A11. */
  tierValue: number;
  isCoach: boolean;
}

/** A court the coach has locked. Exactly four booking ids. 13.9. */
export interface LockedCourt {
  courtNumber: number;
  bookingIds: readonly string[];
}

export type PairingRuleKind = 'never_pair' | 'always_pair';

/**
 * D65. The database stores these against profile ids because they outlive a
 * single session; the engine works in booking ids, so the API layer maps them
 * across and drops any rule whose players are not both attending.
 */
export interface PairingRule {
  kind: PairingRuleKind;
  bookingIdA: string;
  bookingIdB: string;
}

export interface LineupInput {
  sessionId: string;
  sessionType: LineupSessionType;
  /** 3 or 4. D3. */
  courtCount: number;
  /** 4 for standard, 6 or 7 for extended. D5, D62. */
  rotationCount: number;
  attendees: readonly Attendee[];
  lockedCourts: readonly LockedCourt[];
  pairingRules: readonly PairingRule[];
  /** Omit in production, set in tests. 13.1. */
  seed?: number;
}

/**
 * One court in one rotation.
 *
 * 13.2 types the teams as `[string, string]`. They are plain arrays here
 * because 13.7 requires a two-player singles court and a three-player court,
 * neither of which a fixed pair can express. A team holds one or two booking
 * ids and never more.
 */
export interface Court {
  courtNumber: number;
  team1: readonly string[];
  team2: readonly string[];
}

export interface Rotation {
  /** 1-based. 13.2. */
  index: number;
  rule: RotationRule;
  courts: readonly Court[];
  /** Booking ids resting this rotation. 13.10 heads this section "Resting". */
  sitOuts: readonly string[];
}

/**
 * Things the court board has to say out loud. 13.7 asks for a warning banner
 * on three players and an empty state with a cancel prompt on zero, so the
 * engine decides them rather than the screen re-deriving the arithmetic.
 */
export type LineupWarningCode =
  /** Nobody is attending. 13.7 wants the empty state and a Cancel session button. */
  | 'no_players'
  /** One or two attendees. Too few for the coach's night to be worth running. */
  | 'too_few_players'
  /** Exactly three. One court, three players, and a banner. 13.7. */
  | 'court_of_three'
  /** A locked court no longer fits: its players left, or the courts shrank. */
  | 'locked_court_dropped';

export interface Lineup {
  rotations: readonly Rotation[];
  /**
   * Additive to 13.2. The board needs to know why it is showing an empty or
   * odd lineup, and the engine is the only place that knows.
   */
  warnings: readonly LineupWarningCode[];
  /**
   * Additive to 13.2. The sum, across every rotation, of hill-climb
   * iterations actually run before that rotation's own 150ms budget (13.6)
   * either exhausted HILL_CLIMB_MAX_ITERATIONS or cut the climb short. Never
   * persisted — `saveLineup` (features/matchmaking/api.ts) reads only
   * `rotations`. Exists so 19.2's performance fixture can assert on this
   * deterministic count instead of a wall clock a shared test machine cannot
   * reproduce.
   */
  hillClimbIterations: number;
}

/** One court's shape for a given head count. 13.7. */
export interface CourtPlan {
  courtNumber: number;
  size: 2 | 3 | 4;
}

/**
 * The answer to "how do N players fit on C courts", 13.7's table as data.
 * Constant for a whole session because the attendee list is; the court board
 * uses it to lay out tiles before any rotation exists.
 */
export interface CapacityPlan {
  /** How many of the attendees are on court in any one rotation. */
  playingCount: number;
  /** How many rest. `attendees - playingCount`. */
  sitOutCount: number;
  courts: readonly CourtPlan[];
  warnings: readonly LineupWarningCode[];
}
