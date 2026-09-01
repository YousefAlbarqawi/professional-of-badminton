import type { Database } from '../../src/types/database';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { offsetDayKey } from './helpers/dates';
import { USERS, VENUES } from './helpers/fixtures';

type SessionInstanceUpdate = Database['public']['Tables']['session_instances']['Update'];

/**
 * add_rotation. Migration 0038, BUILD-SPEC D62 and A15.
 *
 * "A seventh rotation, if played, uses rule 1" and is added by the coach by
 * hand from the court board. This is the RPC half of that: raise
 * rotation_count by one and hand back the new value, nothing about the
 * lineup itself.
 */
describe('add_rotation', () => {
  let coach: Client;
  let player: Client;
  let service: Client;
  const created: string[] = [];

  beforeAll(async () => {
    [coach, player] = await Promise.all([signIn(USERS.coach.email), signIn(USERS.level0.email)]);
    service = serviceClient();
  });

  afterEach(async () => {
    if (created.length > 0) {
      await service.from('session_instances').delete().in('id', created.splice(0));
    }
  });

  async function futureDate(offsetDays: number): Promise<string> {
    const { data } = await service.rpc('amman_today');
    return offsetDayKey(data as unknown as string, offsetDays);
  }

  async function makeSession(
    overrides: {
      rotationCount?: number;
      status?: 'scheduled' | 'locked' | 'cancelled';
      offsetDays?: number;
    } = {},
  ): Promise<string> {
    const { data, error } = await coach.rpc('create_one_off_session', {
      p_venue_id: VENUES.khalda,
      p_session_date: await futureDate(overrides.offsetDays ?? 45),
      p_start_time: '19:00',
      p_duration_minutes: 90,
      p_price_fils: 6000,
      p_court_count: 4,
    });
    expect(error).toBeNull();
    const sessionId = data as unknown as string;
    created.push(sessionId);

    if (overrides.rotationCount !== undefined || overrides.status !== undefined) {
      const update: SessionInstanceUpdate = {
        ...(overrides.rotationCount === undefined
          ? {}
          : { rotation_count: overrides.rotationCount }),
        ...(overrides.status === undefined ? {} : { status: overrides.status }),
      };
      const { error: updateError } = await service
        .from('session_instances')
        .update(update)
        .eq('id', sessionId);
      expect(updateError).toBeNull();
    }

    return sessionId;
  }

  it('raises rotation_count by one and returns the new value', async () => {
    const sessionId = await makeSession(); // create_one_off_session: 90 min -> 4 rotations

    const { data, error } = await coach.rpc('add_rotation', { p_session_id: sessionId });
    expect(error).toBeNull();
    expect(data).toBe(5);

    const { data: row } = await service
      .from('session_instances')
      .select('rotation_count')
      .eq('id', sessionId)
      .single();
    expect(row?.rotation_count).toBe(5);
  });

  it('can be called repeatedly, one rotation at a time, up to a seventh and beyond', async () => {
    const sessionId = await makeSession({ rotationCount: 6 });

    const first = await coach.rpc('add_rotation', { p_session_id: sessionId });
    expect(first.error).toBeNull();
    expect(first.data).toBe(7);

    const second = await coach.rpc('add_rotation', { p_session_id: sessionId });
    expect(second.error).toBeNull();
    expect(second.data).toBe(8);
  });

  it('refuses at the ten-rotation ceiling', async () => {
    const sessionId = await makeSession({ rotationCount: 10 });

    const { data, error } = await coach.rpc('add_rotation', { p_session_id: sessionId });

    expect(data).toBeNull();
    expect(error?.message).toBe('rotation_count_at_maximum');

    const { data: row } = await service
      .from('session_instances')
      .select('rotation_count')
      .eq('id', sessionId)
      .single();
    expect(row?.rotation_count).toBe(10);
  });

  it('refuses a non-staff caller', async () => {
    const sessionId = await makeSession();

    const { data, error } = await player.rpc('add_rotation', { p_session_id: sessionId });

    expect(data).toBeNull();
    expect(error?.message).toBe('not_authorized');
  });

  it('refuses a locked session. D39', async () => {
    const sessionId = await makeSession({ status: 'locked' });

    const { data, error } = await coach.rpc('add_rotation', { p_session_id: sessionId });

    expect(data).toBeNull();
    expect(error?.message).toBe('session_locked');
  });

  it('refuses a session that does not exist', async () => {
    const { data, error } = await coach.rpc('add_rotation', {
      p_session_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(data).toBeNull();
    expect(error?.message).toBe('session_not_found');
  });
});
