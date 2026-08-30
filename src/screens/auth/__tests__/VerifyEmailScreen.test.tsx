/**
 * Verify email. BUILD-SPEC 14.3: the address, the six digit code, a resend
 * behind a 60 second cooldown, and a poll that moves the player on by itself
 * if he taps the link instead.
 */
import React from 'react';
import { act, fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import {
  PendingVerificationProvider,
  usePendingVerification,
  type PendingVerification,
} from '@/features/auth/pendingVerification';
import type { Locale } from '@/lib/money';

import { VerifyEmailScreen, RESEND_COOLDOWN_SECONDS } from '../VerifyEmailScreen';

jest.mock('@/lib/supabase');

const mockPoll = jest.fn();
const mockResend = jest.fn();
const mockSignUp = jest.fn();
const mockVerifyCode = jest.fn();

jest.mock('@/features/auth/api', () => ({
  pollForConfirmation: (...args: unknown[]) => mockPoll(...args),
  resendConfirmation: (...args: unknown[]) => mockResend(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  verifyEmailCode: (...args: unknown[]) => mockVerifyCode(...args),
}));

type ScreenProps = React.ComponentProps<typeof VerifyEmailScreen>;

const navigation = {
  navigate: jest.fn(),
  setParams: jest.fn(),
} as unknown as ScreenProps['navigation'];

const EMAIL = 'player@example.com';

const route = {
  key: 'VerifyEmail',
  name: 'VerifyEmail',
  params: { email: EMAIL },
} as unknown as ScreenProps['route'];

const FROM_SIGN_UP: PendingVerification = {
  email: EMAIL,
  password: 'badminton1',
  signUpInput: {
    firstName: 'Yousef',
    lastName: 'Alkhatib',
    email: EMAIL,
    phone: '0791234567',
    password: 'badminton1',
  },
};

const FROM_SIGN_IN: PendingVerification = {
  email: EMAIL,
  password: 'badminton1',
  signUpInput: null,
};

/** Seeds the context the way SignUp or SignIn would have. */
const Seed: React.FC<{ pending: PendingVerification; children: React.ReactNode }> = ({
  pending,
  children,
}) => {
  const { pending: current, setPending } = usePendingVerification();
  React.useEffect(() => {
    if (current === null) setPending(pending);
  }, [current, pending, setPending]);
  return current === null ? null : <>{children}</>;
};

async function renderScreen(
  pending: PendingVerification = FROM_SIGN_UP,
  locale: Locale = 'en',
): Promise<RenderResult> {
  return renderWithProviders(
    <PendingVerificationProvider>
      <Seed pending={pending}>
        <VerifyEmailScreen navigation={navigation} route={route} />
      </Seed>
    </PendingVerificationProvider>,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPoll.mockResolvedValue(null);
  mockResend.mockResolvedValue(undefined);
  mockVerifyCode.mockResolvedValue({ access_token: 'token' });
});

describe('VerifyEmailScreen', () => {
  it('names the address the link went to', async () => {
    const view = await renderScreen();

    expect(view.getByText(/player@example\.com/)).toBeTruthy();
  });

  it('starts with the resend on cooldown, because a link has just been sent', async () => {
    const view = await renderScreen();

    const resend = view.getByTestId('verify-resend');
    expect(resend).toBeDisabled();
    expect(view.getByText(`You can resend in ${RESEND_COOLDOWN_SECONDS} seconds`)).toBeTruthy();
  });

  it('counts the cooldown down and then allows a resend', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderScreen();

      await act(async () => {
        jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000);
      });

      await waitFor(() => expect(view.getByTestId('verify-resend')).not.toBeDisabled());

      await fireEvent.press(view.getByTestId('verify-resend'));
      await waitFor(() => expect(mockResend).toHaveBeenCalled());
      expect(mockResend.mock.calls[0]?.[0]).toBe(EMAIL);
    } finally {
      jest.useRealTimers();
    }
  });

  it('polls for the confirmation without being asked to', async () => {
    await renderScreen();

    await waitFor(() => expect(mockPoll).toHaveBeenCalled());
    expect(mockPoll.mock.calls[0]?.[0]).toMatchObject({
      email: EMAIL,
      password: 'badminton1',
    });
  });

  it('offers to change the address when the player has just signed up', async () => {
    const view = await renderScreen(FROM_SIGN_UP);

    expect(view.getByTestId('verify-change-email')).toBeTruthy();
  });

  it('does not offer it when he came from sign in, where there is nothing to change', async () => {
    const view = await renderScreen(FROM_SIGN_IN);

    expect(view.queryByTestId('verify-change-email')).toBeNull();
  });

  it('re-registers the five fields against the new address', async () => {
    mockSignUp.mockResolvedValue({ email: 'other@example.com', needsConfirmation: true });
    const view = await renderScreen(FROM_SIGN_UP);

    await fireEvent.press(view.getByTestId('verify-change-email'));
    await fireEvent.changeText(view.getByTestId('verify-change-email-input'), 'other@example.com');
    await fireEvent.press(view.getByTestId('verify-change-email-dialog-confirm'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expect(mockSignUp.mock.calls[0]?.[0]).toEqual({
      ...FROM_SIGN_UP.signUpInput,
      email: 'other@example.com',
    });
  });

  it('exchanges the typed code for a session', async () => {
    const view = await renderScreen();

    await fireEvent.changeText(view.getByTestId('verify-code-input'), '123456');
    await fireEvent.press(view.getByTestId('verify-code-submit'));

    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalled());
    expect(mockVerifyCode.mock.calls[0]?.[0]).toEqual({ email: EMAIL, code: '123456' });
  });

  it('strips the space a mail client pastes between the groups', async () => {
    const view = await renderScreen();

    await fireEvent.changeText(view.getByTestId('verify-code-input'), '123 456');
    await fireEvent.press(view.getByTestId('verify-code-submit'));

    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalled());
    expect(mockVerifyCode.mock.calls[0]?.[0]).toEqual({ email: EMAIL, code: '123456' });
  });

  it('refuses a code that is not six digits without asking the server', async () => {
    const view = await renderScreen();

    await fireEvent.changeText(view.getByTestId('verify-code-input'), '12345');
    await fireEvent.press(view.getByTestId('verify-code-submit'));

    await waitFor(() =>
      expect(view.getByText('Enter the 6 digit code from the email.')).toBeTruthy(),
    );
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it('says so when the server rejects the code', async () => {
    mockVerifyCode.mockRejectedValue(new Error('Token has expired or is invalid'));
    const view = await renderScreen();

    await fireEvent.changeText(view.getByTestId('verify-code-input'), '123456');
    await fireEvent.press(view.getByTestId('verify-code-submit'));

    await waitFor(() =>
      expect(view.getByText('That code is wrong or has expired. Ask for a new one.')).toBeTruthy(),
    );
  });

  it('clears a stale code when a new one is sent', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderScreen();

      await fireEvent.changeText(view.getByTestId('verify-code-input'), '111111');

      await act(async () => {
        jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000);
      });
      await waitFor(() => expect(view.getByTestId('verify-resend')).not.toBeDisabled());
      await fireEvent.press(view.getByTestId('verify-resend'));

      await waitFor(() => expect(view.getByTestId('verify-code-input').props.value).toBe(''));
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders in Arabic', async () => {
    const view = await renderScreen(FROM_SIGN_UP, 'ar');

    expect(view.getByText('تحقق من بريدك الإلكتروني')).toBeTruthy();
  });
});
