/**
 * The court board. BUILD-SPEC 13.8, 13.9, 13.10, and 19.1's component
 * requirement: "Court board swap updates both tiles."
 *
 * The drag is not driven here — a pan gesture does not reach the renderer, and
 * its hit test is a pure function tested in
 * `src/features/matchmaking/__tests__/boardLayout.test.ts`. Tap-to-swap is
 * driven, and 13.9 requires it anyway as the accessible half.
 */
import { fireEvent, within, type RenderResult } from '@testing-library/react-native';

import { I18nManager } from 'react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { boardRowDirection } from '@/features/matchmaking/boardLayout';
import type { RosterEntry } from '@/features/bookings/types';
import type { StoredLineup } from '@/features/matchmaking/boardTypes';
import type { Session } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionCourtBoardTab } from '../SessionCourtBoardTab';

jest.mock('@/lib/supabase');

const START = parseInstant('2026-08-24T16:00:00Z');

const mockUseRoster = jest.fn();
jest.mock('@/features/bookings/queries', () => ({
  useSessionRoster: () => mockUseRoster(),
}));

const mockUseLineup = jest.fn();
const mockUsePairingRules = jest.fn();
jest.mock('@/features/matchmaking/queries', () => ({
  useLineup: () => mockUseLineup(),
  usePairingRules: () => mockUsePairingRules(),
}));

const mockSave = jest.fn();
const mockSwap = jest.fn();
const mockLock = jest.fn();
jest.mock('@/features/matchmaking/mutations', () => {
  const idle = (mutate: jest.Mock): Record<string, unknown> => ({ mutate, isPending: false });
  return {
    useSaveLineup: () => idle(mockSave),
    useSwapPlayers: () => idle(mockSwap),
    useSetCourtLock: () => idle(mockLock),
    useSetPairingRule: () => idle(jest.fn()),
    useDeletePairingRule: () => idle(jest.fn()),
  };
});

const mockAddRotation = jest.fn();
const mockRemoveRotation = jest.fn();
jest.mock('@/features/sessions/mutations', () => ({
  useAddRotation: () => ({ mutate: mockAddRotation, isPending: false }),
  useRemoveRotation: () => ({ mutate: mockRemoveRotation, isPending: false }),
}));

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    venue: { id: 'v1', name: 'Khalda', area: 'Khalda', googleMapsUrl: null },
    sessionDate: '2026-08-24',
    startsAt: START,
    endsAt: parseInstant('2026-08-24T17:30:00Z'),
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 3,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 12, taken: 10, remaining: 2 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

const NAMES = [
  'Yousef Alkhatib',
  'Rana Haddad',
  'Omar Nasser',
  'Lina Saeed',
  'Karim Odeh',
  'Dana Zaid',
  'Fadi Sabbagh',
  'Maya Rashid',
  'Nabil Farah',
  'Hala Mansour',
];

const ROSTER: RosterEntry[] = NAMES.map((displayName, index) => ({
  bookingId: `b${index + 1}`,
  kind: 'player',
  displayName,
  tier: 'B',
  paymentMethod: 'cash',
  expectedFils: 6000 as Fils,
  isCoachSlot: false,
  playerId: `p${index + 1}`,
}));

/** The coach's own example: ten players on three courts. 13.7, 19.2. */
function lineup(overrides: Partial<StoredLineup> = {}): StoredLineup {
  return {
    rotations: [
      {
        id: 'r1',
        index: 1,
        rule: 'rule_1_similar',
        courts: [
          { courtNumber: 1, team1: ['b1', 'b2'], team2: ['b3', 'b4'] },
          { courtNumber: 2, team1: ['b5', 'b6'], team2: ['b7', 'b8'] },
          { courtNumber: 3, team1: ['b9'], team2: ['b10'] },
        ],
        sitOuts: [],
        generatedAt: START,
      },
      {
        id: 'r2',
        index: 2,
        rule: 'rule_2_mixed',
        courts: [
          { courtNumber: 1, team1: ['b1', 'b5'], team2: ['b2', 'b6'] },
          { courtNumber: 2, team1: ['b3', 'b7'], team2: ['b4', 'b8'] },
          { courtNumber: 3, team1: ['b9'], team2: ['b10'] },
        ],
        sitOuts: [],
        generatedAt: START,
      },
    ],
    lockedCourts: [],
    hasManualLineup: false,
    changesSinceGenerated: 0,
    ...overrides,
  };
}

interface Setup {
  roster?: RosterEntry[];
  board?: StoredLineup | null;
}

function setup({ roster = ROSTER, board = lineup() }: Setup = {}): void {
  mockUseRoster.mockReturnValue({
    data: roster,
    isPending: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  });
  mockUseLineup.mockReturnValue({
    data: board,
    isPending: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  });
  mockUsePairingRules.mockReturnValue({
    data: [],
    isPending: false,
    isSuccess: true,
    isError: false,
  });
}

