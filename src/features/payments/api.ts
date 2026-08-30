/**
 * Payment, review and balance reads and writes. BUILD-SPEC 10.1, 10.2, 10.3.
 *
 * Every screen goes through a hook in queries.ts or mutations.ts, never
 * through this file directly. CLAUDE.md.
 *
 * Staff select from `bookings`, `payment_proofs` and `balance_entries`
 * directly, which RLS permits them and nobody else (7.3). Every *write* is an
 * RPC, because each one enforces something a client must not be trusted with:
 * 8.5's four outcomes and the rewrite-not-duplicate rule, the two review
 * transitions, and D39's lock. The one exception is a manual balance entry
 * (10.3), which is a staff insert into a staff-only table with `created_by`
 * defaulted to `auth.uid()` in the database, so there is nothing left for a
 * function to enforce.
 */
import { supabase } from '@/lib/supabase';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant, formatSessionDate } from '@/lib/time';
import { isTier, type Tier } from '@/lib/tiers';

import { proofStoragePath, uploadProof } from './cliqUpload';
import type {
  BalanceEntry,
  MoneySummary,
  PlayerBalance,
  PlayerIdentity,
  PlayerRecentSession,
  PreparedProof,
  RecordPaymentInput,
  ReviewRow,
  SessionMoneyGlance,
  TierChangeEntry,
} from './types';

function toTier(value: string | null | undefined): Tier | null {
  return value != null && isTier(value) ? value : null;
}

// ── The CliQ booking path ────────────────────────────────

export interface CliqBookingInput {
  sessionId: string;
  proof: PreparedProof;
}

/**
 * 10.1 steps 5, 6 and 7, in the order 10.1 gives them.
 *
 * The id comes first and from the server, because the file is named after the
 * booking and the booking does not exist yet — see migration 0025 for why the
 * uuid is minted there rather than on the phone.
 *
 * If the upload throws, this throws, and no booking is created. That is 10.1's
 * rule, and it is also enforced underneath by a deferred constraint trigger,
 * so it holds even if this function is bypassed entirely.
 */
export async function createCliqBooking(input: CliqBookingInput): Promise<string> {
  // The user id comes from the auth client rather than from a prop, because
  // the path has to match `auth.uid()` on two separate checks — the storage
  // policy's folder test (migration 0013) and create_cliq_booking's whole-path
  // test (migration 0025) — and this is the same value both of them will see.
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (userId === undefined) throw new Error('not_authenticated');

  const { data: bookingId, error: prepareError } = await supabase.rpc('prepare_cliq_booking', {
    p_session_id: input.sessionId,
  });

  if (prepareError) throw prepareError;

  const storagePath = proofStoragePath(userId, bookingId);
  await uploadProof(storagePath, input.proof);

  const { data, error } = await supabase.rpc('create_cliq_booking', {
    p_session_id: input.sessionId,
    p_booking_id: bookingId,
    p_storage_path: storagePath,
    p_file_size_bytes: input.proof.bytes,
    p_mime_type: input.proof.mimeType,
  });

  if (error) throw error;
  return data;
}

// ── The review screen ────────────────────────────────────

interface ReviewRowRecord {
  id: string;
  attendee_kind: ReviewRow['kind'];
  player_id: string | null;
  guest_name: string | null;
  guest_tier: string | null;
  tier_snapshot: string | null;
  payment_method: ReviewRow['paymentMethod'];
  payment_status: ReviewRow['paymentStatus'];
  expected_fils: number;
  paid_fils: number;
  is_coach_slot: boolean;
  status: string;
  note: string | null;
  booked_at: string;
  profiles: { first_name: string; last_name: string; tier: string | null } | null;
  payment_proofs: { storage_path: string }[];
}

/**
 * Every row 10.2 renders, in booking order.
 *
 * Cancelled rows are excluded: 9.3 says the app never creates a balance entry
 * from a cancellation, so a removed player is not somebody the coach still has
 * to make a decision about.
 */
