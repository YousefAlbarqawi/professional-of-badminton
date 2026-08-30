/**
 * The six Arabic plural forms must actually be *selected* at runtime, not
 * merely present in the deck. `keyParity` proves they exist; this proves the
 * runtime reaches them. BUILD-SPEC 16.1.
 *
 * The bug this guards against is invisible in two of the three places it could
 * be caught. Hermes ships an `Intl.PluralRules` with no Arabic data, so
 * i18next falls back to English one/other rules and a three day old
 * announcement renders "قبل 3 يوم" instead of "قبل 3 أيام". Node carries full
 * ICU, so Jest cannot see it; iOS takes ICU from the system, so an iPhone
 * cannot either. Only an Android device shows it.
 *
 * That is also why the first assertion checks for the polyfill rather than
 * only checking the categories: on this runtime the categories resolve
 * correctly with or without it, so a test that only read them would keep
 * passing if the import in `src/i18n/index.ts` were ever dropped.
 */
import i18next from 'i18next';

import '..';
import ar from '../ar.json';

/**
 * `__addLocaleData` is how @formatjs feeds its locale decks in, so its presence
 * on the constructor means the polyfill — not the engine's own implementation —
 * is the one answering. It is the only marker this version exposes.
 */
type PolyfilledCtor = typeof Intl.PluralRules & { __addLocaleData?: unknown };

describe('Arabic plural selection', () => {
  it('has the @formatjs polyfill installed by the i18n module', () => {
    expect(typeof (Intl.PluralRules as PolyfilledCtor).__addLocaleData).toBe('function');
  });

  it('carries all six Arabic categories', () => {
    expect([...new Intl.PluralRules('ar').resolvedOptions().pluralCategories].sort()).toEqual([
      'few',
      'many',
      'one',
      'other',
      'two',
      'zero',
    ]);
  });

  it.each([
    [0, 'zero'],
    [1, 'one'],
    [2, 'two'],
    [3, 'few'],
    [10, 'few'],
    [11, 'many'],
    [25, 'many'],
  ])('puts %i in the %s category', (count, category) => {
    expect(new Intl.PluralRules('ar').select(count)).toBe(category);
  });
});

describe('Arabic counted strings', () => {
  // eslint-disable-next-line import/no-named-as-default-member -- i18next.createInstance is the instance method, not the named export of the same name.
  const instance = i18next.createInstance();

  beforeAll(async () => {
    await instance.init({
      lng: 'ar',
      resources: { ar: { translation: ar } },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  });

  it.each([
    [0, 'اليوم'],
    [1, 'أمس'],
    [2, 'قبل يومين'],
    [3, 'قبل 3 أيام'],
    [10, 'قبل 10 أيام'],
    [11, 'قبل 11 يومًا'],
  ])('renders %i days ago as %s', (count, expected) => {
    expect(instance.t('announcements.daysAgo', { count })).toBe(expected);
  });

  it.each([
    [2, 'قبل ساعتين'],
    [3, 'قبل 3 ساعات'],
    [11, 'قبل 11 ساعة'],
  ])('renders %i hours ago as %s', (count, expected) => {
    expect(instance.t('announcements.hoursAgo', { count })).toBe(expected);
  });

  it.each([
    [2, 'جلستان'],
    [3, '3 جلسات'],
    [11, '11 جلسةً'],
  ])('renders %i sessions that day as %s', (count, expected) => {
    expect(instance.t('schedule.sessionsThatDay', { count })).toBe(expected);
  });
});