const onCancelSession = jest.fn();

async function render(
  locale: Locale = 'en',
  sessionOverrides: Partial<Session> = {},
): Promise<RenderResult> {
  return renderWithProviders(
    <SessionCourtBoardTab session={session(sessionOverrides)} onCancelSession={onCancelSession} />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe('the board, 13.10', () => {
  it("draws the coach's ten on three: two doubles and a singles", async () => {
    const screen = await render();

    expect(screen.getByTestId('court-card-1')).toBeTruthy();
    expect(screen.getByTestId('court-card-2')).toBeTruthy();
    expect(screen.getByTestId('court-card-3')).toBeTruthy();
    expect(screen.getByText('Court 3')).toBeTruthy();
    // The singles court draws two tiles rather than four. 13.7.
    expect(screen.getByTestId('court-tile-b9')).toBeTruthy();
    expect(screen.getByTestId('court-tile-b10')).toBeTruthy();
  });

  it('splits the name so the first name is the big line', async () => {
    const screen = await render();

    expect(screen.getByText('Yousef')).toBeTruthy();
    expect(screen.getByText('Alkhatib')).toBeTruthy();
  });

  it('never truncates a long name', async () => {
    const screen = await render();

    // 13.10: "No truncation below 12 characters; wrap instead." Nothing on a
    // tile carries numberOfLines at all, so every name wraps whole.
    expect(screen.getByText('Alkhatib').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Yousef').props.numberOfLines).toBeUndefined();
  });

  it('draws every player name at 18pt or more', async () => {
    const screen = await render();

    for (const label of ['Yousef', 'Alkhatib', 'Rana', 'Haddad']) {
      const style = screen.getByText(label).props.style as { fontSize: number }[];
      expect(style[0]?.fontSize).toBeGreaterThanOrEqual(18);
    }
  });

  it('offers a chip per rotation and switches between them', async () => {
    const screen = await render();

    expect(screen.getByTestId('rotation-chip-1')).toBeTruthy();
    expect(screen.getByTestId('rotation-chip-2')).toBeTruthy();

    // Rotation 1 is rule 1, rotation 2 is rule 2. 13.3.
    expect(screen.getByText(/rule 1/i)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('rotation-chip-2'));
    expect(screen.getByText(/rule 2/i)).toBeTruthy();
  });

  it('heads the sit-outs "Resting"', async () => {
    setup({
      board: lineup({
        rotations: [
          {
            id: 'r1',
            index: 1,
            rule: 'rule_1_similar',
            courts: [
              { courtNumber: 1, team1: ['b1', 'b2'], team2: ['b3', 'b4'] },
              { courtNumber: 2, team1: ['b5', 'b6'], team2: ['b7', 'b8'] },
            ],
            sitOuts: ['b9', 'b10'],
            generatedAt: START,
          },
        ],
      }),
    });
    const screen = await render();

    expect(screen.getByTestId('board-resting')).toBeTruthy();
    expect(screen.getByText('Resting')).toBeTruthy();
    expect(screen.getByTestId('resting-b9')).toBeTruthy();
  });
});

describe('tap to swap, 13.9', () => {
  it('swaps two players and writes immediately', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b1'));
    await fireEvent.press(screen.getByTestId('court-tile-b8'));

    // 13.9: "Every edit writes immediately. There is no save button."
    expect(mockSwap).toHaveBeenCalledWith(
      { sessionId: 's1', rotationId: 'r1', bookingIdA: 'b1', bookingIdB: 'b8' },
      expect.anything(),
    );
  });

  it('marks the first tap as selected and clears it on the second', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b1'));
    expect(screen.getByTestId('court-tile-b1').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(screen.getByTestId('court-tile-b8'));
    expect(screen.getByTestId('court-tile-b1').props.accessibilityState.selected).toBe(false);
  });

  it('lets a second tap on the same tile drop the selection', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b1'));
    await fireEvent.press(screen.getByTestId('court-tile-b1'));

    expect(mockSwap).not.toHaveBeenCalled();
    expect(screen.getByTestId('court-tile-b1').props.accessibilityState.selected).toBe(false);
  });

  it('swaps a player with somebody resting', async () => {
    setup({
      board: lineup({
        rotations: [
          {
            id: 'r1',
            index: 1,
            rule: 'rule_1_similar',
            courts: [
              { courtNumber: 1, team1: ['b1', 'b2'], team2: ['b3', 'b4'] },
              { courtNumber: 2, team1: ['b5', 'b6'], team2: ['b7', 'b8'] },
            ],
            sitOuts: ['b9', 'b10'],
            generatedAt: START,
          },
        ],
      }),
    });
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b1'));
    await fireEvent.press(screen.getByTestId('resting-b9'));

    expect(mockSwap).toHaveBeenCalledWith(
      expect.objectContaining({ bookingIdA: 'b1', bookingIdB: 'b9' }),
      expect.anything(),
    );
  });

  it('refuses a swap touching a locked court, with a toast saying why', async () => {
    setup({
      board: lineup({ lockedCourts: [{ courtNumber: 1, bookingIds: ['b1', 'b2', 'b3', 'b4'] }] }),
    });
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b5'));
    await fireEvent.press(screen.getByTestId('court-tile-b1'));

    expect(mockSwap).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('board-toast')).getByText(/locked/i)).toBeTruthy();
  });

  it('offers Undo for ten seconds after a swap, and the undo swaps back', async () => {
    mockSwap.mockImplementation((_input, handlers) => handlers.onSuccess?.());
    const screen = await render();

    await fireEvent.press(screen.getByTestId('court-tile-b1'));
    await fireEvent.press(screen.getByTestId('court-tile-b8'));

    const undo = screen.getByTestId('board-toast-action');
    expect(undo).toBeTruthy();

    mockSwap.mockClear();
    await fireEvent.press(undo);
    expect(mockSwap).toHaveBeenCalledWith(
      { sessionId: 's1', rotationId: 'r1', bookingIdA: 'b1', bookingIdB: 'b8' },
      expect.anything(),
    );
  });
});

