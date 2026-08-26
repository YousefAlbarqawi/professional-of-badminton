/**
 * The add-guest form. BUILD-SPEC 15.2, D44, D45.
 */
import { addGuestSchema, isSearchable, MIN_SEARCH_LENGTH } from '../schemas';

function form(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return { guestName: 'Sami', guestTier: 'B', isFree: false, amountJD: '6', ...overrides };
}

describe('addGuestSchema', () => {
  it('accepts a name, a tier and an amount', () => {
    expect(addGuestSchema.safeParse(form()).success).toBe(true);
  });

  it('refuses a blank name', () => {
    const result = addGuestSchema.safeParse(form({ guestName: '   ' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.guestNameRequired');
  });

  it('refuses a name over fifty characters, as the column does', () => {
    expect(addGuestSchema.safeParse(form({ guestName: 'x'.repeat(51) })).success).toBe(false);
  });

  it('refuses a tier outside the nine', () => {
    // D58: nine tiers exactly.
    expect(addGuestSchema.safeParse(form({ guestTier: 'S' })).success).toBe(false);
  });

  it('refuses an amount that is not money', () => {
    const result = addGuestSchema.safeParse(form({ amountJD: 'six' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.priceInvalid');
  });

  it('accepts the three decimal places Jordan quotes', () => {
    // 5.3: 1 JD = 1000 fils, quoted to three places.
    expect(addGuestSchema.safeParse(form({ amountJD: '4.167' })).success).toBe(true);
  });

  it('accepts zero, which is a real amount for a paid guest', () => {
    expect(addGuestSchema.safeParse(form({ amountJD: '0' })).success).toBe(true);
  });

  it('ignores the amount entirely when the guest is free', () => {
    // D45: free is zero, and what is in the field does not matter.
    expect(addGuestSchema.safeParse(form({ isFree: true, amountJD: 'nonsense' })).success).toBe(
      true,
    );
  });
});

describe('isSearchable', () => {
  it('needs two characters, the same floor the server enforces', () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('ab')).toBe(true);
    expect(isSearchable('  a  ')).toBe(false);
    expect(isSearchable('  ab  ')).toBe(true);
  });
});
