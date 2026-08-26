/**
 * Reports. BUILD-SPEC 15.12.
 *
 * The two things this screen must get right are the boundary and the money.
 *
 * The boundary is D73: an admin sees a permission denied state, and — the part
 * that matters — the screen learns that from the server rather than from the
 * account it is signed in as. So the denial here is produced by the query
 * failing with `not_authorized`, which is what migration 0036 raises, and no
 * test anywhere teaches this screen what a role is.
 *
 * The money is 12.2. A credit is never 6 JD; unpaid money is never revenue.
 * Those are asserted on what the coach reads, in the currency he reads it in.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type {
  Debtor,
  PlayerCounts,
  ReportSections,
  ReportSession,
  ReportTotals,
  RevenueWeek,
  SlotAttendance,
  SubscriptionReport,
  VenueFill,
} from '@/features/reports';
import type { Fils, Locale } from '@/lib/money';

import { ReportsScreen } from '../ReportsScreen';

jest.mock('@/lib/supabase');

const mockTotals = jest.fn();
const mockSections = jest.fn();

jest.mock('@/features/reports', () => {
  const actual = jest.requireActual('@/features/reports');

  return {
    ...actual,
    useReportTotals: (...args: unknown[]) => mockTotals(...args),
    useReportSections: (...args: unknown[]) => mockSections(...args),
  };
});

/** A month of the seeded history, in the shape the server returns it. */
const TOTALS: ReportTotals = {
  cashFils: 1969500 as Fils,
  cliqFils: 590000 as Fils,
  creditFils: 42003 as Fils,
  revenueFils: 2601503 as Fils,
  courtCostFils: 1570000 as Fils,
  waterCostFils: 77500 as Fils,
  coachFeeFils: 40000 as Fils,
  coachFeeAccruedFils: 0 as Fils,
  costFils: 1687500 as Fils,
  cashCostFils: 1687500 as Fils,
  outstandingFils: 510500 as Fils,
  profitFils: 914003 as Fils,
  profitIfCollectedFils: 1424503 as Fils,
  sessionsRun: 54,
  sessionsCancelled: 2,
  attendeeCount: 524,
  capacityTotal: 756,
  owedToDateFils: 953500 as Fils,
};

const WEEKS: RevenueWeek[] = [
  {
    weekStart: '2026-07-05',
    cashFils: 500000 as Fils,
    cliqFils: 127000 as Fils,
    creditFils: 0 as Fils,
    totalFils: 627000 as Fils,
    sessionCount: 12,
  },
  {
    weekStart: '2026-07-12',
    cashFils: 434000 as Fils,
    cliqFils: 104000 as Fils,
    creditFils: 4167 as Fils,
    totalFils: 542167 as Fils,
    sessionCount: 12,
  },
];

const SESSIONS: ReportSession[] = [
  {
    sessionId: 's1',
    sessionDate: '2026-07-02',
    startsAt: new Date('2026-07-02T16:00:00.000Z'),
    endsAt: new Date('2026-07-02T17:30:00.000Z'),
    venueId: 'v1',
    venueNameEn: 'International Independent Schools',
    venueNameAr: 'مدارس الاستقلالية الدولية',
    sessionType: 'standard',
    playerCount: 5,
    capacity: 16,
    revenueFils: 27000 as Fils,
    costFils: 31250 as Fils,
    profitFils: -4250 as Fils,
    outstandingFils: 6000 as Fils,
  },
  {
    sessionId: 's2',
    sessionDate: '2026-07-03',
    startsAt: new Date('2026-07-03T16:00:00.000Z'),
    endsAt: new Date('2026-07-03T17:30:00.000Z'),
    venueId: 'v2',
    venueNameEn: "Al-Ra'ed Al-Arabi School",
    venueNameAr: 'مدرسة الرائد العربي',
    sessionType: 'standard',
    playerCount: 6,
    capacity: 12,
    revenueFils: 30000 as Fils,
    costFils: 23750 as Fils,
    profitFils: 6250 as Fils,
    outstandingFils: 0 as Fils,
  },
];