describe('locking a court, 13.9', () => {
  it('locks on a long press of the court heading', async () => {
    const screen = await render();

    await fireEvent(screen.getByTestId('court-header-1'), 'longPress');

    expect(mockLock).toHaveBeenCalledWith(
      { sessionId: 's1', rotationId: 'r1', courtNumber: 1, isLocked: true },
      expect.anything(),
    );
  });

  it('unlocks a locked court, and shows its padlock', async () => {
    setup({
      board: lineup({ lockedCourts: [{ courtNumber: 2, bookingIds: ['b5', 'b6', 'b7', 'b8'] }] }),
    });
    const screen = await render();

    expect(screen.getByTestId('court-lock-2')).toBeTruthy();
    await fireEvent(screen.getByTestId('court-header-2'), 'longPress');

    expect(mockLock).toHaveBeenCalledWith(
      expect.objectContaining({ courtNumber: 2, isLocked: false }),
      expect.anything(),
    );
  });

  it('does not offer the gesture on a singles court. 13.4 rule 3', async () => {
    const screen = await render();

    await fireEvent(screen.getByTestId('court-header-3'), 'longPress');
    expect(mockLock).not.toHaveBeenCalled();
  });
});

describe('regeneration, 13.8', () => {
  it('generates and saves when there is no lineup yet', async () => {
    setup({ board: null });
    await render();

    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0]?.[0];
    expect(saved.sessionId).toBe('s1');
    expect(saved.lineup.rotations).toHaveLength(4);
  });

  it('shows the staleness banner only once he has edited it', async () => {
    setup({ board: lineup({ hasManualLineup: true, changesSinceGenerated: 3 }) });
    const screen = await render();

    expect(screen.getByTestId('board-stale-banner')).toBeTruthy();
    expect(screen.getByText('3 changes since this lineup was made.')).toBeTruthy();
  });

  it("hides the banner while the lineup is still the engine's", async () => {
    setup({ board: lineup({ changesSinceGenerated: 3 }) });
    const screen = await render();

    expect(screen.queryByTestId('board-stale-banner')).toBeNull();
  });

  it('asks before regenerating, because it destroys his work', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('board-regenerate'));
    expect(screen.getByTestId('board-regenerate-dialog')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('board-regenerate-dialog-confirm'));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('feeds the locked courts back in, because they survive regeneration', async () => {
    setup({
      board: lineup({ lockedCourts: [{ courtNumber: 1, bookingIds: ['b1', 'b2', 'b3', 'b4'] }] }),
    });
    const screen = await render();

    await fireEvent.press(screen.getByTestId('board-regenerate'));
    await fireEvent.press(screen.getByTestId('board-regenerate-dialog-confirm'));

    const saved = mockSave.mock.calls[0]?.[0];
    for (const rotation of saved.lineup.rotations) {
      const locked = rotation.courts.find(
        (court: { courtNumber: number }) => court.courtNumber === 1,
      );
      expect([...locked.team1, ...locked.team2].sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
    }
  });
});

