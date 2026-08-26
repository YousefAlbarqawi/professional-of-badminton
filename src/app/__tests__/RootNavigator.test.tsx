/**
 * Role based navigator switching. BUILD-SPEC 14.0.
 *
 * The phase 2 acceptance criterion is that a confirmed player is "recognised as
 * a player" and lands in the player tabs. These prove that, and the three staff
 * roles, and the two states in between.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { type RenderResult } from '@testing-library/react-native';
import type { UseQueryResult } from '@tanstack/react-query';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { AuthContextValue } from '@/features/auth/AuthProvider';
import type { MyProfile } from '@/features/players/types';
import type { Role } from '@/features/auth/types';

import { RootNavigator } from '../RootNavigator';

jest.mock('@/lib/supabase');

const mockUseAuth = jest.fn();
const mockUseMyProfile = jest.fn();

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/features/players/queries', () => ({
  useMyProfile: () => mockUseMyProfile(),
  profileKeys: { all: ['profiles'], me: (id: string) => ['profiles', 'me', id] },
}));

function auth(status: AuthContextValue['status']): AuthContextValue {
  return {
    status,
    user:
      status === 'signed_in' ? { id: 'u1', email: 'p@example.com', isEmailConfirmed: true } : null,
    session: null,
    signOut: jest.fn(async () => undefined),
  };
}

function profileFor(role: Role): MyProfile {
  return {
    id: 'u1',
    firstName: 'Yousef',
    lastName: 'Alkhatib',
    fullName: 'Yousef Alkhatib',
    phone: '0791234567',
    role,
    preferredLocale: 'en',
  };
}

type ProfileQuery = UseQueryResult<MyProfile, Error>;

function loadedProfile(role: Role): Partial<ProfileQuery> {
  return { isPending: false, isError: false, isFetching: false, data: profileFor(role) };
}

async function renderTree(): Promise<RenderResult> {
  return renderWithProviders(
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMyProfile.mockReturnValue({ isPending: true, isError: false, isFetching: true });
});

describe('RootNavigator', () => {
  it('waits while the stored session is being restored', async () => {
    mockUseAuth.mockReturnValue(auth('loading'));

    const view = await renderTree();

    expect(view.getByTestId('root-restoring-session')).toBeTruthy();
  });

  it('shows the auth stack when nobody is signed in', async () => {
    mockUseAuth.mockReturnValue(auth('signed_out'));

    const view = await renderTree();

    expect(view.getByTestId('welcome-sign-in')).toBeTruthy();
    expect(view.getByTestId('welcome-sign-up')).toBeTruthy();
  });

  it('waits for the role rather than guessing at it', async () => {
    mockUseAuth.mockReturnValue(auth('signed_in'));

    const view = await renderTree();

    expect(view.getByTestId('root-loading-profile')).toBeTruthy();
  });

  it('routes a player to the player tabs', async () => {
    mockUseAuth.mockReturnValue(auth('signed_in'));
    mockUseMyProfile.mockReturnValue(loadedProfile('player'));

    const view = await renderTree();

    expect(view.getByText('My bookings')).toBeTruthy();
    expect(view.queryByText('Players')).toBeNull();
  });

  it.each<Role>(['coach', 'admin', 'assistant_coach'])(
    'routes a %s to the admin tabs',
    async (role) => {
      mockUseAuth.mockReturnValue(auth('signed_in'));
      mockUseMyProfile.mockReturnValue(loadedProfile(role));

      const view = await renderTree();

      expect(view.getByText('Players')).toBeTruthy();
      expect(view.queryByText('My bookings')).toBeNull();
    },
  );

  it('offers a way out when the profile cannot be read at all', async () => {
    mockUseAuth.mockReturnValue(auth('signed_in'));
    mockUseMyProfile.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      data: undefined,
      refetch: jest.fn(),
    });

    const view = await renderTree();

    expect(view.getByTestId('root-profile-error')).toBeTruthy();
    expect(view.getByText('Sign out')).toBeTruthy();
  });
});
