/**
 * Account deletion. BUILD-SPEC 14.14 and assumption A1.
 *
 * A1 is a balance of two things that pull against each other: the player's
 * identity has to go, and the coach's records have to stay whole. These test
 * both halves, plus the phase 2 criterion that a deleted account cannot sign in.
 */
import { addDays } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import { ammanDayKey, nowInAmman } from '../../src/lib/time';
import { anonClient, serviceClient } from './helpers/clients';
import { SESSIONS, USERS } from './helpers/fixtures';

type Client = SupabaseClient<Database>;

const PASSWORD = 'badminton1';

interface Subject {
  id: string;
  email: string;
}

const created: string[] = [];

async function makePlayer(label: string): Promise<Subject> {
  const email = `phase2.delete.${label}.${Date.now()}.${Math.floor(Math.random() * 10000)}@pob.test`;
  const admin = serviceClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: 'Doomed',
      last_name: 'Player',
      phone: '0799999999',
      preferred_locale: 'en',
    },
  });

  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`);
  created.push(data.user.id);
  return { id: data.user.id, email };
}

/** The database half of the edge function, which is all of it bar storage. */
async function anonymise(admin: Client, playerId: string): Promise<string[]> {
  const { data, error } = await admin.rpc('anonymise_player_account', { p_player_id: playerId });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

afterAll(async () => {
  const admin = serviceClient();
  for (const id of created) {
    await admin.from('bookings').delete().eq('player_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe('anonymise_player_account', () => {
  it('removes the name and the phone but keeps the row', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('identity');

    await anonymise(admin, subject.id);

    const { data } = await admin
      .from('profiles')
      .select('first_name, last_name, phone, deleted_at, is_active')
      .eq('id', subject.id)
      .single();

    expect(data?.first_name).toBe('Deleted');
    expect(data?.last_name).toBe('player');
    expect(data?.phone).toBeNull();
    expect(data?.deleted_at).not.toBeNull();
    expect(data?.is_active).toBe(false);
  });

  it('cancels a future booking and returns the credit it used', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('credit');

    // A subscription with one credit on it, spent on a future session.
    const { data: pkg } = await admin
      .from('packages')
      .select('id, per_visit_fils')
      .limit(1)
      .single();
    const { data: sub } = await admin
      .from('player_subscriptions')
      .insert({
        player_id: subject.id,
        package_id: pkg?.id as string,
        granted_visits: 1,
        per_visit_fils: pkg?.per_visit_fils as number,
        starts_on: ammanDayKey(nowInAmman()),
        expires_on: ammanDayKey(addDays(nowInAmman(), 30)),
        granted_by: USERS.coach.id,
      })
      .select('id')
      .single();

    const { data: grant } = await admin
      .from('credit_transactions')
      .insert({
        subscription_id: sub?.id as string,
        player_id: subject.id,
        delta: 1,
        reason: 'grant',
      })
      .select('id')
      .single();
    expect(grant?.id).toBeTruthy();

    const { data: booking } = await admin
      .from('bookings')
      .insert({
        session_id: SESSIONS.open,
        attendee_kind: 'player',
        player_id: subject.id,
        payment_method: 'credit',
        payment_status: 'paid',
        expected_fils: 0,
      })
      .select('id')
      .single();

    const { data: spend } = await admin
      .from('credit_transactions')
      .insert({
        subscription_id: sub?.id as string,
        player_id: subject.id,
        delta: -1,
        reason: 'booking',
        booking_id: booking?.id as string,
      })
      .select('id')
      .single();

    await admin
      .from('bookings')
      .update({ credit_txn_id: spend?.id as string })
      .eq('id', booking?.id as string);

    await anonymise(admin, subject.id);

    const { data: after } = await admin
      .from('bookings')
      .select('status, cancelled_at')
      .eq('id', booking?.id as string)
      .single();

    expect(after?.status).toBe('cancelled_by_player');
    expect(after?.cancelled_at).not.toBeNull();

    // Granted 1, spent 1, returned 1. The ledger explains itself.
    const { data: ledger } = await admin
      .from('credit_transactions')
      .select('delta, reason')
      .eq('subscription_id', sub?.id as string);

    const balance = (ledger ?? []).reduce((total, row) => total + row.delta, 0);
    expect(balance).toBe(1);
    expect((ledger ?? []).some((row) => row.reason === 'booking_refund')).toBe(true);
  });

  it('leaves a past booking exactly where it is', async () => {
    // A1: the coach's historical reports must not develop holes.
    const admin = serviceClient();
    const subject = await makePlayer('history');

    const { data: booking } = await admin
      .from('bookings')
      .insert({
        session_id: SESSIONS.pastWithOwnBooking,
        attendee_kind: 'player',
        player_id: subject.id,
        payment_method: 'cash',
        payment_status: 'paid',
        expected_fils: 6000,
        paid_fils: 6000,
      })
      .select('id')
      .single();

    await anonymise(admin, subject.id);

    const { data: after } = await admin
      .from('bookings')
      .select('status, paid_fils, player_id')
      .eq('id', booking?.id as string)
      .single();

    expect(after?.status).toBe('confirmed');
    expect(after?.paid_fils).toBe(6000);
    expect(after?.player_id).toBe(subject.id);
  });

  it('does not forgive what the player owes', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('balance');

    await admin.from('balance_entries').insert({
      player_id: subject.id,
      amount_fils: 2000,
      note: 'Short by 2 JD',
      created_by: USERS.coach.id,
    });

    await anonymise(admin, subject.id);

    const { data } = await admin
      .from('balance_entries')
      .select('amount_fils')
      .eq('player_id', subject.id);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.amount_fils).toBe(2000);
  });

  it('takes the device tokens with it', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('devices');

    await admin.from('device_tokens').insert({
      player_id: subject.id,
      token: `ExponentPushToken[${subject.id}]`,
      platform: 'ios',
    });

    await anonymise(admin, subject.id);

    const { data } = await admin.from('device_tokens').select('id').eq('player_id', subject.id);
    expect(data).toHaveLength(0);
  });

  it('drops any waiting list place, which would otherwise still be pushed at', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('waitlist');

    await admin
      .from('waitlist_entries')
      .insert({ session_id: SESSIONS.outsideWindow, player_id: subject.id });

    await anonymise(admin, subject.id);

    const { data } = await admin.from('waitlist_entries').select('id').eq('player_id', subject.id);
    expect(data).toHaveLength(0);
  });

  it('refuses an id that is not a profile', async () => {
    const admin = serviceClient();
    const { error } = await admin.rpc('anonymise_player_account', {
      p_player_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(error?.message).toContain('profile_not_found');
  });

  it('is not callable by a player, for himself or for anybody else', async () => {
    const client = anonClient();
    await client.auth.signInWithPassword({ email: USERS.outsider.email, password: 'password123' });

    const { error } = await client.rpc('anonymise_player_account', {
      p_player_id: USERS.level0.id,
    });

    expect(error).not.toBeNull();
  });
});

describe('after the auth user is deleted', () => {
  it('the account cannot sign in, and the profile is still there', async () => {
    const admin = serviceClient();
    const subject = await makePlayer('signin');

    // Deletion works: the account exists and can sign in beforehand.
    const before = await anonClient().auth.signInWithPassword({
      email: subject.email,
      password: PASSWORD,
    });
    expect(before.error).toBeNull();

    await anonymise(admin, subject.id);
    const { error: deleteError } = await admin.auth.admin.deleteUser(subject.id);
    expect(deleteError).toBeNull();

    const after = await anonClient().auth.signInWithPassword({
      email: subject.email,
      password: PASSWORD,
    });
    expect(after.data.session).toBeNull();
    expect(after.error).not.toBeNull();

    // The cascade from auth.users was dropped in migration 0014 precisely so
    // that this row, and everything hanging off it, survives.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, first_name, deleted_at')
      .eq('id', subject.id)
      .single();

    expect(profile?.first_name).toBe('Deleted');
    expect(profile?.deleted_at).not.toBeNull();
  });
});
