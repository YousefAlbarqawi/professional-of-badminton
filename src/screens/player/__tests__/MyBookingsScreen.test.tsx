/**
 * My bookings. BUILD-SPEC 14.9.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { splitBookings } from '@/features/bookings/bookingState';
import type { MyBooking } from '@/features/bookings/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { MyBookingsScreen } from '../MyBookingsScreen';

jest.mock('@/lib/supabase');

const NOW = parseInstant('2026-08-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const mockNow = jest.fn<Date, []>(() => NOW);
jest.mock('@/lib/time', () => ({
  ...jest.requireActual<object>('@/lib/time'),
  nowInAmman: () => mockNow(),
}));

const mockUseMyBookings = jest.fn();
jest.mock('@/features/bookings/queries', () => ({
  useMyBookings: () => mockUseMyBookings(),
}));

function booking(overrides: {
  id: string;
  startsInHours: number;
  method?: MyBooking['paymentMethod'];
  sessionStatus?: MyBooking['session']['status'];
  venue?: string;
}): MyBooking {
  const startsAt = new Date(NOW.getTime() + overrides.startsInHours * HOUR);

  return {
    id: overrides.id,
    status: 'confirmed',
    paymentMethod: overrides.method ?? 'cash',
    expectedFils: 6000 as Fils,
    bookedAt: new Date(NOW.getTime() - DAY),
    session: {
      id: `session-${overrides.id}`,
      venue: {
        id: 'v1',
        name: overrides.venue ?? 'International Independent Schools',
        area: 'Khalda',
        googleMapsUrl: null,
      },
      sessionDate: '2026-08-20',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
      sessionType: 'standard',
      status: overrides.sessionStatus ?? 'scheduled',
      cancellationNote: null,
    },
  };
}

type ScreenProps = React.ComponentProps<typeof MyBookingsScreen>;
const parentNavigate = jest.fn();
const navigation = {
  navigate: jest.fn(),
  getParent: () => ({ navigate: parentNavigate }),
} as unknown as ScreenProps['navigation'];
const route = {
  key: 'BookingList',
  name: 'BookingList',
  params: undefined,
} as unknown as ScreenProps['route'];

function setup(bookings: MyBooking[], state: Record<string, unknown> = {}): void {
  mockUseMyBookings.mockReturnValue({
    data: bookings,
    segments: splitBookings(bookings, NOW),
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...state,
  });
}

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<MyBookingsScreen navigation={navigation} route={route} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNow.mockReturnValue(NOW);
});

describe('the upcoming segment', () => {
  it('shows venue, date and time with a payment method chip', async () => {
    setup([booking({ id: 'b1', startsInHours: 30 })]);

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-card-b1')).toBeTruthy();
    expect(screen.getByText('International Independent Schools')).toBeTruthy();
    expect(screen.getByText('Khalda')).toBeTruthy();
    expect(screen.getByTestId('booking-card-b1-method')).toBeTruthy();
    expect(screen.getByText('Cash on arrival')).toBeTruthy();
  });

  it('marks a booking he can still cancel', async () => {
    setup([booking({ id: 'b1', startsInHours: 30 })]);

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-card-b1-cancellable')).toBeTruthy();
  });

  it('does not mark one inside the three hour window. D24', async () => {
    setup([booking({ id: 'b1', startsInHours: 2 })]);

    const screen = await renderScreen();

    expect(screen.queryByTestId('booking-card-b1-cancellable')).toBeNull();
  });

  it('flags a session the coach cancelled', async () => {
    setup([booking({ id: 'b1', startsInHours: 30, sessionStatus: 'cancelled' })]);

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-card-b1-cancelled')).toBeTruthy();
  });

  it('opens the detail screen', async () => {
    setup([booking({ id: 'b1', startsInHours: 30 })]);

    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('booking-card-b1'));

    expect(navigation.navigate).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b1' });
  });

  it('offers a way to the schedule when he has none', async () => {
    setup([]);

    const screen = await renderScreen();

    expect(screen.getByTestId('bookings-empty')).toBeTruthy();
    expect(screen.getByText('You have no reservations yet.')).toBeTruthy();

    await fireEvent.press(screen.getByText('See the schedule'));
    expect(parentNavigate).toHaveBeenCalledWith('ScheduleTab');
  });
});

describe('the past segment', () => {
  it('shows the last 30 days and hides what is older. 5.2', async () => {
    setup([
      booking({ id: 'recent', startsInHours: -48, venue: 'Recent Venue' }),
      booking({ id: 'ancient', startsInHours: -40 * 24, venue: 'Ancient Venue' }),
    ]);

    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Past'));

    expect(screen.getByTestId('booking-card-recent')).toBeTruthy();
    expect(screen.queryByTestId('booking-card-ancient')).toBeNull();
  });

  it('carries no actions: a past row does not open anything', async () => {
    setup([booking({ id: 'recent', startsInHours: -48 })]);

    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Past'));
    await fireEvent.press(screen.getByTestId('booking-card-recent'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('has its own empty state', async () => {
    setup([booking({ id: 'b1', startsInHours: 30 })]);

    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Past'));

    expect(screen.getByTestId('bookings-empty-past')).toBeTruthy();
    expect(screen.getByText('Nothing in the last 30 days.')).toBeTruthy();
  });
});

describe('states', () => {
  it('shows skeletons while loading, not a spinner. 17.4', async () => {
    setup([], { isPending: true });

    const screen = await renderScreen();

    expect(screen.getByTestId('bookings-loading')).toBeTruthy();
  });

  it('shows an error state with a retry', async () => {
    setup([], { isError: true, error: { message: 'boom' } });

    const screen = await renderScreen();

    expect(screen.getByTestId('bookings-error')).toBeTruthy();
    expect(screen.getByText('Could not load your reservations.')).toBeTruthy();
  });

  it('names the offline case separately. D78', async () => {
    setup([], { isError: true, error: new TypeError('Network request failed') });

    const screen = await renderScreen();

    expect(screen.getByText('No internet connection.')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders both segments and a row in Arabic', async () => {
    setup([booking({ id: 'b1', startsInHours: 30 })]);

    const screen = await renderScreen('ar');

    expect(screen.getByText('القادمة')).toBeTruthy();
    expect(screen.getByText('السابقة')).toBeTruthy();
    expect(screen.getByText('نقدًا عند الحضور')).toBeTruthy();
  });
});
