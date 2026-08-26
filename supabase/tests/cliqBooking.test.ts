/**
 * The CliQ booking path. BUILD-SPEC 10.1, D33, D34, D35, D36, A13.
 *
 * One rule underneath all of it:
 *
 *   "If the upload fails, no booking is created. A booking must never exist
 *    with payment_method = 'cliq' and no proof row."
 *
 * The last describe block is the one that matters most. Everything above it
 * tests that the two functions behave; that one tests that the rule holds
 * against something which is not those functions.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import { sql } from './helpers/sql';
import {
  bookingRow,
  cleanupFixtures,
  createSession,
  fillSession,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(21);

let player: Client;
let coach: Client;

function proofPath(playerId: string, bookingId: string): string {
  return `${playerId}/${bookingId}.jpg`;
}

async function proofFor(bookingId: string): Promise<{
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
} | null> {
  const { data } = await serviceClient()
    .from('payment_proofs')
    .select('storage_path, mime_type, file_size_bytes')
    .eq('booking_id', bookingId)
    .maybeSingle();

  return data;
}

beforeAll(async () => {
  [player, coach] = await Promise.all([signIn(SUBJECT.email), signIn(USERS.coach.email)]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('prepare_cliq_booking, 10.1 steps 1 to 4', () => {
  it('hands back an id and writes nothing at all', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60 });

    const { data, error } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });

    expect(error).toBeNull();
    expect(data).toMatch(/^[0-9a-f-]{36}$/);

    // Reserving a name is not reserving a spot. A player who abandons the
    // sheet here has left no trace.
    const { count } = await serviceClient()
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    expect(count).toBe(0);
  });

  it('refuses before the player spends an upload on a full session', async () => {
    // The point of the preflight: 9.1 rule 8 is answered before the photo is
    // taken, not after it has been sent.
    const session = await createSession({ startsInMinutes: 6 * 60 + 5, courtCount: 1 });
    await fillSession(session.id, 4);

    const { error } = await player.rpc('prepare_cliq_booking', { p_session_id: session.id });
    expect(error?.message).toBe('session_full');
  });

  it('refuses after the one hour cutoff', async () => {
    const session = await createSession({ startsInMinutes: 59 });
    const { error } = await player.rpc('prepare_cliq_booking', { p_session_id: session.id });
    expect(error?.message).toBe('booking_window_closed');
  });
});

describe('create_cliq_booking, 10.1 steps 6 and 7', () => {
  it('creates the booking and its proof together', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 });
    const { data: bookingId } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });

    const { data, error } = await player.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(SUBJECT.id, bookingId as string),
      p_file_size_bytes: 184320,
      p_mime_type: 'image/jpeg',
    });

    expect(error).toBeNull();
    expect(data).toBe(bookingId);

    // 10.1's table: cliq is confirmed and unpaid at the session's price. D34:
    // no approval step and no pending state — unpaid says only that the coach
    // has not yet ticked the row in review.
    expect(await bookingRow(data as string)).toMatchObject({
      status: 'confirmed',
      payment_method: 'cliq',
      payment_status: 'unpaid',
      expected_fils: 6000,
      paid_fils: 0,
      source: 'self',
    });

    expect(await proofFor(data as string)).toMatchObject({
      storage_path: proofPath(SUBJECT.id, bookingId as string),
      mime_type: 'image/jpeg',
      file_size_bytes: 184320,
    });
  });

  it('refuses a path pointing into somebody else’s folder', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 + 5 });
    const { data: bookingId } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });

    const { error } = await player.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(USERS.level0.id, bookingId as string),
      p_file_size_bytes: 1000,
      p_mime_type: 'image/jpeg',
    });

    expect(error?.message).toBe('proof_path_mismatch');
  });

  it('refuses a path naming a different booking', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 + 10 });
    const { data: bookingId } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });

    const { error } = await player.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(SUBJECT.id, '00000000-0000-4000-8000-000000000000'),
      p_file_size_bytes: 1000,
      p_mime_type: 'image/jpeg',
    });

    expect(error?.message).toBe('proof_path_mismatch');
  });

  it('runs every 9.1 rule again, because the spot can go while the photo uploads', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 + 15, courtCount: 1 });
    const { data: bookingId } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });

    // Between the two calls, the last spots go.
    await fillSession(session.id, 4);

    const { error } = await player.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(SUBJECT.id, bookingId as string),
      p_file_size_bytes: 1000,
      p_mime_type: 'image/jpeg',
    });

    // 14.8: "Sorry, the last spot went while you were booking."
    expect(error?.message).toBe('session_full');
  });

  it('snapshots the player’s own rate, not the poster price', async () => {
    // D41 and A7. Player 5 carries a custom standard rate in the seed.
    const rated = await signIn(seededPlayer(5).email);
    const session = await createSession({ startsInMinutes: 7 * 60 + 20 });

    const { data: bookingId } = await rated.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });
    const { data: created } = await rated.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(seededPlayer(5).id, bookingId as string),
      p_file_size_bytes: 1000,
      p_mime_type: 'image/jpeg',
    });

    const { data: profile } = await serviceClient()
      .from('profiles')
      .select('custom_rate_standard_fils')
      .eq('id', seededPlayer(5).id)
      .single();

    const row = await bookingRow(created as string);
    expect(row.expected_fils).toBe(profile?.custom_rate_standard_fils ?? 6000);
  });
});

describe('the invariant itself', () => {
  it('refuses CliQ through create_booking, which cannot carry a proof', async () => {
    const session = await createSession({ startsInMinutes: 8 * 60 });
    const { error } = await player.rpc('create_booking', {
      p_session_id: session.id,
      p_payment_method: 'cliq',
    });

    expect(error?.message).toBe('cliq_requires_proof');
  });

  it('aborts a CliQ booking written directly with no proof, service role and all', async () => {
    // The deferred constraint trigger from migration 0025. This is the only
    // assertion in the suite made against a hand-written INSERT rather than
    // against an RPC, and deliberately so: 10.1's rule is a fact about the
    // database, not a convention two functions happen to follow.
    const session = await createSession({ startsInMinutes: 8 * 60 + 5 });

    expect(() =>
      sql(`INSERT INTO bookings (session_id, attendee_kind, player_id, status, source,
                                 payment_method, payment_status, expected_fils)
           VALUES ('${session.id}', 'player', '${USERS.level0.id}', 'confirmed', 'self',
                   'cliq', 'unpaid', 6000)`),
    ).toThrow(/cliq_requires_proof/);

    const { count } = await serviceClient()
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    expect(count).toBe(0);
  });

  it('accepts the same insert when the proof arrives in the same transaction', async () => {
    const session = await createSession({ startsInMinutes: 8 * 60 + 10 });

    const id = sql(`
      WITH b AS (
        INSERT INTO bookings (session_id, attendee_kind, player_id, status, source,
                              payment_method, payment_status, expected_fils)
        VALUES ('${session.id}', 'player', '${USERS.level0.id}', 'confirmed', 'self',
                'cliq', 'unpaid', 6000)
        RETURNING id
      ), p AS (
        INSERT INTO payment_proofs (booking_id, storage_path, file_size_bytes, mime_type)
        SELECT b.id, '${USERS.level0.id}/' || b.id::text || '.jpg', 1000, 'image/jpeg' FROM b
      )
      SELECT id FROM b`);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lets staff change a method to CliQ during review, which has no screenshot', async () => {
    // The trigger fires on INSERT only. 10.2's *Change method* covers the case
    // where a player paid by CliQ in person and the coach records it, and
    // there is no screenshot anywhere in that story.
    const session = await createSession({ startsInMinutes: -3 * 60, status: 'pending_review' });
    const { data: created } = await coach.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Walk-in',
      p_guest_tier: 'B',
      p_is_free: false,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: created as string,
      p_paid_fils: 6000,
      p_method: 'cliq',
    });

    expect(error).toBeNull();
    expect(await proofFor(created as string)).toBeNull();
  });
});

describe('purge_payment_proofs, A13 and 8.6', () => {
  it('retires a proof past its purge_after date and hands back its path', async () => {
    const session = await createSession({ startsInMinutes: 9 * 60 });
    const { data: bookingId } = await player.rpc('prepare_cliq_booking', {
      p_session_id: session.id,
    });
    const { data: created } = await player.rpc('create_cliq_booking', {
      p_session_id: session.id,
      p_booking_id: bookingId as string,
      p_storage_path: proofPath(SUBJECT.id, bookingId as string),
      p_file_size_bytes: 1000,
      p_mime_type: 'image/jpeg',
    });

    // 365 days on, which is what the default column value will have become.
    sql(`UPDATE payment_proofs SET purge_after = current_date - 1
         WHERE booking_id = '${created as string}'`);

    // The service role is the only caller. Storage refuses a SQL delete of the
    // object itself, so the function returns the path and the edge function
    // hands it to the Storage API — see supabase/functions/purge-payment-proofs.
    const paths = sql('SELECT storage_path FROM purge_payment_proofs()').split('\n');
    expect(paths).toContain(proofPath(SUBJECT.id, bookingId as string));

    expect(await proofFor(created as string)).toBeNull();

    // The booking survives its proof. A13 deletes the screenshot, not the
    // record that somebody paid by CliQ.
    expect((await bookingRow(created as string)).payment_method).toBe('cliq');
  });

  it('is not callable by a player or by staff', async () => {
    const asPlayer = await player.rpc('purge_payment_proofs');
    const asCoach = await coach.rpc('purge_payment_proofs');

    expect(asPlayer.error).not.toBeNull();
    expect(asCoach.error).not.toBeNull();
  });
});
