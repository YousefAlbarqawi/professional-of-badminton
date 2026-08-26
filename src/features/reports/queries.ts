/**
 * Report queries. Every Supabase read passes through here. CLAUDE.md.
 *
 * ── Why totals go first and the rest wait on it ──────────
 * 15.12's nine sections come from two functions, and firing both at once would
 * mean an admin who opens the tab generating two refusals to see one
 * permission denied screen. So `useReportTotals` runs alone, and
 * `useReportSections` is enabled only once it has succeeded. A coach pays one
 * extra round trip on the first month he opens; an admin is told no, once.
 *
 * The gate is the server's answer, not the client's guess at it. The screen
 * never reads its own role to decide whether to ask: D73 is enforced inside
 * `report_totals` and `report_sections` alike (migrations 0036 and 0040), and
 * this is what proves it on the phone.
 *
 * `report_sections` used to be seven separate round trips — one per section —
 * fired together the moment the gate opened. OPEN-ITEMS.md recorded that as
 * worth folding into one function if it was ever felt slow; migration 0040
 * does that folding, so opening the tab now costs at most two requests
 * instead of up to eight.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchReportSections, fetchReportTotals } from './api';
import type { MonthKey, ReportSections, ReportTotals } from './types';

export const reportKeys = {
  all: ['reports'] as const,
  month: (month: MonthKey) => ['reports', month] as const,
  totals: (month: MonthKey) => ['reports', month, 'totals'] as const,
  sections: (month: MonthKey) => ['reports', month, 'sections'] as const,
};

/**
 * A closed month never changes: it is past its 7 day review window, every
 * session is locked and every cost snapshot is frozen (12.1). The current
 * month changes every time the coach marks somebody paid, which is often the
 * reason he opened the report at all.
 */
const CLOSED_MONTH_STALE_TIME = 5 * 60_000;
const CURRENT_MONTH_STALE_TIME = 30_000;

function staleTime(month: MonthKey, currentMonth: MonthKey): number {
  return month === currentMonth ? CURRENT_MONTH_STALE_TIME : CLOSED_MONTH_STALE_TIME;
}

/** 15.12 sections 1, 2, 3 and 8's totals. The one query that runs unguarded. */
export function useReportTotals(
  month: MonthKey,
  currentMonth: MonthKey,
): UseQueryResult<ReportTotals, Error> {
  return useQuery({
    queryKey: reportKeys.totals(month),
    queryFn: () => fetchReportTotals(month),
    staleTime: staleTime(month, currentMonth),
    // A refused query is refused for the same reason every time. Retrying it
    // three times tells the admin nothing and the coach nothing either.
    retry: false,
  });
}

/**
 * 15.12 section 1's bar per week, section 4's table, sections 5 and 6's fill,
 * and sections 7, 8 and 9 — bundled in one request by `report_sections`
 * (migration 0040).
 */
export function useReportSections(
  month: MonthKey,
  isEnabled: boolean,
  currentMonth: MonthKey,
): UseQueryResult<ReportSections, Error> {
  return useQuery({
    queryKey: reportKeys.sections(month),
    queryFn: () => fetchReportSections(month),
    enabled: isEnabled,
    staleTime: staleTime(month, currentMonth),
    retry: false,
  });
}
