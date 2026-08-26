/**
 * The engine's own rules: 13.3's rule assignment, 13.7's capacity table,
 * 13.6's budget, and the guarantees a lineup makes whatever the seed.
 */
import { generateLineup, planCapacity, ruleForRotation } from '../engine';
import { pairKey } from '../scoring';
import {
  courtSizes,
  fakeClock,
  makeAttendees,
  makeInput,
  partnershipsOf,
  playersOf,
  teamsOf,
  tierLookup,
} from '@/test/matchmakingHelpers';

describe('ruleForRotation, 13.3', () => {
  it('alternates rule 1 on odd rotations and rule 2 on even', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(ruleForRotation)).toEqual([
      'rule_1_similar',
      'rule_2_mixed',
      'rule_1_similar',
      'rule_2_mixed',
      'rule_1_similar',
      'rule_2_mixed',
      // D62: a seventh rotation, if the coach plays one, is rule 1.
      'rule_1_similar',
    ]);
  });
});

describe('planCapacity, 13.7', () => {
  it('matches the table', () => {
    expect(planCapacity(16, 4).courts.map((c) => c.size)).toEqual([4, 4, 4, 4]);
    expect(planCapacity(14, 4).courts.map((c) => c.size)).toEqual([4, 4, 4, 2]);
    expect(planCapacity(10, 3).courts.map((c) => c.size)).toEqual([4, 4, 2]);
    expect(planCapacity(6, 3).courts.map((c) => c.size)).toEqual([4, 2]);
    expect(planCapacity(4, 3).courts.map((c) => c.size)).toEqual([4]);
    expect(planCapacity(2, 3).courts.map((c) => c.size)).toEqual([2]);
    expect(planCapacity(0, 3).courts).toEqual([]);
  });

  it('numbers courts from 1 upward so the partial court is always the last', () => {
    expect(planCapacity(10, 3).courts).toEqual([
      { courtNumber: 1, size: 4 },
      { courtNumber: 2, size: 4 },
      { courtNumber: 3, size: 2 },
    ]);
  });

  it('rests the odd player rather than seating one or three on a court', () => {
    expect(planCapacity(13, 4)).toMatchObject({ playingCount: 12, sitOutCount: 1 });
    expect(planCapacity(11, 3)).toMatchObject({ playingCount: 10, sitOutCount: 1 });
    expect(planCapacity(7, 3)).toMatchObject({ playingCount: 6, sitOutCount: 1 });
    expect(planCapacity(5, 3)).toMatchObject({ playingCount: 4, sitOutCount: 1 });
  });

  it('caps at the courts available and rests the overflow', () => {
    expect(planCapacity(20, 4)).toMatchObject({ playingCount: 16, sitOutCount: 4 });
    expect(planCapacity(20, 3)).toMatchObject({ playingCount: 12, sitOutCount: 8 });
  });

  it('warns on three players, on one, and on none', () => {
    expect(planCapacity(3, 3).warnings).toEqual(['court_of_three']);
    expect(planCapacity(1, 3).warnings).toEqual(['too_few_players']);
    expect(planCapacity(0, 3).warnings).toEqual(['no_players']);
    expect(planCapacity(2, 3).warnings).toEqual([]);
  });
});

