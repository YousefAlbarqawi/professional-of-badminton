/**
 * Money. All money in this app is an integer count of fils. 1 JD = 1000 fils.
 * Jordan quotes three decimal places. BUILD-SPEC section 5.3.
 *
 * Floats never touch money. The branded `Fils` type makes an accidental raw
 * number a compile error at every boundary that matters.
 */

export type Fils = number & { readonly __brand: 'Fils' };

const FILS_PER_JD = 1000;

/** Currency suffix per locale. Western digits in both. BUILD-SPEC 16.1. */
const CURRENCY_SUFFIX = { en: 'JD', ar: 'د.أ' } as const;

export type Locale = keyof typeof CURRENCY_SUFFIX;

/**
 * Round half to even ("banker's rounding"). Used at the point of report
 * aggregation so that repeated halves do not drift upward. BUILD-SPEC 5.3.
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  // Exactly .5 — round to the even neighbour.
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Convert Jordanian dinars to fils. Accepts the three decimal places Jordan
 * quotes; anything finer is rounded half-to-even rather than truncated.
 */
export function fils(jd: number): Fils {
  if (!Number.isFinite(jd)) {
    throw new Error(`fils() requires a finite number, received ${String(jd)}`);
  }
  return bankersRound(jd * FILS_PER_JD) as Fils;
}

/** Convert fils back to dinars. Display only — never arithmetic. */
export function toJD(f: Fils): number {
  return f / FILS_PER_JD;
}

/**
 * Format for display: "6.000 JD" / "6.000 د.أ".
 *
 * Digits are Western (0-9) in both languages, per BUILD-SPEC 16.1, which
 * states the rule explicitly for times and money. Section 5.3 shows an
 * Arabic-Indic example in a code comment; see "CONFLICTS FOUND" at the end of
 * BUILD-SPEC.md.
 */
export function formatMoney(f: Fils, locale: Locale): string {
  const negative = f < 0;
  const absolute = Math.abs(f);
  const whole = Math.trunc(absolute / FILS_PER_JD);
  const remainder = absolute % FILS_PER_JD;
  const sign = negative ? '-' : '';

  return `${sign}${whole}.${String(remainder).padStart(3, '0')} ${CURRENCY_SUFFIX[locale]}`;
}

/**
 * Split a total across N parts so the parts always sum back to the total
 * exactly. The remainder goes to the earliest part, which is what makes a
 * night's court cost reconcile across its sessions. BUILD-SPEC 5.3 and 12.1.
 *
 * 47500 across 2 -> [23750, 23750]
 * 47500 across 3 -> [15834, 15833, 15833]
 */
export function splitEvenly(total: Fils, parts: number): Fils[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error(`splitEvenly() requires at least one part, received ${String(parts)}`);
  }

  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;

  return Array.from({ length: parts }, (_, index) =>
    index === 0 ? ((base + remainder) as Fils) : (base as Fils),
  );
}
