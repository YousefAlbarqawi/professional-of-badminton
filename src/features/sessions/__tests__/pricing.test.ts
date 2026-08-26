/**
 * `resolve_price` on the client. BUILD-SPEC 19.1 lists it by name.
 *
 * The rule is 8.2's, in three lines: an override for this session's type wins,
 * otherwise the session price. D41 makes zero a valid override, and A5 keeps
 * the standard and extended overrides independent.
 */
import type { Fils } from '@/lib/money';

import { resolvePrice } from '../pricing';

const SIX_JD = 6000 as Fils;
const EIGHT_JD = 8000 as Fils;
const FOUR_JD = 4000 as Fils;
const FREE = 0 as Fils;

describe('resolvePrice', () => {
  it('uses the session price when the player has no override', () => {
    const result = resolvePrice(
      { customRateStandardFils: null, customRateExtendedFils: null },
      'standard',
      SIX_JD,
    );

    expect(result).toEqual({ payableFils: SIX_JD, hasCustomRate: false });
  });

  it('uses the standard override on a standard session', () => {
    const result = resolvePrice(
      { customRateStandardFils: FOUR_JD, customRateExtendedFils: null },
      'standard',
      SIX_JD,
    );

    expect(result).toEqual({ payableFils: FOUR_JD, hasCustomRate: true });
  });

  it('does not carry a standard override onto an extended session', () => {
    // A5: "A player set to 4 JD on standard sessions is not automatically 4 JD
    // on the 8 JD Tuesday."
    const result = resolvePrice(
      { customRateStandardFils: FOUR_JD, customRateExtendedFils: null },
      'extended',
      EIGHT_JD,
    );

    expect(result).toEqual({ payableFils: EIGHT_JD, hasCustomRate: false });
  });

  it('uses the extended override on an extended session', () => {
    const result = resolvePrice(
      { customRateStandardFils: null, customRateExtendedFils: 5000 as Fils },
      'extended',
      EIGHT_JD,
    );

    expect(result).toEqual({ payableFils: 5000, hasCustomRate: true });
  });

  it('treats zero as a rate, not as an absent one', () => {
    // D41: "0 is valid and expected."
    const result = resolvePrice(
      { customRateStandardFils: FREE, customRateExtendedFils: null },
      'standard',
      SIX_JD,
    );

    expect(result).toEqual({ payableFils: 0, hasCustomRate: true });
  });

  it('falls back to the session price when the profile has not loaded', () => {
    expect(resolvePrice(undefined, 'standard', SIX_JD)).toEqual({
      payableFils: SIX_JD,
      hasCustomRate: false,
    });
  });
});
