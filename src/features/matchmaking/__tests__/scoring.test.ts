/**
 * 13.5's arithmetic, checked against the formulas as written rather than
 * against the engine that uses them. If a weight is retuned, these are the
 * tests that should have to change.
 */
import {
  buildConstraints,
  countViolations,
  PairHistory,
  pairKey,
  scoreCourt,
  sitOutPenalty,
  type ScoringContext,
} from '../scoring';
import { partnerRepeatWeight, PARTNER_REPEAT_EXTENDED, WEIGHTS } from '../weights';
import { type Court } from '../types';

const tiers: Record<string, number> = {
  a: 9,
  b: 7,
  c: 5,
  d: 3,
  e: 2,
  f: 1,
};

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    tierOf: (id) => tiers[id] ?? 5,
    history: new PairHistory(),
    sessionType: 'standard',
    weights: WEIGHTS,
    ...overrides,
  };
}

const court = (team1: string[], team2: string[]): Court => ({
  courtNumber: 1,
  team1,
  team2,
});

describe('pairKey', () => {
  it('is order independent', () => {
    expect(pairKey('x', 'y')).toBe(pairKey('y', 'x'));
  });
});

describe('scoreCourt, rule 1', () => {
  it('charges RULE1_COURT_SPREAD per tier point of spread, less the unplayed bonus', () => {
    // Spread 9 - 3 = 6, so 60, minus 2 per never-seen partnership.
    const score = scoreCourt(court(['a', 'd'], ['b', 'c']), 'rule_1_similar', context());
    expect(score).toBe(6 * WEIGHTS.RULE1_COURT_SPREAD + 2 * WEIGHTS.UNPLAYED_PAIR_BONUS);
  });

  it('scores a homogeneous court at nothing but the bonus', () => {
    const flat = context({ tierOf: () => 5 });
    expect(scoreCourt(court(['a', 'b'], ['c', 'd']), 'rule_1_similar', flat)).toBe(
      2 * WEIGHTS.UNPLAYED_PAIR_BONUS,
    );
  });
});

describe('scoreCourt, rule 2', () => {
  it('charges the shortfall below RULE2_TARGET_GAP and the imbalance between teams', () => {
    // a(9)+e(2) is a gap of 7, no shortfall, sum 11.
    // b(7)+c(5) is a gap of 2, one point short, sum 12.
    // Imbalance 1.
    const score = scoreCourt(court(['a', 'e'], ['b', 'c']), 'rule_2_mixed', context());
    expect(score).toBe(
      1 * WEIGHTS.RULE2_TEAM_GAP_SHORTFALL +
        1 * WEIGHTS.RULE2_TEAM_IMBALANCE +
        2 * WEIGHTS.UNPLAYED_PAIR_BONUS,
    );
  });

  it('charges nothing extra once both teams are at or beyond the target gap', () => {
    // a(9)+d(3) and b(7)+c(5): gaps 6 and 2... c is one short, so use f(1).
    const score = scoreCourt(court(['a', 'd'], ['b', 'f']), 'rule_2_mixed', context());
    const imbalance = Math.abs(9 + 3 - (7 + 1));
    expect(score).toBe(imbalance * WEIGHTS.RULE2_TEAM_IMBALANCE + 2 * WEIGHTS.UNPLAYED_PAIR_BONUS);
  });

  it('skips the gap term on a singles court, which has no intra-team gap', () => {
    const score = scoreCourt(court(['a'], ['e']), 'rule_2_mixed', context());
    expect(score).toBe(Math.abs(9 - 2) * WEIGHTS.RULE2_TEAM_IMBALANCE);
  });
});

