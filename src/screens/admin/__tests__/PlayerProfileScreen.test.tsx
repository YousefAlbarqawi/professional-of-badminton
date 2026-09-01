/**
 * The admin's player profile. BUILD-SPEC 15.8 sections 1, 5 and 6, 10.3 and
 * section 11.
 *
 * Three of 15.8's eight sections are built — see the screen for which and why.
 * Section 5 arrived with phase 6 and carries this phase's central claim: the
 * balance the coach reads is the sum of the ledger printed underneath it, and
 * 11.3's migration flow is legible in that ledger.
 */
import { fireEvent, within, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { PlayerBalance, PlayerIdentity, TierChangeEntry } from '@/features/payments/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import type { Subscription } from '@/features/subscriptions/types';

import { PlayerProfileScreen } from '../PlayerProfileScreen';

jest.mock('@/lib/supabase');

const mockIdentity = jest.fn();
const mockBalance = jest.fn();
const mockRecentSessions = jest.fn();
const mockTierHistory = jest.fn();
const mockSubscriptions = jest.fn();
const mockRole = jest.fn();
const mockAdd = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/features/payments/queries', () => ({
  usePlayerIdentity: () => mockIdentity(),
  usePlayerBalance: () => mockBalance(),
  usePlayerRecentSessions: () => mockRecentSessions(),
  usePlayerTierHistory: () => mockTierHistory(),
}));

jest.mock('@/features/subscriptions/queries', () => ({
  usePlayerSubscriptions: () => mockSubscriptions(),
}));

jest.mock('@/features/players/queries', () => ({
  useMyProfile: () => ({ data: { role: mockRole() } }),
}));

