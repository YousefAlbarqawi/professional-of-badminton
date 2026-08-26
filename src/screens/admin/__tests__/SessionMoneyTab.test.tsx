/**
 * The review screen. BUILD-SPEC 10.2 and D39.
 *
 * 19.3 point 6 asks for loading, empty and error states to exist and be
 * reachable; 10.2 gives the row actions and the footer; D39 gives the read-only
 * state that follows the lock, which is phase 5's third acceptance clause seen
 * from the coach's side.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';
import { addDays, addHours } from 'date-fns';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { MoneySummary, ReviewRow } from '@/features/payments/types';
import type { Session } from '@/features/sessions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionMoneyTab } from '../SessionMoneyTab';

jest.mock('@/lib/supabase');

const mockReview = jest.fn();
const mockSummary = jest.fn();
const mockRecord = jest.fn();
const mockConfirm = jest.fn();
const mockReopen = jest.fn();

jest.mock('@/features/payments/queries', () => ({
  useSessionReview: () => mockReview(),
  useMoneySummary: () => mockSummary(),
  useProofUrl: () => ({ isPending: true, isError: false, data: undefined, refetch: jest.fn() }),
}));

jest.mock('@/features/payments/mutations', () => ({
  useRecordPayment: () => ({
    mutate: mockRecord,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useConfirmReview: () => ({
    mutate: mockConfirm,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useReopenReview: () => ({
    mutate: mockReopen,
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const ENDED = addHours(new Date(), -2);

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    venue: { id: 'v1', name: 'Khalda', area: 'Khalda', googleMapsUrl: null },
    sessionDate: '2026-08-20',
    startsAt: parseInstant(addHours(ENDED, -1.5).toISOString()),
    endsAt: ENDED,
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'pending_review',
    occupancy: { capacity: 16, taken: 2, remaining: 14 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

function row(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    bookingId: 'b1',
    kind: 'player',
    displayName: 'Ahmad Nasser',
    tier: 'B',
    paymentMethod: 'cash',
    paymentStatus: 'unpaid',
    expectedFils: 6000 as Fils,
    paidFils: 0 as Fils,
    playerId: 'p1',
    isCoachSlot: false,
    proofPath: null,
    isSettled: false,
    note: null,
    ...overrides,
  };
}

const SUMMARY: MoneySummary = {
  expectedFils: 6000 as Fils,
  collectedFils: 0 as Fils,
  creditRevenueFils: 0 as Fils,
  outstandingFils: 6000 as Fils,
  costFils: 31250 as Fils,
  profitFils: 0 as Fils,
  profitIfCollectedFils: 0 as Fils,
  attendeeCount: 1,
  unsettledCount: 1,
};

const onRemove = jest.fn();
const onOpenPlayer = jest.fn();

interface Setup {
  session?: Session;
  rows?: ReviewRow[];
  isPending?: boolean;
  isError?: boolean;
  summary?: MoneySummary | undefined;
}

async function renderTab(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  mockReview.mockReturnValue({
    data: options.rows ?? [row()],
    isPending: options.isPending ?? false,
    isError: options.isError ?? false,
    isFetching: false,
    error: options.isError === true ? { message: 'network' } : null,
    refetch: jest.fn(),
  });
  mockSummary.mockReturnValue({
    data: 'summary' in options ? options.summary : SUMMARY,
    isError: false,
    refetch: jest.fn(),
  });

  return renderWithProviders(
    <SessionMoneyTab
      session={options.session ?? session()}
      onRemove={onRemove}
      onOpenPlayer={onOpenPlayer}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the states 19.3 requires', () => {
  it('shows a skeleton while the rows load', async () => {
    const screen = await renderTab({ isPending: true });
    expect(screen.getByTestId('money-loading')).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    const screen = await renderTab({ isError: true });
    expect(screen.getByTestId('money-error')).toBeTruthy();
  });

  it('shows an empty state when nobody is booked', async () => {
    const screen = await renderTab({ rows: [] });
    expect(screen.getByTestId('money-empty')).toBeTruthy();
  });
});

describe('a row, 10.2', () => {
  it('shows paid of expected, the method and the status', async () => {
    const screen = await renderTab({
      rows: [row({ paidFils: 2000 as Fils, paymentStatus: 'partial' })],
    });

    expect(screen.getByTestId('money-row-b1-amounts').children.join('')).toBe(
      '2.000 JD / 6.000 JD',
    );
    expect(screen.getByText('Part paid')).toBeTruthy();
    expect(screen.getByText('Cash on arrival')).toBeTruthy();
  });

  it('marks a row paid in one tap', async () => {
    // 10.2: "Sets paid_fils = expected_fils, status paid. One tap."
    const screen = await renderTab();

    await fireEvent.press(screen.getByTestId('money-row-b1-mark-paid'));

    expect(mockRecord.mock.calls[0]?.[0]).toEqual({
      bookingId: 'b1',
      sessionId: 's1',
      paidFils: 6000,
      method: null,
      note: null,
    });
  });

  it('marks a row not paid, which the server turns into a balance entry', async () => {
    const screen = await renderTab({
      rows: [row({ paidFils: 6000 as Fils, paymentStatus: 'paid' })],
    });

    await fireEvent.press(screen.getByTestId('money-row-b1-not-paid'));

    expect(mockRecord.mock.calls[0]?.[0]).toMatchObject({ bookingId: 'b1', paidFils: 0 });
  });

  it('offers no Mark paid on a row that expects nothing', async () => {
    // D45 and D47, and 12.2 rule 2. Nothing to mark, so no dead control.
    const screen = await renderTab({
      rows: [row({ paymentMethod: 'free', expectedFils: 0 as Fils, paymentStatus: 'waived' })],
    });

    expect(screen.queryByTestId('money-row-b1-mark-paid')).toBeNull();
    expect(screen.getByText('Nothing due')).toBeTruthy();
  });

  it('offers View proof on a CliQ row and not on a cash one', async () => {
    const cliq = await renderTab({
      rows: [row({ paymentMethod: 'cliq', proofPath: 'p1/b1.jpg' })],
    });
    expect(cliq.getByTestId('money-row-b1-view-proof')).toBeTruthy();

    const cash = await renderTab();
    expect(cash.queryByTestId('money-row-b1-view-proof')).toBeNull();
  });

  it('offers no Change method on a credit row. A47', async () => {
    const screen = await renderTab({
      rows: [row({ paymentMethod: 'credit', expectedFils: 0 as Fils, paymentStatus: 'paid' })],
    });

    expect(screen.queryByTestId('money-row-b1-change-method')).toBeNull();
  });

  it('opens the partial sheet prefilled with the amount due', async () => {
    // 10.2: "Opens a numeric input, prefilled with expected_fils."
    const screen = await renderTab();

    await fireEvent.press(screen.getByTestId('money-row-b1-partial'));

    expect(screen.getByTestId('partial-amount').props.value).toBe('6');
  });

  it('hands a removal to 15.2’s dialog rather than a second one of its own', async () => {
    const screen = await renderTab();

    await fireEvent.press(screen.getByTestId('money-row-b1-remove'));

    expect(onRemove.mock.calls[0]?.[0]).toMatchObject({ bookingId: 'b1', playerId: 'p1' });
  });

  it('opens the player profile from the name, and not from a guest’s', async () => {
    // 15.8 section 6. A guest has no account and no balance. D44, D46.
    const player = await renderTab();
    await fireEvent.press(player.getByTestId('money-row-b1-name'));
    expect(onOpenPlayer).toHaveBeenCalledWith('p1');

    onOpenPlayer.mockClear();
    const guest = await renderTab({
      rows: [row({ kind: 'guest', playerId: null, displayName: 'Sami' })],
    });
    await fireEvent.press(guest.getByTestId('money-row-b1-name'));
    expect(onOpenPlayer).not.toHaveBeenCalled();
  });
});

describe('the footer, 10.2 and 12.3', () => {
  it('shows expected, collected, outstanding, cost and profit', async () => {
    const screen = await renderTab({
      rows: [row({ paidFils: 2000 as Fils, paymentStatus: 'partial' })],
    });

    expect(screen.getByTestId('money-expected').children.join('')).toBe('6.000 JD');
    expect(screen.getByTestId('money-collected').children.join('')).toBe('2.000 JD');
    expect(screen.getByTestId('money-outstanding').children.join('')).toBe('4.000 JD');
    expect(screen.getByTestId('money-cost').children.join('')).toBe('31.250 JD');
    // 12.3: profit = revenue received − cost.
    expect(screen.getByTestId('money-profit').children.join('')).toBe('-29.250 JD');
    expect(screen.getByTestId('money-profit-if-collected').children.join('')).toBe('-25.250 JD');
  });

  it('values a credit at its subscription’s rate, never the session price', async () => {
    // 12.2 rule 1.
    const screen = await renderTab({
      rows: [row({ paymentMethod: 'credit', expectedFils: 0 as Fils, paymentStatus: 'paid' })],
      summary: { ...SUMMARY, creditRevenueFils: 5000 as Fils, costFils: 31250 as Fils },
    });

    expect(screen.getByTestId('money-credit-revenue').children.join('')).toBe('5.000 JD');
    expect(screen.getByTestId('money-collected').children.join('')).toBe('0.000 JD');
  });

  it('still shows the money it knows when the cost could not be loaded', async () => {
    const screen = await renderTab({ summary: undefined });

    expect(screen.getByTestId('money-expected').children.join('')).toBe('6.000 JD');
    expect(screen.getByTestId('money-cost').children.join('')).toBe('0.000 JD');
  });
});

describe('confirming and reopening', () => {
  it('confirms after a dialog that says how many rows it settles', async () => {
    const screen = await renderTab();

    await fireEvent.press(screen.getByTestId('money-confirm'));
    expect(screen.getByText('1 row will be marked as reviewed.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('review-dialog-confirm'));
    expect(mockConfirm.mock.calls[0]?.[0]).toBe('s1');
  });

  it('notes the money still owed, without blocking the confirm. D40', async () => {
    const screen = await renderTab();

    await fireEvent.press(screen.getByTestId('money-confirm'));

    expect(screen.getByTestId('review-dialog-outstanding')).toBeTruthy();
    expect(screen.getByTestId('review-dialog-confirm').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('offers the reopen only once the session is confirmed', async () => {
    const pending = await renderTab();
    expect(pending.queryByTestId('money-reopen')).toBeNull();

    const confirmed = await renderTab({ session: session({ status: 'confirmed' }) });
    expect(confirmed.getByTestId('money-reopen')).toBeTruthy();

    await fireEvent.press(confirmed.getByTestId('money-reopen'));
    await fireEvent.press(confirmed.getByTestId('review-dialog-confirm'));
    expect(mockReopen.mock.calls[0]?.[0]).toBe('s1');
  });

  it('has nothing to confirm before the session has been played', async () => {
    // D22 still lets him take money at the door.
    const screen = await renderTab({
      session: session({ status: 'scheduled', endsAt: addHours(new Date(), 3) }),
    });

    expect(screen.queryByTestId('money-confirm')).toBeNull();
    expect(screen.getByTestId('money-row-b1-mark-paid')).toBeTruthy();
  });
});

describe('after the 7 day lock, D39', () => {
  it('renders every row read only, with a note saying why', async () => {
    const screen = await renderTab({
      session: session({ status: 'locked', endsAt: addDays(new Date(), -9) }),
    });

    expect(screen.getByTestId('money-notice')).toBeTruthy();
    expect(
      screen.getByText('This session locked 7 days after it ended. Nothing here can be changed.'),
    ).toBeTruthy();

    expect(screen.queryByTestId('money-row-b1-mark-paid')).toBeNull();
    expect(screen.queryByTestId('money-row-b1-partial')).toBeNull();
    expect(screen.queryByTestId('money-row-b1-remove')).toBeNull();
    expect(screen.queryByTestId('money-confirm')).toBeNull();

    // The record itself stays readable. It is read only, not hidden.
    expect(screen.getByTestId('money-row-b1-amounts')).toBeTruthy();
    expect(screen.getByTestId('money-footer')).toBeTruthy();
  });

  it('is read only on the deadline even before the nightly job has run', async () => {
    // 8.6 runs the lock job at 03:10 Amman, so a session can be past its
    // window and still say pending_review. The server refuses a mutation in
    // those hours; the screen must not offer one.
    const screen = await renderTab({
      session: session({ status: 'pending_review', endsAt: addDays(new Date(), -8) }),
    });

    expect(screen.queryByTestId('money-row-b1-mark-paid')).toBeNull();
    expect(screen.queryByTestId('money-confirm')).toBeNull();
  });
});

describe('Arabic', () => {
  it('renders the row actions and the footer in Arabic', async () => {
    const screen = await renderTab({}, 'ar');

    expect(screen.getByText('سجّل دفع كامل')).toBeTruthy();
    expect(screen.getByText('المطلوب')).toBeTruthy();
    expect(screen.getByTestId('money-expected').children.join('')).toBe('6.000 د.أ');
  });
});