const SLOTS: SlotAttendance[] = [
  {
    templateId: 't1',
    venueId: 'v1',
    venueNameEn: 'International Independent Schools',
    venueNameAr: 'مدارس الاستقلالية الدولية',
    weekday: 6,
    startTime: '19:00:00',
    sessionType: 'standard',
    sessionsRun: 4,
    attendeeTotal: 50,
    capacityTotal: 64,
  },
];

const VENUES: VenueFill[] = [
  {
    venueId: 'v1',
    venueNameEn: 'International Independent Schools',
    venueNameAr: 'مدارس الاستقلالية الدولية',
    sessionsRun: 27,
    attendeeTotal: 288,
    capacityTotal: 432,
  },
];

const SUBS: SubscriptionReport = {
  soldCount: 3,
  soldValueFils: 200000 as Fils,
  creditsUsed: 10,
  creditsExpired: 2,
};

const DEBTORS: Debtor[] = [
  {
    playerId: 'p36',
    displayName: 'Player Number036',
    owedFils: 54000 as Fils,
    monthOwedFils: 34000 as Fils,
  },
  {
    playerId: 'p23',
    displayName: 'Player Number023',
    owedFils: 43000 as Fils,
    monthOwedFils: 0 as Fils,
  },
];

const PLAYERS: PlayerCounts = {
  activeThisMonth: 40,
  activePreviousMonth: 36,
  newRegistrations: 5,
};

/**
 * 15.12's other seven sections, bundled the way `report_sections` (migration
 * 0040) returns them and `useReportSections` reads them back.
 */
const SECTIONS: ReportSections = {
  weeks: WEEKS,
  sessions: SESSIONS,
  slots: SLOTS,
  venues: VENUES,
  subscriptions: SUBS,
  outstanding: DEBTORS,
  players: PLAYERS,
};

interface Setup {
  totals?: ReportTotals;
  isPending?: boolean;
  error?: Error;
}

function result(data: unknown, error: Error | null = null): unknown {
  return {
    data: error === null ? data : undefined,
    isPending: false,
    isSuccess: error === null,
    isError: error !== null,
    isFetching: false,
    error,
    refetch: jest.fn(),
  };
}

async function renderScreen(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  const error = options.error ?? null;

  mockTotals.mockReturnValue(
    options.isPending === true
      ? {
          data: undefined,
          isPending: true,
          isSuccess: false,
          isError: false,
          isFetching: true,
          error: null,
          refetch: jest.fn(),
        }
      : result(options.totals ?? TOTALS, error),
  );
  mockSections.mockReturnValue(result(SECTIONS));

  return renderWithProviders(<ReportsScreen />, { locale });
}

