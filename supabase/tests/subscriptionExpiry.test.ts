/**
 * void_expired_subscriptions. BUILD-SPEC 11.5, D54, D56, 8.6.
 *
 * "The nightly job voids subscriptions past expires_on by writing an expiry
 * transaction that brings the balance to exactly zero, then setting
 * is_voided = true. The history remains readable."
 *
 * Three claims, and each one is a test: the balance goes to zero, it goes
 * there by a *transaction* rather than by a flag, and the rows that came
 * before are still there afterwards.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { sql } from './helpers/sql';
import { USERS } from './helpers/fixtures';
import {
  cleanupFixtures,
  grantSubscription,
  remainingCredits,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(26);

let coach: Client;

async function voidExpired(): Promise<number> {
  // Nobody may call this from a phone — it is REVOKEd from authenticated and
  // runs on pg_cron at 03:20 Amman. The service role is how a test stands in
  // for the scheduler.
  const { data, error } = await serviceClient().rpc('void_expired_subscriptions');
  if (error) throw new Error(error.message);
  return data as number;
}

async function isVoided(subscriptionId: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from('player_subscriptions')
    .select('is_voided')
    .eq('id', subscriptionId)
    .single();
  if (error) throw new Error(error.message);
  return data.is_voided;
}

async function ledger(subscriptionId: string): Promise<{ delta: number; reason: string }[]> {
  const { data, error } = await serviceClient()
    .from('credit_transactions')
    .select('delta, reason, created_at')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map((row) => ({ delta: row.delta, reason: row.reason }));
}

beforeAll(async () => {
  coach = await signIn(USERS.coach.email);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('the nightly expiry job', () => {
  it('zeroes the balance with a transaction, then voids', async () => {
    // D54 says the balance goes to zero. D56 says every movement is a ledger
    // row with a reason. Setting the flag alone would satisfy the first and
    // break the second, and a coach reading the history in March would find
    // credits that simply stopped existing one night.
    const subId = await grantSubscription(SUBJECT.id, 8, -3);
    await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: -3,
      p_note: 'three used before the app',
    });

    expect(await remainingCredits(subId)).toBe(5);

    await voidExpired();

    expect(await remainingCredits(subId)).toBe(0);
    expect(await isVoided(subId)).toBe(true);
    expect(await ledger(subId)).toEqual([
      { delta: 8, reason: 'grant' },
      { delta: -3, reason: 'manual_adjustment' },
      { delta: -5, reason: 'expiry' },
    ]);
  });

  it('leaves the history readable. 11.5', async () => {
    const subId = await grantSubscription(SUBJECT.id, 15, -1);
    await voidExpired();

    // Nothing was deleted or rewritten. The grant that put the credits there
    // and the row that took them away are both still on the record.
    const rows = await ledger(subId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ delta: 15, reason: 'grant' });
    expect(rows[1]).toEqual({ delta: -15, reason: 'expiry' });
  });

  it('writes no transaction for a subscription that was already empty', async () => {
    // credit_transactions carries CHECK (delta <> 0), and a row saying nothing
    // happened would be noise in the one history the player is told to read.
    const subId = await grantSubscription(SUBJECT.id, 4, -2);
    await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: -4,
      p_note: 'all four used',
    });

    await voidExpired();

    expect(await isVoided(subId)).toBe(true);
    expect((await ledger(subId)).filter((row) => row.reason === 'expiry')).toHaveLength(0);
  });

  it('leaves a subscription expiring today alone', async () => {
    // pick_subscription accepts expires_on >= amman_today(), so a credit that
    // expires today is spendable all of today. The two must agree exactly or a
    // credit dies on the morning of a day it was still good for.
    const subId = await grantSubscription(SUBJECT.id, 8, 0);

    await voidExpired();

    expect(await isVoided(subId)).toBe(false);
    expect(await remainingCredits(subId)).toBe(8);
  });

  it('leaves a live subscription alone', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    await voidExpired();

    expect(await isVoided(subId)).toBe(false);
    expect(await remainingCredits(subId)).toBe(8);
  });

  it('is idempotent: a second run writes nothing more', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, -4);

    await voidExpired();
    const after = await ledger(subId);

    await voidExpired();

    expect(await ledger(subId)).toEqual(after);
    expect(await remainingCredits(subId)).toBe(0);
  });

  it('re-voids a subscription that received a refund after expiring. A2', async () => {
    // A2: a credit returned by a cancellation goes back to the subscription it
    // came from even if that subscription has since expired, and the job then
    // voids it "like any other credit". So the filter is on the date and on
    // there being something to do — not on the is_voided flag.
    const subId = await grantSubscription(SUBJECT.id, 8, -5);
    await voidExpired();
    expect(await remainingCredits(subId)).toBe(0);

    await serviceClient().from('credit_transactions').insert({
      subscription_id: subId,
      player_id: SUBJECT.id,
      delta: 1,
      reason: 'booking_refund',
    });
    expect(await remainingCredits(subId)).toBe(1);

    await voidExpired();

    expect(await remainingCredits(subId)).toBe(0);
    expect(await isVoided(subId)).toBe(true);
  });
});

describe('after expiry', () => {
  it('a voided subscription is never chosen for a credit booking', async () => {
    // 11.5 and 9.1 rule 9: pick_subscription only ever returns a live one, so
    // the player is told `no_credits_available` rather than spending a credit
    // that D54 has already voided.
    const subId = await grantSubscription(SUBJECT.id, 8, -3);
    await voidExpired();

    const { data, error } = await serviceClient()
      .from('v_player_credit_balance')
      .select('subscription_id')
      .eq('subscription_id', subId);

    expect(error).toBeNull();
    // The view excludes voided subscriptions outright.
    expect(data).toEqual([]);
  });

  it('cannot be extended afterwards. 11.5', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, -3);
    await voidExpired();

    const { error } = await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-12-01',
    });

    expect(error?.message.trim()).toBe('subscription_expired');
  });
});

describe('8.6', () => {
  it('is scheduled daily at 03:20 Amman, which is 00:20 UTC', async () => {
    // pg_cron reads its schedules in the server's timezone, which on Supabase
    // is UTC, and Jordan is permanently UTC+3 with no daylight saving (5.1).
    // The cron schema is not exposed through PostgREST, so this reads it the
    // way the rest of the suite reads auth.users — see helpers/sql.ts.
    const schedule = sql(
      "SELECT schedule FROM cron.job WHERE jobname = 'void-expired-subscriptions'",
    );

    expect(schedule).toBe('20 0 * * *');
  });
});
