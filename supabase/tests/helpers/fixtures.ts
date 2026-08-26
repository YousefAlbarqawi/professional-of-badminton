/**
 * Ids and accounts from supabase/seed.sql, part 2. Every one of these is a
 * dev-only fixture. If the seed changes, this file changes with it.
 */

export const PASSWORD = 'password123';

export const USERS = {
  /** visibility level_0 — sees counts and his own row, nothing else */
  level0: { email: 'player001@pob.test', id: '33333333-3333-4333-8333-000000000001' },
  /** visibility level_1 — sees tiers, no names */
  level1: { email: 'player002@pob.test', id: '33333333-3333-4333-8333-000000000002' },
  /** visibility level_2 — sees tiers and names */
  level2: { email: 'player003@pob.test', id: '33333333-3333-4333-8333-000000000003' },
  /** pays by CliQ on the fixture session, and owns the one payment proof */
  cliqPlayer: { email: 'player004@pob.test', id: '33333333-3333-4333-8333-000000000004' },
  /** not booked on the fixture session at all */
  outsider: { email: 'player020@pob.test', id: '33333333-3333-4333-8333-000000000020' },
  /**
   * Reserved for the profile guard tests, which promote and demote him. No
   * other test asserts anything about this account, so they can mutate it
   * without disturbing the visibility fixtures.
   */
  guardSubject: { email: 'player040@pob.test', id: '33333333-3333-4333-8333-000000000040' },
  admin: { email: 'admin1@pob.test', id: '44444444-4444-4444-8444-000000000002' },
  coach: { email: 'coach@pob.test', id: '44444444-4444-4444-8444-000000000001' },
  assistant: { email: 'assistant@pob.test', id: '44444444-4444-4444-8444-000000000004' },
} as const;

export const SESSIONS = {
  /** today + 1, inside the booking window, six confirmed attendees */
  open: '22222222-2222-4222-8222-000000000001',
  /** today + 10, beyond the 5 day window */
  outsideWindow: '22222222-2222-4222-8222-000000000002',
  /** today + 2, inside the window but cancelled, nobody booked */
  cancelled: '22222222-2222-4222-8222-000000000003',
  /** today - 3, in the past, and level0 has a booking on it */
  pastWithOwnBooking: '22222222-2222-4222-8222-000000000004',
} as const;

export const BOOKINGS = {
  level0OnOpenSession: '55555555-5555-4555-8555-000000000001',
  cliqPlayerOnOpenSession: '55555555-5555-4555-8555-000000000004',
  guestOnOpenSession: '55555555-5555-4555-8555-000000000006',
  level0OnPastSession: '55555555-5555-4555-8555-000000000007',
} as const;

/** Confirmed attendees on SESSIONS.open: five players and one guest. */
export const OPEN_SESSION_ATTENDEE_COUNT = 6;

export const VENUES = {
  khalda: '11111111-1111-4111-8111-000000000001',
  shmeisani: '11111111-1111-4111-8111-000000000002',
} as const;