jest.mock('@/features/subscriptions/mutations', () => ({
  useExtendSubscription: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const mockSetTier = jest.fn();
const mockSetVisibility = jest.fn();
const mockSetRate = jest.fn();
const mockSetRole = jest.fn();

jest.mock('@/features/payments/mutations', () => {
  const idle = (mutate: jest.Mock): Record<string, unknown> => ({
    mutate,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  });

  return {
    useAddBalanceEntry: () => idle(mockAdd),
    useDeleteBalanceEntry: () => idle(mockDelete),
    useSetPlayerTier: () => idle(mockSetTier),
    useSetPlayerVisibility: () => idle(mockSetVisibility),
    useSetPlayerRate: () => idle(mockSetRate),
    useSetPlayerRole: () => idle(mockSetRole),
  };
});

const IDENTITY: PlayerIdentity = {
  id: 'p1',
  fullName: 'Ahmad Nasser',
  email: null,
  phone: '0791234567',
  tier: 'B+',
  joinedAt: parseInstant('2026-03-04T09:00:00Z'),
  visibility: 'level_1',
  customRateStandardFils: null,
  customRateExtendedFils: null,
  role: 'player',
};

const BALANCE: PlayerBalance = {
  totalOwedFils: 8000 as Fils,
  entries: [
    {
      id: 'e1',
      amountFils: 2000 as Fils,
      note: 'Short by two',
      createdAt: parseInstant('2026-08-18T20:00:00Z'),
      sessionId: 's1',
      sessionLabel: 'Khalda · 18/8/2026',
    },
    {
      id: 'e2',
      amountFils: 6000 as Fils,
      note: null,
      createdAt: parseInstant('2026-08-11T20:00:00Z'),
      sessionId: null,
      sessionLabel: null,
    },
  ],
};

/**
 * 11.3, verbatim: grant the full 40 visit package, then adjust by −13 with the
 * note "used before the app". Balance 27, and the history says why.
 */
const MIGRATED: Subscription = {
  id: 'sub-1',
  playerId: 'p1',
  packageNameEn: '40 visits, 3 months',
  packageNameAr: '٤٠ زيارة، ٣ أشهر',
  grantedVisits: 40,
  perVisitFils: 4000 as Fils,
  startsOn: '2026-08-01',
  expiresOn: '2026-11-01',
  isVoided: false,
  note: null,
  createdAt: '2026-08-01T09:00:00Z',
  transactions: [
    {
      id: 't1',
      subscriptionId: 'sub-1',
      delta: 40,
      reason: 'grant',
      note: null,
      bookingId: null,
      createdAt: '2026-08-01T09:00:00Z',
    },
    {
      id: 't2',
      subscriptionId: 'sub-1',
      delta: -13,
      reason: 'manual_adjustment',
      note: 'used before the app',
      bookingId: null,
      createdAt: '2026-08-01T09:05:00Z',
    },
  ],
};

/** Whatever a state test needs to force on one of the three reads. */
interface QueryOverrides {
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  error?: Error | null;
  refetch?: jest.Mock;
}

interface Setup {
  balance?: PlayerBalance;
  subscriptions?: Subscription[];
  role?: 'coach' | 'admin';
  isPending?: boolean;
  identityQuery?: QueryOverrides & { data?: PlayerIdentity };
  balanceQuery?: QueryOverrides;
  subscriptionsQuery?: QueryOverrides;
  tierHistoryQuery?: QueryOverrides & { data?: TierChangeEntry[] };
}

async function renderProfile(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  mockIdentity.mockReturnValue({
    data: IDENTITY,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.identityQuery,
  });
  mockBalance.mockReturnValue({
    data: options.balance ?? BALANCE,
    isPending: options.isPending ?? false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.balanceQuery,
  });
  mockSubscriptions.mockReturnValue({
    data: options.subscriptions ?? [MIGRATED],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.subscriptionsQuery,
  });
  mockRecentSessions.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mockTierHistory.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.tierHistoryQuery,
  });
  mockRole.mockReturnValue(options.role ?? 'coach');

  const route = { key: 'k', name: 'PlayerProfile' as const, params: { playerId: 'p1' } };
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };

  return renderWithProviders(
    <PlayerProfileScreen route={route as never} navigation={navigation as never} />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('15.8 section 1, identity', () => {
  it('shows the name, the tier and when he joined', async () => {
    const screen = await renderProfile();

    expect(screen.getByText('Ahmad Nasser')).toBeTruthy();
    // 15.8 section 2's tier picker also renders a "B+" chip, so this scopes
    // to the identity card specifically.
    expect(within(screen.getByTestId('profile-identity')).getByText('B+')).toBeTruthy();
    expect(screen.getByText('Joined 4/3/2026')).toBeTruthy();
  });
});

describe('15.8 section 6, balance', () => {
  it('shows the total owed and every entry with its date, session and note', async () => {
    // 10.3: "total owed, and every entry with date, session, amount, and note".
    const screen = await renderProfile();

    expect(screen.getByTestId('profile-owed').children.join('')).toBe('8.000 JD');
    expect(screen.getByText('Khalda · 18/8/2026')).toBeTruthy();
    expect(screen.getByText('Short by two')).toBeTruthy();
    expect(screen.getByText('Entered by hand')).toBeTruthy();
  });

  it('says plainly that a balance blocks nothing. D40', async () => {
    const screen = await renderProfile();

    expect(screen.getByText('A balance is a record. It never stops anyone booking.')).toBeTruthy();
  });

  it('has an empty state', async () => {
    const screen = await renderProfile({
      balance: { totalOwedFils: 0 as Fils, entries: [] },
    });

    expect(screen.getByTestId('balance-empty')).toBeTruthy();
  });

  it('records a debt as a positive entry', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-add-entry'));
    await fireEvent.changeText(screen.getByTestId('balance-amount'), '5');
    await fireEvent.changeText(screen.getByTestId('balance-note'), 'Owed from last month');
    await fireEvent.press(screen.getByTestId('balance-save'));

    expect(mockAdd.mock.calls[0]?.[0]).toEqual({
      playerId: 'p1',
      amountFils: 5000,
      note: 'Owed from last month',
    });
  });

  it('records a settlement as a negative entry', async () => {
    // 6.2: positive is owed to the coach, negative is a settlement. The coach
    // never types a minus sign; he picks which of the two things happened.
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-add-entry'));
    await fireEvent.press(screen.getByText('He paid some'));
    await fireEvent.changeText(screen.getByTestId('balance-amount'), '3');
    await fireEvent.changeText(screen.getByTestId('balance-note'), 'Paid at the venue');
    await fireEvent.press(screen.getByTestId('balance-save'));

    expect(mockAdd.mock.calls[0]?.[0]).toMatchObject({ amountFils: -3000 });
  });

  it('previews what the balance becomes', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-add-entry'));
    await fireEvent.changeText(screen.getByTestId('balance-amount'), '2');

    expect(screen.getByText('Balance goes from 8.000 JD to 10.000 JD.')).toBeTruthy();
  });

  it('will not save without a note', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-add-entry'));
    await fireEvent.changeText(screen.getByTestId('balance-amount'), '5');
    await fireEvent.press(screen.getByTestId('balance-save'));

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('confirms before deleting an entry. 17.4', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('balance-delete-e1'));
    expect(
      screen.getByText('The entry for 2.000 JD will be removed from his balance.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('balance-delete-dialog-confirm'));
    expect(mockDelete.mock.calls[0]?.[0]).toBe('e1');
  });
});

describe('Arabic', () => {
  it('renders the balance section in Arabic', async () => {
    const screen = await renderProfile({}, 'ar');

    expect(screen.getByText('الرصيد المستحق')).toBeTruthy();
    expect(screen.getByTestId('profile-owed').children.join('')).toBe('8.000 د.أ');
  });
});

describe('15.8 section 5, subscriptions', () => {
  it('reads 27 after the migration flow, and the history explains it', async () => {
    // BUILD-SPEC 11.3 and this phase's stated definition of done. The number
    // is the sum of the two rows printed under it, and nothing else: 6.2 and
    // D56 forbid a counter column.
    const screen = await renderProfile();

    expect(screen.getByTestId('profile-credits-total').children.join('')).toBe('27');
    expect(screen.getByTestId('subscription-sub-1-remaining').children.join('')).toBe('27');
    expect(screen.getByTestId('credit-history-t1-delta').children.join('')).toBe('+40');
    expect(screen.getByTestId('credit-history-t2-delta').children.join('')).toBe('\u221213');
    expect(screen.getByText('used before the app')).toBeTruthy();
  });

  it('offers Extend to the coach and not to an admin. D55', async () => {
    const asCoach = await renderProfile({ role: 'coach' });
    expect(asCoach.getByTestId('extend-sub-1')).toBeTruthy();

    const asAdmin = await renderProfile({ role: 'admin' });
    expect(asAdmin.queryByTestId('extend-sub-1')).toBeNull();
    // Granting and adjusting stay available to him. 11.2 and D16.
    expect(asAdmin.getByTestId('profile-grant')).toBeTruthy();
    expect(asAdmin.getByTestId('adjust-sub-1')).toBeTruthy();
  });

  it('does not offer Extend on an expired subscription. 11.5', async () => {
    const screen = await renderProfile({
      subscriptions: [
        {
          ...MIGRATED,
          isVoided: true,
          transactions: [
            ...MIGRATED.transactions,
            {
              id: 't3',
              subscriptionId: 'sub-1',
              delta: -27,
              reason: 'expiry' as const,
              note: null,
              bookingId: null,
              createdAt: '2026-11-02T00:20:00Z',
            },
          ],
        },
      ],
    });

    expect(screen.queryByTestId('extend-sub-1')).toBeNull();
    // D54: the balance goes to zero, and the history stays readable.
    expect(screen.getByTestId('subscription-sub-1-remaining').children.join('')).toBe('0');
    expect(screen.getByTestId('credit-history-t3-delta').children.join('')).toBe('\u221227');
  });

  it('opens the grant screen, which 14.0 puts on this stack', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    mockIdentity.mockReturnValue({
      data: IDENTITY,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    mockBalance.mockReturnValue({
      data: BALANCE,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    mockSubscriptions.mockReturnValue({
      data: [MIGRATED],
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    mockRole.mockReturnValue('coach');

    const screen = renderWithProviders(
      <PlayerProfileScreen
        route={{ key: 'k', name: 'PlayerProfile', params: { playerId: 'p1' } } as never}
        navigation={navigation as never}
      />,
    );
    const rendered = await screen;

    await fireEvent.press(rendered.getByTestId('profile-grant'));
    expect(navigation.navigate).toHaveBeenCalledWith('GrantSubscription', { playerId: 'p1' });

    await fireEvent.press(rendered.getByTestId('adjust-sub-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('AdjustCredits', {
      playerId: 'p1',
      subscriptionId: 'sub-1',
    });
  });

  it('says in Arabic that the app does not track the subscription payment. D50', async () => {
    const screen = await renderProfile({}, 'ar');

    expect(
      screen.getAllByText('التطبيق لا يتابع دفع قيمة الاشتراك. سجّلها في الحساب إن أردت ذلك.')
        .length,
    ).toBeGreaterThan(0);
  });

  it('has an empty state when he has never had one', async () => {
    const screen = await renderProfile({ subscriptions: [] });

    expect(screen.getByTestId('subscriptions-empty')).toBeTruthy();
    // Nothing to adjust yet, so the shortcut is not offered.
    expect(screen.queryByTestId('profile-adjust')).toBeNull();
  });
});

describe('19.3 item 6, the states of all three reads', () => {
  // The two empty states are forced elsewhere in this file. The six others
  // were written into the screen and never rendered by anything.
  it('shows a skeleton while the identity loads', async () => {
    const screen = await renderProfile({ identityQuery: { isPending: true } });

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
  });

  it('shows an error state when the identity read failed', async () => {
    const screen = await renderProfile({
      identityQuery: { isError: true, error: new Error('nope') },
    });

    expect(screen.getByTestId('profile-error')).toBeTruthy();
  });

  it('shows a skeleton while the balance loads', async () => {
    const screen = await renderProfile({ balanceQuery: { isPending: true } });

    expect(screen.getByTestId('balance-loading')).toBeTruthy();
  });

  it('shows an error state when the balance read failed', async () => {
    const screen = await renderProfile({
      balanceQuery: { isError: true, error: new Error('nope') },
    });

    expect(screen.getByTestId('balance-list-error')).toBeTruthy();
  });

  it('shows a skeleton while the subscriptions load', async () => {
    const screen = await renderProfile({ subscriptionsQuery: { isPending: true } });

    expect(screen.getByTestId('subscriptions-loading')).toBeTruthy();
  });

  it('shows an error state when the subscriptions read failed', async () => {
    const screen = await renderProfile({
      subscriptionsQuery: { isError: true, error: new Error('nope') },
    });

    expect(screen.getByTestId('subscriptions-list-error')).toBeTruthy();
  });
});

describe('15.8 section 2, tier', () => {
  it('writes a chosen tier immediately, no separate save step', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-tier-picker-A+'));

    expect(mockSetTier).toHaveBeenCalledWith({ playerId: 'p1', tier: 'A+' });
  });

  it('can clear a tier back to unrated', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-tier-picker-unrated'));

    expect(mockSetTier).toHaveBeenCalledWith({ playerId: 'p1', tier: null });
  });

  describe('change history', () => {
    const CHANGE: TierChangeEntry = {
      id: '1',
      fromTier: 'B',
      toTier: 'B+',
      actorName: 'Yousef Alkhatib',
      createdAt: parseInstant('2026-08-01T09:00:00Z'),
    };

    it('is not shown to an admin viewer — audit_log is coach-only, 7.3', async () => {
      const screen = await renderProfile({
        role: 'admin',
        tierHistoryQuery: { data: [CHANGE] },
      });

      expect(screen.queryByText('Change history')).toBeNull();
    });

    it('shows each change, from, to, who and when, for a coach viewer', async () => {
      const screen = await renderProfile({
        role: 'coach',
        tierHistoryQuery: { data: [CHANGE] },
      });

      expect(screen.getByText('Changed from B to B+')).toBeTruthy();
      expect(screen.getByText('By Yousef Alkhatib, 1/8/2026')).toBeTruthy();
    });

    it('shows an empty state when nothing has ever changed', async () => {
      const screen = await renderProfile({ role: 'coach', tierHistoryQuery: { data: [] } });

      expect(screen.getByText('No tier changes recorded.')).toBeTruthy();
    });

    it('shows an error with retry on failure', async () => {
      const screen = await renderProfile({
        role: 'coach',
        tierHistoryQuery: { isError: true, error: new Error('x') },
      });

      expect(screen.getByTestId('tier-history-error')).toBeTruthy();
    });
  });
});

describe('15.8 section 3, visibility', () => {
  it('writes the chosen level immediately', async () => {
    const screen = await renderProfile();

    await fireEvent.press(screen.getByTestId('profile-visibility-control-level_2'));

    expect(mockSetVisibility).toHaveBeenCalledWith({ playerId: 'p1', visibility: 'level_2' });
  });
});

describe('15.8 section 4, custom rate', () => {
  it('starts blank when there is no override, and Save is disabled until it changes', async () => {
    const screen = await renderProfile();

    expect(screen.getByTestId('profile-rate-standard').props.value).toBe('');
    expect(screen.getByTestId('profile-rate-save').props.accessibilityState.disabled).toBe(true);
  });

  it('saves a typed rate, blank stays null on the other field', async () => {
    const screen = await renderProfile();

    await fireEvent.changeText(screen.getByTestId('profile-rate-standard'), '5');
    await fireEvent.press(screen.getByTestId('profile-rate-save'));

    expect(mockSetRate).toHaveBeenCalledWith({
      playerId: 'p1',
      standardFils: 5000,
      extendedFils: null,
    });
  });

  it('D41: zero is a real rate, not treated as blank', async () => {
    const screen = await renderProfile();

    await fireEvent.changeText(screen.getByTestId('profile-rate-standard'), '0');
    await fireEvent.press(screen.getByTestId('profile-rate-save'));

    expect(mockSetRate).toHaveBeenCalledWith({
      playerId: 'p1',
      standardFils: 0,
      extendedFils: null,
    });
  });

  it('resets both fields to default immediately, without waiting for Save', async () => {
    const screen = await renderProfile({
      identityQuery: {
        data: {
          ...IDENTITY,
          customRateStandardFils: 5000 as Fils,
          customRateExtendedFils: 7000 as Fils,
        },
      },
    });

    await fireEvent.press(screen.getByTestId('profile-rate-reset'));

    expect(mockSetRate).toHaveBeenCalledWith({
      playerId: 'p1',
      standardFils: null,
      extendedFils: null,
    });
    expect(screen.getByTestId('profile-rate-standard').props.value).toBe('');
  });
});

describe('15.8 section 8, role', () => {
  it('offers Promote for a player, only to a coach viewer', async () => {
    const screen = await renderProfile({ role: 'coach' });

    expect(within(screen.getByTestId('profile-role')).getByText('Promote to coach')).toBeTruthy();
  });

  it('is not offered at all to an admin viewer. D16', async () => {
    const screen = await renderProfile({ role: 'admin' });

    expect(screen.queryByTestId('profile-role')).toBeNull();
  });

  it('asks first, then promotes', async () => {
    const screen = await renderProfile({ role: 'coach' });

    await fireEvent.press(screen.getByTestId('profile-role-toggle'));
    expect(screen.getByTestId('role-change-dialog')).toBeTruthy();
    expect(mockSetRole).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('role-change-dialog-confirm'));
    expect(mockSetRole).toHaveBeenCalledWith({ playerId: 'p1', role: 'coach' }, expect.anything());
  });

  it('offers Demote, destructively styled, for an existing coach', async () => {
    const screen = await renderProfile({
      role: 'coach',
      identityQuery: { data: { ...IDENTITY, role: 'coach' } },
    });

    expect(within(screen.getByTestId('profile-role')).getByText('Demote to player')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-role-toggle'));
    await fireEvent.press(screen.getByTestId('role-change-dialog-confirm'));

    expect(mockSetRole).toHaveBeenCalledWith({ playerId: 'p1', role: 'player' }, expect.anything());
  });
});
