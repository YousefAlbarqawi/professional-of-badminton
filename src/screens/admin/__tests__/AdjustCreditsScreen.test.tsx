/**
 * Adjusting credits. BUILD-SPEC 15.10 and 11.3.
 *
 * The second half of the migration flow, and the phase's own acceptance
 * criterion: adjust by −13 with a note, the preview reads "Balance goes from
 * 40 to 27", and the ledger underneath says why.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Subscription } from '@/features/subscriptions/types';
import type { Fils, Locale } from '@/lib/money';

import { AdjustCreditsScreen } from '../AdjustCreditsScreen';

jest.mock('@/lib/supabase');

const mockSubscriptions = jest.fn();
const mockAdjust = jest.fn();

jest.mock('@/features/subscriptions/queries', () => ({
  usePlayerSubscriptions: () => mockSubscriptions(),
}));

jest.mock('@/features/subscriptions/mutations', () => ({
  useAdjustCredits: () => ({ mutate: mockAdjust, isPending: false }),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-20T12:00:00Z') };
});

/** Freshly granted, 40 credits, nothing spent. 11.3's starting point. */
const GRANTED: Subscription = {
  id: 'sub-40',
  playerId: 'p1',
  packageNameEn: '40 visits, 3 months',
  packageNameAr: '٤٠ زيارة، ٣ أشهر',
  grantedVisits: 40,
  perVisitFils: 4000 as Fils,
  startsOn: '2026-08-20',
  expiresOn: '2026-11-20',
  isVoided: false,
  note: null,
  createdAt: '2026-08-20T09:00:00Z',
  transactions: [
    {
      id: 'g1',
      subscriptionId: 'sub-40',
      delta: 40,
      reason: 'grant',
      note: null,
      bookingId: null,
      createdAt: '2026-08-20T09:00:00Z',
    },
  ],
};

const EXPIRED: Subscription = {
  ...GRANTED,
  id: 'sub-dead',
  isVoided: true,
  expiresOn: '2026-07-01',
  transactions: [
    ...GRANTED.transactions,
    {
      id: 'e1',
      subscriptionId: 'sub-dead',
      delta: -40,
      reason: 'expiry',
      note: null,
      bookingId: null,
      createdAt: '2026-07-02T00:20:00Z',
    },
  ],
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

interface Setup {
  subscriptions?: Subscription[];
  subscriptionId?: string;
  /** Forces the read's own state, for 19.3 item 6. */
  query?: {
    isPending?: boolean;
    isError?: boolean;
    error?: Error | null;
    refetch?: jest.Mock;
  };
}

async function renderScreen(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  mockSubscriptions.mockReturnValue({
    data: options.subscriptions ?? [GRANTED],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.query,
  });

  return renderWithProviders(
    <AdjustCreditsScreen
      route={
        {
          key: 'k',
          name: 'AdjustCredits',
          params: {
            playerId: 'p1',
            ...(options.subscriptionId === undefined
              ? {}
              : { subscriptionId: options.subscriptionId }),
          },
        } as never
      }
      navigation={navigation as never}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('11.3, the migration flow', () => {
  it('previews the balance going from 40 to 27', async () => {
    // 15.10's preview line, verbatim. `from` is the sum of the ledger printed
    // below it; there is no counter column anywhere. 6.2, D56.
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-13');

    expect(screen.getByTestId('adjust-preview').children.join('')).toBe(
      'Balance goes from 40 to 27.',
    );
  });

  it('writes one adjustment with the documented note', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-13');
    await fireEvent.changeText(screen.getByTestId('adjust-note'), 'used before the app');
    await fireEvent.press(screen.getByTestId('adjust-submit'));

    expect(mockAdjust).toHaveBeenCalledTimes(1);
    expect(mockAdjust.mock.calls[0]?.[0]).toEqual({
      subscriptionId: 'sub-40',
      delta: -13,
      note: 'used before the app',
    });
  });

  it('shows the ledger it is about to join', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('adjust-history-g1-delta').children.join('')).toBe('+40');
  });
});

describe('15.10 rules', () => {
  it('will not save without a note. 11.3 and D56', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-13');
    await fireEvent.press(screen.getByTestId('adjust-submit'));

    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('will not save a zero adjustment', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '0');
    await fireEvent.changeText(screen.getByTestId('adjust-note'), 'nothing happened');
    await fireEvent.press(screen.getByTestId('adjust-submit'));

    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('refuses to take the balance below zero, as the server does', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-50');
    await fireEvent.changeText(screen.getByTestId('adjust-note'), 'too far');

    expect(screen.getByTestId('adjust-preview').children.join('')).toBe(
      'That would take the balance below zero.',
    );

    await fireEvent.press(screen.getByTestId('adjust-submit'));
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('accepts a positive adjustment', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '5');
    await fireEvent.changeText(screen.getByTestId('adjust-note'), 'goodwill');
    await fireEvent.press(screen.getByTestId('adjust-submit'));

    expect(mockAdjust.mock.calls[0]?.[0]).toMatchObject({ delta: 5 });
  });
});

describe('which subscription', () => {
  it('preselects the one the coach tapped', async () => {
    // D51 lets him hold several, so the card he came from has to survive the
    // navigation.
    const second: Subscription = { ...GRANTED, id: 'sub-b', expiresOn: '2026-12-20' };
    const screen = await renderScreen({
      subscriptions: [GRANTED, second],
      subscriptionId: 'sub-b',
    });

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-1');
    await fireEvent.changeText(screen.getByTestId('adjust-note'), 'correction');
    await fireEvent.press(screen.getByTestId('adjust-submit'));

    expect(mockAdjust.mock.calls[0]?.[0]).toMatchObject({ subscriptionId: 'sub-b' });
  });

  it('offers no expired subscription, because adjust_credits refuses one', async () => {
    // 11.5: expiry closes the ledger. Offering it would only produce a failure.
    const screen = await renderScreen({ subscriptions: [GRANTED, EXPIRED] });

    expect(screen.getByTestId('adjust-pick-sub-40')).toBeTruthy();
    expect(screen.queryByTestId('adjust-pick-sub-dead')).toBeNull();
  });

  it('sends him to grant one when there is nothing to adjust', async () => {
    const screen = await renderScreen({ subscriptions: [] });

    expect(screen.getByTestId('adjust-empty')).toBeTruthy();
    expect(screen.getByText('Grant a subscription before adjusting credits.')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the preview in Arabic with Western digits. 16.1', async () => {
    const screen = await renderScreen({}, 'ar');

    await fireEvent.changeText(screen.getByTestId('adjust-delta'), '-13');

    expect(screen.getByTestId('adjust-preview').children.join('')).toBe(
      'الرصيد ينتقل من 40 إلى 27.',
    );
  });
});

describe('19.3 item 6, the loading and error states', () => {
  // 15.10's empty state is forced elsewhere in this file; these two were not.
  it('shows a skeleton while the subscriptions load', async () => {
    const screen = await renderScreen({ query: { isPending: true } });

    expect(screen.getByTestId('adjust-loading')).toBeTruthy();
  });

  it('shows an error state with a retry when the read failed', async () => {
    const refetch = jest.fn();
    const screen = await renderScreen({
      query: { isError: true, error: new Error('nope'), refetch },
    });

    expect(screen.getByTestId('adjust-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});