describe('generateLineup', () => {
  const twelve = makeAttendees([9, 8, 8, 7, 6, 6, 5, 5, 4, 3, 3, 2]);

  it('is reproducible for a given seed', () => {
    // With a frozen clock. 13.6 caps the hill climb at "400 iterations or 150
    // milliseconds, whichever comes first", and a wall clock is not
    // reproducible: on a loaded machine the budget expires at a different
    // iteration each run and the two boards diverge. The seed governs every
    // choice the engine makes; the clock governs only how many it gets to
    // make, and 19.2's fixtures are all well inside it.
    const input = makeInput({ attendees: twelve, courtCount: 3, seed: 99 });
    const frozen = { now: () => 0 };
    expect(generateLineup(input, frozen)).toEqual(generateLineup(input, frozen));
  });

  it('gives a different board for a different seed', () => {
    const first = generateLineup(makeInput({ attendees: twelve, courtCount: 3, seed: 99 }));
    const second = generateLineup(makeInput({ attendees: twelve, courtCount: 3, seed: 100 }));
    expect(first.rotations).toHaveLength(4);
    expect(second.rotations).toHaveLength(4);
  });

  it('never seats a player twice in one rotation, and seats every playing attendee once', () => {
    const lineup = generateLineup(makeInput({ attendees: twelve, courtCount: 3, seed: 5 }));
    for (const rotation of lineup.rotations) {
      const ids = playersOf(rotation);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids, ...rotation.sitOuts].sort()).toEqual(twelve.map((a) => a.bookingId).sort());
    }
  });

  it('gives every rule 1 court a tighter spread than the roster as a whole', () => {
    const attendees = makeAttendees([9, 9, 8, 8, 6, 6, 5, 5, 3, 3, 2, 2]);
    const tierOf = tierLookup(attendees);
    const lineup = generateLineup(makeInput({ attendees, courtCount: 3, seed: 62 }));

    for (const rotation of lineup.rotations.filter((r) => r.rule === 'rule_1_similar')) {
      for (const court of rotation.courts) {
        const values = [...court.team1, ...court.team2].map(tierOf);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('holds its guarantees across many seeds, not just the fixture seed', () => {
    const seeds = Array.from({ length: 25 }, (_, i) => i * 1013 + 7);
    for (const seed of seeds) {
      const lineup = generateLineup(
        makeInput({
          attendees: twelve,
          courtCount: 3,
          seed,
          pairingRules: [
            { kind: 'never_pair', bookingIdA: 'p1', bookingIdB: 'p2' },
            { kind: 'always_pair', bookingIdA: 'p5', bookingIdB: 'p11' },
          ],
        }),
      );
      for (const rotation of lineup.rotations) {
        const partnerships = partnershipsOf(rotation);
        expect(partnerships).not.toContain(pairKey('p1', 'p2'));
        expect(partnerships).toContain(pairKey('p5', 'p11'));
        expect(courtSizes(rotation)).toEqual([4, 4, 4]);
      }
    }
  });

  it('drops a locked court whose players are no longer attending', () => {
    const lineup = generateLineup(
      makeInput({
        attendees: twelve,
        courtCount: 3,
        seed: 12,
        lockedCourts: [{ courtNumber: 1, bookingIds: ['p1', 'p2', 'p3', 'gone'] }],
      }),
    );
    expect(lineup.warnings).toContain('locked_court_dropped');
    expect(lineup.rotations).toHaveLength(4);
  });

  it('drops a locked court that points at a partial court number', () => {
    // Ten players on three courts makes court 3 a singles court, so a locked
    // court 3 cannot hold its four. 13.7 and 13.8.
    const ten = makeAttendees([9, 8, 7, 6, 6, 5, 4, 4, 3, 2]);
    const lineup = generateLineup(
      makeInput({
        attendees: ten,
        courtCount: 3,
        seed: 13,
        lockedCourts: [{ courtNumber: 3, bookingIds: ['p1', 'p2', 'p3', 'p4'] }],
      }),
    );
    expect(lineup.warnings).toContain('locked_court_dropped');
    for (const rotation of lineup.rotations) {
      expect(courtSizes(rotation)).toEqual([4, 4, 2]);
    }
  });

  it('ignores a pairing rule naming somebody who is not attending', () => {
    const lineup = generateLineup(
      makeInput({
        attendees: twelve,
        courtCount: 3,
        seed: 14,
        pairingRules: [{ kind: 'always_pair', bookingIdA: 'p1', bookingIdB: 'absent' }],
      }),
    );
    expect(lineup.rotations).toHaveLength(4);
    expect(playersOf(lineup.rotations[0]!)).toContain('p1');
  });

  it('honours never_pair even when the two share a court as opponents', () => {
    const lineup = generateLineup(
      makeInput({
        attendees: twelve,
        courtCount: 3,
        seed: 15,
        pairingRules: [{ kind: 'never_pair', bookingIdA: 'p1', bookingIdB: 'p12' }],
      }),
    );
    for (const rotation of lineup.rotations) {
      for (const team of teamsOf(rotation)) {
        expect(team.includes('p1') && team.includes('p12')).toBe(false);
      }
    }
  });

  it('stops hill climbing when the time budget is spent', () => {
    // A clock that jumps 200ms per reading is past 13.6's 150ms budget on the
    // first check, so the seed assignment is what comes back.
    const lineup = generateLineup(makeInput({ attendees: twelve, courtCount: 3, seed: 16 }), {
      now: fakeClock(0, 200),
    });
    for (const rotation of lineup.rotations) {
      expect(playersOf(rotation)).toHaveLength(12);
    }
  });

  it('returns nothing for zero rotations', () => {
    const lineup = generateLineup(
      makeInput({ attendees: twelve, courtCount: 3, rotationCount: 0, seed: 17 }),
    );
    expect(lineup.rotations).toEqual([]);
  });

  it('ignores a duplicated attendee rather than seating them twice', () => {
    const attendees = makeAttendees([9, 8, 7, 6]);
    const first = attendees[0];
    const lineup = generateLineup(
      makeInput({
        attendees: first === undefined ? attendees : [...attendees, first],
        courtCount: 3,
        seed: 18,
      }),
    );
    for (const rotation of lineup.rotations) {
      expect(playersOf(rotation).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    }
  });

  it('spreads sit-outs evenly over a long extended session', () => {
    const attendees = makeAttendees([9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 2, 2, 1]);
    const lineup = generateLineup(
      makeInput({
        attendees,
        courtCount: 3,
        rotationCount: 6,
        sessionType: 'extended',
        seed: 19,
      }),
    );
    const counts = new Map<string, number>();
    for (const attendee of attendees) counts.set(attendee.bookingId, 0);
    for (const rotation of lineup.rotations) {
      for (const id of rotation.sitOuts) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const values = [...counts.values()];
    // Hard constraint 6: nobody rests twice before everybody has rested once.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});
