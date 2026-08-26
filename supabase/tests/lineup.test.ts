/**
 * The court board's writes. BUILD-SPEC 13.8, 13.9, D65, D68, and migration
 * 0033.
 *
 * The engine itself is pure TypeScript with its own suite (19.2). What is
 * tested here is everything the engine cannot know about: that a lineup is
 * saved whole or not at all, that `has_manual_lineup` turns over at exactly
 * the moments 13.8 describes, that a locked court refuses a swap, and that
 * none of it is reachable by a player (D18, D68).
 */
import { nowInAmman } from '../../src/lib/time';
import type { Json } from '../../src/types/database';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  cleanupFixtures,
  createSession,
  fillSession,
  seededPlayer,
} from './helpers/bookingFixtures';

let coach: Client;
let admin: Client;
let player: Client;

const service = serviceClient();

interface CourtPayload {
  court_number: number;
  team1: string[];
  team2: string[];
}

beforeAll(async () => {
  [coach, admin, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(seededPlayer(21).email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

async function sessionWithBookings(
  count: number,
  courtCount = 3,
): Promise<{
  sessionId: string;
  bookingIds: string[];
}> {
  const session = await createSession({ startsInMinutes: 4 * 60, courtCount });
  await fillSession(session.id, count);
  const { data, error } = await service
    .from('bookings')
    .select('id')
    .eq('session_id', session.id)
    .order('id');
  if (error) throw new Error(error.message);
  return { sessionId: session.id, bookingIds: data.map((row) => row.id) };
}

interface RotationPayload {
  index: number;
  rule: string;
  courts: CourtPayload[];
  sit_outs: string[];
}

/** `save_lineup` takes jsonb, which the generated types widen to `Json`. */
function asJson(rotations: RotationPayload[]): Json {
  return rotations as unknown as Json;
}

function twoCourts(bookingIds: string[]): RotationPayload[] {
  const [a, b, c, d, e, f, g, h] = bookingIds;
  return [
    {
      index: 1,
      rule: 'rule_1_similar',
      courts: [
        { court_number: 1, team1: [a ?? '', b ?? ''], team2: [c ?? '', d ?? ''] },
        { court_number: 2, team1: [e ?? '', f ?? ''], team2: [g ?? '', h ?? ''] },
      ],
      sit_outs: bookingIds.slice(8),
    },
    {
      index: 2,
      rule: 'rule_2_mixed',
      courts: [
        { court_number: 1, team1: [a ?? '', c ?? ''], team2: [b ?? '', d ?? ''] },
        { court_number: 2, team1: [e ?? '', g ?? ''], team2: [f ?? '', h ?? ''] },
      ],
      sit_outs: bookingIds.slice(8),
    },
  ];
}

async function hasManualLineup(sessionId: string): Promise<boolean> {
  const { data, error } = await service
    .from('session_instances')
    .select('has_manual_lineup')
    .eq('id', sessionId)
    .single();
  if (error) throw new Error(error.message);
  return data.has_manual_lineup;
}

async function rotationIdFor(sessionId: string, index: number): Promise<string> {
  const { data, error } = await service
    .from('rotations')
    .select('id')
    .eq('session_id', sessionId)
    .eq('rotation_index', index)
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function slotOf(
  rotationId: string,
  bookingId: string,
): Promise<{ court_number: number; team: number } | null> {
  const { data, error } = await service
    .from('court_assignments')
    .select('court_number, team')
    .eq('rotation_id', rotationId)
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

describe('save_lineup, 13.8', () => {
  it('writes rotations, assignments and sit-outs in one go', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);

    const { error } = await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    expect(error).toBeNull();

    const { data: rotations } = await service
      .from('rotations')
      .select('rotation_index, rule')
      .eq('session_id', sessionId)
      .order('rotation_index');
    expect(rotations).toEqual([
      { rotation_index: 1, rule: 'rule_1_similar' },
      { rotation_index: 2, rule: 'rule_2_mixed' },
    ]);

    const rotationId = await rotationIdFor(sessionId, 1);
    const { count: assigned } = await service
      .from('court_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('rotation_id', rotationId);
    expect(assigned).toBe(8);

    const { count: resting } = await service
      .from('rotation_sitouts')
      .select('id', { count: 'exact', head: true })
      .eq('rotation_id', rotationId);
    expect(resting).toBe(2);
  });

  it('replaces the previous lineup rather than adding to it', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);

    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });

    const { count } = await service
      .from('rotations')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count).toBe(2);
  });

  it('clears has_manual_lineup, so a booking change may discard it again', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);

    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const [a, , , , e] = bookingIds;
    await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a ?? '',
      p_booking_b: e ?? '',
    });
    expect(await hasManualLineup(sessionId)).toBe(true);

    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    expect(await hasManualLineup(sessionId)).toBe(false);
  });

  it('is refused to a player. D18, D68', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);

    const { error } = await player.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    expect(error?.message).toContain('not_authorized');
  });

  it('is allowed to an admin. D16', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);

    const { error } = await admin.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    expect(error).toBeNull();
  });

  it('is refused once the session has locked. D39', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await service.from('session_instances').update({ status: 'locked' }).eq('id', sessionId);

    const { error } = await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    expect(error?.message).toContain('session_locked');
  });
});

