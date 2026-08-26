/**
 * The report arithmetic that happens after the server's. BUILD-SPEC 15.12.
 *
 * The reconciliation these tests care about most is the one phase 9 is
 * measured by: the weekly bars of section 1 must add up to the headline of
 * section 1 exactly. Both come from the same scope on the server, so a
 * difference here would mean one of the two functions had drifted.
 */
import type { Fils } from '@/lib/money';

import {
  activeChange,
  averageAttendance,
  averageLabel,
  fillRate,
  maxWeekTotal,
  percentLabel,
  signedLabel,
  sortSessions,
  weekdayKey,
  weeklyTotals,
} from '../aggregate';
import type { ReportSession, RevenueWeek } from '../types';

function week(
  weekStart: string,
  cash: number,
  cliq: number,
  credit: number,
  sessionCount = 2,
): RevenueWeek {
  return {
    weekStart,
    cashFils: cash as Fils,
    cliqFils: cliq as Fils,
    creditFils: credit as Fils,
    totalFils: (cash + cliq + credit) as Fils,
    sessionCount,
  };
}

function session(
  id: string,
  startsAt: string,
  players: number,
  revenue: number,
  cost: number,
): ReportSession {
  return {
    sessionId: id,
    sessionDate: startsAt.slice(0, 10),
    startsAt: new Date(startsAt),
    endsAt: new Date(startsAt),
    venueId: 'venue',
    venueNameEn: 'Khalda',
    venueNameAr: 'خلدا',
    sessionType: 'standard',
    playerCount: players,
    capacity: 16,
    revenueFils: revenue as Fils,
    costFils: cost as Fils,
    profitFils: (revenue - cost) as Fils,
    outstandingFils: 0 as Fils,
  };
}

describe('weeklyTotals', () => {
  it('reconciles the bars to the headline, exactly', () => {
    const weeks = [
      week('2026-06-28', 277500, 72000, 12501),
      week('2026-07-05', 500000, 127000, 0),
      week('2026-07-12', 434000, 104000, 4167),
      week('2026-07-19', 442000, 132000, 12834),
      week('2026-07-26', 316000, 155000, 12501),
    ];

    expect(weeklyTotals(weeks)).toEqual({
      cashFils: 1969500,
      cliqFils: 590000,
      creditFils: 42003,
      totalFils: 2601503,
    });
  });

  it('is zero for a month with no revenue at all', () => {
    expect(weeklyTotals([])).toEqual({
      cashFils: 0,
      cliqFils: 0,
      creditFils: 0,
      totalFils: 0,
    });
  });

  it('never loses a fils to floating point, because there is none to lose', () => {
    // 4167 is the 30-visit package's per-visit rate (11.1). Thirty of them is
    // 125.010 JD, not 125.000: the rounding lives in the rate, once, and the
    // sum of the rates is what the report says.
    const weeks = Array.from({ length: 30 }, (_, index) =>
      week(`2026-07-0${index % 9}`, 0, 0, 4167, 1),
    );

    expect(weeklyTotals(weeks).creditFils).toBe(125010);
  });
});

describe('maxWeekTotal', () => {
  it('finds the tallest bar', () => {
    expect(maxWeekTotal([week('a', 1000, 0, 0), week('b', 4000, 0, 0)])).toBe(4000);
  });

  it('is zero for no bars, so every bar renders empty rather than full', () => {
    expect(maxWeekTotal([])).toBe(0);
  });
});

describe('fillRate', () => {
  it('divides attendance by capacity', () => {
    expect(fillRate(38, 48)).toBeCloseTo(0.7917, 4);
  });

  it('is null when nothing ran, not zero', () => {
    // A slot that did not run and a slot nobody came to are different facts,
    // and 15.12 section 5 exists to tell them apart.
    expect(fillRate(0, 0)).toBeNull();
  });

  it('clamps a full session to 1', () => {
    expect(fillRate(16, 16)).toBe(1);
  });
});

describe('percentLabel', () => {
  it('rounds to a whole percent, Western digits', () => {
    expect(percentLabel(0.7917)).toBe('79%');
    expect(percentLabel(1)).toBe('100%');
  });

  it('renders a dash where there is no rate', () => {
    expect(percentLabel(null)).toBe('—');
  });
});

describe('averageAttendance', () => {
  it('is players per session that ran, to one decimal', () => {
    expect(averageAttendance(524, 54)).toBe(9.7);
  });

  it('is null when nothing ran', () => {
    expect(averageAttendance(0, 0)).toBeNull();
    expect(averageLabel(averageAttendance(0, 0))).toBe('—');
  });

  it('always writes the decimal place, so a column of them lines up', () => {
    expect(averageLabel(averageAttendance(48, 4))).toBe('12.0');
  });
});

describe('sortSessions', () => {
  const rows = [
    session('a', '2026-07-02T16:00:00Z', 5, 27000, 31250),
    session('b', '2026-07-01T16:00:00Z', 11, 47000, 25000),
    session('c', '2026-07-03T16:00:00Z', 6, 30000, 23750),
  ];

  it('sorts by date ascending by default', () => {
    expect(sortSessions(rows, 'date', false).map((row) => row.sessionId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by profit, worst first when ascending', () => {
    // 'a' lost 4.250 JD on five players against a 31.250 JD night. 12.4 says
    // that slot breaks even at six.
    expect(sortSessions(rows, 'profit', false)[0]?.sessionId).toBe('a');
  });

  it('sorts by profit descending', () => {
    expect(sortSessions(rows, 'profit', true)[0]?.sessionId).toBe('b');
  });

  it('sorts by players, revenue and cost', () => {
    expect(sortSessions(rows, 'players', true)[0]?.sessionId).toBe('b');
    expect(sortSessions(rows, 'revenue', true)[0]?.sessionId).toBe('b');
    expect(sortSessions(rows, 'cost', true)[0]?.sessionId).toBe('a');
  });

  it('breaks a tie on start time, so the order never jitters', () => {
    const tied = [
      session('late', '2026-07-04T16:00:00Z', 6, 30000, 25000),
      session('early', '2026-07-01T16:00:00Z', 6, 30000, 25000),
    ];

    expect(sortSessions(tied, 'profit', true).map((row) => row.sessionId)).toEqual([
      'early',
      'late',
    ]);
  });

  it('does not mutate the rows it was given', () => {
    const original = [...rows];
    sortSessions(rows, 'profit', true);
    expect(rows).toEqual(original);
  });
});

describe('activeChange', () => {
  it('is this month against last', () => {
    expect(activeChange(42, 38)).toBe(4);
    expect(activeChange(38, 42)).toBe(-4);
  });

  it('writes its sign', () => {
    expect(signedLabel(4)).toBe('+4');
    expect(signedLabel(-4)).toBe('-4');
    expect(signedLabel(0)).toBe('0');
  });
});

describe('weekdayKey', () => {
  it('maps the integers 6.2 uses, Sunday first', () => {
    expect(weekdayKey(0)).toBe('admin.reports.weekday.sunday');
    expect(weekdayKey(6)).toBe('admin.reports.weekday.saturday');
  });

  it('falls back rather than rendering a missing key', () => {
    expect(weekdayKey(9)).toBe('admin.reports.weekday.sunday');
  });
});
