/**
 * The arithmetic the report screen does after the server has done its own.
 *
 * Everything here is pure and takes integers. The division that produces a
 * fill rate or an average happens in exactly one place so that section 2's
 * "average occupancy", section 5's "average fill" and section 6's "fill rate"
 * cannot quietly mean three different things. BUILD-SPEC 15.12.
 */
import type { Fils } from '@/lib/money';

import type { ReportSession, RevenueWeek, SessionSortKey } from './types';

/**
 * Attendance over capacity, 0 to 1. A month with no sessions has no fill rate
 * rather than a rate of zero, and the caller renders a dash; returning 0 would
 * put a dying slot and a slot that did not run in the same bar.
 */
export function fillRate(attendeeTotal: number, capacityTotal: number): number | null {
  if (capacityTotal <= 0) return null;
  return Math.min(1, Math.max(0, attendeeTotal / capacityTotal));
}

/** A fill rate as a whole percentage, Western digits in both languages. 16.1. */
export function percentLabel(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

/**
 * 15.12 section 2's average occupancy: players per session that ran, to one
 * decimal place. Null when nothing ran.
 */
export function averageAttendance(attendeeCount: number, sessionsRun: number): number | null {
  if (sessionsRun <= 0) return null;
  return Math.round((attendeeCount / sessionsRun) * 10) / 10;
}

/** That average as text. "9.7", or a dash for a month with no sessions. */
export function averageLabel(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(1);
}

/**
 * The three revenue streams summed across the weekly bars.
 *
 * This exists so that the chart and the headline can be checked against each
 * other: `report_revenue_by_week` and `report_totals` scope their sessions the
 * same way, so these totals must equal the headline exactly. Where they would
 * not, one of the two functions has drifted, and the test suite says so.
 */
export function weeklyTotals(weeks: RevenueWeek[]): {
  cashFils: Fils;
  cliqFils: Fils;
  creditFils: Fils;
  totalFils: Fils;
} {
  return weeks.reduce(
    (sum, week) => ({
      cashFils: (sum.cashFils + week.cashFils) as Fils,
      cliqFils: (sum.cliqFils + week.cliqFils) as Fils,
      creditFils: (sum.creditFils + week.creditFils) as Fils,
      totalFils: (sum.totalFils + week.totalFils) as Fils,
    }),
    { cashFils: 0 as Fils, cliqFils: 0 as Fils, creditFils: 0 as Fils, totalFils: 0 as Fils },
  );
}

/** The tallest bar, which every other bar is drawn as a fraction of. */
export function maxWeekTotal(weeks: RevenueWeek[]): Fils {
  return weeks.reduce((max, week) => (week.totalFils > max ? week.totalFils : max), 0 as Fils);
}

/**
 * 15.12 section 4's table is sortable. A month holds around fifty rows and
 * they are already on the phone, so re-sorting them must not cost a request.
 *
 * The sort is stable and always falls back to the start time, so two sessions
 * with identical profit keep the order the coach saw them in last.
 */
export function sortSessions(
  rows: ReportSession[],
  key: SessionSortKey,
  isDescending: boolean,
): ReportSession[] {
  const value = (row: ReportSession): number => {
    switch (key) {
      case 'date':
        return row.startsAt.getTime();
      case 'players':
        return row.playerCount;
      case 'revenue':
        return row.revenueFils;
      case 'cost':
        return row.costFils;
      case 'profit':
        return row.profitFils;
    }
  };

  return [...rows].sort((a, b) => {
    const difference = value(a) - value(b);
    if (difference !== 0) return isDescending ? -difference : difference;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

/**
 * 15.12 section 9 sets this month's active players against last month's. The
 * difference is what the coach is actually reading, so it is computed once
 * rather than by eye.
 */
export function activeChange(thisMonth: number, previousMonth: number): number {
  return thisMonth - previousMonth;
}

/** A signed count for display: "+3", "-2", "0". Western digits. 16.1. */
export function signedLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Weekday names for 15.12 section 5, keyed by the integers 6.2 uses
 * (0 = Sunday, matching Postgres EXTRACT(DOW)).
 */
export const WEEKDAY_KEYS = [
  'admin.reports.weekday.sunday',
  'admin.reports.weekday.monday',
  'admin.reports.weekday.tuesday',
  'admin.reports.weekday.wednesday',
  'admin.reports.weekday.thursday',
  'admin.reports.weekday.friday',
  'admin.reports.weekday.saturday',
] as const;

export function weekdayKey(weekday: number): string {
  return WEEKDAY_KEYS[weekday] ?? WEEKDAY_KEYS[0];
}