describe('adding a rotation, D62/A15', () => {
  it('asks first, then rebuilds the board for the new count', async () => {
    mockAddRotation.mockImplementation((_sessionId, handlers) => handlers.onSuccess?.(5));
    const screen = await render();

    await fireEvent.press(screen.getByTestId('board-add-rotation'));
    expect(screen.getByTestId('board-add-rotation-dialog')).toBeTruthy();
    expect(mockAddRotation).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('board-add-rotation-dialog-confirm'));

    expect(mockAddRotation).toHaveBeenCalledWith('s1', expect.anything());
    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0]?.[0];
    expect(saved.sessionId).toBe('s1');
    expect(saved.lineup.rotations).toHaveLength(5);
  });

  it('hides the control once the session already has the maximum rotations', async () => {
    const screen = await render('en', { rotationCount: 10 });

    expect(screen.queryByTestId('board-add-rotation')).toBeNull();
  });

  it('surfaces the ceiling as a toast rather than rebuilding', async () => {
    mockAddRotation.mockImplementation((_sessionId, handlers) =>
      handlers.onError?.(new Error('rotation_count_at_maximum')),
    );
    const screen = await render();

    await fireEvent.press(screen.getByTestId('board-add-rotation'));
    await fireEvent.press(screen.getByTestId('board-add-rotation-dialog-confirm'));

    expect(mockSave).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('board-toast')).getByText(
        'This session already has the most rotations allowed.',
      ),
    ).toBeTruthy();
  });
});

describe('removing a rotation', () => {
  it('asks first, and deletes the rotation the chips are showing', async () => {
    // "Delete any round", so the index is the one on screen rather than the
    // last — the coach picks it the same way he reads it.
    mockRemoveRotation.mockImplementation((_input, handlers) => handlers.onSuccess?.(3));
    const screen = await render('en', { rotationCount: 4 });

    await fireEvent.press(screen.getByTestId('rotation-chip-2'));
    await fireEvent.press(screen.getByTestId('board-remove-rotation'));
    expect(screen.getByTestId('board-remove-rotation-dialog')).toBeTruthy();
    expect(mockRemoveRotation).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('board-remove-rotation-dialog-confirm'));

    expect(mockRemoveRotation).toHaveBeenCalledWith(
      { sessionId: 's1', rotationIndex: 2 },
      expect.anything(),
    );
    // Unlike Add a rotation, nothing is rebuilt: the rounds that remain keep
    // the pairings the coach has already read out.
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('hides the control on a session down to its last rotation', async () => {
    const screen = await render('en', { rotationCount: 1 });

    expect(screen.queryByTestId('board-remove-rotation')).toBeNull();
  });

  it('surfaces the server’s refusal as a toast', async () => {
    mockRemoveRotation.mockImplementation((_input, handlers) =>
      handlers.onError?.(new Error('rotation_count_at_minimum')),
    );
    const screen = await render();

    await fireEvent.press(screen.getByTestId('board-remove-rotation'));
    await fireEvent.press(screen.getByTestId('board-remove-rotation-dialog-confirm'));

    expect(
      within(screen.getByTestId('board-toast')).getByText('A session needs at least one rotation.'),
    ).toBeTruthy();
  });
});

describe('the states 13.7 asks for', () => {
  it('offers to cancel the session when nobody is booked', async () => {
    setup({ roster: [], board: null });
    const screen = await render();

    expect(screen.getByTestId('board-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel this session'));
    expect(onCancelSession).toHaveBeenCalled();
  });

  it('warns when three players are sharing one court', async () => {
    setup({
      roster: ROSTER.slice(0, 3),
      board: lineup({
        rotations: [
          {
            id: 'r1',
            index: 1,
            rule: 'rule_1_similar',
            courts: [{ courtNumber: 1, team1: ['b1', 'b3'], team2: ['b2'] }],
            sitOuts: [],
            generatedAt: START,
          },
        ],
      }),
    });
    const screen = await render();

    expect(screen.getByTestId('board-three-warning')).toBeTruthy();
  });

  it('shows a skeleton while it loads and an error state when it fails', async () => {
    mockUseLineup.mockReturnValue({
      data: undefined,
      isPending: true,
      isSuccess: false,
      isError: false,
    });
    const loading = await render();
    expect(loading.getByTestId('board-loading')).toBeTruthy();

    setup();
    mockUseLineup.mockReturnValue({
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: true,
      isFetching: false,
      refetch: jest.fn(),
    });
    const failed = await render();
    expect(failed.getByTestId('board-error')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the board without mirroring it. 16.2', async () => {
    const screen = await render('ar');

    expect(screen.getByText('ملعب 1')).toBeTruthy();
    expect(screen.getByText('إعادة التوزيع')).toBeTruthy();

    // The board is the one surface that does not mirror (16.2). React Native
    // flips `row` for itself under RTL, so `boardRowDirection` asks for the
    // reverse and the two cancel out, leaving court 1 leftmost.
    const header = screen.getByTestId('court-header-1');
    const style = header.props.style as { flexDirection?: string };
    expect(style.flexDirection).toBe(boardRowDirection(I18nManager.isRTL));
  });
});
