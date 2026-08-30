/**
 * The player's subscriptions screen. BUILD-SPEC 14.13 and 11.6.
 *
 * Two things are asserted above all: that the big number is the sum of the
 * rows printed beneath it (6.2, D56), and that no purchase affordance exists
 * anywhere on the screen in any state (D49, section 4 item 8).
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Subscription } from '@/features/subscriptions/types';
import type { Fils, Locale } from '@/lib/money';

import { SubscriptionsScreen } from '../SubscriptionsScreen';

jest.mock('@/lib/supabase');

const mockSubscriptions = jest.fn();

jest.mock('@/features/subscriptions/queries', () => ({
  useMySubscriptions: () => mockSubscriptions(),
}));

// 5.1: the screen reads Amman's today. Fixed so the expiry chips are testable.
jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-09-13T12:00:00Z') };
});

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-live',
    playerId: 'p1',
    packageNameEn: '15 visits, 1 month',
    packageNameAr: '١٥ زيارة، شهر',
    grantedVisits: 15,
    perVisitFils: 4667 as Fils,
    startsOn: '2026-09-01',
    expiresOn: '2026-10-01',
    isVoided: false,
    note: null,
    createdAt: '2026-09-01T09:00:00Z',
    transactions: [
      {
        id: 'g1',
        subscriptionId: 'sub-live',
        delta: 15,
        reason: 'grant',
        note: null,
        bookingId: null,
        createdAt: '2026-09-01T09:00:00Z',
      },
      {
        id: 'b1',
        subscriptionId: 'sub-live',
        delta: -1,
        reason: 'booking',
        note: null,
        bookingId: 'bk-1',
        createdAt: '2026-09-05T18:00:00Z',
      },
      {
        id: 'r1',
        subscriptionId: 'sub-live',
        delta: 1,
        reason: 'booking_refund',
        note: null,
        bookingId: 'bk-1',
        createdAt: '2026-09-05T19:00:00Z',
      },
      {
        id: 'b2',
        subscriptionId: 'sub-live',
        delta: -1,
        reason: 'booking',
        note: null,
        bookingId: 'bk-2',
        createdAt: '2026-09-08T18:00:00Z',
      },
    ],
    ...overrides,
  };
}

const EXPIRED: Subscription = subscription({
  id: 'sub-dead',
  packageNameEn: '8 visits, 1 month',
  packageNameAr: '٨ زيارات، شهر',
  grantedVisits: 8,
  isVoided: true,
  startsOn: '2026-06-01',
  expiresOn: '2026-07-01',
  createdAt: '2026-06-01T09:00:00Z',
  transactions: [
    {
      id: 'g2',
      subscriptionId: 'sub-dead',
      delta: 8,
      reason: 'grant',
      note: null,
      bookingId: null,
      createdAt: '2026-06-01T09:00:00Z',
    },
    {
      id: 'e2',
      subscriptionId: 'sub-dead',
      delta: -8,
      reason: 'expiry',
      note: null,
      bookingId: null,
      createdAt: '2026-07-02T00:20:00Z',
    },
  ],
});

interface Setup {
  subscriptions?: Subscription[];
  isPending?: boolean;
  isError?: boolean;
}

async function renderScreen(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  mockSubscriptions.mockReturnValue({
    data: options.isError === true ? undefined : (options.subscriptions ?? [subscription()]),
    isPending: options.isPending ?? false,
    isError: options.isError ?? false,
    isFetching: false,
    error: options.isError === true ? new Error('boom') : null,
    refetch: jest.fn(),
  });

  return renderWithProviders(<SubscriptionsScreen />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the balance is the sum of the ledger', () => {
  it('shows 14, which is 15 − 1 + 1 − 1', async () => {
    // 6.2 and D56. Every row that produced this number is on the same screen.
    const screen = await renderScreen();

    expect(screen.getByTestId('credits-total').children.join('')).toBe('14');
    expect(screen.getByTestId('subscription-sub-live-remaining').children.join('')).toBe('14');
  });

  it('lists every movement with its reason and date, newest first', async () => {
    // 14.13: "so a player can see exactly where his credits went".
    const screen = await renderScreen();

    expect(screen.getByTestId('history-g1-delta').children.join('')).toBe('+15');
    expect(screen.getByTestId('history-b1-delta').children.join('')).toBe('−1');
    expect(screen.getByTestId('history-r1')).toBeTruthy();
    expect(screen.getByText('Returned after a cancellation')).toBeTruthy();
    expect(screen.getByText('Subscription granted')).toBeTruthy();
  });

  it('counts only live subscriptions in the total. 11.6', async () => {
    const screen = await renderScreen({ subscriptions: [subscription(), EXPIRED] });

    expect(screen.getByTestId('credits-total').children.join('')).toBe('14');
  });
});

describe('14.13 layout', () => {
  it('shows the granted total and the expiry beside the remaining number', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('of 15 credits')).toBeTruthy();
    expect(screen.getByTestId('subscription-sub-live-expiry').children.join('')).toBe(
      'Expires 1/10/2026',
    );
  });

  it('warns within 7 days of expiry and not before. 11.6', async () => {
    // Today is 13 September. An expiry on the 19th is inside the week.
    const soon = await renderScreen({ subscriptions: [subscription({ expiresOn: '2026-09-19' })] });
    expect(soon.getByTestId('subscription-sub-live-warning')).toBeTruthy();

    const notYet = await renderScreen({
      subscriptions: [subscription({ expiresOn: '2026-09-25' })],
    });
    expect(notYet.queryByTestId('subscription-sub-live-warning')).toBeNull();
  });

  it('collapses expired subscriptions until they are asked for', async () => {
    const screen = await renderScreen({ subscriptions: [subscription(), EXPIRED] });

    expect(screen.queryByTestId('subscription-sub-dead')).toBeNull();

    await fireEvent.press(screen.getByTestId('subscriptions-toggle-expired'));

    expect(screen.getByTestId('subscription-sub-dead')).toBeTruthy();
    expect(screen.getByTestId('subscription-sub-dead-remaining').children.join('')).toBe('0');
  });

  it('keeps the expiry row in the history even while the card is collapsed', async () => {
    // D54 zeroed the subscription; the row saying so is the only answer to
    // "where did my eight visits go", so it is never hidden.
    const screen = await renderScreen({ subscriptions: [subscription(), EXPIRED] });

    expect(screen.getByTestId('history-e2-delta').children.join('')).toBe('−8');
    expect(screen.getByText('Expired')).toBeTruthy();
  });
});

describe('D49, no purchase anywhere', () => {
  it('says so on a screen with subscriptions', async () => {
    const screen = await renderScreen();

    expect(
      screen.getByText('Subscriptions are arranged with the coach, not bought in the app.'),
    ).toBeTruthy();
  });

  it('points an empty player at WhatsApp instead', async () => {
    // 14.13's empty state, verbatim.
    const screen = await renderScreen({ subscriptions: [] });

    expect(
      screen.getByText('You do not have a subscription. Ask the coach on WhatsApp.'),
    ).toBeTruthy();
    expect(screen.getByTestId('whatsapp-button')).toBeTruthy();
  });
});

describe('states', () => {
  it('has a loading state', async () => {
    const screen = await renderScreen({ isPending: true });
    expect(screen.getByTestId('subscriptions-loading')).toBeTruthy();
  });

  it('has an error state that can be retried', async () => {
    const screen = await renderScreen({ isError: true });
    expect(screen.getByTestId('subscriptions-error')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the package name and the history in Arabic', async () => {
    const screen = await renderScreen({}, 'ar');

    // Twice: on the card, and as the label saying which subscription each
    // history row moved.
    expect(screen.getAllByText('١٥ زيارة، شهر').length).toBeGreaterThan(0);
    expect(screen.getByText('منح اشتراك')).toBeTruthy();
    // 16.1: Western digits in both languages, including this one.
    expect(screen.getByTestId('credits-total').children.join('')).toBe('14');
  });
});

describe('19.3 item 6, the empty state', () => {
  // 14.13: "You do not have a subscription. Ask the coach on WhatsApp." The
  // loading and error states are forced elsewhere in this file; this one was
  // described in the deck and never rendered.
  it('says he has no subscription, and offers the coach. D72', async () => {
    const screen = await renderScreen({ subscriptions: [] });

    expect(screen.getByTestId('subscriptions-empty')).toBeTruthy();
    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers no way to buy one, even with nothing to show. D49', async () => {
    // Section 4 item 8. The empty state is where a purchase button would be
    // most tempting, so it is the state worth asserting it out of.
    const screen = await renderScreen({ subscriptions: [] });

    expect(screen.queryByText('Buy')).toBeNull();
    expect(screen.queryByText('Purchase')).toBeNull();
  });
});
