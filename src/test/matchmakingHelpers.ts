/**
 * Shared scaffolding for the matchmaking suite. BUILD-SPEC 19.2 asks for
 * asserted *properties*, not asserted output, so most of what is here turns a
 * lineup back into the sort of statement the coach would make about it: who
 * partnered whom, how tight a court was, who rested.
 */
import { pairKey } from '@/features/matchmaking/scoring';
import {
  type Attendee,
  type Court,
  type LineupInput,
  type Rotation,
} from '@/features/matchmaking/types';

export function makeAttendees(tierValues: readonly number[], prefix = 'p'): Attendee[] {
  return tierValues.map((tierValue, index) => ({
    bookingId: `${prefix}${index + 1}`,
    displayName: `Player ${index + 1}`,
    tierValue,
    isCoach: false,
  }));
}

export function makeInput(
  overrides: Partial<LineupInput> & { attendees: Attendee[] },
): LineupInput {
  return {
    sessionId: 'session-1',
    sessionType: 'standard',
    courtCount: 4,
    rotationCount: 4,
    lockedCourts: [],
    pairingRules: [],
    seed: 1234,
    ...overrides,
  };
}

export function teamsOf(rotation: Rotation): readonly (readonly string[])[] {
  return rotation.courts.flatMap((court) => [court.team1, court.team2]);
}

export function playersOf(rotation: Rotation): string[] {
  return rotation.courts.flatMap((court) => [...court.team1, ...court.team2]);
}

export function courtSizes(rotation: Rotation): number[] {
  return rotation.courts.map((court) => court.team1.length + court.team2.length);
}

/** Every partnership in one rotation, as order-independent keys. */
export function partnershipsOf(rotation: Rotation): string[] {
  return teamsOf(rotation)
    .filter((team) => team.length === 2)
    .map((team) => pairKey(team[0] ?? '', team[1] ?? ''));
}

export function tierSpread(court: Court, tierOf: (id: string) => number): number {
  const values = [...court.team1, ...court.team2].map(tierOf);
  return Math.max(...values) - Math.min(...values);
}

export function tierLookup(attendees: readonly Attendee[]): (id: string) => number {
  const map = new Map(attendees.map((a) => [a.bookingId, a.tierValue]));
  return (id: string) => map.get(id) ?? 0;
}

/** A monotonic fake clock, so the time budget can be tested without waiting. */
export function fakeClock(startMs = 0, stepMs = 0): () => number {
  let value = startMs;
  return () => {
    const current = value;
    value += stepMs;
    return current;
  };
}
