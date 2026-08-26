/**
 * The seeded RNG. Its only job is to be reproducible, which is what makes
 * 19.2's fixtures assertions rather than coin flips.
 */
import { seededRandom, sortByTierDescending } from '../rng';

describe('seededRandom', () => {
  it('gives the same stream for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const draws = Array.from({ length: 20 }, () => a.next());
    expect(draws).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('gives a different stream for a different seed', () => {
    const a = Array.from({ length: 10 }, seededRandom(1).next);
    const b = Array.from({ length: 10 }, seededRandom(2).next);
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws integers inside the range and tolerates an empty one', () => {
    const rng = seededRandom(9);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.int(5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
    expect(rng.int(0)).toBe(0);
  });

  it('shuffles without losing or duplicating anything, and without mutating', () => {
    const source = ['a', 'b', 'c', 'd', 'e', 'f'];
    const shuffled = seededRandom(11).shuffle(source);
    expect(shuffled).not.toBe(source);
    expect(source).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect([...shuffled].sort()).toEqual([...source].sort());
  });

  it('handles a negative or fractional seed', () => {
    expect(() => seededRandom(-1).next()).not.toThrow();
    expect(() => seededRandom(1.5).next()).not.toThrow();
  });
});

describe('sortByTierDescending', () => {
  const tierOf = (id: string): number => Number(id.charAt(0));

  it('puts the strongest first', () => {
    const sorted = sortByTierDescending(['1a', '9a', '5a'], tierOf, seededRandom(3));
    expect(sorted.map(tierOf)).toEqual([9, 5, 1]);
  });

  it('varies the order of equal tiers with the seed, which is D63', () => {
    const equals = ['5a', '5b', '5c', '5d', '5e', '5f', '5g', '5h'];
    const orders = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        sortByTierDescending(equals, tierOf, seededRandom(seed)).join(''),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
