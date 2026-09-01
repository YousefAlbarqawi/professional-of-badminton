/**
 * Session manage, players tab. BUILD-SPEC 15.2.
 *
 * The roster, the three add flows and the remove with its credit prompt. The
 * prompt is the case worth reading: D26 keeps the credit inside three hours
 * and D25 returns it outside, and 8.3 lets the coach do the opposite of
 * whichever applies, so the dialog offers both and defaults to the rule.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { RosterEntry } from '@/features/bookings/types';
import type { Session } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionManageScreen } from '../SessionManageScreen';

jest.mock('@/lib/supabase');

const START = parseInstant('2026-08-24T16:00:00Z');
const HOUR = 60 * 60 * 1000;

const mockNow = jest.fn<Date, []>(() => new Date(START.getTime() - 24 * HOUR));
jest.mock('@/lib/time', () => ({
  ...jest.requireActual<object>('@/lib/time'),
  nowInAmman: () => mockNow(),
}));

const mockUseSession = jest.fn();
const mockUseAdminSchedule = jest.fn();
jest.mock('@/features/sessions/queries', () => ({
  useSession: () => mockUseSession(),
  useAdminSchedule: () => mockUseAdminSchedule(),
}));

const mockUseRoster = jest.fn();
const mockUseSearch = jest.fn();
const mockUseCoachOptions = jest.fn();
jest.mock('@/features/bookings/queries', () => ({
  useSessionRoster: () => mockUseRoster(),
  usePlayerSearch: () => mockUseSearch(),
  useCoachOptions: () => mockUseCoachOptions(),
}));

// The court board tab is its own screen with its own suite
// (SessionCourtBoardTab.test.tsx). Here it only has to mount, so its queries
// answer with a lineup already generated and nothing regenerates.
const mockUseLineup = jest.fn();
jest.mock('@/features/matchmaking/queries', () => ({
  useLineup: () => mockUseLineup(),
  usePairingRules: () => ({ data: [], isPending: false, isSuccess: true, isError: false }),
}));

jest.mock('@/features/matchmaking/mutations', () => {
  const idle = (): Record<string, unknown> => ({ mutate: jest.fn(), isPending: false });
  return {
    useSaveLineup: idle,
    useSwapPlayers: idle,
    useSetCourtLock: idle,
    useSetPairingRule: idle,
    useDeletePairingRule: idle,
  };
});

const mockAddPlayer = jest.fn();
const mockAddGuest = jest.fn();
const mockAddCoach = jest.fn();
const mockRemove = jest.fn();
const mockMove = jest.fn();

jest.mock('@/features/bookings/mutations', () => {
  const idle = (mutate: jest.Mock): Record<string, unknown> => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
  });

  return {
    useAddPlayer: () => idle(mockAddPlayer),
    useAddGuest: () => idle(mockAddGuest),
    useAddCoach: () => idle(mockAddCoach),
    useRemoveBooking: () => idle(mockRemove),
    useMoveBooking: () => idle(mockMove),
  };
});

const mockSetTier = jest.fn();
jest.mock('@/features/payments/mutations', () => {
  const idle = (mutate: jest.Mock = jest.fn()): Record<string, unknown> => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
  });

  return {
    // SessionMoneyTab's three mutations: this suite only has to mount that
    // tab, never drive its payments, so idle stubs are enough.
    useRecordPayment: () => idle(),
    useConfirmReview: () => idle(),
    useReopenReview: () => idle(),
    useSetPlayerTier: () => idle(mockSetTier),
  };
});

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    venue: {
      id: 'v1',
      name: 'International Independent Schools',
      area: 'Khalda',
      googleMapsUrl: null,
    },
    sessionDate: '2026-08-24',
    startsAt: START,
    endsAt: parseInstant('2026-08-24T17:30:00Z'),
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 16, taken: 3, remaining: 13 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

const ROSTER: RosterEntry[] = [
  {
    bookingId: 'b1',
    kind: 'player',
    displayName: 'Yousef Alkhatib',
    tier: 'A',
    paymentMethod: 'cash',
    expectedFils: 6000 as Fils,
    isCoachSlot: false,
    playerId: 'p1',
  },
  {
    bookingId: 'b2',
    kind: 'guest',
    displayName: 'Sami the Guest',
    tier: 'B',
    paymentMethod: 'free',
    expectedFils: 0 as Fils,
    isCoachSlot: false,
    playerId: null,
  },
  {
    bookingId: 'b3',
    kind: 'player',
    displayName: 'Rana Haddad',
    tier: 'B+',
    paymentMethod: 'credit',
    expectedFils: 0 as Fils,
    isCoachSlot: false,
    playerId: 'p3',
  },
];

type ScreenProps = React.ComponentProps<typeof SessionManageScreen>;
const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as ScreenProps['navigation'];
const route = {
  key: 'SessionManage',
  name: 'SessionManage',
  params: { sessionId: 's1' },
} as unknown as ScreenProps['route'];

interface Setup {
  session?: Session;
  roster?: RosterEntry[];
  now?: Date;
  searchResults?: unknown[];
}

function setup({ session: override, roster = ROSTER, now, searchResults = [] }: Setup = {}): void {
  mockNow.mockReturnValue(now ?? new Date(START.getTime() - 24 * HOUR));
  mockUseSession.mockReturnValue({
    data: override ?? session(),
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseRoster.mockReturnValue({
    data: roster,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseSearch.mockReturnValue({ data: searchResults, isPending: false });
  mockUseLineup.mockReturnValue({
    data: {
      rotations: [
        {
          id: 'r1',
          index: 1,
          rule: 'rule_1_similar',
          courts: [{ courtNumber: 1, team1: ['b1', 'b2'], team2: ['b3'] }],
          sitOuts: [],
          generatedAt: START,
        },
      ],
      lockedCourts: [],
      hasManualLineup: false,
      changesSinceGenerated: 0,
    },
    isPending: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  });
  mockUseCoachOptions.mockReturnValue({ data: [], isPending: false });
  mockUseAdminSchedule.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
}

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<SessionManageScreen navigation={navigation} route={route} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe('the three tabs', () => {
  it('opens on Players', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('manage-players')).toBeTruthy();
    expect(screen.queryByTestId('court-board')).toBeNull();
  });

  it('switches to the court board and to the money tab', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByText('Court board'));
    expect(screen.getByTestId('court-board')).toBeTruthy();

    await fireEvent.press(screen.getByText('Money'));
    expect(screen.getByTestId('manage-money')).toBeTruthy();
  });
});

describe('the roster', () => {
  it('shows every attendee with a tier badge and a payment method chip', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('roster-row-b1')).toBeTruthy();
    expect(screen.getByText('Yousef Alkhatib')).toBeTruthy();
    expect(screen.getByText('Sami the Guest')).toBeTruthy();
    expect(screen.getByText('Cash on arrival')).toBeTruthy();
    expect(screen.getByText('Subscription credit')).toBeTruthy();
    expect(screen.getByText('No charge')).toBeTruthy();
  });

  it('labels a guest as a guest. D44', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('has an empty state', async () => {
    setup({ roster: [] });

    const screen = await renderScreen();

    expect(screen.getByTestId('roster-empty')).toBeTruthy();
    expect(screen.getByText('Nobody is booked yet.')).toBeTruthy();
  });
});

describe('the three add buttons', () => {
  it('offers all three. 15.2', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('manage-add-player')).toBeTruthy();
    expect(screen.getByTestId('manage-add-guest')).toBeTruthy();
    expect(screen.getByTestId('manage-add-coach')).toBeTruthy();
  });

  it('stays available after the cutoff and during the session. D22', async () => {
    setup({ now: new Date(START.getTime() + 10 * 60 * 1000) });

    const screen = await renderScreen();

    expect(screen.getByTestId('manage-add-player').props.accessibilityState.disabled).toBe(false);
  });

  it('stops at capacity, because capacity is hard. D30', async () => {
    const full = Array.from({ length: 16 }, (_, index) => ({
      ...(ROSTER[0] as RosterEntry),
      bookingId: `full-${String(index)}`,
    }));
    setup({ roster: full });

    const screen = await renderScreen();

    expect(screen.getByTestId('manage-add-player').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('manage-full')).toBeTruthy();
  });

  it('opens the guest sheet, which defaults to the session price and tier B', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-guest'));

    expect(screen.getByTestId('add-guest-sheet')).toBeTruthy();
    expect(screen.getByTestId('guest-tier-B').props.accessibilityState.selected).toBe(true);
  });

  it('adds a free guest with the income hint. D45', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-guest'));
    await fireEvent.changeText(screen.getByTestId('guest-name'), 'Walk-in Friend');
    await fireEvent.press(screen.getByText('Free'));

    expect(screen.getByTestId('guest-free-hint')).toBeTruthy();
    expect(
      screen.getByText('Free guests fill empty spots and are not counted as income.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('guest-submit'));

    expect(mockAddGuest.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      guestName: 'Walk-in Friend',
      guestTier: 'B',
      isFree: true,
      amountFils: null,
    });
  });

  it('will not add a guest with no name', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-guest'));
    await fireEvent.press(screen.getByTestId('guest-submit'));

    expect(mockAddGuest).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the guest's name.")).toBeTruthy();
  });

  it('opens the player search and adds by credit when he has some. D43', async () => {
    setup({
      searchResults: [
        {
          playerId: 'p9',
          displayName: 'Omar Nasser',
          tier: 'A-',
          credits: 4,
          creditExpires: '2026-09-14',
          isBooked: false,
        },
      ],
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-player'));
    await fireEvent.changeText(screen.getByTestId('player-search'), 'Omar');
    await fireEvent.press(screen.getByTestId('player-result-p9'));
    await fireEvent.press(screen.getByTestId('player-add-credit'));

    expect(mockAddPlayer.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      playerId: 'p9',
      useCredit: true,
    });
  });

  it('offers cash, marked paid, when he has no credits. D43', async () => {
    setup({
      searchResults: [
        {
          playerId: 'p10',
          displayName: 'Rami Haddad',
          tier: 'C+',
          credits: 0,
          creditExpires: null,
          isBooked: false,
        },
      ],
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-player'));
    await fireEvent.changeText(screen.getByTestId('player-search'), 'Rami');
    await fireEvent.press(screen.getByTestId('player-result-p10'));

    expect(screen.getByText('Cash, marked paid')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('player-add-cash'));

    expect(mockAddPlayer.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      playerId: 'p10',
      useCredit: false,
    });
  });

  it('shows an already booked player greyed out, with the reason. 15.2', async () => {
    setup({
      searchResults: [
        {
          playerId: 'p11',
          displayName: 'Already In',
          tier: 'B',
          credits: 2,
          creditExpires: '2026-09-14',
          isBooked: true,
        },
      ],
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('manage-add-player'));
    await fireEvent.changeText(screen.getByTestId('player-search'), 'Already');

    expect(screen.getByText('Already booked in this session')).toBeTruthy();

    // The row has no handler at all, so pressing it goes nowhere.
    await fireEvent.press(screen.getByTestId('player-result-p11'));
    expect(screen.queryByTestId('player-add-credit')).toBeNull();
    expect(screen.queryByTestId('player-add-cash')).toBeNull();
  });
});

describe('removing somebody', () => {
  it('asks first, then removes a cash booking with no credit question', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-remove'));

    expect(screen.getByTestId('remove-dialog')).toBeTruthy();
    expect(screen.queryByTestId('remove-credit-dialog')).toBeNull();

    await fireEvent.press(screen.getByTestId('remove-dialog-confirm'));

    expect(mockRemove.mock.calls[0]?.[0]).toEqual({
      bookingId: 'b1',
      sessionId: 's1',
      returnCredit: null,
    });
  });

  it('asks about the credit on a credit booking, defaulting to returning it outside three hours', async () => {
    // D25: cancelled more than 3 hours out, the credit comes back.
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b3'));
    await fireEvent.press(screen.getByTestId('row-action-remove'));

    expect(screen.getByTestId('remove-credit-dialog')).toBeTruthy();
    expect(screen.getByText('Return the credit')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('remove-credit-dialog-confirm'));

    expect(mockRemove.mock.calls[0]?.[0]).toEqual({
      bookingId: 'b3',
      sessionId: 's1',
      returnCredit: true,
    });
  });

  it('defaults to keeping the credit inside three hours. D26', async () => {
    setup({ now: new Date(START.getTime() - 2 * HOUR) });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b3'));
    await fireEvent.press(screen.getByTestId('row-action-remove'));
    await fireEvent.press(screen.getByTestId('remove-credit-dialog-confirm'));

    expect(mockRemove.mock.calls[0]?.[0]).toEqual({
      bookingId: 'b3',
      sessionId: 's1',
      returnCredit: false,
    });
  });

  it('lets the coach override either way. 8.3', async () => {
    setup({ now: new Date(START.getTime() - 2 * HOUR) });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b3'));
    await fireEvent.press(screen.getByTestId('row-action-remove'));
    // Inside three hours the alternative is to hand it back anyway.
    await fireEvent.press(screen.getByTestId('remove-credit-alternative'));

    expect(mockRemove.mock.calls[0]?.[0]).toEqual({
      bookingId: 'b3',
      sessionId: 's1',
      returnCredit: true,
    });
  });
});

describe('moving somebody to another session', () => {
  function otherSession(overrides: Partial<Session> = {}): Session {
    return session({
      id: 's2',
      venue: { id: 'v2', name: 'Beit Al Nashama', area: 'Abdoun', googleMapsUrl: null },
      startsAt: parseInstant('2026-08-26T16:00:00Z'),
      endsAt: parseInstant('2026-08-26T17:30:00Z'),
      occupancy: { capacity: 16, taken: 3, remaining: 13 },
      ...overrides,
    });
  }

  it('offers Move only for a player row, not a guest', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b2')); // the guest, b2
    expect(screen.queryByTestId('row-action-move')).toBeNull();
    expect(screen.getByTestId('row-action-remove')).toBeTruthy();
  });

  it('lists other open sessions and moves him into the chosen one', async () => {
    mockUseAdminSchedule.mockReturnValue({
      data: [otherSession()],
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-move'));

    expect(screen.getByTestId('move-target-s2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('move-target-s2'));
    await fireEvent.press(screen.getByTestId('move-confirm'));

    expect(mockMove.mock.calls[0]?.[0]).toEqual({ bookingId: 'b1', targetSessionId: 's2' });
  });

  it('excludes the session he is already on from the list', async () => {
    mockUseAdminSchedule.mockReturnValue({
      data: [session(), otherSession()],
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-move'));

    expect(screen.queryByTestId('move-target-s1')).toBeNull();
    expect(screen.getByTestId('move-target-s2')).toBeTruthy();
  });

  it('marks a full session and does not let him tap it', async () => {
    mockUseAdminSchedule.mockReturnValue({
      data: [otherSession({ occupancy: { capacity: 16, taken: 16, remaining: 0 } })],
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-move'));

    expect(screen.getByTestId('move-target-full-s2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('move-target-s2'));
    expect(screen.queryByTestId('move-confirm')).toBeNull();
  });
});

describe('changing a player’s tier', () => {
  it('offers Change tier only for a player row, not a guest', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b2')); // the guest, b2
    expect(screen.queryByTestId('row-action-change-tier')).toBeNull();
  });

  it('writes immediately, one tap, no separate save step', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-change-tier'));

    expect(screen.getByTestId('change-tier-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('change-tier-picker-A+'));

    expect(mockSetTier).toHaveBeenCalledWith({ playerId: 'p1', tier: 'A+' }, expect.anything());
  });

  it('closes the sheet once the write succeeds', async () => {
    mockSetTier.mockImplementation((_input, handlers) => handlers.onSuccess?.());
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('roster-row-b1'));
    await fireEvent.press(screen.getByTestId('row-action-change-tier'));
    await fireEvent.press(screen.getByTestId('change-tier-picker-unrated'));

    expect(mockSetTier).toHaveBeenCalledWith({ playerId: 'p1', tier: null }, expect.anything());
    expect(screen.queryByTestId('change-tier-sheet')).toBeNull();
  });
});

describe('Arabic', () => {
  it('renders the tabs, the add buttons and a roster row in Arabic', async () => {
    const screen = await renderScreen('ar');

    expect(screen.getByText('اللاعبون')).toBeTruthy();
    expect(screen.getByText('أضف لاعبًا')).toBeTruthy();
    expect(screen.getByText('ضيف')).toBeTruthy();
  });
});

describe('19.3 item 6, the session states', () => {
  // The roster's three states are forced elsewhere in this file. The session
  // read behind the whole screen had none.
  it('shows a skeleton while the session loads', async () => {
    setup();
    mockUseSession.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('manage-loading')).toBeTruthy();
    expect(screen.queryByTestId('manage-players')).toBeNull();
  });

  it('shows an error state with a retry when the session read failed', async () => {
    const refetch = jest.fn();
    setup();
    mockUseSession.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error('nope'),
      refetch,
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('manage-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a skeleton while the roster loads', async () => {
    setup();
    mockUseRoster.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('roster-loading')).toBeTruthy();
  });

  it('shows an error state when the roster read failed', async () => {
    setup();
    mockUseRoster.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error('nope'),
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('roster-error')).toBeTruthy();
  });
});
