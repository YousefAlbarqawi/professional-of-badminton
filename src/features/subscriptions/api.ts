/**
 * Subscription and credit reads and writes.
 * BUILD-SPEC section 11, 14.13, 15.8 section 5, 15.9, 15.10.
 *
 * ── Reads go to the tables; writes go to RPCs ─────────────
 * Reading is a policy question and RLS answers it: a player selects his own
 * subscriptions and his own ledger, staff select anybody's (7.3's table). So
 * the reads below are plain selects and the same function serves both sides of
 * the app, which is what makes the coach's view of a balance and the player's
 * view of it provably the same number.
 *
 * Writing is not a policy question. A grant is a subscription and its opening
 * ledger row and both must land together; an extension has a rule about the
 * calendar; an adjustment has a rule about the note. Each is an RPC in
 * migration 0029, gated on the caller's role inside the function.
 *
 * ── The balance is never selected ─────────────────────────
 * There is no `remaining` column to ask for, because 6.2 and D56 forbid one.
 * The ledger comes back with the subscription and `creditLedger.ts` sums it.
 * `v_player_credit_balance` does the same sum in SQL and is used only where a
 * single number is wanted without its history (the booking sheet, 14.8).
 */
import { supabase } from '@/lib/supabase';
import type { Fils } from '@/lib/money';

import type {
  AdjustCreditsInput,
  CreditSummary,
  CreditTransaction,
  ExtendSubscriptionInput,
  GrantSubscriptionInput,
  Package,
  Subscription,
} from './types';

/**
 * The player's usable credit, as 14.8 shows it.
 *
 * "Usable" is `pick_subscription`'s definition and has to stay that way, or
 * the sheet will offer a credit the server then refuses: not voided, not
 * expired, and a positive balance. The expiry reported is the nearest one,
 * because that is the subscription the booking would be taken from (11.4).
 */
export async function fetchMyCredits(playerId: string, today: string): Promise<CreditSummary> {
  const { data, error } = await supabase
    .from('v_player_credit_balance')
    .select('subscription_id, expires_on, remaining')
    .eq('player_id', playerId)
    .gte('expires_on', today)
    .order('expires_on', { ascending: true });

  if (error) throw error;

  const live = data.filter((row) => Number(row.remaining ?? 0) > 0);
  const total = live.reduce((sum, row) => sum + Number(row.remaining ?? 0), 0);

  return {
    total,
    nextExpiry: live[0]?.expires_on ?? null,
    hasUsableCredit: live.length > 0,
  };
}

const SUBSCRIPTION_COLUMNS = `
  id, player_id, granted_visits, per_visit_fils, starts_on, expires_on,
  is_voided, note, created_at,
  packages ( name_en, name_ar ),
  credit_transactions ( id, subscription_id, delta, reason, note, booking_id, created_at )
` as const;

/**
 * Every subscription a player holds, live and expired, each with its ledger.
 * 14.13 for the player, 15.8 section 5 for the coach — the same query, because
 * RLS is what differs between them and not the shape of the answer.
 *
 * One request rather than three: the nested selects are a single PostgREST
 * embed, so a player with four subscriptions and sixty movements is one round
 * trip on a phone in a gym.
 */
export async function fetchPlayerSubscriptions(playerId: string): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('player_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('player_id', playerId)
    .order('expires_on', { ascending: false })
    .order('created_at', { referencedTable: 'credit_transactions', ascending: true });

  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    packageNameEn: row.packages?.name_en ?? '',
    packageNameAr: row.packages?.name_ar ?? '',
    grantedVisits: row.granted_visits,
    perVisitFils: row.per_visit_fils as Fils,
    startsOn: row.starts_on,
    expiresOn: row.expires_on,
    isVoided: row.is_voided,
    note: row.note,
    createdAt: row.created_at,
    transactions: (row.credit_transactions ?? []).map((txn): CreditTransaction => ({
      id: txn.id,
      subscriptionId: txn.subscription_id,
      delta: txn.delta,
      reason: txn.reason,
      note: txn.note,
      bookingId: txn.booking_id,
      createdAt: txn.created_at,
    })),
  }));
}

/**
 * D48's five, for 15.9's picker. Ordered as the coach thinks of them, smallest
 * first, which is `display_order` in the seed.
 *
 * `per_visit_fils` comes back so the picker can show the per-visit rate 15.9
 * asks for. It is also the figure that gets snapshotted onto the subscription
 * — 11.1 — so what the coach sees before granting is what the grant records.
 */
export async function fetchPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select(
      'id, name_en, name_ar, visit_count, price_fils, duration_months, per_visit_fils, display_order',
    )
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    visitCount: row.visit_count,
    priceFils: row.price_fils as Fils,
    durationMonths: row.duration_months,
    perVisitFils: (row.per_visit_fils ?? 0) as Fils,
    displayOrder: row.display_order,
  }));
}

/** 15.9. Returns the new subscription's id. */
export async function grantSubscription(input: GrantSubscriptionInput): Promise<string> {
  const { data, error } = await supabase.rpc('grant_subscription', {
    p_player_id: input.playerId,
    p_package_id: input.packageId,
    p_starts_on: input.startsOn,
    p_expires_on: input.expiresOn,
    p_granted_visits: input.grantedVisits,
    // 11.2 step 5 makes the note optional. The parameter defaults to NULL, so
    // an absent note is an omitted argument rather than an explicit undefined.
    ...(input.note === null ? {} : { p_note: input.note }),
  });

  if (error) throw error;
  return data;
}

/** 11.5 and D55. Coach only, and refused once the subscription has expired. */
export async function extendSubscription(input: ExtendSubscriptionInput): Promise<void> {
  const { error } = await supabase.rpc('extend_subscription', {
    p_subscription_id: input.subscriptionId,
    p_expires_on: input.expiresOn,
  });

  if (error) throw error;
}

/** 15.10 and 11.3's migration flow. The note is not optional. */
export async function adjustCredits(input: AdjustCreditsInput): Promise<void> {
  const { error } = await supabase.rpc('adjust_credits', {
    p_subscription_id: input.subscriptionId,
    p_delta: input.delta,
    p_note: input.note,
  });

  if (error) throw error;
}
