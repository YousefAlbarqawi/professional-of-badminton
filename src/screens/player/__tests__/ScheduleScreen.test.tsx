/**
 * The schedule. BUILD-SPEC 14.6.
 *
 * The four states of 14.6's table, the day grouping, the occupancy line, and
 * the one rule that is easy to get wrong: "Occupancy display is identical at
 * every visibility level. The count is not private. Only names and tiers are."
 */
import React from 'react';
import type { RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { PlayerSession, SessionDay } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { ScheduleScreen } from '../ScheduleScreen';

jest.mock('@/lib/supabase');

const mockUsePlayerSchedule = jest.fn();

jest.mock('@/features/sessions/queries', () => ({
  usePlayerSchedule: () => mockUsePlayerSchedule(),
}));

const KHALDA = {
  id: 'v1',
  name: 'International Independent Schools',
  area: 'Khalda',
  googleMapsUrl: null,
};

function session(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    id: 's1',
    venue: KHALDA,
    sessionDate: '2026-08-24',
    startsAt: parseInstant('2026-08-24T16:00:00Z'),
    endsAt: parseInstant('2026-08-24T17:30:00Z'),
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 16, taken: 8, remaining: 8 },
    notes: null,
    cancellationNote: null,
    payableFils: 6000 as Fils,
    hasCustomRate: false,
    isBooked: false,
    isOnWaitlist: false,
    ...overrides,
  };
}

function day(dayKey: string, sessions: PlayerSession[]): SessionDay<PlayerSession> {
  return { dayKey, date: parseInstant(`${dayKey}T09:00:00Z`), sessions };
}

type ScreenProps = React.ComponentProps<typeof ScheduleScreen>;
const navigate = jest.fn();
const navigation = { navigate } as unknown as ScreenProps['navigation'];
const route = { key: 'ScheduleList', name: 'ScheduleList' } as unknown as ScreenProps['route'];

function scheduleResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    days: [],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<ScheduleScreen navigation={navigation} route={route} />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePlayerSchedule.mockReturnValue(scheduleResult());
});

describe('states', () => {
  it('shows three skeleton cards while loading, and no spinner', async () => {
    mockUsePlayerSchedule.mockReturnValue(scheduleResult({ isPending: true }));

    const screen = await renderScreen();

    expect(screen.getByTestId('schedule-loading')).toBeTruthy();
    expect(screen.queryByTestId('schedule-list')).toBeNull();
  });

  it('shows the empty copy and the WhatsApp button when there is nothing', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('schedule-empty')).toBeTruthy();
    expect(screen.getByText('No sessions in the next 5 days.')).toBeTruthy();
    // D72: the WhatsApp affordance reaches the empty state too.
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers a retry when the read failed', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ isError: true, error: new Error('boom') }),
    );

    const screen = await renderScreen();

    expect(screen.getByTestId('schedule-error')).toBeTruthy();
    expect(screen.getByText('Could not load the schedule.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('says the phone is offline rather than blaming the server', async () => {
    // 14.6 gives offline its own row. D78: the app is online only, so this is
    // a real state, and `fetch` rejecting with a TypeError is how it arrives.
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ isError: true, error: new TypeError('Network request failed') }),
    );

    const screen = await renderScreen();

    expect(screen.getByText('No internet connection.')).toBeTruthy();
  });
});

describe('the list', () => {
  it('groups sessions under a header per day', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({
        days: [
          day('2026-08-24', [session({ id: 'a' }), session({ id: 'b' })]),
          day('2026-08-25', [session({ id: 'c' })]),
        ],
      }),
    );

    const screen = await renderScreen();

    expect(screen.getByTestId('day-header-2026-08-24')).toBeTruthy();
    expect(screen.getByTestId('day-header-2026-08-25')).toBeTruthy();
    expect(screen.getByText('24/8/2026')).toBeTruthy();
    expect(screen.getByTestId('session-card-a')).toBeTruthy();
    expect(screen.getByTestId('session-card-c')).toBeTruthy();
  });

  it('shows occupancy as a bar and as words', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ days: [day('2026-08-24', [session()])] }),
    );

    const screen = await renderScreen();

    expect(screen.getByTestId('session-card-s1-occupancy-bar')).toBeTruthy();
    expect(screen.getByText('8 of 16 booked')).toBeTruthy();
    expect(screen.getByText('8 spots left')).toBeTruthy();
  });

  it('says Full rather than "0 spots left"', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({
        days: [
          day('2026-08-24', [session({ occupancy: { capacity: 16, taken: 16, remaining: 0 } })]),
        ],
      }),
    );

    const screen = await renderScreen();

    expect(screen.getByText('Full')).toBeTruthy();
  });

  it('marks a session the player already holds a spot in', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ days: [day('2026-08-24', [session({ isBooked: true })])] }),
    );

    const screen = await renderScreen();

    expect(screen.getByTestId('session-card-s1-booked')).toBeTruthy();
    expect(screen.getByText('You are booked')).toBeTruthy();
  });

  it('shows the player’s own rate when he has one', async () => {
    // D41 and 14.6: his rate, with no explanation of why it differs. He knows.
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({
        days: [day('2026-08-24', [session({ payableFils: 0 as Fils, hasCustomRate: true })])],
      }),
    );

    const screen = await renderScreen();

    expect(screen.getByText('0.000 JD')).toBeTruthy();
    expect(screen.queryByText('6.000 JD')).toBeNull();
  });

  it('shows the extended chip on a 150 minute session', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ days: [day('2026-08-24', [session({ sessionType: 'extended' })])] }),
    );

    const screen = await renderScreen();

    expect(screen.getByText('150 minutes')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the schedule with Western digits and a numeric date', async () => {
    mockUsePlayerSchedule.mockReturnValue(
      scheduleResult({ days: [day('2026-08-24', [session()])] }),
    );

    const screen = await renderScreen('ar');

    expect(screen.getByText('24/8/2026')).toBeTruthy();
    expect(screen.getByText('8 من 16 محجوز')).toBeTruthy();
    expect(screen.getByText('6.000 د.أ')).toBeTruthy();
  });

  it('renders the empty state in Arabic', async () => {
    const screen = await renderScreen('ar');

    expect(screen.getByText('لا توجد جلسات خلال الأيام الخمسة القادمة.')).toBeTruthy();
  });
});
