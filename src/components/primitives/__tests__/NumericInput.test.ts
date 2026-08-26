/**
 * The money field's normalisation. BUILD-SPEC 5.3 and 16.1.
 *
 * 5.3: money is never a float, so the field holds a string and the conversion
 * happens once at the form's edge. What this has to guarantee is that the
 * string it holds is one `fils()` can convert without surprises.
 */
import { normaliseAmount } from '../NumericInput';

describe('what the field accepts', () => {
  it('keeps a plain dinar amount', () => {
    expect(normaliseAmount('6', false)).toBe('6');
    expect(normaliseAmount('6.500', false)).toBe('6.500');
  });

  it('stops at three decimal places, which is what Jordan quotes', () => {
    expect(normaliseAmount('4.16666', false)).toBe('4.166');
  });

  it('allows only one decimal point', () => {
    expect(normaliseAmount('6.5.2', false)).toBe('6.52');
  });

  it('drops a leading decimal point, which fils() could not read', () => {
    expect(normaliseAmount('.5', false)).toBe('5');
  });

  it('strips anything that is not part of an amount', () => {
    expect(normaliseAmount('6 JD', false)).toBe('6');
    expect(normaliseAmount('abc', false)).toBe('');
  });
});

describe('Arabic input', () => {
  it('folds Arabic-Indic digits to Western ones', () => {
    // 16.1 keeps digits Western in both languages, so a coach typing ٦ on an
    // Arabic keyboard means 6 and gets 6, rather than an empty field.
    expect(normaliseAmount('٦', false)).toBe('6');
    expect(normaliseAmount('١٢٣', false)).toBe('123');
  });

  it('folds the Arabic decimal separator', () => {
    expect(normaliseAmount('٦٫٥', false)).toBe('6.5');
  });
});

describe('the sign', () => {
  it('refuses a minus on a payment amount', () => {
    expect(normaliseAmount('-6', false)).toBe('6');
  });

  it('allows a leading minus on a balance entry, and only leading', () => {
    // 10.3: "positive to add debt, negative to record a settlement".
    expect(normaliseAmount('-6', true)).toBe('-6');
    expect(normaliseAmount('6-5', true)).toBe('65');
  });
});
