/**
 * grant_subscription, extend_subscription, adjust_credits.
 * BUILD-SPEC 11.2, 11.3, 11.5, 15.9, 15.10, D48 to D57.
 *
 * Phase 6's stated definition of done is the first test below:
 *
 *   "the documented migration flow (grant 40, adjust −13, balance 27) works
 *    and reads correctly in the history, and an expired subscription cannot be
 *    be extended."
 *
 * The second clause is in the `extend_subscription` block.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  cleanupFixtures,
  grantSubscription,
  remainingCredits,
  seededPlayer,
  trackSubscription,
} from './helpers/bookingFixtures';

/** Nobody else asserts anything about these two, so they can be granted to. */
const SUBJECT = seededPlayer(24);
const OTHER = seededPlayer(25);

let coach: Client;
let admin: Client;
let player: Client;

async function packageId(visitCount: number): Promise<string> {
  const { data, error } = await serviceClient()
    .from('packages')
    .select('id')
    .eq('visit_count', visitCount)
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function subscriptionRow(id: string): Promise<{
  granted_visits: number;
  per_visit_fils: number;
  starts_on: string;
  expires_on: string;
  is_voided: boolean;
  note: string | null;
}> {
  const { data, error } = await serviceClient()
    .from('player_subscriptions')
    .select('granted_visits, per_visit_fils, starts_on, expires_on, is_voided, note')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ledger(
  subscriptionId: string,
): Promise<{ delta: number; reason: string; note: string | null }[]> {
  const { data, error } = await serviceClient()
    .from('credit_transactions')
    .select('delta, reason, note, created_at')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map((row) => ({ delta: row.delta, reason: row.reason, note: row.note }));
}

function raised(error: { message: string } | null): string | null {
  return error === null ? null : error.message.trim();
}

beforeAll(async () => {
  [coach, admin, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(SUBJECT.email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('11.3, the migration of a current subscriber', () => {
  it('grant 40, adjust −13, balance 27, and the history explains itself', async () => {
    // Verbatim from 11.3: "grant the full 40 visit package, then adjust by −13
    // with the note 'used before the app'. The remaining balance reads 27 and
    // the history explains itself forever."
    const { data: subId, error: grantError } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(40),
    });
    expect(raised(grantError)).toBeNull();
    trackSubscription(subId as string);

    expect(await remainingCredits(subId as string)).toBe(40);

    const { error: adjustError } = await coach.rpc('adjust_credits', {
      p_subscription_id: subId as string,
      p_delta: -13,
      p_note: 'used before the app',
    });
    expect(raised(adjustError)).toBeNull();

    // The number the coach checks. It is the sum of the ledger and there is no
    // counter column for it to disagree with. 6.2, D56.
    expect(await remainingCredits(subId as string)).toBe(27);

    expect(await ledger(subId as string)).toEqual([
      { delta: 40, reason: 'grant', note: null },
      { delta: -13, reason: 'manual_adjustment', note: 'used before the app' },
    ]);
  });

  it('needs no phantom bookings and no import path', async () => {
    // 11.3: "Do not make him book and cancel phantom sessions." The adjustment
    // above touched no booking at all.
    const { data: subId } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(15),
    });
    trackSubscription(subId as string);

    await coach.rpc('adjust_credits', {
      p_subscription_id: subId as string,
      p_delta: -4,
      p_note: 'four used in July',
    });

    const { data, error } = await serviceClient()
      .from('credit_transactions')
      .select('booking_id')
      .eq('subscription_id', subId as string);

    expect(error).toBeNull();
    expect(data?.every((row) => row.booking_id === null)).toBe(true);
  });
});

describe('grant_subscription', () => {
  it('snapshots the package rate, per 11.1', async () => {
    // "per_visit_fils is snapshotted onto player_subscriptions at grant time,
    // so later price changes never rewrite history." 12.2 rule 1 then values
    // every credit booking at this figure, never at the session price.
    const { data: subId } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(30),
    });
    trackSubscription(subId as string);

    // 11.1's table, and C2's resolution: 125 JD over 30 visits is 4.167 JD.
    expect((await subscriptionRow(subId as string)).per_visit_fils).toBe(4167);
  });

  it('defaults the expiry to start plus the package duration', async () => {
    const { data: subId } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(40),
      p_starts_on: '2026-08-20',
    });
    trackSubscription(subId as string);

    // D48: the 40 visit package runs three months. 15.9's own example.
    const row = await subscriptionRow(subId as string);
    expect(row.starts_on).toBe('2026-08-20');
    expect(row.expires_on).toBe('2026-11-20');
    expect(row.granted_visits).toBe(40);
  });

  it('takes an overridden expiry and visit count. 11.2 steps 3 and 4', async () => {
    const { data: subId } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(8),
      p_starts_on: '2026-08-20',
      p_expires_on: '2026-10-31',
      p_granted_visits: 6,
      p_note: 'paid 30, 10 remaining',
    });
    trackSubscription(subId as string);

    const row = await subscriptionRow(subId as string);
    expect(row.expires_on).toBe('2026-10-31');
    expect(row.granted_visits).toBe(6);
    expect(row.note).toBe('paid 30, 10 remaining');
    expect(await remainingCredits(subId as string)).toBe(6);
  });

  it('lets an admin grant one. D16 and 11.2', async () => {
    const { data: subId, error } = await admin.rpc('grant_subscription', {
      p_player_id: OTHER.id,
      p_package_id: await packageId(8),
    });

    expect(raised(error)).toBeNull();
    trackSubscription(subId as string);
  });

  it('refuses a player', async () => {
    // D49: subscriptions cannot be bought in the app, by anybody, ever.
    const { error } = await player.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(8),
    });

    expect(raised(error)).toBe('not_authorized');
  });

  it('lets one player hold several at once. D51', async () => {
    const pkg = await packageId(8);
    const { data: first } = await coach.rpc('grant_subscription', {
      p_player_id: OTHER.id,
      p_package_id: pkg,
    });
    const { data: second, error } = await coach.rpc('grant_subscription', {
      p_player_id: OTHER.id,
      p_package_id: pkg,
    });

    expect(raised(error)).toBeNull();
    trackSubscription(first as string);
    trackSubscription(second as string);
    expect(first).not.toBe(second);
  });

  it('refuses an expiry on or before the start date', async () => {
    const { error } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(8),
      p_starts_on: '2026-08-20',
      p_expires_on: '2026-08-20',
    });

    expect(raised(error)).toBe('invalid_expiry');
  });

  it('refuses a zero visit count', async () => {
    const { error } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: await packageId(8),
      p_granted_visits: 0,
    });

    expect(raised(error)).toBe('invalid_visit_count');
  });

  it('refuses an unknown package and an unknown player', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';

    const { error: pkgError } = await coach.rpc('grant_subscription', {
      p_player_id: SUBJECT.id,
      p_package_id: missing,
    });
    expect(raised(pkgError)).toBe('package_not_found');

    const { error: playerError } = await coach.rpc('grant_subscription', {
      p_player_id: missing,
      p_package_id: await packageId(8),
    });
    expect(raised(playerError)).toBe('player_not_found');
  });
});

