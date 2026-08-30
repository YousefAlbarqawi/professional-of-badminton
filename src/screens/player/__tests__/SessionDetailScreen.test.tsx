/**
 * Session detail. BUILD-SPEC 14.7.
 *
 * 19.1 asks for two things by name: "Session detail renders the correct
 * attendee section for each of the three levels", and "the primary action
 * button matches the state table in Section 14.7 for all eight states". Both
 * are below, and the eight are asserted exhaustively rather than by sample.
 *
 * Phase 4 adds a third: the buttons now do something. Each of the four live
 * actions is asserted to call the right mutation with the right argument, and
 * the destructive one is asserted to ask first.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { SESSION_ACTION_STATES } from '@/features/sessions/sessionState';
import type { Attendee, Session, VisibilityLevel } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionDetailScreen } from '../SessionDetailScreen';

jest.mock('@/lib/supabase');

/**
 * The clock, injected. Fake timers fight React 19's concurrent renderer — the
 * failure looks like overlapping act() calls rather than a timing problem — so
 * the one function that reads the clock is mocked instead.
 */
const mockNow = jest.fn<Date, []>();
jest.mock('@/lib/time', () => ({
  ...jest.requireActual<object>('@/lib/time'),
  nowInAmman: () => mockNow(),
}));

const mockUseSession = jest.fn();
const mockUseAttendees = jest.fn();
const mockUseStanding = jest.fn();
const mockUseBookingProfile = jest.fn();

jest.mock('@/features/sessions/queries', () => ({
  useSession: () => mockUseSession(),
  useSessionAttendees: () => mockUseAttendees(),
  useMyBookingProfile: () => mockUseBookingProfile(),
}));

jest.mock('@/features/bookings/queries', () => ({
  useMySessionStanding: () => mockUseStanding(),
}));

const mockCancel = jest.fn();
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockCreate = jest.fn();

/**
 * A mutation result that is idle, so the screen draws its resting state.
 * Defined inside the factory: jest hoists `jest.mock` above every other
 * statement in the file, so a helper declared out here would not exist yet.
 */
jest.mock('@/features/bookings/mutations', () => {
  const idle = (mutate: jest.Mock): Record<string, unknown> => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
  });

  return {
    useCancelBooking: () => idle(mockCancel),
    useJoinWaitlist: () => idle(mockJoin),
    useLeaveWaitlist: () => idle(mockLeave),
    useCreateBooking: () => idle(mockCreate),
  };
});

jest.mock('@/features/subscriptions/queries', () => ({
  useMyCredits: () => ({ data: { total: 0, nextExpiry: null, hasUsableCredit: false } }),
}));

/** Section 18: asked the first time he joins a waiting list, and never here. */
const mockRequestPermission = jest.fn(async () => true);
jest.mock('@/features/notifications/permissions', () => ({
  requestNotificationPermission: () => mockRequestPermission(),
}));

const HOUR = 60 * 60 * 1000;
const START = parseInstant('2026-08-24T16:00:00Z');
const END = parseInstant('2026-08-24T17:30:00Z');

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    venue: {
      id: 'v1',
      name: 'International Independent Schools',
      area: 'Khalda',
      googleMapsUrl: 'https://maps.example/khalda',
    },
    sessionDate: '2026-08-24',
    startsAt: START,
    endsAt: END,
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 16, taken: 9, remaining: 7 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

const ATTENDEES: Attendee[] = [
  { bookingId: 'b1', displayName: 'Yousef Alkhatib', tier: 'B', isSelf: true },
  { bookingId: 'b2', displayName: 'Omar Nasser', tier: 'A-', isSelf: false },
  { bookingId: 'b3', displayName: 'Rami Haddad', tier: 'C+', isSelf: false },
];

/** What `get_session_attendees` actually returns at each level. 7.2. */
function attendeesAtLevel(level: VisibilityLevel): Attendee[] {
  if (level === 'level_2') return ATTENDEES;
  if (level === 'level_1') {
    return ATTENDEES.map((attendee) => ({ ...attendee, displayName: null }));
  }
  // level_0: his own row, name and tier nulled.
  return [{ bookingId: 'b1', displayName: null, tier: null, isSelf: true }];
}

