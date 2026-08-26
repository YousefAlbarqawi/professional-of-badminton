/**
 * Lineup reads and writes. D68: coach and admin only, and D18 keeps players
 * out of these tables regardless of what this file asks for.
 *
 * The reads go straight at the tables, because 0012 gives staff `FOR ALL` on
 * all four and a lineup is a plain join. Every write is an RPC from migration
 * 0033: each one touches several tables at once, and half a lineup on the
 * screen the coach reads aloud from is worse than none.
 */
import { supabase } from '@/lib/supabase';
import { parseInstant } from '@/lib/time';

import type {
  CourtLockInput,
  PairingRuleSummary,
  SetPairingRuleInput,
  StoredLineup,
  StoredRotation,
  SwapPlayersInput,
} from './boardTypes';
import type { Court, Lineup, PairingRuleKind, RotationRule } from './types';

interface AssignmentRow {
  court_number: number;
  booking_id: string;
  team: number;
}

interface RotationRow {
  id: string;
  rotation_index: number;
  rule: RotationRule;
  generated_at: string;
  court_assignments: AssignmentRow[];
  rotation_sitouts: { booking_id: string }[];
}

function toCourts(assignments: readonly AssignmentRow[]): Court[] {
  const byCourt = new Map<number, { team1: string[]; team2: string[] }>();
  for (const row of assignments) {
    const court = byCourt.get(row.court_number) ?? { team1: [], team2: [] };
    if (row.team === 1) court.team1.push(row.booking_id);
    else court.team2.push(row.booking_id);
    byCourt.set(row.court_number, court);
  }

  // 13.10 reads court 1 first, and 16.2 keeps that true in Arabic as well:
  // the board maps to the physical hall, so it never mirrors.
  return [...byCourt.entries()]
    .sort(([a], [b]) => a - b)
    .map(([courtNumber, teams]) => ({ courtNumber, ...teams }));
}

/**
 * The whole board for one session, or null when no lineup has been generated
 * yet — which is what the coach sees the first time he opens the tab, and
 * again after `mark_lineup_stale` has discarded one (0020, 13.8).
 */
export async function fetchLineup(sessionId: string): Promise<StoredLineup | null> {
  const [rotations, locked, session, changes] = await Promise.all([
    supabase
      .from('rotations')
      .select(
        `id, rotation_index, rule, generated_at,
         court_assignments ( court_number, booking_id, team ),
         rotation_sitouts ( booking_id )`,
      )
      .eq('session_id', sessionId)
      .order('rotation_index', { ascending: true }),
    supabase.from('locked_courts').select('court_number, booking_ids').eq('session_id', sessionId),
    supabase.from('session_instances').select('has_manual_lineup').eq('id', sessionId).single(),
    supabase.rpc('count_lineup_changes', { p_session_id: sessionId }),
  ]);

  if (rotations.error) throw rotations.error;
  if (locked.error) throw locked.error;
  if (session.error) throw session.error;
  if (changes.error) throw changes.error;

  const rows = (rotations.data ?? []) as unknown as RotationRow[];
  if (rows.length === 0) return null;

  const stored: StoredRotation[] = rows.map((row) => ({
    id: row.id,
    index: row.rotation_index,
    rule: row.rule,
    courts: toCourts(row.court_assignments),
    sitOuts: row.rotation_sitouts.map((sitOut) => sitOut.booking_id),
    generatedAt: parseInstant(row.generated_at),
  }));

  return {
    rotations: stored,
    lockedCourts: (locked.data ?? [])
      .map((row) => ({ courtNumber: row.court_number, bookingIds: row.booking_ids }))
      .sort((a, b) => a.courtNumber - b.courtNumber),
    hasManualLineup: session.data.has_manual_lineup,
    changesSinceGenerated: changes.data ?? 0,
  };
}

/**
 * The engine's output, in the shape `save_lineup` parses. Snake case here and
 * camel case everywhere else, because this is the wire.
 */
export async function saveLineup(sessionId: string, lineup: Lineup): Promise<void> {
  const payload = lineup.rotations.map((rotation) => ({
    index: rotation.index,
    rule: rotation.rule,
    courts: rotation.courts.map((court) => ({
      court_number: court.courtNumber,
      team1: [...court.team1],
      team2: [...court.team2],
    })),
    sit_outs: [...rotation.sitOuts],
  }));

  const { error } = await supabase.rpc('save_lineup', {
    p_session_id: sessionId,
    p_lineup: payload,
  });
  if (error) throw error;
}

/** 13.9. One swap, written immediately. There is no save button. */
export async function swapLineupPlayers(input: SwapPlayersInput): Promise<void> {
  const { error } = await supabase.rpc('swap_lineup_players', {
    p_rotation_id: input.rotationId,
    p_booking_a: input.bookingIdA,
    p_booking_b: input.bookingIdB,
  });
  if (error) throw error;
}

/** 13.9's long press, both ways. */
export async function setCourtLock(input: CourtLockInput): Promise<void> {
  const { error } = input.isLocked
    ? await supabase.rpc('lock_court', {
        p_rotation_id: input.rotationId,
        p_court_number: input.courtNumber,
      })
    : await supabase.rpc('unlock_court', {
        p_session_id: input.sessionId,
        p_court_number: input.courtNumber,
      });
  if (error) throw error;
}

interface PairingRuleRow {
  id: string;
  kind: PairingRuleKind;
  player_a_id: string;
  player_b_id: string;
  player_a: { first_name: string; last_name: string } | null;
  player_b: { first_name: string; last_name: string } | null;
}

function fullName(profile: { first_name: string; last_name: string } | null): string {
  if (profile === null) return '';
  return `${profile.first_name} ${profile.last_name}`.trim();
}

/**
 * Every pairing rule the coach has ever made. D65 puts them on the players,
 * not on a session, so this is not scoped to one; the board filters down to
 * the rules whose players are both attending.
 */
export async function fetchPairingRules(): Promise<PairingRuleSummary[]> {
  const { data, error } = await supabase
    .from('pairing_rules')
    .select(
      `id, kind, player_a_id, player_b_id,
       player_a:profiles!pairing_rules_player_a_id_fkey ( first_name, last_name ),
       player_b:profiles!pairing_rules_player_b_id_fkey ( first_name, last_name )`,
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as PairingRuleRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    playerAId: row.player_a_id,
    playerAName: fullName(row.player_a),
    playerBId: row.player_b_id,
    playerBName: fullName(row.player_b),
  }));
}

export async function setPairingRule(input: SetPairingRuleInput): Promise<string> {
  const { data, error } = await supabase.rpc('set_pairing_rule', {
    p_kind: input.kind,
    p_player_a: input.playerAId,
    p_player_b: input.playerBId,
  });
  if (error) throw error;
  return data;
}

export async function deletePairingRule(ruleId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_pairing_rule', { p_rule_id: ruleId });
  if (error) throw error;
}
