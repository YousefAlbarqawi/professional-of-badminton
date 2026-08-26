/**
 * What this player pays for this session.
 *
 * The client-side twin of `resolve_price` in BUILD-SPEC 8.2. It exists so the
 * schedule can show the right number (14.6: "Price, or the player's custom
 * rate when one is set") without a round trip, and it is never the authority:
 * `create_booking` resolves the price again in Postgres and snapshots the
 * result onto the booking.
 *
 * D41: zero is a valid custom rate and an expected one. A5: the standard and
 * extended overrides are independent, so a player on 4 JD for the 6 JD
 * Saturday is not automatically on 4 JD for the 8 JD Tuesday.
 */
import type { Fils } from '@/lib/money';

import type { MyBookingProfile, SessionType } from './types';

export interface ResolvedPrice {
  payableFils: Fils;
  /** True when an override applied, so the UI can tell them apart if it needs to. */
  hasCustomRate: boolean;
}

export function resolvePrice(
  profile: Pick<MyBookingProfile, 'customRateStandardFils' | 'customRateExtendedFils'> | undefined,
  sessionType: SessionType,
  sessionPriceFils: Fils,
): ResolvedPrice {
  const override =
    sessionType === 'standard'
      ? (profile?.customRateStandardFils ?? null)
      : (profile?.customRateExtendedFils ?? null);

  // `null` means no override. Zero is an override, and a deliberate one.
  if (override === null) {
    return { payableFils: sessionPriceFils, hasCustomRate: false };
  }

  return { payableFils: override, hasCustomRate: true };
}
