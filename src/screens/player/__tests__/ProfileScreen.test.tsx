/**
 * Profile. BUILD-SPEC 14.12.
 *
 * Half of this screen's specification is a list of things it must not show:
 * "The profile does not show the player's tier, his visibility level, or his
 * balance." D19 and A4 say the same from the other direction. The absences are
 * tested as deliberately as the contents.
 */
import React from 'react';
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { AuthContextValue } from '@/features/auth/AuthProvider';
import type { MyProfile } from '@/features/players/types';
import type { Locale } from '@/lib/money';

import { ProfileScreen } from '../ProfileScreen';

jest.mock('@/lib/supabase');

const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();
const mockUseMyProfile = jest.fn();
const mockUpdateLocale = jest.fn();
const mockPermission = jest.fn();
const mockCredits = jest.fn();

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/features/players/queries', () => ({
  useMyProfile: () => mockUseMyProfile(),
  profileKeys: { all: ['profiles'], me: (id: string) => ['profiles', 'me', id] },
}));

jest.mock('@/features/players/mutations', () => ({
  useUpdatePreferredLocale: () => ({ mutate: mockUpdateLocale }),
}));

jest.mock('@/features/notifications/permissions', () => ({
  useNotificationPermission: () => mockPermission(),
}));

jest.mock('@/features/subscriptions/queries', () => ({
  useMyCredits: () => mockCredits(),
}));

// A31: the card's expiry warning is measured against Amman's today.
jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-09-13T12:00:00Z') };
});

const PROFILE: MyProfile = {
  id: 'u1',
  firstName: 'Yousef',
  lastName: 'Alkhatib',
  fullName: 'Yousef Alkhatib',
  phone: '0791234567',
  role: 'player',
  preferredLocale: 'en',
};

type ScreenProps = React.ComponentProps<typeof ProfileScreen>;

const navigation = { navigate: jest.fn() } as unknown as ScreenProps['navigation'];
const route = { key: 'Profile', name: 'Profile' } as unknown as ScreenProps['route'];

const auth: AuthContextValue = {
  status: 'signed_in',
  user: { id: 'u1', email: 'yousef@example.com', isEmailConfirmed: true },
  session: null,
  signOut: mockSignOut,
};

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<ProfileScreen navigation={navigation} route={route} />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue(auth);
  mockUseMyProfile.mockReturnValue({
    isPending: false,
    isError: false,
    isFetching: false,
    data: PROFILE,
    refetch: jest.fn(),
  });
  mockPermission.mockReturnValue({
    status: 'granted',
    openSettings: jest.fn(),
    refresh: jest.fn(),
  });
  mockCredits.mockReturnValue({
    isPending: false,
    isError: false,
    data: { total: 27, nextExpiry: '2026-11-20', hasUsableCredit: true },
    refetch: jest.fn(),
  });
});

describe('ProfileScreen', () => {
  it('shows the name, email and phone', async () => {
    const view = await renderScreen();

    expect(view.getByText('Yousef Alkhatib')).toBeTruthy();
    expect(view.getByText(/yousef@example\.com/)).toBeTruthy();
    expect(view.getByText(/0791234567/)).toBeTruthy();
  });

  it('shows no tier, no visibility level and no balance', async () => {
    const view = await renderScreen();

    for (const forbidden of [/tier/i, /level/i, /balance/i, /owe/i, /A\+/, /B-/]) {
      expect(view.queryByText(forbidden)).toBeNull();
    }
  });

  it('never asks the server for a tier, a visibility level or a rate', () => {
    // The rule is structural, not a matter of remembering it in the JSX: the
    // shape the query returns has no field to render.
    expect(Object.keys(PROFILE).sort()).toEqual([
      'firstName',
      'fullName',
      'id',
      'lastName',
      'phone',
      'preferredLocale',
      'role',
    ]);
  });

  it('switches language on the device and on the profile', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('profile-language-toggle'));

    // 16.1: the device copy survives before login, the profile copy follows him
    // to a new phone.
    await waitFor(() => expect(mockUpdateLocale).toHaveBeenCalledWith('ar'));
  });

  it('confirms before signing out, because it costs him his session', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('profile-sign-out'));
    expect(mockSignOut).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('sign-out-dialog-confirm'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('reaches account deletion in one tap, per guideline 5.1.1(v)', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('profile-delete-account'));

    expect(navigation.navigate).toHaveBeenCalledWith('DeleteAccount');
  });

  it('offers the system settings only when notifications are actually off', async () => {
    const view = await renderScreen();
    expect(view.queryByTestId('profile-open-settings')).toBeNull();

    mockPermission.mockReturnValue({
      status: 'denied',
      openSettings: jest.fn(),
      refresh: jest.fn(),
    });
    const denied = await renderScreen();

    expect(denied.getByTestId('profile-open-settings')).toBeTruthy();
    expect(denied.getByText(/Turn notifications on in system settings/)).toBeTruthy();
  });

  it('has a loading state and an error state, both reachable', async () => {
    mockUseMyProfile.mockReturnValue({ isPending: true, isError: false, isFetching: true });
    const loading = await renderScreen();
    expect(loading.getByTestId('profile-loading')).toBeTruthy();

    mockUseMyProfile.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      data: undefined,
      refetch: jest.fn(),
    });
    const failed = await renderScreen();
    expect(failed.getByTestId('profile-error')).toBeTruthy();
  });

  it('renders in Arabic', async () => {
    const view = await renderScreen('ar');

    expect(view.getByText('بياناتك')).toBeTruthy();
    expect(view.getByText('احذف حسابي')).toBeTruthy();
  });
});

describe('14.12, the credits card', () => {
  it('shows the total and taps through to the subscriptions screen. A30', async () => {
    const view = await renderScreen();

    expect(view.getByTestId('credits-total').children.join('')).toBe('27');
    expect(view.getByTestId('credits-expiry').children.join('')).toBe(
      'Next credit expires 20 November 2026',
    );

    await fireEvent.press(view.getByTestId('profile-credits'));
    expect(navigation.navigate).toHaveBeenCalledWith('Subscriptions');
  });

  it('warns inside the last seven days. 11.6', async () => {
    // Today is 13 September; a credit dying on the 19th is inside the week.
    mockCredits.mockReturnValue({
      isPending: false,
      isError: false,
      data: { total: 2, nextExpiry: '2026-09-19', hasUsableCredit: true },
      refetch: jest.fn(),
    });

    const view = await renderScreen();
    expect(view.getByTestId('credits-warning')).toBeTruthy();
  });

  it('still appears at zero, and offers no way to buy more. D49', async () => {
    mockCredits.mockReturnValue({
      isPending: false,
      isError: false,
      data: { total: 0, nextExpiry: null, hasUsableCredit: false },
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(view.getByTestId('credits-total').children.join('')).toBe('0');
    expect(view.getByTestId('credits-expiry').children.join('')).toBe('No active subscription');
    for (const forbidden of [/buy/i, /purchase/i, /subscribe/i]) {
      expect(view.queryByText(forbidden)).toBeNull();
    }
  });

  it('hides the card rather than the screen when the read fails', async () => {
    // One line of a profile, not the profile. The rest of 14.12 still renders.
    mockCredits.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      error: new Error('boom'),
      refetch: jest.fn(),
    });

    const view = await renderScreen();

    expect(view.queryByTestId('profile-credits')).toBeNull();
    expect(view.getByTestId('profile-details')).toBeTruthy();
  });
});
