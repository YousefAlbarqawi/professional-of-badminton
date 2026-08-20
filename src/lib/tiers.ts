/**
 * Tiers. Nine values, A+ strongest down to C- weakest. Never called "rank" or
 * "grade". BUILD-SPEC 1.3 and D58.
 *
 * The order below is weakest first, matching the Postgres enum declaration in
 * section 6.1, so that comparisons mean the same thing on both sides of the
 * wire. The numeric map is 1 (C-) through 9 (A+), which is what the
 * matchmaking engine scores against.
 */

/** Weakest first. Mirrors the `tier` enum in Postgres. */
export const TIERS = ['C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'] as const;

export type Tier = (typeof TIERS)[number];

/** 'A' | 'B' | 'C'. Drives the badge colour band in BUILD-SPEC 17.2. */
export type TierFamily = 'A' | 'B' | 'C';

/**
 * A player with no tier assigned is treated as B by the engine, and marked
 * visually so the coach notices. Assumption A11 and BUILD-SPEC 13.1.
 */
export const UNRATED_TIER_VALUE = 5;

const TIER_TO_VALUE: Readonly<Record<Tier, number>> = Object.freeze(
  Object.fromEntries(TIERS.map((tier, index) => [tier, index + 1])) as Record<Tier, number>,
);

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** C- is 1, B is 5, A+ is 9. */
export function tierToValue(tier: Tier): number {
  return TIER_TO_VALUE[tier];
}

/**
 * The tier for a numeric value. Throws on anything outside 1-9, because a
 * value out of range means the caller has a bug, not a missing tier.
 */
export function valueToTier(value: number): Tier {
  const tier = TIERS[value - 1];
  if (tier === undefined) {
    throw new Error(`valueToTier() expects 1-9, received ${String(value)}`);
  }
  return tier;
}

/**
 * The engine's view of a player's strength. An unrated player counts as B.
 * A11.
 */
export function tierValueOrDefault(tier: Tier | null | undefined): number {
  return tier == null ? UNRATED_TIER_VALUE : tierToValue(tier);
}

/** The letter family, for badge colours. BUILD-SPEC 17.2. */
export function tierFamily(tier: Tier): TierFamily {
  return tier.charAt(0) as TierFamily;
}

/**
 * Comparator, weakest first. `TIERS.slice().sort(compareTiers)` yields
 * C- through A+; reverse it for strongest first, which is what the attendee
 * grid and the seeding step both want.
 */
export function compareTiers(a: Tier, b: Tier): number {
  return tierToValue(a) - tierToValue(b);
}

/** Strongest first. */
export function compareTiersDescending(a: Tier, b: Tier): number {
  return tierToValue(b) - tierToValue(a);
}

/** The i18n key for a tier label, e.g. 'A+' -> 'tiers.aPlus'. */
export function tierLabelKey(tier: Tier): string {
  const letter = tier.charAt(0).toLowerCase();
  if (tier.endsWith('+')) return `tiers.${letter}Plus`;
  if (tier.endsWith('-')) return `tiers.${letter}Minus`;
  return `tiers.${letter}`;
}
