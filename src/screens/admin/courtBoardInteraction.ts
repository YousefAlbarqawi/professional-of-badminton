/**
 * The court board's decisions, without the board. BUILD-SPEC 13.9 and 13.10.
 *
 * Everything a swap or a lock has to work out before it happens lives here as
 * a pure function: which court somebody is on, whether the swap is allowed,
 * who is resting, and which tiles a court draws. The screen is then wiring.
 */
import type { BoardPlayer, StoredLineup, StoredRotation } from '@/features/matchmaking/boardTypes';
import type { Court } from '@/features/matchmaking/types';

/** The court a booking is on in this rotation, or null when it is resting. */
export function courtNumberOf(rotation: StoredRotation, bookingId: string): number | null {
  for (const court of rotation.courts) {
    if (court.team1.includes(bookingId) || court.team2.includes(bookingId)) {
      return court.courtNumber;
    }
  }
  return null;
}

/**
 * 13.9: "Swapping into or out of a locked court is blocked with a toast
 * explaining why." Either end being locked refuses the whole swap, which is
 * also what `swap_lineup_players` decides for itself in migration 0033. The
 * check is here as well so the coach gets the toast rather than a round trip.
 */
export type SwapRefusal = 'court_locked' | 'same_player' | null;

export function swapRefusal(
  rotation: StoredRotation,
  lockedCourtNumbers: readonly number[],
  bookingIdA: string,
  bookingIdB: string,
): SwapRefusal {
  if (bookingIdA === bookingIdB) return 'same_player';

  const locked = new Set(lockedCourtNumbers);
  const courtA = courtNumberOf(rotation, bookingIdA);
  const courtB = courtNumberOf(rotation, bookingIdB);

  if (courtA !== null && locked.has(courtA)) return 'court_locked';
  if (courtB !== null && locked.has(courtB)) return 'court_locked';

  return null;
}

function lookUp(ids: readonly string[], players: ReadonlyMap<string, BoardPlayer>): BoardPlayer[] {
  const found: BoardPlayer[] = [];
  for (const id of ids) {
    const player = players.get(id);
    // A booking that vanished between the lineup being saved and the roster
    // being read is skipped rather than drawn as a blank tile. The staleness
    // banner is what tells the coach the board is behind. 13.8.
    if (player !== undefined) found.push(player);
  }
  return found;
}

export function courtTeams(
  court: Court,
  players: ReadonlyMap<string, BoardPlayer>,
): { team1: BoardPlayer[]; team2: BoardPlayer[] } {
  return { team1: lookUp(court.team1, players), team2: lookUp(court.team2, players) };
}

/** 13.10: "Sit-outs in a separate section at the bottom, headed Resting". */
export function restingPlayers(
  rotation: StoredRotation,
  players: ReadonlyMap<string, BoardPlayer>,
): BoardPlayer[] {
  return lookUp(rotation.sitOuts, players);
}

export function rotationAt(lineup: StoredLineup, index: number): StoredRotation | null {
  return lineup.rotations.find((rotation) => rotation.index === index) ?? null;
}

/**
 * 13.4 rule 3: a locked court keeps exactly four players, so a singles court
 * and the three-player court cannot be locked and the board does not offer it.
 */
export function canLockCourt(court: Court): boolean {
  return court.team1.length + court.team2.length === 4;
}

/**
 * 13.8's banner: "3 changes since this lineup was made", shown only once the
 * coach has taken the lineup over. While the flag is false a booking change
 * discards the lineup outright (0020's `mark_lineup_stale`), so there is
 * nothing stale to warn about — there is nothing at all, and the board
 * generates a new one.
 */
export function isLineupStale(lineup: StoredLineup): boolean {
  return lineup.hasManualLineup && lineup.changesSinceGenerated > 0;
}
