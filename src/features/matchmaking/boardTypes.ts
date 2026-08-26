/**
 * What the court board reads and writes. BUILD-SPEC 13.8, 13.9, 13.10.
 *
 * Kept apart from `types.ts` deliberately. That file is the engine's, and the
 * engine knows nothing about Postgres, rotation ids, or how a name is drawn on
 * a tile. This one is the boundary between the two: the engine's `Court` and
 * `RotationRule` reappear here carrying the database keys the board needs to
 * edit a slot in place.
 */
import type { Tier } from '@/lib/tiers';

import type { Court, LineupWarningCode, PairingRuleKind, RotationRule } from './types';

/** A rotation as it comes back from `rotations` and `court_assignments`. */
export interface StoredRotation {
  /** The `rotations` row. Swapping and locking both address a rotation by id. */
  id: string;
  index: number;
  rule: RotationRule;
  courts: Court[];
  sitOuts: string[];
  generatedAt: Date;
}

/** A locked court, exactly as 13.4 rule 3 and 13.8 keep it: an input. */
export interface StoredLockedCourt {
  courtNumber: number;
  bookingIds: string[];
}

export interface StoredLineup {
  rotations: StoredRotation[];
  /**
   * 13.4 rule 3, and the padlocks on the board. The booking ids are here and
   * not just the numbers because 13.8 feeds them straight back into the next
   * generation: "Locked courts and pairing rules survive regeneration."
   */
  lockedCourts: StoredLockedCourt[];
  /** 13.8's flag. False means a booking change may discard this lineup. */
  hasManualLineup: boolean;
  /** 13.8's banner: "3 changes since this lineup was made". */
  changesSinceGenerated: number;
}

/**
 * One player, as 13.10 draws them: "first name in large bold text, family
 * name smaller, tier badge in the corner".
 */
export interface BoardPlayer {
  bookingId: string;
  firstName: string;
  /** Empty for a guest the coach typed as a single word. D44. */
  familyName: string;
  tier: Tier | null;
  /** D47. Coaches occupy a slot and pay nothing; the tile says so. */
  isCoachSlot: boolean;
}

/** A pairing rule with enough of the two players to render it. D65. */
export interface PairingRuleSummary {
  id: string;
  kind: PairingRuleKind;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
}

/** Everything the board needs in one object, assembled by `useCourtBoard`. */
export interface CourtBoardState {
  lineup: StoredLineup;
  players: Map<string, BoardPlayer>;
  warnings: LineupWarningCode[];
}

export interface SwapPlayersInput {
  sessionId: string;
  rotationId: string;
  bookingIdA: string;
  bookingIdB: string;
}

export interface CourtLockInput {
  sessionId: string;
  rotationId: string;
  courtNumber: number;
  isLocked: boolean;
}

export interface SetPairingRuleInput {
  kind: PairingRuleKind;
  playerAId: string;
  playerBId: string;
}
