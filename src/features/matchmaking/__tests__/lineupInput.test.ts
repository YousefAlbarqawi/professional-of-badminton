/**
 * Turning a roster into engine input. 13.1, 13.10, D44, D65.
 */
import {
  buildLineupInput,
  splitDisplayName,
  toAttendee,
  toBoardPlayers,
  toEnginePairingRules,
  type LineupAttendeeSource,
} from '../lineupInput';
import type { PairingRuleSummary } from '../boardTypes';

function source(overrides: Partial<LineupAttendeeSource> = {}): LineupAttendeeSource {
  return {
    bookingId: 'b1',
    displayName: 'Yousef Alkhatib',
    tier: 'A',
    isCoachSlot: false,
    playerId: 'p1',
    ...overrides,
  };
}

describe('splitDisplayName, 13.10', () => {
  it('splits a registered player at the first space', () => {
    expect(splitDisplayName('Yousef Alkhatib')).toEqual({
      firstName: 'Yousef',
      familyName: 'Alkhatib',
    });
  });

  it('keeps everything after the first space as the family name', () => {
    expect(splitDisplayName('Rana Al Haddad')).toEqual({
      firstName: 'Rana',
      familyName: 'Al Haddad',
    });
  });

  it('treats a one word guest name as a first name. D44', () => {
    expect(splitDisplayName('Sami')).toEqual({ firstName: 'Sami', familyName: '' });
  });

  it('tolerates the spacing a coach types under pressure', () => {
    expect(splitDisplayName('  Sami   Nabil  ')).toEqual({
      firstName: 'Sami',
      familyName: 'Nabil',
    });
  });
});

describe('toAttendee, 13.1', () => {
  it('maps a tier to its numeric value', () => {
    expect(toAttendee(source({ tier: 'A+' })).tierValue).toBe(9);
    expect(toAttendee(source({ tier: 'C-' })).tierValue).toBe(1);
  });

  it('defaults an unrated player to 5, which is B. A11', () => {
    expect(toAttendee(source({ tier: null })).tierValue).toBe(5);
  });

  it('leaves the tier itself null so the badge can mark him unrated', () => {
    const players = toBoardPlayers([source({ tier: null })]);
    expect(players.get('b1')?.tier).toBeNull();
  });

  it('carries the coach flag through. D47', () => {
    expect(toAttendee(source({ isCoachSlot: true })).isCoach).toBe(true);
  });
});

describe('toEnginePairingRules, D65', () => {
  const rule: PairingRuleSummary = {
    id: 'r1',
    kind: 'never_pair',
    playerAId: 'p1',
    playerAName: 'A',
    playerBId: 'p2',
    playerBName: 'B',
  };

  it('translates profile ids into the booking ids the engine works in', () => {
    const attendees = [
      source({ bookingId: 'b1', playerId: 'p1' }),
      source({ bookingId: 'b2', playerId: 'p2' }),
    ];
    expect(toEnginePairingRules([rule], attendees)).toEqual([
      { kind: 'never_pair', bookingIdA: 'b1', bookingIdB: 'b2' },
    ]);
  });

  it('drops a rule whose other half is not attending', () => {
    const attendees = [source({ bookingId: 'b1', playerId: 'p1' })];
    expect(toEnginePairingRules([rule], attendees)).toEqual([]);
  });

  it('never matches a guest, who has no profile. D44, D46', () => {
    const attendees = [
      source({ bookingId: 'b1', playerId: 'p1' }),
      source({ bookingId: 'b2', playerId: null, displayName: 'Sami' }),
    ];
    expect(toEnginePairingRules([rule], attendees)).toEqual([]);
  });
});

describe('buildLineupInput', () => {
  const session = {
    id: 's1',
    sessionType: 'standard' as const,
    courtCount: 4,
    rotationCount: 4,
  };

  it('carries the session, the roster, the locks and the rules', () => {
    const input = buildLineupInput({
      session,
      attendees: [source({ bookingId: 'b1' }), source({ bookingId: 'b2', playerId: 'p2' })],
      lockedCourts: [{ courtNumber: 2, bookingIds: ['b1', 'b2'] }],
      pairingRules: [],
    });

    expect(input).toMatchObject({
      sessionId: 's1',
      sessionType: 'standard',
      courtCount: 4,
      rotationCount: 4,
    });
    expect(input.attendees).toHaveLength(2);
    expect(input.lockedCourts).toEqual([{ courtNumber: 2, bookingIds: ['b1', 'b2'] }]);
  });

  it('omits the seed rather than passing undefined, so the engine uses the clock', () => {
    const input = buildLineupInput({
      session,
      attendees: [source()],
      lockedCourts: [],
      pairingRules: [],
    });
    expect('seed' in input).toBe(false);
  });

  it('passes a seed through when one is given', () => {
    const input = buildLineupInput({
      session,
      attendees: [source()],
      lockedCourts: [],
      pairingRules: [],
      seed: 42,
    });
    expect(input.seed).toBe(42);
  });
});
