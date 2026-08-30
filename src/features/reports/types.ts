/**
 * Report shapes. BUILD-SPEC 15.12, valued per 12.1, 12.2 and 12.3.
 *
 * Every money field is `Fils`. Every count is a plain integer. Nothing here
 * carries a percentage or an average: those are divisions the client does in
 * `aggregate.ts`, from two integers, so that two sections of the same report
 * cannot disagree about what "fill" means.
 */
import type { Fils } from '@/lib/money';

/** A calendar month in Amman, `yyyy-MM`. What the picker holds. */
export type MonthKey = string;

/** 15.12 sections 1, 2, 3 and the two totals of section 8. */
export interface ReportTotals {
  cashFils: Fils;
  cliqFils: Fils;
  /** Valued at each subscription's per-visit rate, never the session price. 12.2 rule 1. */
  creditFils: Fils;
  revenueFils: Fils;
  courtCostFils: Fils;
  waterCostFils: Fils;
  coachFeeFils: Fils;
  /**
   * Snacks, shuttlecocks and extra court time, summed over the month.
   * Migration 0043: these have no rate table to be derived from, so they are
   * reported as their own part of the cost rather than folded into one of the
   * three that do.
   */
  extrasFils: Fils;
  /** The part of the coach fee still owed. 12.3's accrued marker. */
  coachFeeAccruedFils: Fils;
  costFils: Fils;
  /** Cost minus what is accrued: what actually left the coach's pocket. */
  cashCostFils: Fils;
  /** Money expected and not received. Never revenue. 12.2 rule 3. */
  outstandingFils: Fils;
  profitFils: Fils;
  profitIfCollectedFils: Fils;
  sessionsRun: number;
  sessionsCancelled: number;
  attendeeCount: number;
  capacityTotal: number;
  /** The debt book as it stands today, not this month's slice of it. */
  owedToDateFils: Fils;
}

/** One bar of 15.12 section 1. Weeks start on Sunday. */
export interface RevenueWeek {
  /** `yyyy-MM-dd` of the week's Sunday, which may fall in the previous month. */
  weekStart: string;
  cashFils: Fils;
  cliqFils: Fils;
  creditFils: Fils;
  totalFils: Fils;
  sessionCount: number;
}

/** One row of 15.12 section 4. */
export interface ReportSession {
  sessionId: string;
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  venueId: string;
  venueNameEn: string;
  venueNameAr: string;
  sessionType: 'standard' | 'extended';
  playerCount: number;
  capacity: number;
  revenueFils: Fils;
  costFils: Fils;
  profitFils: Fils;
  outstandingFils: Fils;
}

/** One recurring slot of 15.12 section 5. */
export interface SlotAttendance {
  templateId: string;
  venueId: string;
  venueNameEn: string;
  venueNameAr: string;
  /** 0 = Sunday, matching Postgres EXTRACT(DOW). 6.2. */
  weekday: number;
  startTime: string;
  sessionType: 'standard' | 'extended';
  sessionsRun: number;
  attendeeTotal: number;
  capacityTotal: number;
}

/** One venue of 15.12 section 6. */
export interface VenueFill {
  venueId: string;
  venueNameEn: string;
  venueNameAr: string;
  sessionsRun: number;
  attendeeTotal: number;
  capacityTotal: number;
}

/** 15.12 section 7. */
export interface SubscriptionReport {
  soldCount: number;
  soldValueFils: Fils;
  creditsUsed: number;
  creditsExpired: number;
}

/** One of the ten names in 15.12 section 8. */
export interface Debtor {
  playerId: string;
  displayName: string;
  owedFils: Fils;
  monthOwedFils: Fils;
}

/** 15.12 section 9. */
export interface PlayerCounts {
  activeThisMonth: number;
  activePreviousMonth: number;
  newRegistrations: number;
}

/** The sortable columns of 15.12 section 4's table. */
export type SessionSortKey = 'date' | 'players' | 'revenue' | 'cost' | 'profit';

/**
 * The seven sections gated behind `report_totals`, fetched together through
 * `report_sections` (migration 0040) instead of seven separate round trips.
 */
export interface ReportSections {
  weeks: RevenueWeek[];
  sessions: ReportSession[];
  slots: SlotAttendance[];
  venues: VenueFill[];
  subscriptions: SubscriptionReport;
  outstanding: Debtor[];
  players: PlayerCounts;
}
