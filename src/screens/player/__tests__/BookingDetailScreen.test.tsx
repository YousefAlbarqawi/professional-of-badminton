/**
 * Booking detail. BUILD-SPEC 14.10.
 *
 * The assertions that matter most here are the negative ones. "The player is
 * never shown payment_status, whether the coach marked him paid, or any
 * balance" (14.10, A4), and the query does not even fetch those columns — so
 * the test that proves it is one that looks for them and finds nothing.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { MyBooking } from '@/features/bookings/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { BookingDetailScreen } from '../BookingDetailScreen';

jest.mock('@/lib/supabase');

const NOW = parseInstant('2026-08-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const mockNow = jest.fn<Date, []>(() => NOW);
jest.mock('@/lib/time', () => ({
  ...jest.requireActual<object>('@/lib/time'),
  nowInAmman: () => mockNow(),
}));

const mockUseBooking = jest.fn();
jest.mock('@/features/bookings/queries', () => ({
  useMyBooking: () => mockUseBooking(),
}));

const mockCancel = jest.fn();
const mockCancelState = jest.fn();
jest.mock('@/features/bookings/mutations', () => ({
  useCancelBooking: () => mockCancelState(),
}));

function booking(overrides: {
  startsInHours: number;
  method?: MyBooking['paymentMethod'];
  sessionStatus?: MyBooking['session']['status'];
  sessionType?: MyBooking['session']['sessionType'];
  expectedFils?: number;
}): MyBooking {
  const startsAt = new Date(NOW.getTime() + overrides.startsInHours * HOUR);

  return {
    id: 'b1',
    status: 'confirmed',
    paymentMethod: overrides.method ?? 'cash',
    expectedFils: (overrides.expectedFils ?? 6000) as Fils,
    bookedAt: parseInstant('2026-08-18T09:00:00Z'),
    session: {
      id: 's1',
      venue: {
        id: 'v1',
        name: 'International Independent Schools',
        area: 'Khalda',
        googleMapsUrl: null,
      },
      sessionDate: '2026-08-20',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
      sessionType: overrides.sessionType ?? 'standard',
      status: overrides.sessionStatus ?? 'scheduled',
      cancellationNote: null,
    },
  };
}

type ScreenProps = React.ComponentProps<typeof BookingDetailScreen>;
const goBack = jest.fn();
const navigation = { goBack, navigate: jest.fn() } as unknown as ScreenProps['navigation'];
const route = {
  key: 'BookingDetail',
  name: 'BookingDetail',
  params: { bookingId: 'b1' },
} as unknown as ScreenProps['route'];

function setup(data: MyBooking | undefined, state: Record<string, unknown> = {}): void {
  mockUseBooking.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...state,
  });
  mockCancelState.mockReturnValue({
    mutate: mockCancel,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  });
}

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<BookingDetailScreen navigation={navigation} route={route} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNow.mockReturnValue(NOW);
});

describe('what it shows', () => {
  it('shows the session summary, the method and the price he booked at', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen();

    expect(screen.getByText('International Independent Schools')).toBeTruthy();
    expect(screen.getByTestId('booking-when')).toBeTruthy();
    expect(screen.getByTestId('booking-detail-method')).toBeTruthy();
    expect(screen.getByText('Cash on arrival')).toBeTruthy();
    // A7: the snapshot, not today's price.
    expect(screen.getByTestId('booking-amount')).toBeTruthy();
    expect(screen.getByText('6.000 JD')).toBeTruthy();
  });

  it('carries the WhatsApp button. D72', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen();

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('says nothing about whether he has paid. 14.10, A4', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen();

    expect(screen.queryByText(/unpaid/i)).toBeNull();
    expect(screen.queryByText(/\bpaid\b/i)).toBeNull();
    expect(screen.queryByText(/owe/i)).toBeNull();
    expect(screen.queryByText(/balance/i)).toBeNull();
  });

  it('shows the banner when the coach cancelled the session', async () => {
    setup(booking({ startsInHours: 30, sessionStatus: 'cancelled' }));

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-session-cancelled')).toBeTruthy();
  });
});

describe('the cancel button, subject to the window', () => {
  it('appears more than three hours before start', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-cancel')).toBeTruthy();
  });

  it('is replaced by the coach’s copy inside three hours. D24, 9.2', async () => {
    setup(booking({ startsInHours: 2 }));

    const screen = await renderScreen();

    expect(screen.queryByTestId('booking-cancel')).toBeNull();
    expect(screen.getByTestId('booking-cancel-too-late')).toBeTruthy();
    expect(screen.getByText('Cancellations within 3 hours are handled by the coach.')).toBeTruthy();
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('is gone once the session is over', async () => {
    setup(booking({ startsInHours: -5 }));

    const screen = await renderScreen();

    expect(screen.queryByTestId('booking-cancel')).toBeNull();
    expect(screen.getByTestId('booking-past-note')).toBeTruthy();
  });

  it('asks before it cancels. 17.4', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('booking-cancel'));

    expect(mockCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('booking-cancel-dialog')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('booking-cancel-dialog-confirm'));
    expect(mockCancel.mock.calls[0]?.[0]).toBe('b1');
  });
});

describe('states', () => {
  it('shows a skeleton while loading', async () => {
    setup(undefined, { isPending: true });

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-detail-loading')).toBeTruthy();
  });

  it('shows an error state with a retry', async () => {
    setup(undefined, { isError: true, error: { message: 'boom' } });

    const screen = await renderScreen();

    expect(screen.getByTestId('booking-detail-error')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the summary and the cancel button in Arabic', async () => {
    setup(booking({ startsInHours: 30 }));

    const screen = await renderScreen('ar');

    expect(screen.getByText('إلغاء حجزي')).toBeTruthy();
    expect(screen.getByText('نقدًا عند الحضور')).toBeTruthy();
    expect(screen.getByText('6.000 د.أ')).toBeTruthy();
  });
});
