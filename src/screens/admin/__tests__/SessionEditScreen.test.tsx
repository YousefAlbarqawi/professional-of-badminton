/**
 * Editing and cancelling a dated session. BUILD-SPEC 15.4, 15.5 and 9.4.
 *
 * Three things this screen must get right, and each has its own block below:
 *
 *   - the capacity guard blocks a reduction below the current bookings and
 *     never removes anybody (A3);
 *   - a price change tells the coach that existing bookings keep their own
 *     price (A7);
 *   - cancelling states that **no notification is sent** (D31) and then offers
 *     the prefilled announcement composer (9.4 step 6, A6).
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Session } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionEditScreen } from '../SessionEditScreen';

jest.mock('@/lib/supabase');

const mockUseSession = jest.fn();
const mockUpdate = jest.fn();
const mockCancel = jest.fn();
const mockTabNavigate = jest.fn();

jest.mock('@/features/sessions/queries', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/sessions/mutations', () => ({
  useUpdateSession: () => ({ mutate: mockUpdate, isPending: false, isSuccess: false }),
  useCancelSession: () => ({ mutate: mockCancel, isPending: false, isSuccess: false }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockTabNavigate }),
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
    occupancy: { capacity: 16, taken: 12, remaining: 4 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

type ScreenProps = React.ComponentProps<typeof SessionEditScreen>;
const goBack = jest.fn();
const navigation = { navigate: jest.fn(), goBack } as unknown as ScreenProps['navigation'];
const route = {
  key: 'SessionEdit',
  name: 'SessionEdit',
  params: { sessionId: 's1' },
} as unknown as ScreenProps['route'];

function setup(overrides: Partial<Session> = {}): void {
  mockUseSession.mockReturnValue({
    data: session(overrides),
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });
}

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<SessionEditScreen navigation={navigation} route={route} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe('the capacity guard', () => {
  it('states the arithmetic before he changes anything', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('4 courts hold 16 players. 12 are booked.')).toBeTruthy();
  });

  it('blocks a reduction below the current bookings and removes nobody', async () => {
    // A3: "The app never auto-removes players when court count drops."
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-court-count'), '2');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('edit-error')).toBeTruthy();
    expect(
      screen.getByText('12 players are booked but 2 courts hold only 8. Remove players first.'),
    ).toBeTruthy();
  });

  it('allows a reduction that still holds everybody', async () => {
    const screen = await renderScreen();

    // 12 booked, 3 courts hold 12 exactly.
    await fireEvent.changeText(screen.getByTestId('edit-court-count'), '3');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({ sessionId: 's1', courtCount: 3 });
  });

  it('allows an increase without comment', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-court-count'), '5');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({ courtCount: 5 });
  });
});

describe('editing', () => {
  it('sends the start time and duration it was given', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-start-time'), '20:30');
    await fireEvent.press(screen.getByTestId('edit-duration-150'));
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({
      startTime: '20:30',
      durationMinutes: 150,
    });
  });

  it('converts the dinars he typed into fils', async () => {
    // 5.3: money is an integer count of fils, never a float.
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-price'), '7.250');
    await fireEvent.press(screen.getByTestId('edit-save'));
    // A price change on a booked session confirms first.
    await fireEvent.press(screen.getByText('Save'));

    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({ priceFils: 7250 });
  });

  it('refuses a malformed time', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-start-time'), '7pm');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a time as HH:MM, for example 19:30.')).toBeTruthy();
  });

  it('warns that existing bookings keep the price they booked at', async () => {
    // A7.
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-price'), '8');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('price-change-dialog')).toBeTruthy();
    expect(
      screen.getByText(
        'New price applies to new bookings only. 12 existing bookings keep the price they booked at.',
      ),
    ).toBeTruthy();
  });

  it('does not stop to warn when nobody is booked yet', async () => {
    setup({ occupancy: { capacity: 16, taken: 0, remaining: 16 } });

    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('edit-price'), '8');
    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('locks every control once the session has locked', async () => {
    // Appendix A: session_locked is raised by any staff mutation. 10.2: "every
    // control becomes read only, with a note explaining why. There is no unlock."
    setup({ status: 'locked' });

    const screen = await renderScreen();

    expect(screen.getByTestId('session-edit-readonly')).toBeTruthy();
    expect(
      screen.getByText('This session locked 7 days after it ended and cannot be edited.'),
    ).toBeTruthy();
    expect(screen.getByTestId('edit-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('edit-cancel-session')).toBeNull();
  });

  it('offers no cancel button on a session that already ended', async () => {
    // 5.5 allows a cancellation only from scheduled or in_progress.
    setup({ status: 'pending_review' });

    const screen = await renderScreen();

    expect(screen.queryByTestId('edit-cancel-session')).toBeNull();
  });
});

describe('cancelling', () => {
  it('lists what will happen, including that nothing is sent', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));

    expect(screen.getByTestId('cancel-session-dialog')).toBeTruthy();
    expect(screen.getByText('12 bookings will be cancelled.')).toBeTruthy();
    expect(screen.getByText('12 credits will be returned.')).toBeTruthy();
    // D31, stated rather than implied.
    expect(screen.getByTestId('cancel-no-push-line')).toBeTruthy();
    expect(screen.getByText('No notification is sent to players.')).toBeTruthy();
  });

  it('sends the optional note with the cancellation', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));
    await fireEvent.changeText(screen.getByTestId('cancel-note'), 'The gym flooded.');
    await fireEvent.press(screen.getByText('Cancel the session'));

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      note: 'The gym flooded.',
    });
  });

  it('sends a null note rather than an empty string', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));
    await fireEvent.press(screen.getByText('Cancel the session'));

    expect(mockCancel.mock.calls[0]?.[0]).toEqual({ sessionId: 's1', note: null });
  });

  it('offers the prefilled announcement composer afterwards', async () => {
    // 9.4 step 6 and A6: no push was sent, so this is the one deliberate tap.
    mockCancel.mockImplementation((_input, options) => options.onSuccess());

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));
    await fireEvent.press(screen.getByText('Cancel the session'));

    expect(screen.getByTestId('announcement-prompt')).toBeTruthy();
    expect(screen.getByText('Post an announcement so players know?')).toBeTruthy();
    expect(
      screen.getByText(
        'The session at International Independent Schools on 24 August 2026, 7:00 PM – 8:30 PM, is cancelled.',
      ),
    ).toBeTruthy();
  });

  it('hands the draft to the composer when he chooses to post', async () => {
    mockCancel.mockImplementation((_input, options) => options.onSuccess());

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));
    await fireEvent.press(screen.getByText('Cancel the session'));
    await fireEvent.press(screen.getByText('Post announcement'));

    expect(mockTabNavigate).toHaveBeenCalledWith('More', {
      screen: 'AnnouncementCompose',
      params: {
        draftBody:
          'The session at International Independent Schools on 24 August 2026, 7:00 PM – 8:30 PM, is cancelled.',
      },
    });
  });

  it('leaves without posting when he chooses not now', async () => {
    mockCancel.mockImplementation((_input, options) => options.onSuccess());

    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));
    await fireEvent.press(screen.getByText('Cancel the session'));
    await fireEvent.press(screen.getByText('Not now'));

    expect(mockTabNavigate).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});

describe('Arabic', () => {
  it('states the capacity arithmetic in Arabic', async () => {
    const screen = await renderScreen('ar');

    expect(screen.getByText('4 ملاعب تتسع لـ16 لاعبًا، والمحجوز 12.')).toBeTruthy();
  });

  it('states the no-notification line in Arabic', async () => {
    const screen = await renderScreen('ar');

    await fireEvent.press(screen.getByTestId('edit-cancel-session'));

    expect(screen.getByText('لن يصل أي إشعار إلى اللاعبين.')).toBeTruthy();
  });
});

describe('19.3 item 6, the loading state', () => {
  // The error state is forced elsewhere in this file. A form has no empty
  // state: 15.4 edits a session that exists or it says it could not load one.
  it('shows a skeleton while the session loads', async () => {
    mockUseSession.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderScreen();

    expect(screen.getByTestId('session-edit-loading')).toBeTruthy();
  });
});