describe('repeat penalties', () => {
  it('charges PARTNER_REPEAT once per previous outing together', () => {
    // Flat tiers, so nothing but the history moves the score.
    const flat = { tierOf: () => 5 };
    const repeated = court(['a', 'd'], ['b', 'c']);

    expect(scoreCourt(repeated, 'rule_1_similar', context(flat))).toBe(
      2 * WEIGHTS.UNPLAYED_PAIR_BONUS,
    );

    const history = new PairHistory();
    history.record([repeated]);
    expect(scoreCourt(repeated, 'rule_1_similar', context({ ...flat, history }))).toBe(
      // Two partnerships seen once each, and four oppositions seen once each.
      2 * WEIGHTS.PARTNER_REPEAT + 4 * WEIGHTS.OPPONENT_REPEAT,
    );
  });

  it('charges a second repeat twice over', () => {
    const flat = { tierOf: () => 5 };
    const together = court(['a', 'd'], ['b', 'c']);
    const history = new PairHistory();
    history.record([together]);
    history.record([together]);

    expect(scoreCourt(together, 'rule_1_similar', context({ ...flat, history }))).toBe(
      2 * (2 * WEIGHTS.PARTNER_REPEAT) + 4 * (2 * WEIGHTS.OPPONENT_REPEAT),
    );
  });

  it('charges OPPONENT_REPEAT per previous meeting across the net', () => {
    const history = new PairHistory();
    history.record([court(['a', 'd'], ['b', 'c'])]);
    expect(history.opponentCount('a', 'b')).toBe(1);
    expect(history.opponentCount('a', 'd')).toBe(0);
    expect(history.partnerCount('a', 'd')).toBe(1);
  });

  it('drops the partner weight to 8 on an extended session, per D64', () => {
    expect(partnerRepeatWeight('standard')).toBe(WEIGHTS.PARTNER_REPEAT);
    expect(partnerRepeatWeight('extended')).toBe(PARTNER_REPEAT_EXTENDED);
  });
});

describe('countViolations, 13.4', () => {
  const playing = new Set(['a', 'b', 'c', 'd']);

  it('counts a never_pair sharing a team', () => {
    const constraints = buildConstraints(
      [],
      [{ kind: 'never_pair', bookingIdA: 'a', bookingIdB: 'd' }],
    );
    expect(countViolations([court(['a', 'd'], ['b', 'c'])], constraints, playing)).toBe(1);
    expect(countViolations([court(['a', 'b'], ['c', 'd'])], constraints, playing)).toBe(0);
  });

  it('counts an always_pair split across teams', () => {
    const constraints = buildConstraints(
      [],
      [{ kind: 'always_pair', bookingIdA: 'a', bookingIdB: 'b' }],
    );
    expect(countViolations([court(['a', 'd'], ['b', 'c'])], constraints, playing)).toBe(1);
    expect(countViolations([court(['a', 'b'], ['c', 'd'])], constraints, playing)).toBe(0);
  });

  it('does not count an always_pair when one of the two is resting', () => {
    const constraints = buildConstraints(
      [],
      [{ kind: 'always_pair', bookingIdA: 'a', bookingIdB: 'z' }],
    );
    expect(countViolations([court(['a', 'd'], ['b', 'c'])], constraints, playing)).toBe(0);
  });

  it('ignores a second always_pair rule that would chain three players', () => {
    const constraints = buildConstraints(
      [],
      [
        { kind: 'always_pair', bookingIdA: 'a', bookingIdB: 'b' },
        { kind: 'always_pair', bookingIdA: 'b', bookingIdB: 'c' },
      ],
    );
    expect(constraints.alwaysPartner.get('c')).toBeUndefined();
  });
});

describe('sitOutPenalty', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('is zero when everybody has rested the same number of times', () => {
    const counts = new Map(ids.map((id) => [id, 1]));
    expect(sitOutPenalty([], counts, ids)).toBe(0);
  });

  it('charges SITOUT_UNFAIRNESS for every rest above the luckiest player', () => {
    const counts = new Map<string, number>([
      ['a', 2],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ]);
    expect(sitOutPenalty([], counts, ids)).toBe(2 * WEIGHTS.SITOUT_UNFAIRNESS);
    // Resting 'a' again makes it worse; resting 'b' evens things up.
    expect(sitOutPenalty(['a'], counts, ids)).toBe(3 * WEIGHTS.SITOUT_UNFAIRNESS);
    expect(sitOutPenalty(['b'], counts, ids)).toBe(3 * WEIGHTS.SITOUT_UNFAIRNESS);
  });
});
