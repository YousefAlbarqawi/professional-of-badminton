/**
 * Create a one-off session. BUILD-SPEC 15.6.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { VenueOption } from '@/features/sessions/types';
import type { Locale } from '@/lib/money';
import { isolateLTR } from '@/components/primitives/Text';

import { CreateSessionScreen } from '../CreateSessionScreen';

jest.mock('@/lib/supabase');

const mockUseVenues = jest.fn();
const mockCreate = jest.fn();

jest.mock('@/features/sessions/queries', () => ({
  useVenues: () => mockUseVenues(),
}));

jest.mock('@/features/sessions/mutations', () => ({
  useCreateOneOffSession: () => ({ mutate: mockCreate, isPending: false }),
}));

/** D1 and D3: two venues, Khalda 4 courts and Shmeisani 3. */
const VENUES: VenueOption[] = [
  { id: 'khalda', name: 'International Independent Schools', area: 'Khalda', courtCount: 4 },
  { id: 'shmeisani', name: "Al-Ra'ed Al-Arabi School", area: 'Shmeisani', courtCount: 3 },
];

type ScreenProps = React.ComponentProps<typeof CreateSessionScreen>;
const goBack = jest.fn();
const navigation = { navigate: jest.fn(), goBack } as unknown as ScreenProps['navigation'];

/**
 * A35's picker (DateField), opened and driven the way the native module
 * would drive it — see jest.setup.ts. The default test platform is iOS
 * (src/features/notifications/__tests__/deviceToken.test.ts), whose wheel
 * commits on every tick, so *Done* only has to close it.
 */
async function pickDate(screen: RenderResult, testID: string, date: Date): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await fireEvent(screen.getByTestId(`${testID}-native`), 'change', { type: 'set' }, date);
  await fireEvent.press(screen.getByTestId(`${testID}-done`));
}

/**
 * The same module in `mode="time"` (`TimeField`), driven the same way. The
 * wheel hands back a `Date` and only its local hour and minute are read, so
 * the calendar day here is arbitrary.
 */
async function pickTime(
  screen: RenderResult,
  testID: string,
  hours: number,
  minutes: number,
): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await fireEvent(
    screen.getByTestId(`${testID}-native`),
    'change',
    { type: 'set' },
    new Date(1970, 0, 1, hours, minutes),
  );
  await fireEvent.press(screen.getByTestId(`${testID}-done`));
}

function routeWith(params: ScreenProps['route']['params']): ScreenProps['route'] {
  return { key: 'CreateSession', name: 'CreateSession', params } as unknown as ScreenProps['route'];
}

async function renderScreen(
  params: ScreenProps['route']['params'] = undefined,
  locale: Locale = 'en',
): Promise<RenderResult> {
  return renderWithProviders(
    <CreateSessionScreen navigation={navigation} route={routeWith(params)} />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseVenues.mockReturnValue({
    data: VENUES,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  });
});

describe('defaults', () => {
  it('opens on the first venue with its own court count', async () => {
    // D4: all the courts at a venue are rented for the whole night.
    const screen = await renderScreen();

    expect(screen.getByTestId('create-venue-khalda')).toBeTruthy();
    expect(screen.getByTestId('create-court-count').props.value).toBe('4');
  });

  it('follows the venue’s court count when the venue changes', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('create-venue-shmeisani'));

    expect(screen.getByTestId('create-court-count').props.value).toBe('3');
  });

  it('gives a 90 minute session four rotations and a 150 minute one six', async () => {
    // D5.
    const screen = await renderScreen();

    expect(screen.getByTestId('create-rotation-count').props.value).toBe('4');

    await fireEvent.press(screen.getByTestId('create-duration-150'));

    expect(screen.getByTestId('create-rotation-count').props.value).toBe('6');
  });

  it('says plainly that a one-off does not repeat', async () => {
    // 15.6: "No recurrence option; one-off means one-off."
    const screen = await renderScreen();

    expect(
      screen.getByText(
        'One-off means one-off. This does not repeat and does not change a template.',
      ),
    ).toBeTruthy();
  });
});

describe('submitting', () => {
  it('sends the form as fils and integers', async () => {
    const screen = await renderScreen();

    await pickDate(screen, 'create-date', new Date(2026, 8, 1));
    await pickTime(screen, 'create-start-time', 20, 30);
    await fireEvent.changeText(screen.getByTestId('create-price'), '8');
    await fireEvent.press(screen.getByTestId('create-duration-150'));
    await fireEvent.press(screen.getByTestId('create-submit'));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]?.[0]).toEqual({
      venueId: 'khalda',
      sessionDate: '2026-09-01',
      startTime: '20:30',
      durationMinutes: 150,
      priceFils: 8000,
      courtCount: 4,
      rotationCount: 6,
    });
  });

  it('refuses a court count outside 1 to 20', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('create-court-count'), '0');
    await fireEvent.press(screen.getByTestId('create-submit'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a court count between 1 and 20.')).toBeTruthy();
  });

  it('cannot be crashed by a letter in the price field', async () => {
    // The summary line prices the session on every keystroke, and `fils()`
    // throws on a non-finite number by design (5.3). A letter used to take the
    // screen down before the schema could report it; the money field now
    // refuses the character outright and the preview no longer throws.
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('create-price'), '6a.5x');

    expect(screen.getByTestId('create-price').props.value).toBe('6.5');
    expect(screen.getByTestId('create-summary')).toBeTruthy();

    // And an empty field is a form still being filled in, not a crash.
    await fireEvent.changeText(screen.getByTestId('create-price'), '');
    expect(screen.getByTestId('create-summary')).toBeTruthy();
  });

  it('shows the server’s reason when the slot is already taken', async () => {
    mockCreate.mockImplementation((_input, options) =>
      options.onError({ message: 'session_time_taken' }),
    );

    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('create-submit'));

    expect(
      screen.getByText('Another session already starts at that time at this venue.'),
    ).toBeTruthy();
  });

  it('goes back once the session exists', async () => {
    mockCreate.mockImplementation((_input, options) => options.onSuccess('new-id'));

    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('create-submit'));

    expect(goBack).toHaveBeenCalledTimes(1);
  });
});

describe('the prefill', () => {
  it('opens on the venue and values it was handed', async () => {
    // 15.3's *Duplicate* row action is a prefilled create rather than a fourth
    // code path.
    const screen = await renderScreen({
      venueId: 'shmeisani',
      sessionDate: '2026-09-05',
      startTime: '21:00',
      durationMinutes: 150,
      priceJD: '8',
      courtCount: 3,
    });

    expect(screen.getByTestId('create-date-value').children.join('')).toBe(
      isolateLTR('5/9/2026'),
    );
    // 16.1's 12 hour clock, which is what the wheel shows and what every other
    // time in the app reads as — not the `HH:mm` the form holds underneath.
    expect(screen.getByTestId('create-start-time-value').children.join('')).toBe(
      isolateLTR('9:00 PM'),
    );
    expect(screen.getByTestId('create-price').props.value).toBe('8');
    expect(screen.getByTestId('create-court-count').props.value).toBe('3');
    expect(screen.getByTestId('create-rotation-count').props.value).toBe('6');
  });
});

describe('Arabic', () => {
  it('renders the form in Arabic', async () => {
    const screen = await renderScreen(undefined, 'ar');

    expect(screen.getByText('إنشاء جلسة منفردة')).toBeTruthy();
    expect(screen.getByText('أنشئ الجلسة')).toBeTruthy();
  });
});
