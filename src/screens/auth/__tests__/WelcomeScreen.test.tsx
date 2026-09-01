/**
 * Welcome. BUILD-SPEC 14.1.
 *
 * The four things 14.1 names — logo, wordmark, sign in, create account — plus
 * the two rules that are easy to break by decorating around them: the backdrop
 * must never take a touch or reach a screen reader, and 14.1's own exception
 * says this screen carries no WhatsApp affordance.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Locale } from '@/lib/money';

import { WelcomeScreen } from '../WelcomeScreen';

jest.mock('@/lib/supabase');

const mockChangeLanguage = jest.fn();

jest.mock('@/i18n/useChangeLanguage', () => ({
  useChangeLanguage: () => ({
    changeLanguage: mockChangeLanguage,
    current: 'en',
    isRestarting: false,
  }),
}));

type ScreenProps = React.ComponentProps<typeof WelcomeScreen>;

const navigate = jest.fn();
const navigation = { navigate } as unknown as ScreenProps['navigation'];
const route = { key: 'Welcome', name: 'Welcome' } as unknown as ScreenProps['route'];

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<WelcomeScreen navigation={navigation} route={route} />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('14.1, what the screen offers', () => {
  it('shows the wordmark, the subtitle and both ways in', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Professional of Badminton')).toBeTruthy();
    expect(screen.getByTestId('welcome-subtitle').children.join('')).toBe(
      'Book your court, every week',
    );
    expect(screen.getByTestId('welcome-sign-in')).toBeTruthy();
    expect(screen.getByTestId('welcome-sign-up')).toBeTruthy();
  });

  it('routes to sign in and to create account', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    expect(navigate).toHaveBeenCalledWith('SignIn');

    await fireEvent.press(screen.getByTestId('welcome-sign-up'));
    expect(navigate).toHaveBeenCalledWith('SignUp');
  });

  it('switches language from the corner, before anybody has signed in. 16.1', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('welcome-language-toggle'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('ar');
  });

  it('renders in Arabic', async () => {
    const screen = await renderScreen('ar');

    expect(screen.getByText('تسجيل الدخول')).toBeTruthy();
    expect(screen.getByText('إنشاء حساب')).toBeTruthy();
    expect(screen.getByTestId('welcome-subtitle').children.join('')).toBe('احجز مكانك كل أسبوع');
  });
});

describe('the backdrop is decoration and nothing else', () => {
  it('is absent from the accessible tree entirely', async () => {
    // Not an incidental assertion: the testing library's default queries skip
    // anything hidden from accessibility, so the backdrop being *unfindable*
    // here is the same fact a screen reader observes. It has to be asked for
    // explicitly to be seen at all.
    const screen = await renderScreen();

    expect(screen.queryByTestId('welcome-backdrop')).toBeNull();
    expect(screen.getByTestId('welcome-backdrop', { includeHiddenElements: true })).toBeTruthy();
  });

  it('never takes a touch', async () => {
    // One prop, easy to lose in a refactor, and expensive when it goes: a
    // full-screen decorative layer that swallows taps would break the two
    // buttons that are the entire point of this screen.
    const screen = await renderScreen();
    const backdrop = screen.getByTestId('welcome-backdrop', { includeHiddenElements: true });

    expect(backdrop.props.pointerEvents).toBe('none');
    expect(backdrop.props.accessibilityElementsHidden).toBe(true);
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('adds nothing for a screen reader to announce', async () => {
    // Every piece is an icon or a drawn shape, and none of them carries a
    // label. If one ever does, this catches it.
    const screen = await renderScreen();

    expect(screen.queryByLabelText(/shuttle|badminton|icon/i)).toBeNull();
  });
});

describe('14.1, the stated exception', () => {
  it('offers no way to message the coach', async () => {
    // D72 puts the WhatsApp action on almost every screen and 14.1 names this
    // one as the exception: a stranger who has just installed the app has no
    // reason to message the coach. `whatsappCoverage.test.tsx` asserts the same
    // thing against the source; this asserts it against the render.
    const screen = await renderScreen();

    expect(screen.queryByTestId('whatsapp-button')).toBeNull();
  });
});
