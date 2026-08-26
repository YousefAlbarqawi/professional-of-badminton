/**
 * Admin schedule and Today. BUILD-SPEC 15.3 and 15.1.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Session } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { AdminScheduleScreen } from '../AdminScheduleScreen';
import { TodayScreen } from '../TodayScreen';

jest.mock('@/lib/supabase');

const mockUseAdminSchedule = jest.fn();
const mockUseTodaySessions = jest.fn();
const mockUseSessionsMoneySummary = jest.fn();

jest.mock('@/features/sessions/queries', () => ({
  useAdminSchedule: () => mockUseAdminSchedule(),
  useTodaySessions: () => mockUseTodaySessions(),
  ADMIN_SCHEDULE_DAYS: 30,
}));

jest.mock('@/features/payments/queries', () => ({
  useSessionsMoneySummary: () => mockUseSessionsMoneySummary(),
}));

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
    ...overrides,
  };
}

function queryResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

const navigate = jest.fn();

type AdminProps = React.ComponentProps<typeof AdminScheduleScreen>;
const adminNavigation = { navigate } as unknown as AdminProps['navigation'];
const adminRoute = {
  key: 'AdminScheduleList',
  name: 'AdminScheduleList',
} as unknown as AdminProps['route'];

type TodayProps = React.ComponentProps<typeof TodayScreen>;
const todayNavigation = { navigate } as unknown as TodayProps['navigation'];
const todayRoute = { key: 'TodayList', name: 'TodayList' } as unknown as TodayProps['route'];

async function renderAdminSchedule(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(
    <AdminScheduleScreen navigation={adminNavigation} route={adminRoute} />,
    { locale },
  );
}

async function renderToday(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<TodayScreen navigation={todayNavigation} route={todayRoute} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAdminSchedule.mockReturnValue(queryResult([]));
  mockUseTodaySessions.mockReturnValue(queryResult([]));
  mockUseSessionsMoneySummary.mockReturnValue(queryResult(new Map()));
});

describe('admin schedule', () => {
  it('offers the one-off session button in the header', async () => {
    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-create-one-off')).toBeTruthy();
    expect(screen.getByText('Create a one-off session')).toBeTruthy();
  });

  it('says how far forward it reaches', async () => {
    const screen = await renderAdminSchedule();

    expect(screen.getByText('The next 30 days')).toBeTruthy();
  });

  it('opens the edit screen for the session that was tapped', async () => {
    mockUseAdminSchedule.mockReturnValue(queryResult([session({ id: 'abc' })]));

    const screen = await renderAdminSchedule();
    await fireEvent.press(screen.getByTestId('admin-card-abc'));

    expect(navigate).toHaveBeenCalledWith('SessionEdit', { sessionId: 'abc' });
  });

  it('opens the create screen from the header', async () => {
    const screen = await renderAdminSchedule();
    await fireEvent.press(screen.getByTestId('admin-create-one-off'));

    expect(navigate).toHaveBeenCalledWith('CreateSession', {});
  });

  it('duplicates a row into the create screen, prefilled but dateless', async () => {
    mockUseAdminSchedule.mockReturnValue(
      queryResult([
        session({
          id: 'abc',
          startsAt: parseInstant('2026-08-24T16:00:00Z'),
          endsAt: parseInstant('2026-08-24T17:30:00Z'),
          priceFils: 6500 as Fils,
          courtCount: 3,
        }),
      ]),
    );

    const screen = await renderAdminSchedule();
    await fireEvent.press(screen.getByTestId('admin-duplicate-abc'));

    expect(navigate).toHaveBeenCalledWith('CreateSession', {
      venueId: 'v1',
      startTime: '19:00',
      durationMinutes: 90,
      priceJD: '6.5',
      courtCount: 3,
    });
  });

  it('keeps cancelled sessions on the list, struck through', async () => {
    // 15.3: "including cancelled sessions in a struck-through style".
    mockUseAdminSchedule.mockReturnValue(
      queryResult([session({ id: 'gone', status: 'cancelled' })]),
    );

    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-card-gone')).toBeTruthy();
    expect(screen.getByTestId('admin-card-gone-cancelled')).toBeTruthy();
    const venueLabel = screen.getByText('International Independent Schools');
    expect(venueLabel.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
  });

  it('shows a status chip on every row', async () => {
    mockUseAdminSchedule.mockReturnValue(
      queryResult([
        session({ id: 'a', status: 'scheduled' }),
        session({
          id: 'b',
          status: 'pending_review',
          startsAt: parseInstant('2026-08-24T17:30:00Z'),
          endsAt: parseInstant('2026-08-24T19:00:00Z'),
        }),
      ]),
    );

    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-status-a')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('groups by day', async () => {
    mockUseAdminSchedule.mockReturnValue(
      queryResult([
        session({ id: 'a' }),
        session({
          id: 'b',
          sessionDate: '2026-08-25',
          startsAt: parseInstant('2026-08-25T16:00:00Z'),
          endsAt: parseInstant('2026-08-25T17:30:00Z'),
        }),
      ]),
    );

    const screen = await renderAdminSchedule();

    expect(screen.getByText('24 August 2026')).toBeTruthy();
    expect(screen.getByText('25 August 2026')).toBeTruthy();
  });

  it('shows an empty state with nothing scheduled', async () => {
    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-schedule-empty')).toBeTruthy();
    expect(screen.getByText('No sessions in the next 30 days.')).toBeTruthy();
  });

  it('shows skeletons while loading', async () => {
    mockUseAdminSchedule.mockReturnValue(queryResult(undefined, { isPending: true }));

    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-schedule-loading')).toBeTruthy();
  });

  it('shows an error state when the read failed', async () => {
    mockUseAdminSchedule.mockReturnValue(
      queryResult(undefined, { isError: true, error: new Error('nope') }),
    );

    const screen = await renderAdminSchedule();

    expect(screen.getByTestId('admin-schedule-error')).toBeTruthy();
  });
});

describe('today', () => {
  it('heads the first day Today and the second Tomorrow', async () => {
    // 15.1: "Lists today's sessions, then tomorrow's."
    mockUseTodaySessions.mockReturnValue(
      queryResult([
        session({ id: 'a' }),
        session({
          id: 'b',
          sessionDate: '2026-08-25',
          startsAt: parseInstant('2026-08-25T16:00:00Z'),
          endsAt: parseInstant('2026-08-25T17:30:00Z'),
        }),
      ]),
    );

    const screen = await renderToday();

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
  });

  it('opens session manage for the card that was tapped', async () => {
    mockUseTodaySessions.mockReturnValue(queryResult([session({ id: 'abc' })]));

    const screen = await renderToday();
    await fireEvent.press(screen.getByTestId('today-card-abc'));

    expect(navigate).toHaveBeenCalledWith('SessionManage', { sessionId: 'abc' });
  });

  it('shows occupancy and a status chip', async () => {
    mockUseTodaySessions.mockReturnValue(queryResult([session({ id: 'abc' })]));

    const screen = await renderToday();

    expect(screen.getByText('8 of 16 booked')).toBeTruthy();
    expect(screen.getByTestId('today-status-abc')).toBeTruthy();
  });

  it('shows collected and outstanding once the session is past, from the batch', async () => {
    // 15.1: "a payment summary once the session is past." The fixture's
    // startsAt/endsAt (2026-08-24) is already behind any real clock this
    // suite runs under.
    mockUseTodaySessions.mockReturnValue(queryResult([session({ id: 'abc' })]));
    mockUseSessionsMoneySummary.mockReturnValue(
      queryResult(new Map([['abc', { collectedFils: 8000, outstandingFils: 4000 }]])),
    );

    const screen = await renderToday();

    expect(screen.getByTestId('today-money-abc')).toBeTruthy();
    expect(screen.getByTestId('today-money-abc-collected').children.join('')).toBe(
      'Collected: 8.000 JD',
    );
    expect(screen.getByTestId('today-money-abc-outstanding').children.join('')).toBe(
      'Outstanding: 4.000 JD',
    );
  });

  it('shows nothing yet for a past session while the batch has not resolved it', async () => {
    mockUseTodaySessions.mockReturnValue(queryResult([session({ id: 'abc' })]));
    mockUseSessionsMoneySummary.mockReturnValue(queryResult(new Map()));

    const screen = await renderToday();

    expect(screen.queryByTestId('today-money-abc')).toBeNull();
  });

  it('shows no payment summary for a session that has not ended yet', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    mockUseTodaySessions.mockReturnValue(
      queryResult([session({ id: 'abc', startsAt: future, endsAt: future })]),
    );
    mockUseSessionsMoneySummary.mockReturnValue(
      queryResult(new Map([['abc', { collectedFils: 8000, outstandingFils: 4000 }]])),
    );

    const screen = await renderToday();

    expect(screen.queryByTestId('today-money-abc')).toBeNull();
  });

  it('shows skeletons while loading', async () => {
    mockUseTodaySessions.mockReturnValue(queryResult(undefined, { isPending: true }));

    const screen = await renderToday();

    expect(screen.getByTestId('today-loading')).toBeTruthy();
    expect(screen.queryByTestId('today-list')).toBeNull();
  });

  it('shows an error state with a retry when the read failed', async () => {
    const refetch = jest.fn();
    mockUseTodaySessions.mockReturnValue(
      queryResult(undefined, { isError: true, error: new Error('nope'), refetch }),
    );

    const screen = await renderToday();

    expect(screen.getByTestId('today-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says there are no sessions today', async () => {
    const screen = await renderToday();

    expect(screen.getByTestId('today-empty')).toBeTruthy();
    expect(screen.getByText('No sessions today.')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the admin schedule header in Arabic', async () => {
    const screen = await renderAdminSchedule('ar');

    expect(screen.getByText('إنشاء جلسة منفردة')).toBeTruthy();
    expect(screen.getByText('الأيام الـ30 القادمة')).toBeTruthy();
  });

  it('renders the today empty state in Arabic', async () => {
    const screen = await renderToday('ar');

    expect(screen.getByText('لا توجد جلسات اليوم.')).toBeTruthy();
  });
});
