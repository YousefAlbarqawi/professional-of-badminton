/**
 * The push outbox. BUILD-SPEC 8.4, 8.7, section 18, D27, D28, D70.
 *
 * ── The two acceptance criteria of phase 8 that live in SQL ──
 * "A spot freed 40 minutes before start sends nothing" is asserted here from
 * both sides of the line, at 40 minutes and at 61, by looking at whether a job
 * exists at all — because after phase 8 the silence has to survive one more
 * step than it did in phase 4, and a job that exists is a notification that
 * will go out.
 *
 * D70 is asserted as a fact about the schema: `push_job_kind` has two values.
 * A booking confirmation cannot be enqueued because there is nothing to
 * enqueue it as.
 *
 * ── What is not tested here ─────────────────────────────
 * Expo. `sendExpoMessages` talks to exp.host, and a test that reached it would
 * be testing somebody else's uptime. What the edge function does with the
 * answer is what this file exercises, by handing `complete_push_job` and
 * `settle_push_receipts` the shapes Expo returns.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import { sql } from './helpers/sql';
import {
  cleanupFixtures,
  createSession,
  fillSession,
  seededPlayer,
} from './helpers/bookingFixtures';

const WAITER = seededPlayer(23);
const SECOND = seededPlayer(24);

const WAITER_TOKEN = 'ExponentPushToken[outbox-waiter]';
const SECOND_TOKEN = 'ExponentPushToken[outbox-second]';
const TEST_TOKENS = [WAITER_TOKEN, SECOND_TOKEN];

let waiter: Client;
let second: Client;
let coach: Client;

interface ClaimedJob {
  jobId: string;
  kind: string;
  sessionId: string | null;
  announcementId: string | null;
  payload: Record<string, unknown>;
  devices: { token: string; locale: string }[];
}

const createdAnnouncements: string[] = [];

/** notify_waitlist is not callable by a client; the probe uses service role. */
async function notify(sessionId: string): Promise<number> {
  const { data, error } = await serviceClient().rpc('notify_waitlist', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as number;
}

async function jobsForSession(
  sessionId: string,
): Promise<{ id: string; recipient_ids: string[] | null; payload: Record<string, unknown> }[]> {
  const { data } = await serviceClient()
    .from('push_jobs')
    .select('id, recipient_ids, payload')
    .eq('session_id', sessionId);
  return (data ?? []) as never;
}

async function claim(limit = 5): Promise<ClaimedJob[]> {
  const { data, error } = await serviceClient().rpc('claim_push_jobs', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ClaimedJob[];
}

async function registerToken(client: Client, token: string, locale: string): Promise<void> {
  const { error } = await client.rpc('register_device_token', {
    p_token: token,
    p_platform: 'ios',
    p_locale: locale,
  });
  if (error) throw new Error(error.message);
}

async function tokenExists(token: string): Promise<boolean> {
  const { count } = await serviceClient()
    .from('device_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('token', token);
  return (count ?? 0) > 0;
}

/** Empties the outbox so a claim only ever sees this test's own job. */
async function clearOutbox(): Promise<void> {
  sql('DELETE FROM push_deliveries');
  sql('DELETE FROM push_jobs');
}

beforeAll(async () => {
  [waiter, second, coach] = await Promise.all([
    signIn(WAITER.email),
    signIn(SECOND.email),
    signIn(USERS.coach.email),
  ]);
}, 60000);

beforeEach(async () => {
  await clearOutbox();
  await serviceClient().from('device_tokens').delete().in('token', TEST_TOKENS);
});

afterAll(async () => {
  await clearOutbox();
  await serviceClient().from('device_tokens').delete().in('token', TEST_TOKENS);
  if (createdAnnouncements.length > 0) {
    await serviceClient().from('announcements').delete().in('id', createdAnnouncements);
  }
  await cleanupFixtures();
});

describe('D70, exactly two triggers', () => {
  it('has two kinds of push job and no third', () => {
    const values = sql(
      "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum " +
        "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'push_job_kind'",
    );

    // A booking confirmation, a reminder, a cancellation and an expiry warning
    // have nowhere to go. Section 18: "Nothing else pushes."
    expect(values).toBe('waitlist_spot,announcement');
  });
});

describe('8.4 step 4, the waiting list', () => {
  it('enqueues one job for the players it stamped', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 4);
    await waiter.rpc('join_waitlist', { p_session_id: session.id });
    await second.rpc('join_waitlist', { p_session_id: session.id });

    // A spot opens.
    await serviceClient().from('session_instances').update({ court_count: 2 }).eq('id', session.id);

    expect(await notify(session.id)).toBe(2);

    const jobs = await jobsForSession(session.id);
    expect(jobs).toHaveLength(1);
    expect([...(jobs[0]?.recipient_ids ?? [])].sort()).toEqual([WAITER.id, SECOND.id].sort());
  });

  it('carries the venue in both languages and the start time. Section 18', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 3);
    await waiter.rpc('join_waitlist', { p_session_id: session.id });

    await notify(session.id);

    const payload = (await jobsForSession(session.id))[0]?.payload ?? {};
    // The reader's language decides which one is used, not the sender's.
    expect(payload.venueEn).toBe('International Independent Schools');
    expect(payload.venueAr).toBe('مدارس الاستقلالية الدولية');
    expect(String(payload.startsAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('enqueues nothing when the spot opens inside the last hour. D28', async () => {
    // The phase's stated acceptance criterion. Before phase 8 the proof was
    // that nobody was stamped; now it also has to be that nothing was queued,
    // because a job is a notification that will go out.
    const session = await createSession({ startsInMinutes: 40, courtCount: 1 });
    await fillSession(session.id, 3);
    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: WAITER.id });

    expect(await notify(session.id)).toBe(0);
    expect(await jobsForSession(session.id)).toHaveLength(0);
  });

  it('enqueues when the spot opens 61 minutes before start. D28, the other side', async () => {
    const session = await createSession({ startsInMinutes: 61, courtCount: 1 });
    await fillSession(session.id, 3);
    await waiter.rpc('join_waitlist', { p_session_id: session.id });

    expect(await notify(session.id)).toBe(1);
    expect(await jobsForSession(session.id)).toHaveLength(1);
  });

  it('enqueues nothing when the session is still full', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 4);
    await waiter.rpc('join_waitlist', { p_session_id: session.id });

    expect(await notify(session.id)).toBe(0);
    expect(await jobsForSession(session.id)).toHaveLength(0);
  });

  it('enqueues nothing when nobody is waiting', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 2);

    expect(await notify(session.id)).toBe(0);
    expect(await jobsForSession(session.id)).toHaveLength(0);
  });

  it('does not enqueue for a cancelled session', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await waiter.rpc('join_waitlist', { p_session_id: session.id });
    await serviceClient()
      .from('session_instances')
      .update({ status: 'cancelled' })
      .eq('id', session.id);

    expect(await notify(session.id)).toBe(0);
    expect(await jobsForSession(session.id)).toHaveLength(0);
  });
});