export async function fetchSessionReview(sessionId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, attendee_kind, player_id, guest_name, guest_tier, tier_snapshot,
       payment_method, payment_status, expected_fils, paid_fils, is_coach_slot,
       status, note, booked_at,
       profiles!bookings_player_id_fkey ( first_name, last_name, tier ),
       payment_proofs ( storage_path )`,
    )
    .eq('session_id', sessionId)
    .in('status', ['confirmed', 'settled'])
    .order('booked_at', { ascending: true });

  if (error) throw error;

  return (data as unknown as ReviewRowRecord[]).map((row) => ({
    bookingId: row.id,
    kind: row.attendee_kind,
    displayName:
      row.profiles === null
        ? (row.guest_name ?? '')
        : `${row.profiles.first_name} ${row.profiles.last_name}`.trim(),
    tier: toTier(row.tier_snapshot) ?? toTier(row.guest_tier) ?? toTier(row.profiles?.tier),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    expectedFils: row.expected_fils as Fils,
    paidFils: row.paid_fils as Fils,
    playerId: row.player_id,
    isCoachSlot: row.is_coach_slot,
    // A13 purges the image after 365 days and the row with it, so an old CliQ
    // booking legitimately has no proof to view.
    proofPath: row.payment_proofs[0]?.storage_path ?? null,
    isSettled: row.status === 'settled',
    note: row.note,
  }));
}

/** 10.2's footer. Staff only, and the server says so. */
export async function fetchMoneySummary(sessionId: string): Promise<MoneySummary> {
  const { data, error } = await supabase.rpc('get_session_money_summary', {
    p_session_id: sessionId,
  });

  if (error) throw error;

  const row = data[0];
  if (row === undefined) throw new Error('session_not_found');

  return {
    expectedFils: row.expected_fils as Fils,
    collectedFils: row.collected_fils as Fils,
    creditRevenueFils: row.credit_revenue_fils as Fils,
    outstandingFils: row.outstanding_fils as Fils,
    costFils: row.cost_fils as Fils,
    profitFils: row.profit_fils as Fils,
    profitIfCollectedFils: row.profit_if_collected_fils as Fils,
    attendeeCount: row.attendee_count,
    unsettledCount: row.unsettled_count,
  };
}

/**
 * 15.1's card footer, for every session in the list at once. Returns a map so
 * the caller can look a session up without a second pass, the same shape
 * `fetchOccupancy` (features/sessions/api.ts) already uses for the same
 * reason — a session outside the batch simply has no entry, and the client is
 * the one deciding which sessions in the batch have even started their
 * review window (15.1: "once the session is past").
 */
export async function fetchSessionsMoneySummary(
  sessionIds: readonly string[],
): Promise<Map<string, SessionMoneyGlance>> {
  const glances = new Map<string, SessionMoneyGlance>();
  if (sessionIds.length === 0) return glances;

  const { data, error } = await supabase.rpc('get_sessions_money_summary', {
    p_session_ids: [...sessionIds],
  });

  if (error) throw error;

  for (const row of data) {
    glances.set(row.session_id, {
      collectedFils: row.collected_fils as Fils,
      outstandingFils: row.outstanding_fils as Fils,
    });
  }

  return glances;
}

/**
 * A short-lived URL for one proof. 10.2's *View proof*.
 *
 * The bucket is private and only staff may read it (7.3), so the image cannot
 * be an `<Image src>` pointing at a public path. A signed URL is the sanctioned
 * way to hand one to a renderer, and a five minute life is long enough to look
 * at a screenshot and short enough that a URL copied out of a log is useless.
 */
export async function fetchProofUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(storagePath, 300);

  if (error) throw error;
  return data.signedUrl;
}

/** 8.5. */
export async function recordPayment(input: RecordPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_booking_id: input.bookingId,
    p_paid_fils: input.paidFils,
    // exactOptionalPropertyTypes: omitting the key is how the function's own
    // DEFAULT NULL — "leave the method as it is" — is asked for.
    ...(input.method === null ? {} : { p_method: input.method }),
    ...(input.note === null ? {} : { p_note: input.note }),
  });

  if (error) throw error;
}

export async function confirmSessionReview(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_session_review', { p_session_id: sessionId });
  if (error) throw error;
}

export async function reopenSessionReview(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_session_review', { p_session_id: sessionId });
  if (error) throw error;
}

// ── Balances, 10.3 and 15.8 section 6 ────────────────────

interface BalanceEntryRecord {
  id: string;
  amount_fils: number;
  note: string | null;
  created_at: string;
  session_id: string | null;
  session_instances: {
    session_date: string;
    starts_at: string;
    venues: { name_en: string; name_ar: string };
  } | null;
}

/**
 * "Total owed, and every entry with date, session, amount, and note." 10.3.
 *
 * The total is summed from the entries rather than read from
 * `v_player_total_balance`, so the number and the list can never disagree on
 * screen. The view exists for the reports in phase 9, which aggregate across
 * players and never render the entries.
 */
export async function fetchPlayerBalance(playerId: string, locale: Locale): Promise<PlayerBalance> {
  const { data, error } = await supabase
    .from('balance_entries')
    .select(
      `id, amount_fils, note, created_at, session_id,
       session_instances ( session_date, starts_at, venues ( name_en, name_ar ) )`,
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data as unknown as BalanceEntryRecord[];

  const entries: BalanceEntry[] = rows.map((row) => ({
    id: row.id,
    amountFils: row.amount_fils as Fils,
    note: row.note,
    createdAt: parseInstant(row.created_at),
    sessionId: row.session_id,
    sessionLabel:
      row.session_instances === null
        ? null
        : `${
            locale === 'ar'
              ? row.session_instances.venues.name_ar
              : row.session_instances.venues.name_en
          } · ${formatSessionDate(parseInstant(row.session_instances.starts_at), locale)}`,
  }));

  return {
    totalOwedFils: entries.reduce((sum, entry) => sum + entry.amountFils, 0) as Fils,
    entries,
  };
}

const RECENT_SESSIONS_LIMIT = 20;

interface PlayerRecentSessionRecord {
  id: string;
  payment_method: PlayerRecentSession['paymentMethod'];
  payment_status: PlayerRecentSession['paymentStatus'];
  expected_fils: number;
  paid_fils: number;
  session_instances: {
    id: string;
    starts_at: string;
    venues: { name_en: string; name_ar: string };
  } | null;
}

/**
 * 15.8 section 7: "Last 20 bookings with payment outcomes."
 *
 * A plain select rather than an RPC, the same as `fetchPlayerBalance` just
 * above: `bookings_staff_all` (migration 0012) is the boundary, and there is
 * nothing here for a function to enforce. A guest or a coach slot never has a
 * `player_id`, so filtering on it already excludes both without a kind check.
 */
export async function fetchPlayerRecentSessions(
  playerId: string,
  locale: Locale,
): Promise<PlayerRecentSession[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, payment_method, payment_status, expected_fils, paid_fils,
       session_instances ( id, starts_at, venues ( name_en, name_ar ) )`,
    )
    .eq('player_id', playerId)
    .in('status', ['confirmed', 'settled'])
    .order('booked_at', { ascending: false })
    .limit(RECENT_SESSIONS_LIMIT);

  if (error) throw error;

  const rows = data as unknown as PlayerRecentSessionRecord[];

  // A booking's session is never null in practice — every row is created
  // against a real session_instances id — but the embed is nullable typing,
  // and a row that somehow lost its session is one worth dropping rather than
  // crashing the screen over.
  return rows
    .filter((row) => row.session_instances !== null)
    .map((row) => ({
      bookingId: row.id,
      sessionId: row.session_instances?.id ?? '',
      venue:
        locale === 'ar'
          ? (row.session_instances?.venues.name_ar ?? '')
          : (row.session_instances?.venues.name_en ?? ''),
      startsAt: parseInstant(row.session_instances?.starts_at ?? ''),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      expectedFils: row.expected_fils as Fils,
      paidFils: row.paid_fils as Fils,
    }));
}

