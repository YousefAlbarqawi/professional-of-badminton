/**
 * `en.json` and `ar.json` must always have identical key sets. BUILD-SPEC 16.3
 * requires CI to fail when they diverge; this is how that happens, since
 * `npm test` runs in CI.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, deviceDefaultLocale, isLocale, isRTLLocale } from '..';
import ar from '../ar.json';
import en from '../en.json';

type Json = { [key: string]: Json | string };

function flatten(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof child === 'string' ? [path] : flatten(child, path);
  });
}

const enKeys = flatten(en as Json).sort();
const arKeys = flatten(ar as Json).sort();

describe('string deck parity', () => {
  it('has the same keys in both files', () => {
    expect(arKeys).toEqual(enKeys);
  });

  it('lists any key missing from Arabic', () => {
    expect(enKeys.filter((key) => !arKeys.includes(key))).toEqual([]);
  });

  it('lists any key missing from English', () => {
    expect(arKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it('has no empty strings', () => {
    for (const [locale, deck] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      const empties = flatten(deck as Json).filter((key) => {
        const value = key.split('.').reduce<Json | string>((node, part) => {
          return typeof node === 'string' ? node : (node[part] ?? '');
        }, deck as Json);
        return typeof value === 'string' && value.trim() === '';
      });
      expect({ locale, empties }).toEqual({ locale, empties: [] });
    }
  });
});

describe('interpolation', () => {
  it('uses the same placeholders in both languages', () => {
    const placeholders = (deck: Json, key: string): string[] => {
      const value = key.split('.').reduce<Json | string>((node, part) => {
        return typeof node === 'string' ? node : (node[part] ?? '');
      }, deck);
      if (typeof value !== 'string') return [];
      return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
    };

    for (const key of enKeys) {
      expect({ key, tokens: placeholders(ar as Json, key) }).toEqual({
        key,
        tokens: placeholders(en as Json, key),
      });
    }
  });
});

describe('numerals', () => {
  it('uses Western Arabic numerals in the Arabic deck', () => {
    // BUILD-SPEC 16.1: "Western Arabic numerals (0-9) in both languages…
    // it avoids mixed-numeral confusion in times and money."
    // See CONFLICTS FOUND in BUILD-SPEC.md.
    const arabicIndicDigits = /[٠-٩]/;
    const offenders = flatten(ar as Json).filter((key) => {
      const value = key.split('.').reduce<Json | string>((node, part) => {
        return typeof node === 'string' ? node : (node[part] ?? '');
      }, ar as Json);
      return typeof value === 'string' && arabicIndicDigits.test(value);
    });
    expect(offenders).toEqual([]);
  });
});

describe('Arabic plurals', () => {
  const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

  /**
   * Every base key that carries at least one plural suffix, in either deck.
   * A counted string is discovered rather than listed, so adding one to the
   * deck brings it under this rule automatically — which is the point. The
   * previous version of this suite named `schedule.spotsLeft` alone, and five
   * families shipped with only English's two forms in Arabic as a result.
   */
  const pluralFamilies = (): string[] => {
    const bases = new Set<string>();
    for (const key of [...enKeys, ...arKeys]) {
      for (const form of FORMS) {
        if (key.endsWith(`_${form}`)) bases.add(key.slice(0, -form.length - 1));
      }
    }
    return [...bases].sort();
  };

  it('finds the counted strings', () => {
    // A guard on the guard: if the decks ever stop using suffixes, the loops
    // below would pass by having nothing to check.
    expect(pluralFamilies().length).toBeGreaterThan(0);
  });

  it.each(pluralFamilies())('carries all six forms for %s', (base) => {
    // Arabic has six plural forms and section 16.1 forbids faking it with an
    // `if`. i18next resolves these through Intl.PluralRules and falls back to
    // `_other` when a form is absent, so a missing `_two` is not an error at
    // runtime — it is silently wrong Arabic. Hence a test.
    for (const form of FORMS) {
      expect({ deck: 'ar', key: `${base}_${form}` }).toEqual({
        deck: 'ar',
        key: arKeys.find((key) => key === `${base}_${form}`),
      });
      expect({ deck: 'en', key: `${base}_${form}` }).toEqual({
        deck: 'en',
        key: enKeys.find((key) => key === `${base}_${form}`),
      });
    }
  });

  it.each(pluralFamilies())('has no unsuffixed fallback for %s', (base) => {
    // i18next's candidate list ends with the bare key. One left in the deck
    // would mask a missing form rather than letting this suite see it.
    expect(enKeys).not.toContain(base);
    expect(arKeys).not.toContain(base);
  });
});

describe('locale resolution', () => {
  it('defaults a new install to Arabic', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
  });

  it('supports exactly Arabic and English', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(['ar', 'en']);
  });

  it('recognises supported locales only', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('treats Arabic as right to left and English as left to right', () => {
    expect(isRTLLocale('ar')).toBe(true);
    expect(isRTLLocale('en')).toBe(false);
  });

  it('uses the device locale only as a tiebreak when it is English', () => {
    // jest.setup.ts mocks the device as English.
    expect(deviceDefaultLocale()).toBe('en');
  });
});
