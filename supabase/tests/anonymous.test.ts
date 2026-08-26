import { anonClient, type Client } from './helpers/clients';
import { SESSIONS } from './helpers/fixtures';

/**
 * "A psql session as an anonymous role can read nothing." Phase 1, section 20.
 *
 * Every policy in 0012 is scoped TO authenticated, so a table returns an empty
 * set rather than an error: there is simply no policy that matches. The views
 * are a different mechanism — SELECT is revoked from anon outright — so those
 * come back as a permission error. Both are proven here, because a test that
 * accepted either would pass against a table that had accidentally been
 * granted and returned rows on a different day.
 */

const TABLES = [
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
  'rotation_sitouts',
  'locked_courts',
  'pairing_rules',
  'announcements',
  'device_tokens',
  'audit_log',
] as const;

const VIEWS = [
  'v_player_credit_balance',
  'v_player_total_balance',
  'v_session_occupancy',
  'v_session_financials',
] as const;

describe('the anonymous role', () => {
  let anon: Client;

  beforeAll(() => {
    anon = anonClient();
  });

  it('holds no session', async () => {
    const { data } = await anon.auth.getSession();
    expect(data.session).toBeNull();
  });

  it.each(TABLES)('reads no rows from %s', async (table) => {
    const { data, error } = await anon.from(table).select('*').limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(VIEWS)('is refused by %s', async (view) => {
    const { data, error } = await anon.from(view).select('*').limit(5);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('cannot call get_session_attendees', async () => {
    const { error } = await anon.rpc('get_session_attendees', { p_session_id: SESSIONS.open });
    expect(error).not.toBeNull();
  });

  it('cannot write anywhere', async () => {
    const { error } = await anon.from('waitlist_entries').insert({
      session_id: SESSIONS.open,
      player_id: '33333333-3333-4333-8333-000000000030',
    });
    expect(error).not.toBeNull();
  });
});
