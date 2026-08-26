/**
 * Sign up, as the player meets it. BUILD-SPEC 14.2.
 *
 * Two things about RNTL 14 on React 19 shape every test here: `render` and
 * `fireEvent` are both async, and the `screen` singleton is not populated. So
 * every render and every interaction is awaited, and assertions run against the
 * returned result.
 */
import React from 'react';
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { PendingVerificationProvider } from '@/features/auth/pendingVerification';
import { EmailInUseError } from '@/features/auth/errors';
import type { Locale } from '@/lib/money';

import { SignUpScreen } from '../SignUpScreen';

jest.mock('@/lib/supabase');

const mockSignUp = jest.fn();

jest.mock('@/features/auth/api', () => ({
  signUp: (...args: unknown[]) => mockSignUp(...args),
}));

type ScreenProps = React.ComponentProps<typeof SignUpScreen>;

const navigation = { navigate: jest.fn() } as unknown as ScreenProps['navigation'];
const route = { key: 'SignUp', name: 'SignUp' } as unknown as ScreenProps['route'];

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(
    <PendingVerificationProvider>
      <SignUpScreen navigation={navigation} route={route} />
    </PendingVerificationProvider>,
    { locale },
  );
}

async function fillValidForm(view: RenderResult): Promise<void> {
  await fireEvent.changeText(view.getByTestId('sign-up-first-name'), 'Yousef');
  await fireEvent.changeText(view.getByTestId('sign-up-last-name'), 'Alkhatib');
  await fireEvent.changeText(view.getByTestId('sign-up-email'), 'Player@Example.com');
  await fireEvent.changeText(view.getByTestId('sign-up-phone'), '079 123 4567');
  await fireEvent.changeText(view.getByTestId('sign-up-password'), 'badminton1');
  await fireEvent.changeText(view.getByTestId('sign-up-confirm-password'), 'badminton1');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ email: 'player@example.com', needsConfirmation: true });
});

describe('SignUpScreen', () => {
  it('shows exactly the five fields D11 names, plus the confirmation', async () => {
    const view = await renderScreen();

    for (const testID of [
      'sign-up-first-name',
      'sign-up-last-name',
      'sign-up-email',
      'sign-up-phone',
      'sign-up-password',
      'sign-up-confirm-password',
    ]) {
      expect(view.getByTestId(testID)).toBeTruthy();
    }
  });

  it('disables submit until the form is valid', async () => {
    const view = await renderScreen();

    expect(view.getByTestId('sign-up-submit')).toBeDisabled();

    await fillValidForm(view);

    await waitFor(() => expect(view.getByTestId('sign-up-submit')).not.toBeDisabled());
  });

  it('keeps submit disabled when the passwords differ', async () => {
    const view = await renderScreen();
    await fillValidForm(view);
    await fireEvent.changeText(view.getByTestId('sign-up-confirm-password'), 'different1');

    await waitFor(() => expect(view.getByTestId('sign-up-submit')).toBeDisabled());
  });

  it('shows the field message for a bad phone number once the field is left', async () => {
    const view = await renderScreen();
    const phone = view.getByTestId('sign-up-phone');

    await fireEvent.changeText(phone, '12345');
    await fireEvent(phone, 'blur');

    expect(await view.findByText('Enter a valid phone number.')).toBeTruthy();
  });

  it('sends the normalised five fields and moves to the verify screen', async () => {
    const view = await renderScreen();
    await fillValidForm(view);

    await waitFor(() => expect(view.getByTestId('sign-up-submit')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('sign-up-submit'));

    // TanStack passes its own context as a second argument, so the assertion is
    // on what the screen sent, not on the whole call.
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expect(mockSignUp.mock.calls[0]?.[0]).toEqual({
      firstName: 'Yousef',
      lastName: 'Alkhatib',
      email: 'player@example.com',
      phone: '0791234567',
      password: 'badminton1',
    });

    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', {
      email: 'player@example.com',
    });
  });

  it('offers a way to sign in when the address is already registered', async () => {
    mockSignUp.mockRejectedValue(new EmailInUseError());
    const view = await renderScreen();
    await fillValidForm(view);

    await waitFor(() => expect(view.getByTestId('sign-up-submit')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('sign-up-submit'));

    expect(await view.findByTestId('sign-up-error')).toHaveTextContent(
      /That email already has an account/,
    );

    await fireEvent.press(view.getByTestId('sign-up-sign-in-instead'));
    expect(navigation.navigate).toHaveBeenCalledWith('SignIn');
  });

  it('renders in Arabic without falling back to English', async () => {
    const view = await renderScreen('ar');

    expect(view.getByText('الاسم الأول')).toBeTruthy();
    expect(view.getByText('رقم الهاتف')).toBeTruthy();
  });
});