type ScreenProps = React.ComponentProps<typeof SessionDetailScreen>;
const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as ScreenProps['navigation'];
const route = {
  key: 'SessionDetail',
  name: 'SessionDetail',
  params: { sessionId: 's1' },
} as unknown as ScreenProps['route'];

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<SessionDetailScreen navigation={navigation} route={route} />, {
    locale,
  });
}

interface Setup {
  session?: Session;
  level?: VisibilityLevel;
  isBooked?: boolean;
  isOnWaitlist?: boolean;
  now?: Date;
}

function setup({
  session: sessionOverride,
  level = 'level_0',
  isBooked = false,
  isOnWaitlist = false,
  now = new Date(START.getTime() - 24 * HOUR),
}: Setup = {}): void {
  mockNow.mockReturnValue(now);
  mockUseSession.mockReturnValue({
    data: sessionOverride ?? session(),
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseAttendees.mockReturnValue({ data: attendeesAtLevel(level), refetch: jest.fn() });
  mockUseStanding.mockReturnValue({
    data: { isBooked, bookingId: isBooked ? 'b1' : null, isOnWaitlist },
  });
  mockUseBookingProfile.mockReturnValue({
    data: { visibility: level, customRateStandardFils: null, customRateExtendedFils: null },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe('always visible', () => {
  it('shows the venue, the time range, the courts and the price', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('International Independent Schools')).toBeTruthy();
    expect(screen.getByText('Khalda')).toBeTruthy();
    expect(screen.getByTestId('fact-when')).toBeTruthy();
    expect(screen.getByText('24/8/2026 · 7:00 PM – 8:30 PM')).toBeTruthy();
    expect(screen.getByText('4 courts')).toBeTruthy();
    expect(screen.getByText('6.000 JD')).toBeTruthy();
  });

  it('offers the maps link when the venue has one', async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId('session-open-maps')).toBeTruthy();
  });

  it('hides the maps link when the venue has none', async () => {
    setup({ session: session({ venue: { id: 'v1', name: 'X', area: 'Y', googleMapsUrl: null } }) });
    const screen = await renderScreen();
    expect(screen.queryByTestId('session-open-maps')).toBeNull();
  });

  // 14.6: "the count is not private. Only names and tiers are."
  it.each(['level_0', 'level_1', 'level_2'] as const)('shows occupancy at %s', async (level) => {
    setup({ level });

    const screen = await renderScreen();

    expect(screen.getByTestId('session-occupancy')).toBeTruthy();
    expect(screen.getByText('9 of 16 booked')).toBeTruthy();
  });
});

describe('the attendee section, by visibility level', () => {
  it('level 0 shows a count and nothing else — not even anonymous rows', async () => {
    setup({ level: 'level_0' });

    const screen = await renderScreen();

    expect(screen.getByTestId('attendees-level-0')).toBeTruthy();
    expect(screen.getByText('9 players booked.')).toBeTruthy();
    expect(screen.queryByTestId('attendees-level-1')).toBeNull();
    expect(screen.queryByTestId('attendees-level-2')).toBeNull();
    expect(screen.queryByText('Yousef Alkhatib')).toBeNull();
    expect(screen.queryByText('B')).toBeNull();
  });

  it('level 1 shows tier badges only, strongest first, own badge outlined', async () => {
    setup({ level: 'level_1' });

    const screen = await renderScreen();

    expect(screen.getByTestId('attendees-level-1')).toBeTruthy();
    expect(screen.getByText('A-')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C+')).toBeTruthy();
    // No names reach this level, from the server or from the screen.
    expect(screen.queryByText('Yousef Alkhatib')).toBeNull();
    expect(screen.queryByTestId('attendees-level-2')).toBeNull();

    const badges = screen.getAllByTestId(/^attendee-tier-/);
    expect(badges.map((badge) => badge.props.accessibilityLabel)).toEqual(['A-', 'B', 'C+']);
  });

  it('level 2 shows names with tier badges, in booking order', async () => {
    setup({ level: 'level_2' });

    const screen = await renderScreen();

    expect(screen.getByTestId('attendees-level-2')).toBeTruthy();
    expect(screen.getByText('Yousef Alkhatib')).toBeTruthy();
    expect(screen.getByText('Omar Nasser')).toBeTruthy();
    expect(screen.getByText('Rami Haddad')).toBeTruthy();
    expect(screen.getByTestId('attendee-row-b1')).toBeTruthy();
    // Own row highlighted.
    expect(screen.getByText('Your spot')).toBeTruthy();
  });

  // D18: "No player ever sees court assignments or rotations, at any level."
  it.each(['level_0', 'level_1', 'level_2'] as const)(
    'never mentions a court assignment at %s',
    async (level) => {
      setup({ level });

      const screen = await renderScreen();

      expect(screen.queryByText(/rotation/i)).toBeNull();
      expect(screen.queryByText(/court 1/i)).toBeNull();
    },
  );
});

describe('the primary action, by state', () => {
  it('offers a reservation with spots left before the cutoff', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('action-open')).toBeTruthy();
    expect(screen.getByText('Reserve a spot')).toBeTruthy();
  });

  it('offers the waiting list when full', async () => {
    setup({ session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }) });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-full')).toBeTruthy();
    expect(screen.getByText('Join the waiting list')).toBeTruthy();
    expect(
      screen.getByText(
        'When a spot opens everyone on the list is told at once. The first to reserve gets it.',
      ),
    ).toBeTruthy();
  });

  it('offers to leave the waiting list when he is on it', async () => {
    setup({
      session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }),
      isOnWaitlist: true,
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-on-waitlist')).toBeTruthy();
    expect(screen.getByText('Leave the waiting list')).toBeTruthy();
  });

  it('offers cancellation more than three hours out', async () => {
    setup({ isBooked: true, now: new Date(START.getTime() - 4 * HOUR) });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-booked-cancellable')).toBeTruthy();
    expect(screen.getByTestId('action-button').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText('Cancel my reservation')).toBeTruthy();
  });

  it('disables cancellation inside three hours and points at WhatsApp', async () => {
    // D24: only the coach can remove him now.
    setup({ isBooked: true, now: new Date(START.getTime() - 2 * HOUR) });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-booked-locked')).toBeTruthy();
    expect(screen.getByTestId('action-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Cancellations within 3 hours are handled by the coach.')).toBeTruthy();
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('shows a disabled Booking closed after the one hour cutoff', async () => {
    setup({ now: new Date(START.getTime() - 30 * 60 * 1000) });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-closed')).toBeTruthy();
    expect(screen.getByTestId('action-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Booking closed')).toBeTruthy();
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('shows a red banner and no action on a cancelled session', async () => {
    setup({
      session: session({ status: 'cancelled', cancellationNote: 'The gym is closed.' }),
      isBooked: true,
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-cancelled')).toBeTruthy();
    expect(screen.getByText('This session was cancelled')).toBeTruthy();
    expect(screen.getByText('The coach added: The gym is closed.')).toBeTruthy();
    expect(screen.queryByTestId('action-button')).toBeNull();
    // "no actions except WhatsApp"
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers nothing once the session is over', async () => {
    setup({ isBooked: true, now: new Date(END.getTime() + HOUR) });

    const screen = await renderScreen();

    expect(screen.getByTestId('action-ended')).toBeTruthy();
    expect(screen.getByText('This session is over.')).toBeTruthy();
    expect(screen.queryByTestId('action-button')).toBeNull();
  });

  /**
   * One row per state. The list is asserted against SESSION_ACTION_STATES so
   * that adding a ninth state to the enumeration fails here until it has a
   * button, rather than silently rendering nothing.
   */
  const STATE_CASES: [state: string, setup: Setup][] = [
    ['open', {}],
    ['full', { session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }) }],
    [
      'on-waitlist',
      {
        session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }),
        isOnWaitlist: true,
      },
    ],
    ['booked-cancellable', { isBooked: true, now: new Date(START.getTime() - 4 * HOUR) }],
    ['booked-locked', { isBooked: true, now: new Date(START.getTime() - 2 * HOUR) }],
    ['closed', { now: new Date(START.getTime() - 30 * 60 * 1000) }],
    ['cancelled', { session: session({ status: 'cancelled' }) }],
    ['ended', { now: new Date(END.getTime() + HOUR) }],
  ];

  it('covers every state the enumeration names', () => {
    expect(STATE_CASES).toHaveLength(SESSION_ACTION_STATES.length);
  });

  it.each(STATE_CASES)('renders exactly the %s action and no other', async (state, options) => {
    setup(options);

    const screen = await renderScreen();

    expect(screen.getByTestId(`action-${state}`)).toBeTruthy();
    // Exactly one action block is on screen at a time.
    expect(screen.getAllByTestId(/^action-(?!button$)/)).toHaveLength(1);
  });
});

