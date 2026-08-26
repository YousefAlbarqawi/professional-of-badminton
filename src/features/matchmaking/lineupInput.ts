/**
 * Turning a session's roster into something the engine can generate from, and
 * turning what it generates back into something the board can draw.
 *
 * Pure, like the engine, and separately testable. The mapping is not
 * mechanical: three of BUILD-SPEC's rules live in this file rather than in the
 * engine, because they are about what a booking *means* rather than about who
 * plays with whom.
 */
import { tierValueOrDefault, type Tier } from '@/lib/tiers';

import type { BoardPlayer, PairingRuleSummary } from './boardTypes';
import type { Attendee, LineupInput, LineupSessionType, PairingRule } from './types';

/** As much of a session as the engine needs. */
export interface LineupSession {
  id: string;
  sessionType: LineupSessionType;
  courtCount: number;
  rotationCount: number;
}

/** As much of a roster row as the engine and the tiles need. */
export interface LineupAttendeeSource {
  bookingId: string;
  displayName: string;
  tier: Tier | null;
  isCoachSlot: boolean;
  /** Null for a guest. D44, D46. */
  playerId: string | null;
}

/**
 * "First name in large bold text, family name smaller." 13.10.
 *
 * A registered player's name is `first last`, so the first space is the split.
 * A guest is whatever the coach typed, often one word (D44), and one word is a
 * first name with no family name rather than a family name with no first.
 */
export function splitDisplayName(displayName: string): { firstName: string; familyName: string } {
  const trimmed = displayName.trim().replace(/\s+/g, ' ');
  const space = trimmed.indexOf(' ');
  if (space === -1) return { firstName: trimmed, familyName: '' };
  return { firstName: trimmed.slice(0, space), familyName: trimmed.slice(space + 1) };
}

export function toBoardPlayer(source: LineupAttendeeSource): BoardPlayer {
  const { firstName, familyName } = splitDisplayName(source.displayName);
  return {
    bookingId: source.bookingId,
    firstName,
    familyName,
    tier: source.tier,
    isCoachSlot: source.isCoachSlot,
  };
}

export function toBoardPlayers(sources: readonly LineupAttendeeSource[]): Map<string, BoardPlayer> {
  return new Map(sources.map((source) => [source.bookingId, toBoardPlayer(source)]));
}

/**
 * 13.1: "A player with no tier assigned defaults to 5 (B) for the purposes of
 * generation, and the UI shows a subtle 'unrated' marker so the coach can fix
 * it." `tierValueOrDefault` is that default; the marker is `TierBadge`'s
 * dashed outline, which is why the tier itself stays null on `BoardPlayer`.
 */
export function toAttendee(source: LineupAttendeeSource): Attendee {
  return {
    bookingId: source.bookingId,
    displayName: source.displayName,
    tierValue: tierValueOrDefault(source.tier),
    isCoach: source.isCoachSlot,
  };
}

/**
 * Pairing rules are stored against profiles, because two brothers are two
 * brothers on any night (D65). The engine works in booking ids, so a rule
 * only applies when both players hold a booking on this session — and a guest,
 * having no profile, can never be either half of one.
 */
export function toEnginePairingRules(
  rules: readonly PairingRuleSummary[],
  attendees: readonly LineupAttendeeSource[],
): PairingRule[] {
  const bookingByPlayer = new Map<string, string>();
  for (const attendee of attendees) {
    if (attendee.playerId !== null) bookingByPlayer.set(attendee.playerId, attendee.bookingId);
  }

  const applicable: PairingRule[] = [];
  for (const rule of rules) {
    const a = bookingByPlayer.get(rule.playerAId);
    const b = bookingByPlayer.get(rule.playerBId);
    if (a === undefined || b === undefined) continue;
    applicable.push({ kind: rule.kind, bookingIdA: a, bookingIdB: b });
  }
  return applicable;
}

export interface BuildLineupInputOptions {
  session: LineupSession;
  attendees: readonly LineupAttendeeSource[];
  /** Court number to its four booking ids. 13.8: locked courts survive. */
  lockedCourts: readonly { courtNumber: number; bookingIds: readonly string[] }[];
  pairingRules: readonly PairingRuleSummary[];
  seed?: number;
}

export function buildLineupInput({
  session,
  attendees,
  lockedCourts,
  pairingRules,
  seed,
}: BuildLineupInputOptions): LineupInput {
  const base: LineupInput = {
    sessionId: session.id,
    sessionType: session.sessionType,
    courtCount: session.courtCount,
    rotationCount: session.rotationCount,
    attendees: attendees.map(toAttendee),
    lockedCourts: lockedCourts.map((court) => ({
      courtNumber: court.courtNumber,
      bookingIds: [...court.bookingIds],
    })),
    pairingRules: toEnginePairingRules(pairingRules, attendees),
  };

  // exactOptionalPropertyTypes: `seed: undefined` is not the same as omitting
  // it, and 13.1 wants it omitted so the engine falls back to the clock.
  return seed === undefined ? base : { ...base, seed };
}
