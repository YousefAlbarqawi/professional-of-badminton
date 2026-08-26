/**
 * Player domain types.
 */
import type { Fils, Locale } from '@/lib/money';
import type { Tier } from '@/lib/tiers';
import type { Role } from '@/features/auth/types';
import type { Database } from '@/types/database';

export type VisibilityLevel = Database['public']['Enums']['visibility_level'];

/**
 * The player's own profile, as 14.12 renders it.
 *
 * Tier, visibility level, balance and the custom rates are absent by design.
 * 14.12: "The profile does not show the player's tier, his visibility level, or
 * his balance", and D19 says he never sees a tier below visibility level 1.
 * They are left out of the query rather than out of the JSX, so a future screen
 * cannot show one by accident.
 */
export interface MyProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  role: Role;
  preferredLocale: Locale;
}

/**
 * One row of 15.7's player list: "name, tier badge, visibility level chip,
 * credits remaining, and amount owed when non-zero".
 *
 * This is a staff type. It carries three things the player himself is never
 * shown — his tier (D19), his visibility level (14.12), and what he owes (A4)
 * — and it exists only behind `search_players`, which refuses a non-staff
 * caller outright rather than returning a thinner row.
 */
export interface DirectoryPlayer {
  id: string;
  fullName: string;
  tier: Tier | null;
  visibility: VisibilityLevel;
  /** D56: the sum of the ledger across his live subscriptions. Never a column. */
  credits: number;
  /** 11.4's nearest expiry, so the row warns about the credit he will spend. */
  creditExpires: string | null;
  owedFils: Fils;
}

/** 15.7: "Sortable by name, tier, or amount owed." */
export type PlayerSort = 'name' | 'tier' | 'owed';

/**
 * 15.7's four filters. Each is tri-state on purpose: `null` is "do not filter",
 * which is not the same as `false`. "Owes money: no" is a filter the coach may
 * want; "owes money: unset" is the default list.
 */
export interface PlayerFilters {
  query: string;
  tier: Tier | null;
  visibility: VisibilityLevel | null;
  hasSubscription: boolean | null;
  owesMoney: boolean | null;
  sort: PlayerSort;
}

export const DEFAULT_PLAYER_FILTERS: PlayerFilters = {
  query: '',
  tier: null,
  visibility: null,
  hasSubscription: null,
  owesMoney: null,
  sort: 'name',
};
