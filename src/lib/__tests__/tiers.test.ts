import {
  TIERS,
  UNRATED_TIER_VALUE,
  compareTiers,
  compareTiersDescending,
  isTier,
  tierFamily,
  tierLabelKey,
  tierToValue,
  tierValueOrDefault,
  valueToTier,
  type Tier,
} from '../tiers';

describe('TIERS', () => {
  it('has exactly nine values', () => {
    // D58: nine tiers exactly, A+ down to C-.
    expect(TIERS).toHaveLength(9);
  });

  it('is declared weakest first, matching the Postgres enum', () => {
    // Section 6.1: the enum is weakest first so that 'A+'::tier > 'B'::tier.
    expect(TIERS).toEqual(['C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+']);
  });

  it('contains no duplicates', () => {
    expect(new Set(TIERS).size).toBe(TIERS.length);
  });
});

describe('tierToValue', () => {
  it('maps C- to 1 and A+ to 9', () => {
    expect(tierToValue('C-')).toBe(1);
    expect(tierToValue('A+')).toBe(9);
  });

  it('maps B to the middle', () => {
    expect(tierToValue('B')).toBe(5);
  });

  it('increases monotonically with strength', () => {
    const values = TIERS.map(tierToValue);
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('agrees with the Postgres comparison it mirrors', () => {
    // 'A+'::tier > 'B'::tier must hold on the client too.
    expect(tierToValue('A+')).toBeGreaterThan(tierToValue('B'));
    expect(tierToValue('C-')).toBeLessThan(tierToValue('C'));
  });
});

describe('valueToTier', () => {
  it('inverts tierToValue for every tier', () => {
    for (const tier of TIERS) {
      expect(valueToTier(tierToValue(tier))).toBe(tier);
    }
  });

  it('rejects values outside 1 to 9', () => {
    expect(() => valueToTier(0)).toThrow();
    expect(() => valueToTier(10)).toThrow();
    expect(() => valueToTier(-1)).toThrow();
  });
});

describe('tierValueOrDefault', () => {
  it('treats an unrated player as B', () => {
    // A11 and section 13.1: a player with no tier defaults to 5 for the engine.
    expect(UNRATED_TIER_VALUE).toBe(5);
    expect(tierValueOrDefault(null)).toBe(5);
    expect(tierValueOrDefault(undefined)).toBe(5);
    expect(tierValueOrDefault(null)).toBe(tierToValue('B'));
  });

  it('uses the real tier when there is one', () => {
    expect(tierValueOrDefault('A+')).toBe(9);
  });
});

describe('tierFamily', () => {
  it('groups by letter for the badge colour bands', () => {
    // Section 17.2.
    expect(['A+', 'A', 'A-'].map((tier) => tierFamily(tier as Tier))).toEqual(['A', 'A', 'A']);
    expect(['B+', 'B', 'B-'].map((tier) => tierFamily(tier as Tier))).toEqual(['B', 'B', 'B']);
    expect(['C+', 'C', 'C-'].map((tier) => tierFamily(tier as Tier))).toEqual(['C', 'C', 'C']);
  });

  it('covers every tier with exactly three families', () => {
    expect(new Set(TIERS.map(tierFamily))).toEqual(new Set(['A', 'B', 'C']));
  });
});

describe('isTier', () => {
  it('accepts every real tier', () => {
    for (const tier of TIERS) {
      expect(isTier(tier)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isTier('D')).toBe(false);
    expect(isTier('a+')).toBe(false); // case matters
    expect(isTier('')).toBe(false);
    expect(isTier(null)).toBe(false);
    expect(isTier(5)).toBe(false);
    expect(isTier(undefined)).toBe(false);
  });
});

describe('sorting', () => {
  it('sorts weakest first by default', () => {
    const shuffled: Tier[] = ['B', 'A+', 'C-', 'A-', 'B+'];
    expect([...shuffled].sort(compareTiers)).toEqual(['C-', 'B', 'B+', 'A-', 'A+']);
  });

  it('sorts strongest first when descending', () => {
    // The attendee grid at visibility level 1 is sorted strongest first,
    // and so is the seeding step of the matchmaking engine.
    const shuffled: Tier[] = ['B', 'A+', 'C-', 'A-', 'B+'];
    expect([...shuffled].sort(compareTiersDescending)).toEqual(['A+', 'A-', 'B+', 'B', 'C-']);
  });

  it('treats equal tiers as equal', () => {
    expect(compareTiers('B', 'B')).toBe(0);
    expect(compareTiersDescending('B', 'B')).toBe(0);
  });
});

describe('tierLabelKey', () => {
  it('maps to the i18n keys in the tiers namespace', () => {
    expect(tierLabelKey('A+')).toBe('tiers.aPlus');
    expect(tierLabelKey('A')).toBe('tiers.a');
    expect(tierLabelKey('A-')).toBe('tiers.aMinus');
    expect(tierLabelKey('C-')).toBe('tiers.cMinus');
  });

  it('produces a distinct key for every tier', () => {
    expect(new Set(TIERS.map(tierLabelKey)).size).toBe(TIERS.length);
  });
});
