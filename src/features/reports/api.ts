/**
 * Report reads. BUILD-SPEC 15.12.
 *
 * Every one of these is an RPC rather than a table read, for two reasons.
 *
 * The first is the boundary. D73 makes reports coach only and phase 9's brief
 * is that an admin "hitting the endpoint gets a permission error", not a blank
 * screen. Each function in migration 0036 raises `not_authorized` from the
 * inside, so the refusal happens whether the caller came through this file, a
 * crafted `supabase.rpc` in a console, or curl.
 *
 * The second is arithmetic. A credit is worth the per-visit rate of the
 * subscription it came from (12.2 rule 1), which is three tables away from the
 * booking; the cost of a night is split across the sessions that ran (12.1),
 * which is a window function. Neither belongs on a phone, and doing them here
 * would mean shipping a month of bookings to the device to add them up.
 */
import type { Fils } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { monthKeyToDate, parseInstant } from '@/lib/time';

import type { MonthKey, ReportSections, ReportTotals } from './types';

/**
 * A report function that returns one row returns it as a one-row set, which
 * arrives as an array of one. An empty month still produces its row of zeroes,
 * so an empty array here would mean the query was refused — and it was not,
 * because `error` would have said so first.
 */
function firstRow<T>(rows: T[] | null, name: string): T {
  const row = rows?.[0];
  if (row === undefined) throw new Error(`${name}_returned_no_row`);
  return row;
}

export async function fetchReportTotals(month: MonthKey): Promise<ReportTotals> {
  const { data, error } = await supabase.rpc('report_totals', {
    p_month: monthKeyToDate(month),
  });

  if (error) throw error;
  const row = firstRow(data, 'report_totals');

  return {
    cashFils: row.cash_fils as Fils,
    cliqFils: row.cliq_fils as Fils,
    creditFils: row.credit_fils as Fils,
    revenueFils: row.revenue_fils as Fils,
    courtCostFils: row.court_cost_fils as Fils,
    waterCostFils: row.water_cost_fils as Fils,
    coachFeeFils: row.coach_fee_fils as Fils,
    extrasFils: row.extras_fils as Fils,
    coachFeeAccruedFils: row.coach_fee_accrued_fils as Fils,
    costFils: row.cost_fils as Fils,
    cashCostFils: row.cash_cost_fils as Fils,
    outstandingFils: row.outstanding_fils as Fils,
    profitFils: row.profit_fils as Fils,
    profitIfCollectedFils: row.profit_if_collected_fils as Fils,
    sessionsRun: row.sessions_run,
    sessionsCancelled: row.sessions_cancelled,
    attendeeCount: row.attendee_count,
    capacityTotal: row.capacity_total,
    owedToDateFils: row.owed_to_date_fils as Fils,
  };
}

/**
 * The raw shape of `report_sections`' jsonb document (migration 0040) — one
 * key per wrapped function, snake_case exactly as that function's row shape
 * already was. `report_sections` itself holds no arithmetic; it only calls
 * the seven functions BUILD-SPEC 15.12 names individually and bundles what
 * they already return, so this type is those seven row shapes once more.
 */
interface ReportSectionsRow {
  weeks: {
    week_start: string;
    cash_fils: number;
    cliq_fils: number;
    credit_fils: number;
    total_fils: number;
    session_count: number;
  }[];
  sessions: {
    session_id: string;
    session_date: string;
    starts_at: string;
    ends_at: string;
    venue_id: string;
    venue_name_en: string;
    venue_name_ar: string;
    session_type: 'standard' | 'extended';
    player_count: number;
    capacity: number;
    revenue_fils: number;
    cost_fils: number;
    profit_fils: number;
    outstanding_fils: number;
  }[];
  slots: {
    template_id: string;
    venue_id: string;
    venue_name_en: string;
    venue_name_ar: string;
    weekday: number;
    start_time: string;
    session_type: 'standard' | 'extended';
    sessions_run: number;
    attendee_total: number;
    capacity_total: number;
  }[];
  venues: {
    venue_id: string;
    venue_name_en: string;
    venue_name_ar: string;
    sessions_run: number;
    attendee_total: number;
    capacity_total: number;
  }[];
  subscriptions: {
    sold_count: number;
    sold_value_fils: number;
    credits_used: number;
    credits_expired: number;
  };
  outstanding: {
    player_id: string;
    display_name: string;
    owed_fils: number;
    month_owed_fils: number;
  }[];
  players: {
    active_this_month: number;
    active_previous_month: number;
    new_registrations: number;
  };
}

/**
 * 15.12 sections 1's weekly bars, 4, 5, 6, 7, 8 and 9, in one round trip
 * through `report_sections` instead of seven. See that migration for why: the
 * screen still runs `fetchReportTotals` alone first, as D73's refusal gate.
 */
export async function fetchReportSections(month: MonthKey): Promise<ReportSections> {
  const { data, error } = await supabase.rpc('report_sections', {
    p_month: monthKeyToDate(month),
  });

  if (error) throw error;
  const bundle = data as unknown as ReportSectionsRow;

  return {
    weeks: bundle.weeks.map((row) => ({
      weekStart: row.week_start,
      cashFils: row.cash_fils as Fils,
      cliqFils: row.cliq_fils as Fils,
      creditFils: row.credit_fils as Fils,
      totalFils: row.total_fils as Fils,
      sessionCount: row.session_count,
    })),
    sessions: bundle.sessions.map((row) => ({
      sessionId: row.session_id,
      sessionDate: row.session_date,
      startsAt: parseInstant(row.starts_at),
      endsAt: parseInstant(row.ends_at),
      venueId: row.venue_id,
      venueNameEn: row.venue_name_en,
      venueNameAr: row.venue_name_ar,
      sessionType: row.session_type,
      playerCount: row.player_count,
      capacity: row.capacity,
      revenueFils: row.revenue_fils as Fils,
      costFils: row.cost_fils as Fils,
      profitFils: row.profit_fils as Fils,
      outstandingFils: row.outstanding_fils as Fils,
    })),
    slots: bundle.slots.map((row) => ({
      templateId: row.template_id,
      venueId: row.venue_id,
      venueNameEn: row.venue_name_en,
      venueNameAr: row.venue_name_ar,
      weekday: row.weekday,
      startTime: row.start_time,
      sessionType: row.session_type,
      sessionsRun: row.sessions_run,
      attendeeTotal: row.attendee_total,
      capacityTotal: row.capacity_total,
    })),
    venues: bundle.venues.map((row) => ({
      venueId: row.venue_id,
      venueNameEn: row.venue_name_en,
      venueNameAr: row.venue_name_ar,
      sessionsRun: row.sessions_run,
      attendeeTotal: row.attendee_total,
      capacityTotal: row.capacity_total,
    })),
    subscriptions: {
      soldCount: bundle.subscriptions.sold_count,
      soldValueFils: bundle.subscriptions.sold_value_fils as Fils,
      creditsUsed: bundle.subscriptions.credits_used,
      creditsExpired: bundle.subscriptions.credits_expired,
    },
    outstanding: bundle.outstanding.map((row) => ({
      playerId: row.player_id,
      displayName: row.display_name,
      owedFils: row.owed_fils as Fils,
      monthOwedFils: row.month_owed_fils as Fils,
    })),
    players: {
      activeThisMonth: bundle.players.active_this_month,
      activePreviousMonth: bundle.players.active_previous_month,
      newRegistrations: bundle.players.new_registrations,
    },
  };
}
