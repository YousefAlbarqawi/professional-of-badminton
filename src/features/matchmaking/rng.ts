/**
 * A seeded pseudo-random generator, so that every lineup is reproducible.
 *
 * BUILD-SPEC 13.1 puts `seed` on the input and 19.2 requires every fixture to
 * run with a fixed one. `Math.random` would make the fixture suite flap, and
 * would also mean the coach could not be shown the same board twice.
 *
 * The algorithm is mulberry32: thirty-two bits of state, one multiply and two
 * shifts per draw, and a period long enough for a few thousand draws per
 * session. Nothing here is cryptographic and nothing here needs to be.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). Returns 0 when the range is empty. */
  int(maxExclusive: number): number;
  /** A new array, Fisher-Yates shuffled. The input is left alone. */
  shuffle<T>(items: readonly T[]): T[];
}

export function seededRandom(seed: number): Rng {
  // Any 32-bit seed works; the >>> 0 keeps a negative or fractional seed from
  // poisoning the state.
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 0) return 0;
    return Math.floor(next() * maxExclusive);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      const a = out[i];
      const b = out[j];
      // noUncheckedIndexedAccess: both indices are in range by construction,
      // and the guard costs nothing next to the readability of not casting.
      if (a !== undefined && b !== undefined) {
        out[i] = b;
        out[j] = a;
      }
    }
    return out;
  };

  return { next, int, shuffle };
}

/**
 * Sort strongest first, with ties broken by the seeded RNG rather than by
 * array order.
 *
 * This is where D63 lives. When a tier band does not divide into fours, the
 * players either side of a court boundary have the same tier, so shuffling
 * equals before the sort is exactly "the leftover player is pushed up or down
 * at random", and reseeding per rotation is what varies the direction across
 * rotations.
 */
export function sortByTierDescending<T>(
  items: readonly T[],
  tierOf: (item: T) => number,
  rng: Rng,
): T[] {
  return rng.shuffle(items).sort((a, b) => tierOf(b) - tierOf(a));
}
