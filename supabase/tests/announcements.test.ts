/**
 * Announcements. BUILD-SPEC 14.11, 15.11, D69, and 7.3's policy row.
 *
 * Three things are being proved. Publishing writes the announcement and the
 * push job together, because 15.11 says publishing sends a push and an
 * announcement with no job behind it is one nobody was told about. A player
 * cannot publish. And a soft delete takes the message out of the list without
 * touching anything in the outbox — 15.11's "does not recall the push", which
 * is honoured by omission and is therefore exactly the kind of thing that
 * rots silently without a test.
 */
import { anonClient, serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';

let coach: Client;
let admin: Client;
let player: Client;

const created: string[] = [];

async function publish(
  client: Client,
  body: string,
  language: 'ar' | 'en',
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await client.rpc('publish_announcement', {
    p_body: body,
    p_language: language,
  });

  if (error !== null) return { id: null, error: error.message.trim() };
  const id = data as unknown as string;
  created.push(id);
  return { id, error: null };
}

async function jobsFor(announcementId: string): Promise<
  {
    kind: string;
    recipient_ids: string[] | null;
    payload: Record<string, unknown>;
    sent_at: string | null;
  }[]
> {
  const { data } = await serviceClient()
    .from('push_jobs')
    .select('kind, recipient_ids, payload, sent_at')
    .eq('announcement_id', announcementId);

  return (data ?? []) as never;
}

beforeAll(async () => {
  [coach, admin, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(USERS.level0.email),
  ]);
}, 60000);

afterAll(async () => {
  if (created.length > 0) {
    await serviceClient().from('announcements').delete().in('id', created);
  }
});

describe('15.11, publishing', () => {
  it('writes the announcement and its push job in one call', async () => {
    const { id, error } = await publish(coach, 'Friday session is cancelled.', 'en');

    expect(error).toBeNull();
    expect(id).not.toBeNull();

    const jobs = await jobsFor(id ?? '');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe('announcement');
    // 15.11: "every registered device". Null is how the outbox says everyone.
    expect(jobs[0]?.recipient_ids).toBeNull();
    expect(jobs[0]?.sent_at).toBeNull();
  });

  it("freezes section 18's 120 character preview at publish time", async () => {
    const body = `${'x'.repeat(200)}TAIL`;
    const { id } = await publish(coach, body, 'en');

    const jobs = await jobsFor(id ?? '');
    expect(jobs[0]?.payload.preview).toBe('x'.repeat(120));
  });

  it('lets an admin publish. D16', async () => {
    const { error } = await publish(admin, 'Courts are booked for Monday.', 'en');
    expect(error).toBeNull();
  });

  it('refuses a player', async () => {
    const { error } = await publish(player, 'I am the coach now', 'en');
    expect(error).toBe('not_authorized');
  });

  it('refuses an empty body and one over 2000 characters. 6.2', async () => {
    expect((await publish(coach, '   ', 'en')).error).toBe('invalid_announcement_body');
    expect((await publish(coach, 'x'.repeat(2001), 'en')).error).toBe('invalid_announcement_body');
  });

  it('accepts exactly 2000 characters', async () => {
    expect((await publish(coach, 'x'.repeat(2000), 'en')).error).toBeNull();
  });

  it('refuses a language that is not one of the two. D69, 6.2', async () => {
    expect((await publish(coach, 'Bonjour', 'fr' as 'en')).error).toBe('invalid_language');
  });

  it('stores whichever language the author says he typed, and does not check it', async () => {
    // D69: "one message to everyone, in whichever language the author types.
    // Not a dual language form." Nothing translates and nothing validates the
    // body against the label — 14.11 detects direction from the content on the
    // reader's phone instead.
    const { id } = await publish(coach, 'Session cancelled', 'ar');

    const { data } = await serviceClient()
      .from('announcements')
      .select('body, language')
      .eq('id', id ?? '')
      .single();

    expect(data?.language).toBe('ar');
    expect(data?.body).toBe('Session cancelled');
  });
});

describe('7.3, who can read an announcement', () => {
  it('lets any signed-in player read a published one', async () => {
    const { id } = await publish(coach, 'Everyone can read this.', 'en');

    const { data } = await player
      .from('announcements')
      .select('id')
      .eq('id', id ?? '');
    expect(data).toHaveLength(1);
  });

  it('refuses the anonymous role', async () => {
    const { id } = await publish(coach, 'Members only.', 'en');

    const { data } = await anonClient()
      .from('announcements')
      .select('id')
      .eq('id', id ?? '');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('15.11, the soft delete', () => {
  it('hides it from a player without deleting the row', async () => {
    const { id } = await publish(coach, 'This one gets withdrawn.', 'en');

    const { error } = await coach.rpc('delete_announcement', { p_id: id ?? '' });
    expect(error).toBeNull();

    const { data: playerSees } = await player
      .from('announcements')
      .select('id')
      .eq('id', id ?? '');
    expect(playerSees ?? []).toHaveLength(0);

    const { data: row } = await serviceClient()
      .from('announcements')
      .select('is_deleted')
      .eq('id', id ?? '')
      .single();
    expect(row?.is_deleted).toBe(true);
  });

  it('does not recall the push', async () => {
    // The clause this test exists for. Deleting must leave the outbox exactly
    // as it found it: a notification already delivered cannot be unsent, and
    // one already enqueued still goes out.
    const { id } = await publish(coach, 'Withdrawn after sending.', 'en');

    const before = await jobsFor(id ?? '');
    expect(before).toHaveLength(1);

    await coach.rpc('delete_announcement', { p_id: id ?? '' });

    const after = await jobsFor(id ?? '');
    expect(after).toEqual(before);
  });

  it('refuses a player', async () => {
    const { id } = await publish(coach, 'Not yours to delete.', 'en');

    const { error } = await player.rpc('delete_announcement', { p_id: id ?? '' });
    expect(error?.message.trim()).toBe('not_authorized');
  });

  it('reports a row that is not there', async () => {
    const { error } = await coach.rpc('delete_announcement', {
      p_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(error?.message.trim()).toBe('announcement_not_found');
  });
});