export interface ManualBalanceInput {
  playerId: string;
  /** Positive adds debt, negative records a settlement. 10.3. */
  amountFils: Fils;
  note: string;
}

/** 10.3: "He can add a manual entry (positive to add debt, negative to record a settlement)". */
export async function addBalanceEntry(input: ManualBalanceInput): Promise<void> {
  // created_by is defaulted to auth.uid() in the database (migration 0026), so
  // one admin cannot file an entry under another's name.
  const { error } = await supabase
    .from('balance_entries')
    .insert({ player_id: input.playerId, amount_fils: input.amountFils, note: input.note });

  if (error) throw error;
}

/** 10.3: "and delete any entry". */
export async function deleteBalanceEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('balance_entries').delete().eq('id', entryId);
  if (error) throw error;
}

/** 15.8 section 1, the header the balance section sits under. */
export async function fetchPlayerIdentity(playerId: string): Promise<PlayerIdentity> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `id, first_name, last_name, phone, tier, created_at,
       visibility, custom_rate_standard_fils, custom_rate_extended_fils, role`,
    )
    .eq('id', playerId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    fullName: `${data.first_name} ${data.last_name}`.trim(),
    // profiles carries no email column; 15.8's email comes from auth, which is
    // not readable from the client. Phase 6 builds the rest of this screen and
    // can add a staff-only RPC for it if the coach turns out to want it.
    email: null,
    phone: data.phone,
    tier: toTier(data.tier),
    joinedAt: parseInstant(data.created_at),
    visibility: data.visibility,
    customRateStandardFils:
      data.custom_rate_standard_fils === null ? null : (data.custom_rate_standard_fils as Fils),
    customRateExtendedFils:
      data.custom_rate_extended_fils === null ? null : (data.custom_rate_extended_fils as Fils),
    role: data.role,
  };
}