describe('Arabic', () => {
  it('renders the level 2 attendee list and the reserve button in Arabic', async () => {
    setup({ level: 'level_2' });

    const screen = await renderScreen('ar');

    expect(screen.getByText('من سيحضر')).toBeTruthy();
    expect(screen.getByText('احجز مكانك')).toBeTruthy();
    expect(screen.getByText('6.000 د.أ')).toBeTruthy();
  });

  it('renders the level 0 count in Arabic', async () => {
    setup({ level: 'level_0' });

    const screen = await renderScreen('ar');

    expect(screen.getByText('9 لاعبين محجوزين.')).toBeTruthy();
  });
});

/**
 * The four actions that now do something. 14.8 and 9.5.
 */
describe('the actions', () => {
  it('opens the booking sheet from Reserve a spot', async () => {
    const screen = await renderScreen();

    expect(screen.queryByTestId('booking-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('action-button'));

    expect(screen.getByTestId('booking-sheet')).toBeTruthy();
    expect(screen.getByText('How will you pay?')).toBeTruthy();
  });

  it('joins the waiting list, then asks for notification permission', async () => {
    // Section 18: "Permission is requested contextually, the first time the
    // player joins a waiting list, not on first launch."
    setup({ session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }) });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('action-button'));

    expect(mockJoin).toHaveBeenCalled();
    expect(mockJoin.mock.calls[0]?.[0]).toBe('s1');
  });

  it('does not ask for notification permission before he joins anything', async () => {
    await renderScreen();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('leaves the waiting list', async () => {
    setup({
      session: session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } }),
      isOnWaitlist: true,
    });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('action-button'));

    expect(mockLeave).toHaveBeenCalled();
    expect(mockLeave.mock.calls[0]?.[0]).toBe('s1');
  });

  it('asks before cancelling, and cancels the right booking', async () => {
    // 17.4: every destructive action confirms.
    setup({ isBooked: true, now: new Date(START.getTime() - 4 * HOUR) });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('action-button'));
    expect(mockCancel).not.toHaveBeenCalled();

    expect(screen.getByText('Cancel your reservation?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cancel-dialog-confirm'));

    expect(mockCancel).toHaveBeenCalled();
    expect(mockCancel.mock.calls[0]?.[0]).toBe('b1');
  });

  it('cancels nothing from the disabled button inside three hours', async () => {
    // D24. The button is there so the state is legible, and it is inert.
    setup({ isBooked: true, now: new Date(START.getTime() - 2 * HOUR) });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('action-button'));

    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('19.3 item 6, the states', () => {
  // 14.7 has no empty state: a session with nobody in it is still a session,
  // and the attendee card says so in its own words rather than through
  // `EmptyState`. Loading and error are the two that exist, and neither was
  // forced anywhere before this.
  it('shows skeletons while the session loads', async () => {
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

    expect(screen.getByTestId('session-loading')).toBeTruthy();
    expect(screen.queryByTestId('session-detail')).toBeNull();
  });

  it('shows an error state with a retry when the read failed', async () => {
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

    expect(screen.getByTestId('session-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('carries the WhatsApp affordance on the error state. D72', async () => {
    setup();
    mockUseSession.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error('nope'),
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('says nobody is booked yet rather than showing an empty list', async () => {
    setup({ level: 'level_2' });
    mockUseAttendees.mockReturnValue({ data: [], refetch: jest.fn() });

    const screen = await renderScreen();

    expect(screen.getByTestId('attendees-empty')).toBeTruthy();
  });
});
