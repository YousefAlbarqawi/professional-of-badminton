/**
 * Granting a subscription. BUILD-SPEC 15.9 and 11.2.
 *
 * The first half of 11.3's migration flow: grant the full 40 visit package.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Package } from '@/features/subscriptions/types';
import type { Fils, Locale } from '@/lib/money';

import { GrantSubscriptionScreen } from '../GrantSubscriptionScreen';

jest.mock('@/lib/supabase');

const mockPackages = jest.fn();
const mockGrant = jest.fn();

jest.mock('@/features/subscriptions/queries', () => ({
  usePackages: () => mockPackages(),
}));

jest.mock('@/features/subscriptions/mutations', () => ({
  useGrantSubscription: () => ({ mutate: mockGrant, isPending: false }),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-20T12:00:00Z') };
});

/** D48's five, with the per-visit rates section 11.1 tabulates. See C2. */
const PACKAGES: Package[] = [
  {
    id: 'pkg-8',
    nameEn: '8 visits, 1 month',
    nameAr: '٨ زيارات، شهر',
    visitCount: 8,
    priceFils: 40000 as Fils,
    durationMonths: 1,
    perVisitFils: 5000 as Fils,
    displayOrder: 1,
  },
  {
    id: 'pkg-40',
    nameEn: '40 visits, 3 months',
    nameAr: '٤٠ زيارة، ٣ أشهر',
    visitCount: 40,
    priceFils: 160000 as Fils,
    durationMonths: 3,
    perVisitFils: 4000 as Fils,
    displayOrder: 5,
  },
];

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

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

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  mockPackages.mockReturnValue({
    data: PACKAGES,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });

  return renderWithProviders(
    <GrantSubscriptionScreen
      route={{ key: 'k', name: 'GrantSubscription', params: { playerId: 'p1' } } as never}
      navigation={navigation as never}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('15.9 the picker', () => {
  it('shows visits, price, duration and the per visit rate', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('40 visits, 3 months')).toBeTruthy();
    expect(screen.getByText('40 visits, 160.000 JD, 3 months')).toBeTruthy();
    // 11.1 and 12.2 rule 1: what a credit from this package will be worth.
    expect(screen.getByText('4.000 JD per visit')).toBeTruthy();
    expect(screen.getByText('5.000 JD per visit')).toBeTruthy();
  });

  it('fills the expiry and the visit count from the package chosen', async () => {
    // 11.2 steps 3 and 4. Today is 20 August 2026; the 40 visit package runs
    // three months, so the expiry auto-fills to 20 November 2026 — the exact
    // summary line 15.9 gives as its example.
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('package-pkg-40'));

    expect(screen.getByTestId('grant-expires-on-value').children.join('')).toBe(
      '20 November 2026',
    );
    expect(screen.getByTestId('grant-visits').props.value).toBe('40');
    expect(screen.getByTestId('grant-summary').children.join('')).toBe(
      '40 credits, expires 20 November 2026.',
    );
  });

  it('keeps a start date the coach has already moved', async () => {
    const screen = await renderScreen();

    await pickDate(screen, 'grant-starts-on', new Date(2026, 8, 1));
    await fireEvent.press(screen.getByTestId('package-pkg-40'));

    expect(screen.getByTestId('grant-expires-on-value').children.join('')).toBe('1 December 2026');
  });
});

describe('granting', () => {
  it('sends the package, the dates, the count and the note', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('package-pkg-40'));
    await fireEvent.changeText(screen.getByTestId('grant-note'), 'paid 80, 45 remaining');
    await fireEvent.press(screen.getByTestId('grant-submit'));

    expect(mockGrant.mock.calls[0]?.[0]).toEqual({
      playerId: 'p1',
      packageId: 'pkg-40',
      startsOn: '2026-08-20',
      expiresOn: '2026-11-20',
      grantedVisits: 40,
      note: 'paid 80, 45 remaining',
    });
  });

  it('sends no note when none was typed. 11.2 step 5', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('grant-submit'));

    expect(mockGrant.mock.calls[0]?.[0]).toMatchObject({ note: null });
  });

  it('lets the coach override the visit count. 11.2 step 4', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('package-pkg-40'));
    await fireEvent.changeText(screen.getByTestId('grant-visits'), '35');
    await fireEvent.press(screen.getByTestId('grant-submit'));

    expect(mockGrant.mock.calls[0]?.[0]).toMatchObject({ grantedVisits: 35 });
  });

  it('does not submit an expiry on or before the start date', async () => {
    const screen = await renderScreen();

    await pickDate(screen, 'grant-expires-on', new Date(2026, 7, 19));
    await fireEvent.press(screen.getByTestId('grant-submit'));

    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('does not submit a zero visit count', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('grant-visits'), '0');
    await fireEvent.press(screen.getByTestId('grant-submit'));

    expect(mockGrant).not.toHaveBeenCalled();
  });
});

describe('D50', () => {
  it('never asks whether he paid, and says why', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('grant-not-paid-here').children.join('')).toBe(
      'The app does not track whether he paid for this. Use a balance entry if you want that recorded.',
    );
    expect(screen.queryByText('Amount paid')).toBeNull();
  });
});

describe('states', () => {
  it('has a loading state', async () => {
    mockPackages.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      error: null,
      refetch: jest.fn(),
    });

    const screen = await renderWithProviders(
      <GrantSubscriptionScreen
        route={{ key: 'k', name: 'GrantSubscription', params: { playerId: 'p1' } } as never}
        navigation={navigation as never}
      />,
    );

    expect(screen.getByTestId('grant-loading')).toBeTruthy();
  });

  it('has an error state', async () => {
    mockPackages.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error('boom'),
      refetch: jest.fn(),
    });

    const screen = await renderWithProviders(
      <GrantSubscriptionScreen
        route={{ key: 'k', name: 'GrantSubscription', params: { playerId: 'p1' } } as never}
        navigation={navigation as never}
      />,
    );

    expect(screen.getByTestId('grant-error')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the picker and the summary in Arabic', async () => {
    const screen = await renderScreen('ar');

    expect(screen.getByText('٤٠ زيارة، ٣ أشهر')).toBeTruthy();
    // 16.1: Western digits, including inside an Arabic date.
    expect(screen.getByTestId('grant-summary').children.join('')).toContain('2026');
  });
});