describe('extend_subscription', () => {
  it('moves the expiry forward on a live subscription', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);
    const before = await subscriptionRow(subId);

    const { error } = await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-06-01',
    });

    expect(raised(error)).toBeNull();
    expect((await subscriptionRow(subId)).expires_on).toBe('2027-06-01');
    expect(before.expires_on).not.toBe('2027-06-01');
  });

  it('writes nothing to the ledger, because no credit moved', async () => {
    // D56 is about credits. Extending changes a date; the audit trigger on
    // player_subscriptions is what records that.
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-07-01',
    });

    expect(await ledger(subId)).toHaveLength(1);
    expect(await remainingCredits(subId)).toBe(8);
  });

  it('is blocked once the subscription has expired. 11.5 and D55', async () => {
    // Phase 6's second acceptance criterion, in as many words.
    const subId = await grantSubscription(SUBJECT.id, 8, -5);

    const { error } = await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-01-01',
    });

    expect(raised(error)).toBe('subscription_expired');
  });

  it('is blocked on a voided subscription even before its date has passed', async () => {
    // Both halves of "expired" are checked, for the reason A52 gives about the
    // 7 day lock: the hours between a date passing and a cron job running must
    // not be a window in which the rule does not hold.
    const subId = await grantSubscription(SUBJECT.id, 8, 30);
    await serviceClient().from('player_subscriptions').update({ is_voided: true }).eq('id', subId);

    const { error } = await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-01-01',
    });

    expect(raised(error)).toBe('subscription_expired');
  });

  it('refuses an admin. D55 names the coach specifically', async () => {
    // D16's list of admin powers includes granting and does not mention
    // extending; D55 is written about extending and says only the coach.
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await admin.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: '2027-02-01',
    });

    expect(raised(error)).toBe('not_authorized');
  });

  it('refuses a date that is not later than the current one', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);
    const current = (await subscriptionRow(subId)).expires_on;

    const { error } = await coach.rpc('extend_subscription', {
      p_subscription_id: subId,
      p_expires_on: current,
    });

    expect(raised(error)).toBe('invalid_expiry');
  });
});

