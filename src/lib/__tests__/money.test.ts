import { bankersRound, fils, formatMoney, splitEvenly, toJD, type Fils } from '../money';

describe('fils', () => {
  it('converts the prices from the decisions register', () => {
    expect(fils(6)).toBe(6000); // standard session, D5
    expect(fils(8)).toBe(8000); // extended session, D5
    expect(fils(1.25)).toBe(1250); // standard water, D75
    expect(fils(2.5)).toBe(2500); // extended water, D75
    expect(fils(10)).toBe(10000); // assistant coach day rate, D76
  });

  it('converts the values tabulated in section 5.3', () => {
    expect(fils(47.5)).toBe(47500);
    expect(fils(23.75)).toBe(23750);
  });

  it('handles zero, which is a valid custom rate', () => {
    expect(fils(0)).toBe(0);
  });

  it('handles negative amounts, used by balance settlements', () => {
    expect(fils(-6)).toBe(-6000);
  });

  it('does not accumulate float error', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in fils it is exactly 300.
    expect(fils(0.1) + fils(0.2)).toBe(300);
  });

  it('rejects values that are not finite', () => {
    expect(() => fils(Number.NaN)).toThrow();
    expect(() => fils(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('toJD', () => {
  it('round-trips through fils', () => {
    expect(toJD(fils(6))).toBe(6);
    expect(toJD(fils(4.167))).toBe(4.167);
    expect(toJD(fils(0))).toBe(0);
  });
});

describe('bankersRound', () => {
  it('rounds halves to the even neighbour', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds non-halves normally', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
    expect(bankersRound(-1.4)).toBe(-1);
    expect(bankersRound(-1.6)).toBe(-2);
  });

  it('produces 4167 for a 30-visit, 125 JD credit', () => {
    // Section 5.3: "4.166 JD (a 30/125 credit) -> 4167 with banker's rounding
    // at the point of report aggregation".
    expect(bankersRound(125000 / 30)).toBe(4167);
  });
});

describe('formatMoney', () => {
  it('always shows three decimal places', () => {
    expect(formatMoney(fils(6), 'en')).toBe('6.000 JD');
    expect(formatMoney(fils(1.25), 'en')).toBe('1.250 JD');
    expect(formatMoney(fils(47.5), 'en')).toBe('47.500 JD');
    expect(formatMoney(fils(0), 'en')).toBe('0.000 JD');
  });

  it('pads fils to three digits rather than truncating', () => {
    expect(formatMoney(5 as Fils, 'en')).toBe('0.005 JD');
    expect(formatMoney(50 as Fils, 'en')).toBe('0.050 JD');
    expect(formatMoney(4167 as Fils, 'en')).toBe('4.167 JD');
  });

  it('uses the Arabic currency suffix with Western digits', () => {
    // BUILD-SPEC 16.1: Western Arabic numerals in both languages, explicitly
    // including money. See CONFLICTS FOUND in BUILD-SPEC.md.
    expect(formatMoney(fils(6), 'ar')).toBe('6.000 د.أ');
    expect(formatMoney(fils(8), 'ar')).toBe('8.000 د.أ');
  });

  it('formats negative amounts for balance settlements', () => {
    expect(formatMoney(fils(-2), 'en')).toBe('-2.000 JD');
    expect(formatMoney(fils(-0.5), 'ar')).toBe('-0.500 د.أ');
  });
});

describe('splitEvenly', () => {
  it('splits a night cost cleanly across two sessions', () => {
    expect(splitEvenly(fils(47.5), 2)).toEqual([23750, 23750]);
  });

  it('gives the remainder to the earliest session', () => {
    // Section 5.3, stated verbatim.
    expect(splitEvenly(fils(47.5), 3)).toEqual([15834, 15833, 15833]);
  });

  it('always reconciles back to the total exactly', () => {
    for (const total of [47500, 60000, 50000, 30000, 35000, 22500, 10000, 1]) {
      for (const parts of [1, 2, 3, 4, 5, 6, 7]) {
        const shares = splitEvenly(total as Fils, parts);
        expect(shares).toHaveLength(parts);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      }
    }
  });

  it('handles a single part', () => {
    expect(splitEvenly(fils(60), 1)).toEqual([60000]);
  });

  it('handles a zero total', () => {
    expect(splitEvenly(fils(0), 3)).toEqual([0, 0, 0]);
  });

  it('rejects a part count below one', () => {
    expect(() => splitEvenly(fils(47.5), 0)).toThrow();
    expect(() => splitEvenly(fils(47.5), -1)).toThrow();
    expect(() => splitEvenly(fils(47.5), 1.5)).toThrow();
  });
});

describe('the Khalda and Shmeisani cost fixtures', () => {
  it('reproduces the break-even table in section 12.4', () => {
    // Khalda Saturday: 60 JD night across two sessions, plus 1.25 JD water.
    const khaldaSaturday = splitEvenly(fils(60), 2);
    expect(formatMoney((khaldaSaturday[0]! + fils(1.25)) as Fils, 'en')).toBe('31.250 JD');

    // Khalda Monday extended: whole 50 JD night on one session, 2.5 JD water.
    const khaldaMonday = splitEvenly(fils(50), 1);
    expect(formatMoney((khaldaMonday[0]! + fils(2.5)) as Fils, 'en')).toBe('52.500 JD');

    // Shmeisani Sunday: 47.5 JD across two, plus 1.25 JD water.
    const shmeisaniSunday = splitEvenly(fils(47.5), 2);
    expect(formatMoney((shmeisaniSunday[0]! + fils(1.25)) as Fils, 'en')).toBe('25.000 JD');

    // Shmeisani Friday: a single 22.5 JD session, plus 1.25 JD water.
    const shmeisaniFriday = splitEvenly(fils(22.5), 1);
    expect(formatMoney((shmeisaniFriday[0]! + fils(1.25)) as Fils, 'en')).toBe('23.750 JD');
  });
});