describe('swap_lineup_players, 13.9', () => {
  it('exchanges two players across courts and turns the manual flag on', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const [a, , , , e] = bookingIds;

    const before = { a: await slotOf(rotationId, a ?? ''), e: await slotOf(rotationId, e ?? '') };
    const { error } = await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a ?? '',
      p_booking_b: e ?? '',
    });

    expect(error).toBeNull();
    expect(await slotOf(rotationId, a ?? '')).toEqual(before.e);
    expect(await slotOf(rotationId, e ?? '')).toEqual(before.a);
    expect(await hasManualLineup(sessionId)).toBe(true);
  });

  it('exchanges a player on court with one who is resting', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const onCourt = bookingIds[0] ?? '';
    const resting = bookingIds[8] ?? '';

    const slot = await slotOf(rotationId, onCourt);
    const { error } = await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: onCourt,
      p_booking_b: resting,
    });

    expect(error).toBeNull();
    expect(await slotOf(rotationId, resting)).toEqual(slot);
    expect(await slotOf(rotationId, onCourt)).toBeNull();

    const { data: sitOuts } = await service
      .from('rotation_sitouts')
      .select('booking_id')
      .eq('rotation_id', rotationId);
    expect(sitOuts?.map((row) => row.booking_id)).toContain(onCourt);
    expect(sitOuts?.map((row) => row.booking_id)).not.toContain(resting);
  });

  it('refuses a swap touching a locked court', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    await coach.rpc('lock_court', { p_rotation_id: rotationId, p_court_number: 1 });
    const [a, , , , e] = bookingIds;

    const { error } = await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a ?? '',
      p_booking_b: e ?? '',
    });
    expect(error?.message).toContain('court_locked');
  });

  it('refuses to swap somebody with himself', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const a = bookingIds[0] ?? '';

    const { error } = await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a,
      p_booking_b: a,
    });
    expect(error?.message).toContain('same_player');
  });

  it('is refused to a player', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const [a, , , , e] = bookingIds;

    const { error } = await player.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a ?? '',
      p_booking_b: e ?? '',
    });
    expect(error?.message).toContain('not_authorized');
  });
});

describe('locking a court, 13.4 rule 3 and 13.9', () => {
  it('records the four players on that court and sets the manual flag', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);

    const { error } = await coach.rpc('lock_court', {
      p_rotation_id: rotationId,
      p_court_number: 1,
    });
    expect(error).toBeNull();

    const { data } = await service
      .from('locked_courts')
      .select('court_number, booking_ids')
      .eq('session_id', sessionId)
      .single();
    expect(data?.court_number).toBe(1);
    expect(data?.booking_ids.slice().sort()).toEqual(bookingIds.slice(0, 4).sort());
    expect(await hasManualLineup(sessionId)).toBe(true);
  });

  it('refuses to lock a court that is not four players', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    const singles = twoCourts(bookingIds);
    singles[0]?.courts.push({
      court_number: 3,
      team1: [bookingIds[8] ?? ''],
      team2: [bookingIds[9] ?? ''],
    });
    singles[0]!.sit_outs = [];
    await coach.rpc('save_lineup', { p_session_id: sessionId, p_lineup: asJson(singles) });
    const rotationId = await rotationIdFor(sessionId, 1);

    const { error } = await coach.rpc('lock_court', {
      p_rotation_id: rotationId,
      p_court_number: 3,
    });
    expect(error?.message).toContain('court_not_full');
  });

  it('leaves the rotations alone, because a lock governs the next generation', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotation2 = await rotationIdFor(sessionId, 2);
    const before = await slotOf(rotation2, bookingIds[0] ?? '');

    await coach.rpc('lock_court', {
      p_rotation_id: await rotationIdFor(sessionId, 1),
      p_court_number: 1,
    });

    expect(await slotOf(rotation2, bookingIds[0] ?? '')).toEqual(before);
  });

  it('unlocks again', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    await coach.rpc('lock_court', {
      p_rotation_id: await rotationIdFor(sessionId, 1),
      p_court_number: 1,
    });

    const { error } = await coach.rpc('unlock_court', {
      p_session_id: sessionId,
      p_court_number: 1,
    });
    expect(error).toBeNull();

    const { count } = await service
      .from('locked_courts')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count).toBe(0);
  });

  it('survives a regeneration, because a lock is an input and not a result. 13.8', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    await coach.rpc('lock_court', {
      p_rotation_id: await rotationIdFor(sessionId, 1),
      p_court_number: 1,
    });

    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });

    const { count } = await service
      .from('locked_courts')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count).toBe(1);
  });
});