describe('8.7, claiming', () => {
  it('resolves an announcement to every registered device, in its own locale', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    await registerToken(second, SECOND_TOKEN, 'en');

    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Friday is cancelled.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const jobs = await claim();
    expect(jobs).toHaveLength(1);

    const devices = jobs[0]?.devices ?? [];
    const mine = devices.filter((device) => TEST_TOKENS.includes(device.token));
    expect(mine).toHaveLength(2);
    // Section 18: "Language for the payload comes from the device row, not the
    // sender." The sender said English; one of these devices is Arabic.
    expect(mine.find((device) => device.token === WAITER_TOKEN)?.locale).toBe('ar');
    expect(mine.find((device) => device.token === SECOND_TOKEN)?.locale).toBe('en');
  });

  it('resolves a waitlist job to the stamped players only', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    await registerToken(second, SECOND_TOKEN, 'en');

    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 3);
    await waiter.rpc('join_waitlist', { p_session_id: session.id });
    await notify(session.id);

    const jobs = await claim();
    expect(jobs[0]?.kind).toBe('waitlist_spot');
    expect(jobs[0]?.devices.map((device) => device.token)).toEqual([WAITER_TOKEN]);
  });

  it('does not hand the same job out twice', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Only once.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    expect(await claim()).toHaveLength(1);
    expect(await claim()).toHaveLength(0);
  });

  it('is not readable by a player', async () => {
    // A waitlist job carries who is on the list, which is nobody else's
    // business. RLS is on with no policies and the grants are revoked too.
    const { data, error } = await waiter.from('push_jobs').select('id');
    expect(data ?? []).toHaveLength(0);
    expect(error === null || error.code !== undefined).toBe(true);
  });
});