/** Whether the one gated query was told it may run. */
function gatedQueriesEnabled(): boolean[] {
  return [mockSections].map((mock) => mock.mock.calls[0]?.[1] as boolean);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('D73, coach only', () => {
  it('shows the permission denied state when the API refuses', async () => {
    const screen = await renderScreen({ error: new Error('not_authorized') });

    expect(screen.getByTestId('reports-denied')).toBeTruthy();
    expect(screen.getByText('Coach only')).toBeTruthy();
    // No figure of any kind reaches an admin.
    expect(screen.queryByTestId('report-revenue-total')).toBeNull();
  });

  it('asks for nothing else once it has been refused', async () => {
    // 15.12's admin generates one refusal, not two.
    await renderScreen({ error: new Error('not_authorized') });
    expect(gatedQueriesEnabled()).toEqual([false]);
  });

  it('leaves the month picker usable, so the refusal is not mistaken for a crash', async () => {
    const screen = await renderScreen({ error: new Error('not_authorized') });
    expect(screen.getByTestId('reports-month-previous')).toBeTruthy();
  });

  it('tells a dropped connection apart from a refusal', async () => {
    const screen = await renderScreen({ error: new TypeError('Network request failed') });

    expect(screen.queryByTestId('reports-denied')).toBeNull();
    expect(screen.getByText('No internet connection.')).toBeTruthy();
  });

  it('opens the bundled sections query once the totals query has succeeded', async () => {
    await renderScreen();
    expect(gatedQueriesEnabled()).toEqual([true]);
  });
});

describe('15.12 section 1, revenue', () => {
  it('shows the total and its three parts', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-revenue-total').children.join('')).toBe('2601.503 JD');
    expect(screen.getByTestId('report-revenue-cash').children.join('')).toBe('1969.500 JD');
    expect(screen.getByTestId('report-revenue-cliq').children.join('')).toBe('590.000 JD');
  });

  it('values credits at the package rate and says so. 12.2 rule 1', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-revenue-credit').children.join('')).toBe('42.003 JD');
    expect(
      screen.getByText(
        'A credit is worth the per-visit rate of the package it came from, not the session price.',
      ),
    ).toBeTruthy();
  });

  it('draws a bar per week', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-revenue-weeks')).toBeTruthy();
    expect(screen.getByText('5 July')).toBeTruthy();
    expect(screen.getByText('12 July')).toBeTruthy();
  });
});

describe('15.12 section 2, sessions', () => {
  it('counts what ran and what was cancelled, and averages the fill', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-sessions-run').children.join('')).toBe('54');
    expect(screen.getByTestId('report-sessions-cancelled').children.join('')).toBe('2');
    expect(screen.getByTestId('report-sessions-average').children.join('')).toBe('9.7');
  });
});

describe('15.12 section 3, profit', () => {
  it('shows profit and profit if all outstanding is collected. 12.3', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-profit-total').children.join('')).toBe('914.003 JD');
    expect(screen.getByTestId('report-profit-if-collected').children.join('')).toBe('1424.503 JD');
  });

  it('keeps unpaid money out of revenue. 12.2 rule 3', async () => {
    const screen = await renderScreen();

    // The difference between the two profit figures is exactly the outstanding
    // amount, which is the only place it appears.
    expect(screen.getByText('Outstanding from this month: 510.500 JD')).toBeTruthy();
  });

  it('marks an unpaid assistant coach as accrued rather than spent. 12.3', async () => {
    const screen = await renderScreen({
      totals: {
        ...TOTALS,
        coachFeeAccruedFils: 10000 as Fils,
        cashCostFils: 1677500 as Fils,
      },
    });

    expect(screen.getByText('10.000 JD of that is owed and has not been paid out.')).toBeTruthy();
    expect(screen.getByTestId('report-cost-cash-spent').children.join('')).toBe('1677.500 JD');
  });

  it('says nothing about accrual when every coach has been paid', async () => {
    const screen = await renderScreen();
    expect(screen.queryByTestId('report-cost-cash-spent')).toBeNull();
  });
});

describe('15.12 section 4, the per session table', () => {
  it('shows every session with its revenue, cost and profit', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-session-s1')).toBeTruthy();
    expect(screen.getByTestId('report-session-s1-profit').children.join('')).toBe('-4.250 JD');
    expect(screen.getByText('5 of 16')).toBeTruthy();
  });

  it('sorts, and reverses when the live column is tapped again', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('report-sort-profit'));
    let rows = screen.getAllByTestId(/^report-session-s\d$/);
    // Descending by default on a money column: the profitable night first.
    expect(rows[0]?.props.testID).toBe('report-session-s2');

    await fireEvent.press(screen.getByTestId('report-sort-profit'));
    rows = screen.getAllByTestId(/^report-session-s\d$/);
    expect(rows[0]?.props.testID).toBe('report-session-s1');
  });
});

describe('15.12 sections 5 and 6, fill', () => {
  it('shows a slot with its weekday, its time and its fill', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Saturday 7:00 PM')).toBeTruthy();
    expect(screen.getByTestId('report-slot-t1')).toBeTruthy();
    expect(screen.getByText('78%')).toBeTruthy();
  });

  it('shows a venue with its own fill', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-venue-v1')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
  });
});