describe('pairing rules, D65', () => {
  const a = seededPlayer(22).id;
  const b = seededPlayer(23).id;

  afterEach(async () => {
    await service.from('pairing_rules').delete().or(`player_a_id.eq.${a},player_b_id.eq.${a}`);
  });

  it('creates a rule and reads it back', async () => {
    const { data, error } = await coach.rpc('set_pairing_rule', {
      p_kind: 'never_pair',
      p_player_a: a,
      p_player_b: b,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
  });

  it('changes the kind rather than duplicating when the same pair comes back', async () => {
    await coach.rpc('set_pairing_rule', { p_kind: 'never_pair', p_player_a: a, p_player_b: b });
    // The unique index is on the unordered pair, so the other way round is the
    // same rule.
    await coach.rpc('set_pairing_rule', { p_kind: 'always_pair', p_player_a: b, p_player_b: a });

    const { data } = await service
      .from('pairing_rules')
      .select('kind')
      .or(`player_a_id.eq.${a},player_b_id.eq.${a}`);
    expect(data).toEqual([{ kind: 'always_pair' }]);
  });

  it('refuses a rule pairing somebody with himself', async () => {
    const { error } = await coach.rpc('set_pairing_rule', {
      p_kind: 'never_pair',
      p_player_a: a,
      p_player_b: a,
    });
    expect(error?.message).toContain('same_player');
  });

  it('is refused to a player', async () => {
    const { error } = await player.rpc('set_pairing_rule', {
      p_kind: 'never_pair',
      p_player_a: a,
      p_player_b: b,
    });
    expect(error?.message).toContain('not_authorized');
  });

  it('deletes', async () => {
    const { data: created } = await coach.rpc('set_pairing_rule', {
      p_kind: 'never_pair',
      p_player_a: a,
      p_player_b: b,
    });
    const id = created ?? '';

    const { error } = await coach.rpc('delete_pairing_rule', { p_rule_id: id });
    expect(error).toBeNull();

    const { count } = await service
      .from('pairing_rules')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    expect(count).toBe(0);
  });
});

describe('count_lineup_changes, 13.8', () => {
  it('answers zero when there is no lineup to be stale', async () => {
    const { sessionId } = await sessionWithBookings(10);
    const { data } = await coach.rpc('count_lineup_changes', { p_session_id: sessionId });
    expect(data).toBe(0);
  });

  it('counts a booking added since the lineup was made', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(8);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });

    const { data: before } = await coach.rpc('count_lineup_changes', { p_session_id: sessionId });
    expect(before).toBe(0);

    await fillSession(sessionId, 2);
    const { data: after } = await coach.rpc('count_lineup_changes', { p_session_id: sessionId });
    expect(after).toBe(2);
  });

  it('counts a booking cancelled since the lineup was made', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });

    await service
      .from('bookings')
      .update({ status: 'cancelled_by_admin', cancelled_at: nowInAmman().toISOString() })
      .eq('id', bookingIds[9] ?? '');

    const { data } = await coach.rpc('count_lineup_changes', { p_session_id: sessionId });
    expect(data).toBe(1);
  });

  it('is refused to a player', async () => {
    const { sessionId } = await sessionWithBookings(10);
    const { error } = await player.rpc('count_lineup_changes', { p_session_id: sessionId });
    expect(error?.message).toContain('not_authorized');
  });
});

describe('mark_lineup_stale, 13.8 and migration 0020', () => {
  it('discards a generated lineup when a booking changes', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });

    await service.rpc('mark_lineup_stale', { p_session_id: sessionId });

    const { count } = await service
      .from('rotations')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count).toBe(0);
  });

  it('leaves the coach his own work once he has edited it', async () => {
    const { sessionId, bookingIds } = await sessionWithBookings(10);
    await coach.rpc('save_lineup', {
      p_session_id: sessionId,
      p_lineup: asJson(twoCourts(bookingIds)),
    });
    const rotationId = await rotationIdFor(sessionId, 1);
    const [a, , , , e] = bookingIds;
    await coach.rpc('swap_lineup_players', {
      p_rotation_id: rotationId,
      p_booking_a: a ?? '',
      p_booking_b: e ?? '',
    });

    await service.rpc('mark_lineup_stale', { p_session_id: sessionId });

    const { count } = await service
      .from('rotations')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count).toBe(2);
  });
});
