/**
 * Reports. BUILD-SPEC 15.12, valued per 12.1, 12.2 and 12.3, coach only per
 * D73 and D16.
 *
 * Phase 9's acceptance criteria, in order: "a month of seeded data produces
 * revenue that reconciles to the sum of payments, credit revenue valued at
 * package rates, and an admin receives a permission error." All three are
 * below, against the two months of history section 22 seeds.
 *
 * ── How the reconciliation is done ───────────────────────
 * Three separate paths must produce the same figure, or one of them has
 * drifted: `report_totals`, the weekly bars of `report_revenue_by_week`, and
 * the per-session rows of `report_session_table`. Underneath all three, the
 * money is summed straight off the `bookings` rows in SQL, which is what "the
 * sum of payment rows" means and is the only one of the four that does not go
 * through a report function at all.
 */
import { anonClient, serviceClient, signIn, type Client } from './helpers/clients';
import { USERS, VENUES } from './helpers/fixtures';
import { sql } from './helpers/sql';
import {
  cleanupFixtures,
  createBookingRow,
  createSession,
  grantSubscription,
  seededPlayer,
} from './helpers/bookingFixtures';
import { ammanMonthKey, monthKeyToDate, nowInAmman, shiftMonthKey } from '../../src/lib/time';

const CURRENT_MONTH = ammanMonthKey(nowInAmman());
const LAST_MONTH = shiftMonthKey(CURRENT_MONTH, -1);

/** The exclusive end of a month, as a date literal. */
function monthEnd(monthKey: string): string {
  return monthKeyToDate(shiftMonthKey(monthKey, 1));
}

/**
 * The report's scope, written once. Sessions in the month that are not
 * cancelled and have started; bookings on them that are not cancelled.
 * Section 12.1 and 12.2, and A72.
 */
function scope(monthKey: string): string {
  return `
    FROM bookings b
    JOIN session_instances si ON si.id = b.session_id
    WHERE si.session_date >= '${monthKeyToDate(monthKey)}'
      AND si.session_date <  '${monthEnd(monthKey)}'
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
      AND b.status IN ('confirmed','settled')`;
}

function scalar(statement: string): number {
  const value = sql(statement);
  return value === '' ? 0 : Number(value);
}

let coach: Client;
let admin: Client;
let assistant: Client;
let player: Client;

