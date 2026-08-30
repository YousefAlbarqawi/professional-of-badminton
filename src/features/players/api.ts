/**
 * Profile reads and writes.
 *
 * The column list is deliberately short. RLS lets a player read his whole row,
 * but 14.12 says the profile screen shows neither his tier nor his visibility
 * level nor his balance, so the app never asks for them.
 */
import type { Fils, Locale } from '@/lib/money';
import { supabase } from '@/lib/supabase';

import type { DirectoryPlayer, MyProfile, PlayerFilters } from './types';

const PROFILE_COLUMNS = 'id, first_name, last_name, phone, role, preferred_locale' as const;

export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    fullName: `${data.first_name} ${data.last_name}`.trim(),
    phone: data.phone,
    role: data.role,
    preferredLocale: data.preferred_locale === 'en' ? 'en' : 'ar',
  };
}

/**
 * 16.1: the chosen language lives on the profile as well as on the device, so
 * it follows the player to a new phone.
 */
export async function updatePreferredLocale(userId: string, locale: Locale): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ preferred_locale: locale })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * 15.7's page size. `search_players` (migration 0031, and its cursor in
 * 0041) caps at 500; this is the page `usePlayerDirectory` walks in, one
 * `onEndReached` at a time.
 */
export const PLAYER_PAGE_SIZE = 40;

/** One page of 15.7's list, and the cursor `fetchPlayerPage` needs for the next one. */
export interface PlayerDirectoryPage {
  players: DirectoryPlayer[];
  /** `null` once the last row has been seen. Literally the previous page's last row. */
  nextCursor: DirectoryPlayer | null;
}

/**
 * 15.7's list, through the staff-only `search_players` RPC (migration 0031).
 *
 * The filters go to the server rather than being applied here because two of
 * them — "has an active subscription" and "owes money" — are facts about sums
 * over other tables, and the sort by credits or by amount owed needs the same
 * sums. Filtering on the phone would mean fetching every player to hide most
 * of them.
 *
 * `cursor` is the previous page's last row, or `null` for the first page.
 * `search_players`' `p_after_*` arguments only read the one field its own
 * `p_sort` actually sorts by, so sending all four unconditionally is simpler
 * than the caller having to know which one that is.
 *
 * One row past `PLAYER_PAGE_SIZE` is asked for so `nextCursor` can be `null`
 * exactly when the caller has genuinely seen every row — without it, a month
 * that ends precisely on a page boundary could not be told apart from one
 * that keeps going.
 */
export async function fetchPlayerPage(
  filters: PlayerFilters,
  cursor: DirectoryPlayer | null,
): Promise<PlayerDirectoryPage> {
  // Each optional argument is omitted rather than sent as undefined, because a
  // filter that is not set and a filter set to `false` are different questions:
  // "everybody" against "the people who owe nothing". The RPC defaults its
  // parameters to NULL and reads NULL as "do not filter".
  const { data, error } = await supabase.rpc('search_players', {
    p_query: filters.query.trim(),
    p_sort: filters.sort,
    p_limit: PLAYER_PAGE_SIZE + 1,
    ...(filters.tier === null ? {} : { p_tier: filters.tier }),
    ...(filters.visibility === null ? {} : { p_visibility: filters.visibility }),
    ...(filters.hasSubscription === null ? {} : { p_has_subscription: filters.hasSubscription }),
    ...(filters.owesMoney === null ? {} : { p_owes_money: filters.owesMoney }),
    ...(cursor === null
      ? {}
      : {
          // An unrated player's tier is genuinely null, and the RPC's
          // `p_after_tier` defaults to NULL — so omitting the argument and
          // sending NULL are the same call. Omitted, because the generated
          // types do not carry `| null` on a defaulted parameter and this
          // codebase does not silence that with a cast.
          ...(cursor.tier === null ? {} : { p_after_tier: cursor.tier }),
          p_after_owed: cursor.owedFils,
          p_after_name: cursor.fullName,
          p_after_id: cursor.id,
        }),
  });

  if (error) throw error;

  const rows = data.map((row) => ({
    id: row.player_id,
    fullName: row.display_name,
    tier: row.tier,
    visibility: row.visibility,
    credits: row.credits,
    creditExpires: row.credit_expires,
    owedFils: row.owed_fils as Fils,
  }));

  const hasMore = rows.length > PLAYER_PAGE_SIZE;
  const players = hasMore ? rows.slice(0, PLAYER_PAGE_SIZE) : rows;

  return { players, nextCursor: hasMore ? (players.at(-1) ?? null) : null };
}
