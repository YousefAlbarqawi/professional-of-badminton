/**
 * The board's decisions, without the board. 13.4, 13.8, 13.9, 13.10.
 */
import type { BoardPlayer, StoredLineup, StoredRotation } from '@/features/matchmaking/boardTypes';
import { parseInstant } from '@/lib/time';

import {
  canLockCourt,
  courtNumberOf,
  courtTeams,
  isLineupStale,
  restingPlayers,
  rotationAt,
  swapRefusal,
} from '../courtBoardInteraction';

const GENERATED_AT = parseInstant('2026-08-24T15:00:00Z');

function rotation(overrides: Partial<StoredRotation> = {}): StoredRotation {
  return {
    id: 'r1',
    index: 1,
    rule: 'rule_1_similar',
    courts: [
      { courtNumber: 1, team1: ['b1', 'b2'], team2: ['b3', 'b4'] },
      { courtNumber: 2, team1: ['b5', 'b6'], team2: ['b7', 'b8'] },
      { courtNumber: 3, team1: ['b9'], team2: ['b10'] },
    ],
    sitOuts: ['b11'],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function player(bookingId: string): BoardPlayer {
  return { bookingId, firstName: bookingId, familyName: 'Test', tier: 'B', isCoachSlot: false };
}

const PLAYERS = new Map(
  ['b1', 'b2', 'b3', 'b4', 'b5', 'b9', 'b10', 'b11'].map((id) => [id, player(id)]),
);

describe('courtNumberOf', () => {
  it('finds a player on either team', () => {
    expect(courtNumberOf(rotation(), 'b1')).toBe(1);
    expect(courtNumberOf(rotation(), 'b8')).toBe(2);
  });

  it('answers null for somebody resting', () => {
    expect(courtNumberOf(rotation(), 'b11')).toBeNull();
  });
});

describe('swapRefusal, 13.9', () => {
  it('allows a swap between two unlocked courts', () => {
    expect(swapRefusal(rotation(), [], 'b1', 'b5')).toBeNull();
  });

  it('allows a swap with somebody resting', () => {
    expect(swapRefusal(rotation(), [], 'b1', 'b11')).toBeNull();
  });

  it('refuses a swap out of a locked court', () => {
    expect(swapRefusal(rotation(), [1], 'b1', 'b5')).toBe('court_locked');
  });

  it('refuses a swap into a locked court', () => {
    expect(swapRefusal(rotation(), [2], 'b1', 'b5')).toBe('court_locked');
  });

  it('lets a swap between two other courts through while a third is locked', () => {
    expect(swapRefusal(rotation(), [3], 'b1', 'b5')).toBeNull();
  });

  it('refuses to swap somebody with himself', () => {
    expect(swapRefusal(rotation(), [], 'b1', 'b1')).toBe('same_player');
  });
});

describe('courtTeams and restingPlayers, 13.10', () => {
  it('resolves booking ids into the players the tiles draw', () => {
    const court = rotation().courts[0];
    const teams = courtTeams(court!, PLAYERS);
    expect(teams.team1.map((p) => p.bookingId)).toEqual(['b1', 'b2']);
    expect(teams.team2.map((p) => p.bookingId)).toEqual(['b3', 'b4']);
  });

  it('skips a booking the roster no longer has, rather than drawing a blank tile', () => {
    const court = rotation().courts[1];
    const teams = courtTeams(court!, PLAYERS);
    expect(teams.team1.map((p) => p.bookingId)).toEqual(['b5']);
    expect(teams.team2).toEqual([]);
  });

  it('lists the resting players', () => {
    expect(restingPlayers(rotation(), PLAYERS).map((p) => p.bookingId)).toEqual(['b11']);
  });
});

describe('canLockCourt, 13.4 rule 3', () => {
  it('allows a court of four', () => {
    expect(canLockCourt({ courtNumber: 1, team1: ['a', 'b'], team2: ['c', 'd'] })).toBe(true);
  });

  it('refuses a singles court and a court of three', () => {
    expect(canLockCourt({ courtNumber: 3, team1: ['a'], team2: ['b'] })).toBe(false);
    expect(canLockCourt({ courtNumber: 1, team1: ['a', 'b'], team2: ['c'] })).toBe(false);
  });
});

describe('rotationAt', () => {
  const lineup: StoredLineup = {
    rotations: [rotation(), rotation({ id: 'r2', index: 2, rule: 'rule_2_mixed' })],
    lockedCourts: [],
    hasManualLineup: false,
    changesSinceGenerated: 0,
  };

  it('finds a rotation by its 1-based index', () => {
    expect(rotationAt(lineup, 2)?.id).toBe('r2');
  });

  it('answers null for an index that is not there', () => {
    expect(rotationAt(lineup, 7)).toBeNull();
  });
});

describe('isLineupStale, 13.8', () => {
  const base: StoredLineup = {
    rotations: [rotation()],
    lockedCourts: [],
    hasManualLineup: false,
    changesSinceGenerated: 0,
  };

  it('is stale once he has edited it and bookings have changed since', () => {
    expect(isLineupStale({ ...base, hasManualLineup: true, changesSinceGenerated: 3 })).toBe(true);
  });

  it('is not stale before he has edited anything, however much has changed', () => {
    // While the flag is false a booking change deletes the lineup outright
    // (mark_lineup_stale, 0020), so there is nothing to warn about.
    expect(isLineupStale({ ...base, changesSinceGenerated: 3 })).toBe(false);
  });

  it('is not stale when he has edited it and nothing has changed since', () => {
    expect(isLineupStale({ ...base, hasManualLineup: true })).toBe(false);
  });
});