describe('section 18, pruning dead tokens', () => {
  it('deletes a token Expo rejects at ticket time', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    await registerToken(second, SECOND_TOKEN, 'en');

    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Some of these phones are gone.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];

    const { data: pruned } = await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [
        { token: WAITER_TOKEN, ticketId: '', status: 'error', error: 'DeviceNotRegistered' },
        { token: SECOND_TOKEN, ticketId: 'ticket-ok', status: 'ok', error: '' },
      ],
    });

    expect(Number(pruned)).toBe(1);
    expect(await tokenExists(WAITER_TOKEN)).toBe(false);
    expect(await tokenExists(SECOND_TOKEN)).toBe(true);
  });

  it('keeps a token whose failure says nothing about the phone', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Rate limited.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];
    await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [
        { token: WAITER_TOKEN, ticketId: '', status: 'error', error: 'MessageRateExceeded' },
      ],
    });

    expect(await tokenExists(WAITER_TOKEN)).toBe(true);
  });

  it('deletes a token the receipt API reports as gone', async () => {
    // The sentence `push_deliveries` exists for: a receipt names a ticket, not
    // a token, so the mapping has to outlive the request that made it.
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Delivered, then not.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];
    await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [{ token: WAITER_TOKEN, ticketId: 'ticket-1', status: 'ok', error: '' }],
    });

    const { data: due } = await serviceClient().rpc('pending_push_receipts', {
      p_limit: 100,
      p_min_age_seconds: 0,
    });
    expect((due as unknown as { ticketId: string }[]).map((row) => row.ticketId)).toContain(
      'ticket-1',
    );

    const { data: pruned } = await serviceClient().rpc('settle_push_receipts', {
      p_results: [{ ticketId: 'ticket-1', status: 'error', error: 'DeviceNotRegistered' }],
    });

    expect(Number(pruned)).toBe(1);
    expect(await tokenExists(WAITER_TOKEN)).toBe(false);
  });

  it('does not ask about a receipt twice', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Checked once.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];
    await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [{ token: WAITER_TOKEN, ticketId: 'ticket-2', status: 'ok', error: '' }],
    });

    await serviceClient().rpc('settle_push_receipts', {
      p_results: [{ ticketId: 'ticket-2', status: 'ok', error: '' }],
    });

    const { data: due } = await serviceClient().rpc('pending_push_receipts', {
      p_limit: 100,
      p_min_age_seconds: 0,
    });
    expect((due as unknown as { ticketId: string }[]).map((row) => row.ticketId)).not.toContain(
      'ticket-2',
    );
    expect(await tokenExists(WAITER_TOKEN)).toBe(true);
  });

  it('leaves a ticket Expo has no answer for yet unchecked', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Still pending.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];
    await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [{ token: WAITER_TOKEN, ticketId: 'ticket-3', status: 'ok', error: '' }],
    });

    // Expo returned nothing for it.
    await serviceClient().rpc('settle_push_receipts', { p_results: [] });

    const { data: due } = await serviceClient().rpc('pending_push_receipts', {
      p_limit: 100,
      p_min_age_seconds: 0,
    });
    expect((due as unknown as { ticketId: string }[]).map((row) => row.ticketId)).toContain(
      'ticket-3',
    );
  });
});

describe('15.11, push_sent_at', () => {
  it("is stamped when the announcement's job completes", async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Sent.',
      p_language: 'en',
    });
    const announcementId = id as unknown as string;
    createdAnnouncements.push(announcementId);

    const before = await serviceClient()
      .from('announcements')
      .select('push_sent_at')
      .eq('id', announcementId)
      .single();
    expect(before.data?.push_sent_at).toBeNull();

    const job = (await claim())[0];
    await serviceClient().rpc('complete_push_job', {
      p_job_id: job?.jobId ?? '',
      p_tickets: [{ token: WAITER_TOKEN, ticketId: 'ticket-4', status: 'ok', error: '' }],
    });

    const after = await serviceClient()
      .from('announcements')
      .select('push_sent_at')
      .eq('id', announcementId)
      .single();
    expect(after.data?.push_sent_at).not.toBeNull();
  });
});

describe('a send that fails', () => {
  it('releases the claim so the next drain picks it up', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Expo was down.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    const job = (await claim())[0];
    await serviceClient().rpc('fail_push_job', {
      p_job_id: job?.jobId ?? '',
      p_error: 'expo_send_failed_503',
    });

    const again = await claim();
    expect(again.map((row) => row.jobId)).toEqual([job?.jobId]);
  });

  it('gives up after five attempts rather than retrying forever', async () => {
    await registerToken(waiter, WAITER_TOKEN, 'ar');
    const { data: id } = await coach.rpc('publish_announcement', {
      p_body: 'Permanently broken.',
      p_language: 'en',
    });
    createdAnnouncements.push(id as unknown as string);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const job = (await claim())[0];
      expect(job).toBeDefined();
      await serviceClient().rpc('fail_push_job', {
        p_job_id: job?.jobId ?? '',
        p_error: 'expo_send_failed_500',
      });
    }

    expect(await claim()).toHaveLength(0);
  });
});