describe('15.12 sections 7, 8 and 9', () => {
  it('shows subscriptions granted, used and expired', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-subs-sold').children.join('')).toBe('3');
    expect(screen.getByTestId('report-subs-used').children.join('')).toBe('10');
    expect(screen.getByTestId('report-subs-expired').children.join('')).toBe('2');
  });

  it('shows the debt book and the part of it this month made', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-owed-total').children.join('')).toBe('953.500 JD');
    expect(screen.getByTestId('report-owed-month').children.join('')).toBe('510.500 JD');
    expect(screen.getByTestId('report-debtor-p36').children.join('')).toBe('54.000 JD');
    expect(screen.getByText('34.000 JD of it from this month')).toBeTruthy();
  });

  it('repeats that a balance never blocks a booking. D40', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('A balance never blocks a booking.')).toBeTruthy();
  });

  it('sets active players against last month and shows the change', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('report-players-active').children.join('')).toBe('40');
    expect(screen.getByTestId('report-players-change').children.join('')).toBe('+4');
    expect(screen.getByTestId('report-players-new').children.join('')).toBe('5');
  });
});

describe('the month picker', () => {
  it('steps back a month and forward again', async () => {
    const screen = await renderScreen();

    const label = screen.getByTestId('reports-month-label').children.join('');

    await fireEvent.press(screen.getByTestId('reports-month-previous'));
    expect(screen.getByTestId('reports-month-label').children.join('')).not.toBe(label);

    await fireEvent.press(screen.getByTestId('reports-month-next'));
    expect(screen.getByTestId('reports-month-label').children.join('')).toBe(label);
  });

  it('cannot walk into a month that has not started', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('reports-month-next').props.accessibilityState.disabled).toBe(true);
  });
});

describe('the other states', () => {
  it('has a loading state', async () => {
    const screen = await renderScreen({ isPending: true });
    expect(screen.getByTestId('reports-loading')).toBeTruthy();
  });

  it('has an empty state for a month in which nothing ran', async () => {
    const screen = await renderScreen({
      totals: { ...TOTALS, sessionsRun: 0, sessionsCancelled: 0 },
    });

    expect(screen.getByTestId('reports-empty')).toBeTruthy();
    expect(screen.queryByTestId('report-revenue-total')).toBeNull();
  });

  it('has an error state, distinct from the coach-only refusal', async () => {
    // A failed read is not a refusal, and telling the coach he is not the
    // coach because the network dropped would be the wrong answer twice.
    const screen = await renderScreen({ error: new Error('boom') });

    expect(screen.getByTestId('reports-error')).toBeTruthy();
    expect(screen.queryByTestId('reports-denied')).toBeNull();
  });

  it('offers a retry on the error state', async () => {
    const screen = await renderScreen({ error: new Error('boom') });

    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('16.1, in Arabic', () => {
  it('reads in Arabic with Western digits and Levantine month names', async () => {
    const screen = await renderScreen({}, 'ar');

    // "Revenue" heads section 1 and appears again as a line inside section 3.
    expect(screen.getAllByText('الإيرادات').length).toBeGreaterThan(0);
    expect(screen.getByTestId('report-revenue-total').children.join('')).toBe('2601.503 د.أ');
    expect(screen.getByText('السبت 7:00 مساءً')).toBeTruthy();
  });

  it('names venues in the reading language', async () => {
    const screen = await renderScreen({}, 'ar');
    expect(screen.getAllByText('مدارس الاستقلالية الدولية').length).toBeGreaterThan(0);
  });
});

describe('section 4 item 19, no export', () => {
  it('offers no way to export anything', async () => {
    const screen = await renderScreen();

    for (const word of ['Export', 'CSV', 'PDF', 'Share', 'Download']) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });
});
