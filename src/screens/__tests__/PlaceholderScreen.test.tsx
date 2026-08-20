/**
 * Proves the Phase 0 "done when" criteria that a bundle check cannot: the
 * placeholder renders, it renders in both languages, and the money and time
 * helpers reach the screen formatted per locale.
 */
import { render, type RenderResult } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import i18n, { initI18n } from '@/i18n';
import { ThemeProvider } from '@/theme';

import { PlaceholderScreen } from '../PlaceholderScreen';

/** RNTL 14 on React 19 renders concurrently, so this resolves a promise. */
async function renderIn(locale: 'en' | 'ar'): Promise<RenderResult> {
  await i18n.changeLanguage(locale);
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <PlaceholderScreen />
      </ThemeProvider>
    </I18nextProvider>,
  );
}

describe('PlaceholderScreen', () => {
  beforeAll(async () => {
    await initI18n();
  });

  describe('in English', () => {
    it('renders the academy name', async () => {
      const screen = await renderIn('en');
      expect(screen.getByText('Professional of Badminton')).toBeTruthy();
    });

    it('renders English copy', async () => {
      const screen = await renderIn('en');
      expect(screen.getByText('Foundation ready')).toBeTruthy();
      expect(screen.getByText('Reserve a spot')).toBeTruthy();
    });

    it('formats money through money.ts', async () => {
      const screen = await renderIn('en');
      expect(screen.getByText(/6\.000 JD/)).toBeTruthy();
      expect(screen.getByText(/8\.000 JD/)).toBeTruthy();
    });

    it('formats the session time range through time.ts', async () => {
      const screen = await renderIn('en');
      expect(screen.getByText('7:00 PM – 8:30 PM')).toBeTruthy();
    });

    it('resolves the English plural for spots left', async () => {
      const screen = await renderIn('en');
      expect(screen.getByText(/8 spots left/)).toBeTruthy();
    });

    it('offers the switch to Arabic', async () => {
      const screen = await renderIn('en');
      expect(screen.getByTestId('language-switch')).toBeTruthy();
      expect(screen.getByText('العربية')).toBeTruthy();
    });
  });

  describe('in Arabic', () => {
    it('renders Arabic copy', async () => {
      const screen = await renderIn('ar');
      expect(screen.getByText('الأساس جاهز')).toBeTruthy();
      expect(screen.getByText('احجز مكانك')).toBeTruthy();
    });

    it('formats money with the Arabic currency suffix and Western digits', async () => {
      const screen = await renderIn('ar');
      expect(screen.getByText(/6\.000 د\.أ/)).toBeTruthy();
    });

    it('formats time with مساءً and a Levantine month name', async () => {
      const screen = await renderIn('ar');
      expect(screen.getByText('7:00 مساءً – 8:30 مساءً')).toBeTruthy();
      // "خلدا، 22 آب 2026" — Levantine month name, Western digits.
      expect(screen.getByText('خلدا، 22 آب 2026')).toBeTruthy();
    });

    it('resolves an Arabic plural form', async () => {
      // 8 falls in the "few" bucket in Arabic: "بقي 8 أماكن".
      const screen = await renderIn('ar');
      expect(screen.getByText(/بقي 8 أماكن/)).toBeTruthy();
    });

    it('offers the switch back to English', async () => {
      const screen = await renderIn('ar');
      expect(screen.getByText('English')).toBeTruthy();
    });
  });
});