interface TierAuditRecord {
  id: number;
  before: { tier?: string | null } | null;
  after: { tier?: string | null } | null;
  created_at: string;
  actor: { first_name: string; last_name: string } | null;
}

// Raw rows fetched before the tier-only filter below, capped generously since
// `trg_audit_profiles` also fires for role, visibility and rate writes on the
// same profile row and every one of those lands in this same result set.
const TIER_HISTORY_FETCH_LIMIT = 100;

/**
 * 15.8 section 2: "the change history." `audit_log` is coach-only (7.3,
 * D73's "an admin can do everything the coach can do except see the books"),
 * so RLS's `audit_log_select_coach` is what actually keeps this from an admin
 * rather than anything checked here — the same shape as `Extend` and section
 * 8's role toggle, both hidden from an admin on this same screen.
 *
 * `trg_audit_profiles` (migration 0011) fires on role, visibility, tier and
 * custom-rate writes alike and writes one row per UPDATE covering whichever
 * of those changed, so a plain select the same shape as
 * `fetchPlayerRecentSessions` is filtered down here to the rows where `tier`
 * itself moved — there is no PostgREST filter that compares two jsonb columns
 * against each other, so this is a client-side narrowing of a capped fetch
 * rather than a query the server can express.
 */
export async function fetchPlayerTierHistory(playerId: string): Promise<TierChangeEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, before, after, created_at, actor:profiles!audit_log_actor_id_fkey(first_name, last_name)')
    .eq('entity', 'profiles')
    .eq('entity_id', playerId)
    .eq('action', 'UPDATE')
    .order('created_at', { ascending: false })
    .limit(TIER_HISTORY_FETCH_LIMIT);

  if (error) throw error;

  const rows = data as unknown as TierAuditRecord[];

  return rows
    .filter((row) => (row.before?.tier ?? null) !== (row.after?.tier ?? null))
    .map((row) => ({
      id: String(row.id),
      fromTier: toTier(row.before?.tier),
      toTier: toTier(row.after?.tier),
      actorName: row.actor === null ? null : `${row.actor.first_name} ${row.actor.last_name}`.trim(),
      createdAt: parseInstant(row.created_at),
    }));
}

// ── 15.8 sections 2, 3, 4 and 8: guarded profile columns ────
// Staff already has `UPDATE` on `profiles` (migration 0012's
// profiles_update_staff), and 0009's trg_guard_profile is what actually
// enforces who may touch these five columns and who may promote to coach —
// RLS is the boundary, not an RPC, per CLAUDE.md.

export async function setPlayerTier(playerId: string, tier: Tier | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ tier }).eq('id', playerId);
  if (error) throw error;
}

export async function setPlayerVisibility(
  playerId: string,
  visibility: PlayerIdentity['visibility'],
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ visibility }).eq('id', playerId);
  if (error) throw error;
}

export interface SetPlayerRateInput {
  playerId: string;
  /** Null resets to the session's list price — 15.8's "Default". D41. */
  standardFils: Fils | null;
  extendedFils: Fils | null;
}

export async function setPlayerRate(input: SetPlayerRateInput): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      custom_rate_standard_fils: input.standardFils,
      custom_rate_extended_fils: input.extendedFils,
    })
    .eq('id', input.playerId);
  if (error) throw error;
}

/** D16: promoting to coach is refused server-side unless the caller already is one. */
export async function setPlayerRole(
  playerId: string,
  role: PlayerIdentity['role'],
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', playerId);
  if (error) throw error;
}
