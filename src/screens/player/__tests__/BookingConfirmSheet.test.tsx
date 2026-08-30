/**
 * The booking confirmation sheet. BUILD-SPEC 14.8.
 *
 * 19.1 names this screen's cases: "Payment sheet disables credit correctly and
 * shows the extended top-up line only for extended sessions." Both are below,
 * along with the lost-race state 14.8 gives its own presentation.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Session } from '@/features/sessions/types';
import type { CreditSummary } from '@/features/subscriptions/types';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { BookingConfirmSheet } from '../BookingConfirmSheet';

jest.mock('@/lib/supabase');

const mockCreate = jest.fn();
const mockReset = jest.fn();
const mockCreateState = jest.fn();
const mockCredits = jest.fn();
const mockCliq = jest.fn();
const mockCliqReset = jest.fn();
const mockCliqState = jest.fn();
const mockPick = jest.fn();
const mockCopy = jest.fn((_value: string) => Promise.resolve());

const PROOF = {
  uri: 'file:///tmp/proof.jpg',
  width: 1600,
  height: 900,
  bytes: 184320,
  mimeType: 'image/jpeg' as const,
};

jest.mock('@/features/bookings/mutations', () => ({
  useCreateBooking: () => mockCreateState(),
}));

jest.mock('@/features/payments/mutations', () => ({
  useCreateCliqBooking: () => mockCliqState(),
}));

// 10.1 step 3 and 4 reach the camera roll and the image manipulator, neither of
// which exists under Jest. What is asserted here is what the sheet does with
// the result, not that Expo works.
jest.mock('@/features/payments/cliqUpload', () => ({
  pickAndPrepareProof: (source: string) => mockPick(source),
  proofStoragePath: (userId: string, bookingId: string) => `${userId}/${bookingId}.jpg`,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockCopy(value),
}));

// Section 24 question 2 is answered, so the alias and the account holder it
// resolves to are constants rather than something the sheet has to do without.
jest.mock('@/lib/config', () => ({
  config: {
    cliqAlias: 'prof2023',
    cliqAccountName: 'MOHAMMAD YOUSEF A. ABUDABBOUR',
    whatsappNumber: '962792841696',
  },
  isProduction: false,
}));

jest.mock('@/features/subscriptions/queries', () => ({
  useMyCredits: () => mockCredits(),
}));

const START = parseInstant('2026-08-24T16:00:00Z');

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
    startsAt: START,
    endsAt: parseInstant('2026-08-24T17:30:00Z'),
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 16, taken: 9, remaining: 7 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

const onClose = jest.fn();
const onJoinWaitlist = jest.fn();

interface Setup {
  session?: Session;
  payableFils?: Fils;
  credits?: CreditSummary;
  error?: unknown;
  isPending?: boolean;
  cliqError?: unknown;
}

function setup({
  credits = { total: 0, nextExpiry: null, hasUsableCredit: false },
  error,
  isPending = false,
  cliqError,
}: Setup = {}): void {
  mockCredits.mockReturnValue({ data: credits });
  mockCreateState.mockReturnValue({
    mutate: mockCreate,
    reset: mockReset,
    isPending,
    isError: error !== undefined,
    error: error ?? null,
  });
  mockCliqState.mockReturnValue({
    mutate: mockCliq,
    reset: mockCliqReset,
    isPending: false,
    isError: cliqError !== undefined,
    error: cliqError ?? null,
  });
  mockPick.mockResolvedValue(PROOF);
}

async function renderSheet(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  setup(options);

  return renderWithProviders(
    <BookingConfirmSheet
      isVisible
      session={options.session ?? session()}
      payableFils={options.payableFils ?? (6000 as Fils)}
      onClose={onClose}
      onJoinWaitlist={onJoinWaitlist}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the three options', () => {
  it('offers cash, CliQ and credit', async () => {
    const screen = await renderSheet();

    expect(screen.getByTestId('payment-option-cash')).toBeTruthy();
    expect(screen.getByTestId('payment-option-cliq')).toBeTruthy();
    expect(screen.getByTestId('payment-option-credit')).toBeTruthy();
  });

  it('preselects cash', async () => {
    const screen = await renderSheet();

    expect(screen.getByTestId('payment-option-cash').props.accessibilityState.selected).toBe(true);
  });

  it('disables credit and says why when he has none', async () => {
    // 14.8: the subtitle becomes "No credits available".
    const screen = await renderSheet();

    expect(screen.getByTestId('payment-option-credit').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByText('No credits available')).toBeTruthy();
  });

  it('enables credit and shows the balance and the expiry when he has some', async () => {
    const screen = await renderSheet({
      credits: { total: 3, nextExpiry: '2026-09-14', hasUsableCredit: true },
    });

    expect(screen.getByTestId('payment-option-credit').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(screen.getByText('3 credits left, expires 14/9/2026')).toBeTruthy();
  });

  it('never disables CliQ. 14.8', async () => {
    const screen = await renderSheet();

    expect(screen.getByTestId('payment-option-cliq').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText('Transfer now and attach a screenshot')).toBeTruthy();
  });
});

describe('the amount', () => {
  it('shows the session price', async () => {
    const screen = await renderSheet();

    expect(screen.getByTestId('booking-amount').children.join('')).toBe('6.000 JD');
  });

  it('shows his own rate instead, with no explanation. D41', async () => {
    const screen = await renderSheet({ payableFils: 4000 as Fils });

    expect(screen.getByTestId('booking-amount').children.join('')).toBe('4.000 JD');
    expect(screen.queryByText(/6.000/)).toBeNull();
  });
});

describe('the extended top-up line', () => {
  const CREDITS: CreditSummary = { total: 3, nextExpiry: '2026-09-14', hasUsableCredit: true };

  it('appears on an extended session paid by credit. D53', async () => {
    const screen = await renderSheet({
      session: session({ sessionType: 'extended' }),
      credits: CREDITS,
    });

    await fireEvent.press(screen.getByTestId('payment-option-credit'));

    expect(screen.getByTestId('booking-extended-topup')).toBeTruthy();
    expect(
      screen.getByText(
        'Your credit covers this session. The price difference is paid to the coach at the venue.',
      ),
    ).toBeTruthy();
  });

  it('does not appear on a standard session paid by credit', async () => {
    const screen = await renderSheet({ credits: CREDITS });

    await fireEvent.press(screen.getByTestId('payment-option-credit'));

    expect(screen.queryByTestId('booking-extended-topup')).toBeNull();
  });

  it('does not appear on an extended session paid in cash', async () => {
    // D53 is about what a credit does not cover. Cash covers the whole price.
    const screen = await renderSheet({
      session: session({ sessionType: 'extended' }),
      credits: CREDITS,
    });

    expect(screen.queryByTestId('booking-extended-topup')).toBeNull();
  });
});

describe('confirming', () => {
  it('books with the chosen method', async () => {
    const screen = await renderSheet({
      credits: { total: 3, nextExpiry: '2026-09-14', hasUsableCredit: true },
    });

    await fireEvent.press(screen.getByTestId('payment-option-credit'));
    await fireEvent.press(screen.getByTestId('booking-confirm'));

    expect(mockCreate.mock.calls[0]?.[0]).toEqual({ sessionId: 's1', method: 'credit' });
  });

  it('books cash when he changes nothing', async () => {
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('booking-confirm'));

    expect(mockCreate.mock.calls[0]?.[0]).toEqual({ sessionId: 's1', method: 'cash' });
  });

  it('cannot be confirmed twice while it is in flight', async () => {
    const screen = await renderSheet({ isPending: true });

    await fireEvent.press(screen.getByTestId('booking-confirm'));

    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the CliQ path, 14.8 and 10.1', () => {
  it('shows the alias, a copy button and the amount when CliQ is chosen', async () => {
    // 14.8: "shows the CliQ alias with a copy button and the amount".
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));

    expect(screen.getByTestId('cliq-step')).toBeTruthy();
    expect(screen.getByTestId('cliq-alias').children.join('')).toBe('prof2023');
    expect(screen.getByTestId('cliq-copy')).toBeTruthy();
    expect(screen.getByTestId('cliq-amount').children.join('')).toBe('6.000 JD');
  });

  it('names the account the alias resolves to', async () => {
    // The CliQ account is a personal one, so the name a player's banking app
    // shows him after typing the alias is not the academy's. Showing it here
    // first is what makes that reassuring rather than alarming.
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));

    expect(screen.getByTestId('cliq-account-name').children.join('')).toBe(
      'MOHAMMAD YOUSEF A. ABUDABBOUR',
    );
  });

  it('copies the alias', async () => {
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-copy'));

    expect(mockCopy).toHaveBeenCalled();
  });

  it('keeps confirm disabled until an image is attached', async () => {
    // 14.8: "The confirm button is disabled until an image is attached."
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    expect(screen.getByTestId('booking-confirm').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('booking-confirm'));
    expect(mockCliq).not.toHaveBeenCalled();
  });

  it('shows a thumbnail with a Replace option once one is attached', async () => {
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-attach'));

    expect(screen.getByTestId('cliq-thumbnail')).toBeTruthy();
    expect(screen.getByTestId('cliq-replace')).toBeTruthy();
    expect(screen.getByTestId('booking-confirm').props.accessibilityState.disabled).toBe(false);
  });

  it('books through the CliQ path, which carries the proof', async () => {
    // 10.1 steps 5 to 7. Not `create_booking`, which cannot attach a proof and
    // refuses CliQ for exactly that reason.
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-attach'));
    await fireEvent.press(screen.getByTestId('booking-confirm'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCliq.mock.calls[0]?.[0]).toEqual({ sessionId: 's1', proof: PROOF });
  });

  it('drops the screenshot when he switches back to cash', async () => {
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-attach'));
    await fireEvent.press(screen.getByTestId('payment-option-cash'));
    await fireEvent.press(screen.getByTestId('payment-option-cliq'));

    // Back to the attach button: a cash booking holding an image nothing will
    // ever upload is a state worth not having.
    expect(screen.getByTestId('cliq-attach')).toBeTruthy();
    expect(screen.queryByTestId('cliq-thumbnail')).toBeNull();
  });

  it('keeps the screenshot after a failed upload, so the retry is one tap', async () => {
    // 10.1: "If the upload fails, no booking is created and the player sees a
    // retry option."
    const screen = await renderSheet({ cliqError: { message: 'upload_failed' } });

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-attach'));

    expect(screen.getByTestId('booking-error')).toBeTruthy();
    expect(screen.getByTestId('cliq-thumbnail')).toBeTruthy();
    expect(screen.getByTestId('booking-confirm').props.accessibilityState.disabled).toBe(false);
  });

  it('treats a cancelled picker as nothing at all', async () => {
    mockPick.mockResolvedValueOnce(null);
    const screen = await renderSheet();

    await fireEvent.press(screen.getByTestId('payment-option-cliq'));
    await fireEvent.press(screen.getByTestId('cliq-attach'));

    expect(screen.queryByTestId('cliq-thumbnail')).toBeNull();
    expect(screen.queryByTestId('cliq-pick-error')).toBeNull();
  });
});

describe('the lost race', () => {
  it('apologises and offers the waiting list. 14.8, 9.5', async () => {
    const screen = await renderSheet({ error: { message: 'session_full' } });

    expect(screen.getByTestId('booking-full')).toBeTruthy();
    expect(screen.getByText('Sorry, the last spot went while you were booking.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('booking-join-waitlist'));
    expect(onJoinWaitlist).toHaveBeenCalled();
  });

  it('shows any other failure as its own message, not as the apology', async () => {
    const screen = await renderSheet({ error: { message: 'booking_window_closed' } });

    expect(screen.queryByTestId('booking-full')).toBeNull();
    expect(screen.getByText('Booking closed one hour before the session.')).toBeTruthy();
  });

  it('offers WhatsApp beside a failure, per D72', async () => {
    const screen = await renderSheet({ error: { message: 'already_booked' } });

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('renders the sheet, the method names and the amount in Arabic', async () => {
    const screen = await renderSheet({}, 'ar');

    expect(screen.getByText('كيف ستدفع؟')).toBeTruthy();
    expect(screen.getByText('نقدًا عند الحضور')).toBeTruthy();
    expect(screen.getByTestId('booking-amount').children.join('')).toBe('6.000 د.أ');
  });

  it('renders the extended top-up line in Arabic', async () => {
    const screen = await renderSheet(
      {
        session: session({ sessionType: 'extended' }),
        credits: { total: 2, nextExpiry: '2026-09-14', hasUsableCredit: true },
      },
      'ar',
    );

    await fireEvent.press(screen.getByTestId('payment-option-credit'));

    expect(
      screen.getByText('الاشتراك يغطي هذه الجلسة، وفرق السعر يُدفع للكابتن في الصالة.'),
    ).toBeTruthy();
  });
});
