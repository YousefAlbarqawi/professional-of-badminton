import { signIn, type Client } from './helpers/clients';
import { SESSIONS, USERS } from './helpers/fixtures';

/**
 * "An admin can read everything except the report views." D16 and D73: admins
 * can do everything the coach can do except view reports.
 *
 * audit_log is the second coach-only surface. It is not a report, but it is
 * the same boundary, and it is a table rather than a view so the two are
 * enforced by different mechanisms and are worth asserting separately.
 */

const STAFF_READABLE = [
  'profiles',
  'venues',
  'venue_night_costs',
  'consumable_costs',
  'coach_fee_rates',
  'session_templates',
  'session_instances',
  'bookings',
  'waitlist_entries',
  'payment_proofs',
  'balance_entries',
  'packages',
  'player_subscriptions',
  'credit_transactions',
  'session_coaches',
  'rotations',
  'court_assignments',
  'pairing_rules',
  'announcements',
  'device_tokens',
] as const;

describe('staff access', () => {
  let admin: Client;
  let coach: Client;
  let assistant: Client;

  beforeAll(async () => {
    [admin, coach, assistant] = await Promise.all([
      signIn(USERS.admin.email),
      signIn(USERS.coach.email),
      signIn(USERS.assistant.email),
    ]);
  });

  describe('the admin', () => {
    it.each(STAFF_READABLE)('reads %s', async (table) => {
      const { data, error } = await admin.from(table).select('*').limit(5);
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it('reads every profile, not just his own', async () => {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true });
      expect(count).toBe(44);
    });

    it('reads sessions outside the player booking window', async () => {
      const { data } = await admin
        .from('session_instances')
        .select('id')
        .eq('id', SESSIONS.outsideWindow);

      expect(data).toHaveLength(1);
    });

    it('reads cancelled sessions', async () => {
      const { data } = await admin
        .from('session_instances')
        .select('id')
        .eq('id', SESSIONS.cancelled);

      expect(data).toHaveLength(1);
    });

    it('is refused the report view', async () => {
      const { data, error } = await admin.from('v_session_financials').select('*').limit(5);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('is refused the audit log', async () => {
      const { data, error } = await admin.from('audit_log').select('*').limit(5);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('the coach', () => {
    it.each(STAFF_READABLE)('reads %s', async (table) => {
      const { data, error } = await coach.from(table).select('*').limit(5);
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it('reads the report view', async () => {
      const { data, error } = await coach.from('v_session_financials').select('*').limit(5);

      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it('reads the audit log', async () => {
      const { data, error } = await coach.from('audit_log').select('*').limit(5);

      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it('values a session by its own cost snapshot and paid money only', async () => {
      const { data } = await coach
        .from('v_session_financials')
        .select('*')
        .eq('session_id', SESSIONS.pastWithOwnBooking)
        .single();

      expect(data?.cash_revenue_fils).toBe(6000);
      expect(data?.credit_revenue_fils).toBe(0);
      expect(data?.cost_fils).toBe(31250);
      expect(data?.outstanding_fils).toBe(0);
    });
  });

  describe('an assistant coach', () => {
    // A14 gives him Today and the court board, and that read path is built
    // with the court board in phase 7. Today he is not staff, and section 7.3
    // does not list him. This test records where the boundary currently sits.
    it('is not staff', async () => {
      const { data } = await assistant.rpc('is_staff');
      expect(data).toBe(false);
    });

    it('cannot read the court board yet', async () => {
      const { data } = await assistant.from('court_assignments').select('*');
      expect(data).toEqual([]);
    });

    it('cannot read the report view', async () => {
      const { data } = await assistant.from('v_session_financials').select('*');
      expect(data).toEqual([]);
    });
  });
});