beforeAll(async () => {
  [coach, admin, assistant, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(USERS.assistant.email),
    signIn(USERS.level0.email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

async function totals(client: Client, monthKey: string) {
  const { data, error } = await client.rpc('report_totals', {
    p_month: monthKeyToDate(monthKey),
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (row === undefined) throw new Error('report_totals returned no row');
  return row;
}

// ─────────────────────────────────────────────────────────
// D73 and D16
// ─────────────────────────────────────────────────────────

const FUNCTIONS = [
  'report_totals',
  'report_revenue_by_week',
  'report_session_table',
  'report_slot_attendance',
  'report_venue_fill',
  'report_subscriptions',
  'report_outstanding',
  'report_players',
] as const;

describe('D73, reports are coach only', () => {
  it('lets the coach read every one of them', async () => {
    for (const name of FUNCTIONS) {
      const { error } = await coach.rpc(name, { p_month: monthKeyToDate(LAST_MONTH) });
      expect({ name, error: error?.message ?? null }).toEqual({ name, error: null });
    }
  });

  it('refuses an admin, from the API and not from a hidden tab. D16', async () => {
    // "An admin opening this tab sees a permission denied state, and the API
    // refuses the query as well." 15.12.
    for (const name of FUNCTIONS) {
      const { data, error } = await admin.rpc(name, { p_month: monthKeyToDate(LAST_MONTH) });
      expect({ name, message: error?.message ?? null }).toEqual({
        name,
        message: 'not_authorized',
      });
      expect(data).toBeNull();
    }
  });

  it('refuses an assistant coach. A14', async () => {
    const { error } = await assistant.rpc('report_totals', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error?.message).toBe('not_authorized');
  });

  it('refuses a player', async () => {
    const { error } = await player.rpc('report_totals', { p_month: monthKeyToDate(LAST_MONTH) });
    expect(error?.message).toBe('not_authorized');
  });

  it('refuses the anonymous role outright, before the function is entered', async () => {
    const { error } = await anonClient().rpc('report_totals', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// 12.2, revenue recognition
// ─────────────────────────────────────────────────────────

describe('12.2, revenue reconciles to the sum of payment rows', () => {
  for (const monthKey of [LAST_MONTH, shiftMonthKey(LAST_MONTH, -1)]) {
    describe(`the seeded month ${monthKey}`, () => {
      it('sums cash exactly. Rule: paid rows and partial rows, at what was paid', async () => {
        const row = await totals(coach, monthKey);
        const expected = scalar(`
          SELECT COALESCE(SUM(b.paid_fils),0)
          ${scope(monthKey)}
            AND b.payment_method = 'cash'
            AND b.payment_status IN ('paid','partial')`);

        expect(row.cash_fils).toBe(expected);
      });

      it('sums CliQ exactly', async () => {
        const row = await totals(coach, monthKey);
        const expected = scalar(`
          SELECT COALESCE(SUM(b.paid_fils),0)
          ${scope(monthKey)}
            AND b.payment_method = 'cliq'
            AND b.payment_status IN ('paid','partial')`);

        expect(row.cliq_fils).toBe(expected);
      });

      it('values every credit at the rate of the subscription it came from. Rule 1', async () => {
        const row = await totals(coach, monthKey);
        const expected = scalar(`
          SELECT COALESCE(SUM(ps.per_visit_fils),0)
          FROM bookings b
          JOIN session_instances si ON si.id = b.session_id
          JOIN credit_transactions ct ON ct.id = b.credit_txn_id
          JOIN player_subscriptions ps ON ps.id = ct.subscription_id
          WHERE si.session_date >= '${monthKeyToDate(monthKey)}'
            AND si.session_date <  '${monthEnd(monthKey)}'
            AND si.status <> 'cancelled'
            AND si.starts_at <= now()
            AND b.status IN ('confirmed','settled')
            AND b.payment_method = 'credit'`);

        expect(row.credit_fils).toBe(expected);
      });

      it('adds the three streams into the total and nothing else', async () => {
        const row = await totals(coach, monthKey);
        expect(row.revenue_fils).toBe(row.cash_fils + row.cliq_fils + row.credit_fils);
      });

      it('agrees with the weekly bars, to the fils', async () => {
        const row = await totals(coach, monthKey);
        const { data, error } = await coach.rpc('report_revenue_by_week', {
          p_month: monthKeyToDate(monthKey),
        });
        expect(error).toBeNull();

        const weekly = (data ?? []).reduce(
          (sum, week) => ({
            cash: sum.cash + week.cash_fils,
            cliq: sum.cliq + week.cliq_fils,
            credit: sum.credit + week.credit_fils,
            total: sum.total + week.total_fils,
          }),
          { cash: 0, cliq: 0, credit: 0, total: 0 },
        );

        expect(weekly).toEqual({
          cash: row.cash_fils,
          cliq: row.cliq_fils,
          credit: row.credit_fils,
          total: row.revenue_fils,
        });
      });

      it('agrees with the per session table, to the fils', async () => {
        const row = await totals(coach, monthKey);
        const { data, error } = await coach.rpc('report_session_table', {
          p_month: monthKeyToDate(monthKey),
        });
        expect(error).toBeNull();

        const summed = (data ?? []).reduce(
          (sum, session) => ({
            revenue: sum.revenue + session.revenue_fils,
            cost: sum.cost + session.cost_fils,
            profit: sum.profit + session.profit_fils,
            players: sum.players + session.player_count,
          }),
          { revenue: 0, cost: 0, profit: 0, players: 0 },
        );

        expect(summed.revenue).toBe(row.revenue_fils);
        expect(summed.cost).toBe(row.cost_fils);
        expect(summed.profit).toBe(row.profit_fils);
        expect(summed.players).toBe(row.attendee_count);
        expect(data?.length).toBe(row.sessions_run);
      });
    });
  }

  it('never values a credit at the 6 JD session price. 12.2 rule 1', async () => {
    // Every seeded package rate is between 4.000 and 5.000 (11.1), so a credit
    // that came out at 6000 could only have been valued at the session price.
    const outOfRange = scalar(`
      SELECT COUNT(*)
      FROM player_subscriptions ps
      WHERE ps.per_visit_fils < 4000 OR ps.per_visit_fils > 5000`);

    expect(outOfRange).toBe(0);

    const creditBookings = scalar(`
      SELECT COUNT(*) ${scope(LAST_MONTH)} AND b.payment_method = 'credit'`);
    const row = await totals(coach, LAST_MONTH);

    expect(creditBookings).toBeGreaterThan(0);
    expect(row.credit_fils).toBeLessThanOrEqual(creditBookings * 5000);
    expect(row.credit_fils).toBeGreaterThanOrEqual(creditBookings * 4000);
  });

  it('keeps unpaid money out of revenue and in outstanding. Rule 3', async () => {
    const row = await totals(coach, LAST_MONTH);
    const expected = scalar(`
      SELECT COALESCE(SUM(b.expected_fils - b.paid_fils),0) ${scope(LAST_MONTH)}`);

    expect(row.outstanding_fils).toBe(expected);
    expect(row.outstanding_fils).toBeGreaterThan(0);
    // 12.3: both figures, and the second is the first plus what is owed.
    expect(row.profit_if_collected_fils).toBe(row.profit_fils + row.outstanding_fils);
  });
});

describe('12.2 rule 2, a slot consumed and nothing contributed', () => {
  const ZERO_RATE = seededPlayer(6);
  const CREDIT_PLAYER = seededPlayer(21);

  it('counts a free guest, a 0 JD player and a coach slot as attendees worth nothing', async () => {
    const before = await totals(coach, CURRENT_MONTH);

    const session = await createSession({ startsInMinutes: -180, status: 'pending_review' });
    const service = serviceClient();

    // A free guest. D45: "Free guests fill empty spots and contribute no
    // revenue."
    await service.from('bookings').insert({
      session_id: session.id,
      attendee_kind: 'guest',
      guest_name: 'Report Guest',
      guest_tier: 'B',
      status: 'confirmed',
      source: 'admin_added',
      payment_method: 'free',
      payment_status: 'waived',
      expected_fils: 0,
      paid_fils: 0,
    });

    // A 0 JD custom rate player. D41: "0 is valid and expected."
    await createBookingRow({
      sessionId: session.id,
      playerId: ZERO_RATE.id,
      method: 'cash',
      expectedFils: 0,
    });

    // A coach slot. D47: "They occupy a court slot and pay nothing."
    await service.from('bookings').insert({
      session_id: session.id,
      attendee_kind: 'coach',
      player_id: USERS.assistant.id,
      status: 'confirmed',
      source: 'admin_added',
      payment_method: 'free',
      payment_status: 'waived',
      expected_fils: 0,
      paid_fils: 0,
      is_coach_slot: true,
    });

    const after = await totals(coach, CURRENT_MONTH);

    expect(after.attendee_count).toBe(before.attendee_count + 3);
    expect(after.revenue_fils).toBe(before.revenue_fils);
    expect(after.outstanding_fils).toBe(before.outstanding_fils);
  });

  it('values a credit booking at its own package rate, not the session price', async () => {
    const before = await totals(coach, CURRENT_MONTH);

    const session = await createSession({ startsInMinutes: -180, status: 'pending_review' });
    // The 40 visit, 160 JD package: 4.000 JD a visit. 11.1.
    const subscription = await grantSubscription(CREDIT_PLAYER.id, 40, 60, 40);

    await createBookingRow({
      sessionId: session.id,
      playerId: CREDIT_PLAYER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const after = await totals(coach, CURRENT_MONTH);

    expect(after.credit_fils - before.credit_fils).toBe(4000);
    expect(after.revenue_fils - before.revenue_fils).toBe(4000);
  });
});

// ─────────────────────────────────────────────────────────
// 12.1, cost allocation, and the 12.4 break-even table
// ─────────────────────────────────────────────────────────

describe('12.1, cost allocation', () => {
  it('is the sum of the three snapshotted parts', async () => {
    const row = await totals(coach, LAST_MONTH);
    expect(row.cost_fils).toBe(row.court_cost_fils + row.water_cost_fils + row.coach_fee_fils);
  });

  it('takes its cost from sessions that ran, not from cancelled ones', async () => {
    const row = await totals(coach, LAST_MONTH);
    const expected = scalar(`
      SELECT COALESCE(SUM(si.court_cost_share_fils + si.water_cost_fils + si.coach_fee_share_fils),0)
      FROM session_instances si
      WHERE si.session_date >= '${monthKeyToDate(LAST_MONTH)}'
        AND si.session_date <  '${monthEnd(LAST_MONTH)}'
        AND si.status <> 'cancelled'
        AND si.starts_at <= now()`);

    expect(row.cost_fils).toBe(expected);
  });

  it('counts a cancelled session on its own line and nowhere else', async () => {
    const before = await totals(coach, CURRENT_MONTH);

    await createSession({ startsInMinutes: -240, status: 'cancelled' });

    const after = await totals(coach, CURRENT_MONTH);

    expect(after.sessions_cancelled).toBe(before.sessions_cancelled + 1);
    expect(after.sessions_run).toBe(before.sessions_run);
    expect(after.cost_fils).toBe(before.cost_fils);
    expect(after.revenue_fils).toBe(before.revenue_fils);
  });

  /**
   * BUILD-SPEC 12.4, the break-even table, as a sanity check on the cost each
   * session carries. Every figure below is the table's, and the coach fee is
   * separated out because the table quotes a night with no assistant on it
   * while the seed puts one on Khalda Saturdays (D76: 10 JD for the night,
   * 5 JD to each of the two sessions).
   */
  const BREAK_EVEN = [
    {
      name: 'Khalda Monday, extended',
      venue: VENUES.khalda,
      weekday: 1,
      cost: 52500,
      price: 8000,
      players: 7,
    },
    {
      name: 'Khalda Thursday, each of two',
      venue: VENUES.khalda,
      weekday: 4,
      cost: 31250,
      price: 6000,
      players: 6,
    },
    {
      name: 'Shmeisani Sunday, each of two',
      venue: VENUES.shmeisani,
      weekday: 0,
      cost: 25000,
      price: 6000,
      players: 5,
    },
    {
      name: 'Shmeisani Tuesday, extended',
      venue: VENUES.shmeisani,
      weekday: 2,
      cost: 37500,
      price: 8000,
      players: 5,
    },
    {
      name: 'Shmeisani Friday',
      venue: VENUES.shmeisani,
      weekday: 5,
      cost: 23750,
      price: 6000,
      players: 4,
    },
  ] as const;

  for (const row of BREAK_EVEN) {
    it(`matches 12.4 for ${row.name}`, async () => {
      const { data, error } = await coach.rpc('report_session_table', {
        p_month: monthKeyToDate(LAST_MONTH),
      });
      expect(error).toBeNull();

      const ids = sql(`
        SELECT si.id
        FROM session_instances si
        WHERE si.venue_id = '${row.venue}'
          AND EXTRACT(DOW FROM si.session_date) = ${String(row.weekday)}
          AND si.session_date >= '${monthKeyToDate(LAST_MONTH)}'
          AND si.session_date <  '${monthEnd(LAST_MONTH)}'
          AND si.status <> 'cancelled'
          AND si.template_id IS NOT NULL`)
        .split('\n')
        .filter((line) => line !== '');

      expect(ids.length).toBeGreaterThan(0);

      const rows = (data ?? []).filter((session) => ids.includes(session.session_id));
      expect(rows.length).toBe(ids.length);

      for (const session of rows) {
        // The court share plus water, with the assistant's share, if any, on
        // top. 12.4 quotes the first two.
        const coachShare = scalar(`
          SELECT coach_fee_share_fils FROM session_instances WHERE id = '${session.session_id}'`);

        expect(session.cost_fils - coachShare).toBe(row.cost);
        // The table's last column: how many at list price cover that cost.
        expect(Math.ceil(row.cost / row.price)).toBe(row.players);
      }
    });
  }
});

describe('12.3, an unpaid assistant coach is accrued, not spent', () => {
  it('moves the fee out of cash spent while leaving it in the cost', async () => {
    const paidRow = await totals(coach, LAST_MONTH);
    expect(paidRow.coach_fee_accrued_fils).toBe(0);
    expect(paidRow.cash_cost_fils).toBe(paidRow.cost_fils);

    // One seeded night's assistant, marked unpaid behind the coach's back.
    const target = sql(`
      SELECT sc.id
      FROM session_coaches sc
      JOIN session_instances si ON si.id = sc.session_id
      WHERE si.session_date >= '${monthKeyToDate(LAST_MONTH)}'
        AND si.session_date <  '${monthEnd(LAST_MONTH)}'
        AND sc.is_paid
      ORDER BY si.starts_at
      LIMIT 1`);
    expect(target).not.toBe('');

    const share = scalar(`SELECT fee_share_fils FROM session_coaches WHERE id = '${target}'`);
    expect(share).toBeGreaterThan(0);

    sql(`UPDATE session_coaches SET is_paid = false, paid_at = NULL WHERE id = '${target}'`);

    try {
      const accruedRow = await totals(coach, LAST_MONTH);

      expect(accruedRow.coach_fee_accrued_fils).toBe(share);
      // Still a cost: the academy owes it either way. 12.3.
      expect(accruedRow.cost_fils).toBe(paidRow.cost_fils);
      expect(accruedRow.profit_fils).toBe(paidRow.profit_fils);
      // But not cash that has left.
      expect(accruedRow.cash_cost_fils).toBe(paidRow.cost_fils - share);
    } finally {
      sql(`UPDATE session_coaches SET is_paid = true, paid_at = now() WHERE id = '${target}'`);
    }
  });
});

// ─────────────────────────────────────────────────────────
// The remaining sections of 15.12
// ─────────────────────────────────────────────────────────

describe('15.12 section 2, sessions', () => {
  it('counts the sessions that ran and their capacity', async () => {
    const row = await totals(coach, LAST_MONTH);
    const expected = scalar(`
      SELECT COUNT(*)
      FROM session_instances si
      WHERE si.session_date >= '${monthKeyToDate(LAST_MONTH)}'
        AND si.session_date <  '${monthEnd(LAST_MONTH)}'
        AND si.status <> 'cancelled'
        AND si.starts_at <= now()`);

    expect(row.sessions_run).toBe(expected);
    expect(row.capacity_total).toBeGreaterThanOrEqual(row.attendee_count);
  });
});

describe('15.12 section 5, attendance by slot', () => {
  it('groups by recurring template and leaves one-off sessions out', async () => {
    const { data, error } = await coach.rpc('report_slot_attendance', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error).toBeNull();

    // Twelve templates, section 3.1, and a full month runs all of them.
    expect(data?.length).toBe(12);

    for (const slot of data ?? []) {
      expect(slot.capacity_total).toBe(
        slot.sessions_run * 4 * (slot.venue_id === VENUES.khalda ? 4 : 3),
      );
      expect(slot.attendee_total).toBeLessThanOrEqual(slot.capacity_total);
    }
  });

  it('adds up to the same attendance the month reports', async () => {
    const row = await totals(coach, LAST_MONTH);
    const { data } = await coach.rpc('report_slot_attendance', {
      p_month: monthKeyToDate(LAST_MONTH),
    });

    const fromSlots = (data ?? []).reduce((sum, slot) => sum + slot.attendee_total, 0);
    const oneOffs = scalar(`
      SELECT COUNT(*) ${scope(LAST_MONTH)} AND si.template_id IS NULL`);

    expect(fromSlots + oneOffs).toBe(row.attendee_count);
  });
});

describe('15.12 section 6, fill rate by venue', () => {
  it('covers both venues and only those two. D1, D2', async () => {
    const { data, error } = await coach.rpc('report_venue_fill', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error).toBeNull();

    expect(data?.map((venue) => venue.venue_id).sort()).toEqual(
      [VENUES.khalda, VENUES.shmeisani].sort(),
    );
  });

  it('adds up to the month', async () => {
    const row = await totals(coach, LAST_MONTH);
    const { data } = await coach.rpc('report_venue_fill', {
      p_month: monthKeyToDate(LAST_MONTH),
    });

    const summed = (data ?? []).reduce(
      (sum, venue) => ({
        sessions: sum.sessions + venue.sessions_run,
        players: sum.players + venue.attendee_total,
        capacity: sum.capacity + venue.capacity_total,
      }),
      { sessions: 0, players: 0, capacity: 0 },
    );

    expect(summed).toEqual({
      sessions: row.sessions_run,
      players: row.attendee_count,
      capacity: row.capacity_total,
    });
  });
});

describe('15.12 section 7, subscriptions', () => {
  it('counts what was granted this month at the rate it was granted at', async () => {
    const { data, error } = await coach.rpc('report_subscriptions', {
      p_month: monthKeyToDate(CURRENT_MONTH),
    });
    expect(error).toBeNull();

    const expected = scalar(`
      SELECT COALESCE(SUM(s.granted_visits * s.per_visit_fils),0)
      FROM player_subscriptions s
      WHERE (s.created_at AT TIME ZONE 'Asia/Amman')::date >= '${monthKeyToDate(CURRENT_MONTH)}'
        AND (s.created_at AT TIME ZONE 'Asia/Amman')::date <  '${monthEnd(CURRENT_MONTH)}'`);

    expect(data?.[0]?.sold_value_fils).toBe(expected);
  });

  it('nets a refunded credit off the credits used', async () => {
    const player21 = seededPlayer(22);
    const subscription = await grantSubscription(player21.id, 8, 45, 8);
    const service = serviceClient();

    const before = await coach.rpc('report_subscriptions', {
      p_month: monthKeyToDate(CURRENT_MONTH),
    });

    await service.from('credit_transactions').insert([
      { subscription_id: subscription, player_id: player21.id, delta: -1, reason: 'booking' },
      {
        subscription_id: subscription,
        player_id: player21.id,
        delta: 1,
        reason: 'booking_refund',
      },
    ]);

    const after = await coach.rpc('report_subscriptions', {
      p_month: monthKeyToDate(CURRENT_MONTH),
    });

    // 9.3: a cancelled credit booking consumed nothing, so the month did not
    // use a credit either.
    expect((after.data?.[0]?.credits_used ?? 0) - (before.data?.[0]?.credits_used ?? 0)).toBe(0);
  });
});

describe('15.12 section 8, outstanding', () => {
  it('reports the debt book and at most ten names', async () => {
    const row = await totals(coach, LAST_MONTH);
    const expected = scalar(`SELECT COALESCE(SUM(amount_fils),0) FROM balance_entries`);

    expect(row.owed_to_date_fils).toBe(expected);

    const { data, error } = await coach.rpc('report_outstanding', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeLessThanOrEqual(10);
  });

  it('orders by what each debtor owes, largest first, and owes nobody nothing', async () => {
    const { data } = await coach.rpc('report_outstanding', {
      p_month: monthKeyToDate(LAST_MONTH),
    });

    const owed = (data ?? []).map((debtor) => debtor.owed_fils);
    expect([...owed].sort((a, b) => b - a)).toEqual(owed);
    for (const amount of owed) expect(amount).toBeGreaterThan(0);
  });
});

describe('15.12 section 9, players', () => {
  it('counts who was on a court this month against last', async () => {
    const { data, error } = await coach.rpc('report_players', {
      p_month: monthKeyToDate(LAST_MONTH),
    });
    expect(error).toBeNull();

    const expected = scalar(`
      SELECT COUNT(DISTINCT b.player_id) ${scope(LAST_MONTH)} AND b.player_id IS NOT NULL`);
    const previous = scalar(`
      SELECT COUNT(DISTINCT b.player_id) ${scope(shiftMonthKey(LAST_MONTH, -1))}
        AND b.player_id IS NOT NULL`);

    expect(data?.[0]?.active_this_month).toBe(expected);
    expect(data?.[0]?.active_previous_month).toBe(previous);
  });
});

describe('an empty month', () => {
  it('answers with zeroes rather than with nothing', async () => {
    // A month long before the seed's history begins.
    const row = await totals(coach, shiftMonthKey(CURRENT_MONTH, -24));

    expect(row.sessions_run).toBe(0);
    expect(row.revenue_fils).toBe(0);
    expect(row.cost_fils).toBe(0);
    expect(row.profit_fils).toBe(0);
  });
});