describe('adjust_credits', () => {
  it('requires a note. 11.3, 15.10, D56', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    for (const note of [null, '', '   ']) {
      const { error } = await coach.rpc('adjust_credits', {
        p_subscription_id: subId,
        p_delta: -1,
        p_note: note as string,
      });
      expect(raised(error)).toBe('note_required');
    }

    expect(await remainingCredits(subId)).toBe(8);
  });

  it('refuses a zero adjustment', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: 0,
      p_note: 'nothing',
    });

    expect(raised(error)).toBe('invalid_amount');
  });

  it('refuses to take the balance below zero', async () => {
    // 15.10's preview is "Balance goes from 40 to 27". A subscription holding
    // minus six credits is not a state anything in the specification
    // describes: it cannot be spent, and D40 keeps debts in balance_entries.
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: -9,
      p_note: 'too far',
    });

    expect(raised(error)).toBe('insufficient_credits');
    expect(await remainingCredits(subId)).toBe(8);
  });

  it('allows an adjustment that lands exactly on zero', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: -8,
      p_note: 'all eight used before the app',
    });

    expect(raised(error)).toBeNull();
    expect(await remainingCredits(subId)).toBe(0);
  });

  it('adds credits as well as removing them', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: 3,
      p_note: 'three sessions I owed him',
    });

    expect(await remainingCredits(subId)).toBe(11);
  });

  it('refuses a voided subscription, whose ledger is closed', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);
    await serviceClient().from('player_subscriptions').update({ is_voided: true }).eq('id', subId);

    const { error } = await coach.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: 1,
      p_note: 'reopening a closed ledger',
    });

    expect(raised(error)).toBe('subscription_voided');
  });

  it('lets an admin adjust. D16 and 15.10', async () => {
    const subId = await grantSubscription(OTHER.id, 8, 30);

    const { error } = await admin.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: -2,
      p_note: 'two used before the app',
    });

    expect(raised(error)).toBeNull();
    expect(await remainingCredits(subId)).toBe(6);
  });

  it('refuses a player adjusting his own', async () => {
    const subId = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await player.rpc('adjust_credits', {
      p_subscription_id: subId,
      p_delta: 10,
      p_note: 'a few extra for me',
    });

    expect(raised(error)).toBe('not_authorized');
    expect(await remainingCredits(subId)).toBe(8);
  });
});

describe('what the player can read', () => {
  it('sees his own subscription and its ledger, and nobody else’s', async () => {
    // 7.3: own rows only, on both tables. The screen in 14.13 rests on this.
    const mine = await grantSubscription(SUBJECT.id, 8, 30);
    const theirs = await grantSubscription(OTHER.id, 8, 30);

    const { data: subs } = await player.from('player_subscriptions').select('id');
    const ids = (subs ?? []).map((row) => row.id);

    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);

    const { data: txns } = await player
      .from('credit_transactions')
      .select('subscription_id')
      .eq('subscription_id', theirs);
    expect(txns).toEqual([]);
  });

  it('cannot write to the ledger directly', async () => {
    // D56 makes it append only *through the functions*. A player with a
    // PostgREST client and an idea is stopped by the policy, not by the UI.
    const mine = await grantSubscription(SUBJECT.id, 8, 30);

    const { error } = await player.from('credit_transactions').insert({
      subscription_id: mine,
      player_id: SUBJECT.id,
      delta: 50,
      reason: 'manual_adjustment',
    });

    expect(error).not.toBeNull();
    expect(await remainingCredits(mine)).toBe(8);
  });
});
