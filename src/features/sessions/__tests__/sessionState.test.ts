/**
 * The eight states of 14.7, and the schedule's day grouping.
 *
 * BUILD-SPEC 19.1 asks that "the primary action button matches the state table
 * in Section 14.7 for all eight states". This proves the decision; the
 * component test proves the button.
 */
import {
  SESSION_ACTION_STATES,
  groupByAmmanDay,
  isPastReservationCutoff,
  isVisibleOnPlayerSchedule,
  sessionActionState,
  type SessionActionInput,
} from '../sessionState';
import { parseInstant } from '@/lib/time';

const HOUR = 60 * 60 * 1000;

/** 2026-08-24 is a Monday. 19:00 Amman is 16:00 UTC. */
const START = parseInstant('2026-08-24T16:00:00Z');
const END = parseInstant('2026-08-24T17:30:00Z');

function at(offsetFromStartMs: number): Date {
  return new Date(START.getTime() + offsetFromStartMs);
}

function input(overrides: Partial<SessionActionInput> = {}): SessionActionInput {
  return {
    status: 'scheduled',
    startsAt: START,
    endsAt: END,
    remaining: 7,
    isBooked: false,
    isOnWaitlist: false,
    now: at(-24 * HOUR),
    ...overrides,
  };
}

describe('sessionActionState', () => {
  it('offers a reservation when there are spots and the cutoff is ahead', () => {
    expect(sessionActionState(input())).toBe('open');
  });

  it('offers the waiting list when the session is full', () => {
    expect(sessionActionState(input({ remaining: 0 }))).toBe('full');
  });

  it('offers to leave the waiting list when he is already on it', () => {
    expect(sessionActionState(input({ remaining: 0, isOnWaitlist: true }))).toBe('on_waitlist');
  });

  it('offers cancellation more than three hours out', () => {
    expect(sessionActionState(input({ isBooked: true, now: at(-3 * HOUR - 60_000) }))).toBe(
      'booked_cancellable',
    );
  });

  it('withdraws cancellation inside three hours', () => {
    // D23 and D24, tested at 3h01m and 2h59m as 19.1 asks.
    expect(sessionActionState(input({ isBooked: true, now: at(-3 * HOUR + 60_000) }))).toBe(
      'booked_locked',
    );
  });

  it('treats exactly three hours out as too late', () => {
    expect(sessionActionState(input({ isBooked: true, now: at(-3 * HOUR) }))).toBe('booked_locked');
  });

  it('closes booking one hour before the start', () => {
    expect(sessionActionState(input({ now: at(-HOUR + 60_000) }))).toBe('closed');
    expect(sessionActionState(input({ now: at(-HOUR) }))).toBe('closed');
    expect(sessionActionState(input({ now: at(-HOUR - 60_000) }))).toBe('open');
  });

  it('closes booking for a waitlisted player too, once the cutoff passes', () => {
    // D28: a spot opening inside the last hour is invisible to the list, so
    // offering him control over it would be a lie.
    expect(sessionActionState(input({ isOnWaitlist: true, now: at(-HOUR + 60_000) }))).toBe(
      'closed',
    );
  });

  it('reports a cancelled session ahead of everything else', () => {
    expect(sessionActionState(input({ status: 'cancelled', isBooked: true }))).toBe('cancelled');
    expect(sessionActionState(input({ status: 'cancelled', remaining: 0 }))).toBe('cancelled');
  });

  it('reports an ended session once it is over, however he stands', () => {
    const afterwards = new Date(END.getTime() + 60_000);
    expect(sessionActionState(input({ now: afterwards }))).toBe('ended');
    expect(sessionActionState(input({ isBooked: true, now: afterwards }))).toBe('ended');
    expect(sessionActionState(input({ status: 'pending_review' }))).toBe('ended');
    expect(sessionActionState(input({ status: 'confirmed' }))).toBe('ended');
    expect(sessionActionState(input({ status: 'locked' }))).toBe('ended');
  });

  it('keeps a booked player on the booked branch while the session runs', () => {
    // in_progress is not ended: he is at the venue, and D24 means only the
    // coach can remove him.
    expect(
      sessionActionState(input({ status: 'in_progress', isBooked: true, now: at(30 * 60_000) })),
    ).toBe('booked_locked');
  });

  it('is total: every input lands on one of the eight named states', () => {
    const statuses = [
      'scheduled',
      'in_progress',
      'pending_review',
      'confirmed',
      'locked',
      'cancelled',
    ] as const;
    const moments = [-48 * HOUR, -4 * HOUR, -2 * HOUR, -30 * 60_000, 60 * 60_000, 4 * HOUR];
    const seen = new Set<string>();

    for (const status of statuses) {
      for (const offset of moments) {
        for (const remaining of [0, 7]) {
          for (const isBooked of [false, true]) {
            for (const isOnWaitlist of [false, true]) {
              const state = sessionActionState(
                input({ status, now: at(offset), remaining, isBooked, isOnWaitlist }),
              );
              expect(SESSION_ACTION_STATES).toContain(state);
              seen.add(state);
            }
          }
        }
      }
    }

    // Not just valid — every one of the eight is reachable.
    expect([...seen].sort()).toEqual([...SESSION_ACTION_STATES].sort());
  });

  it('names exactly eight states', () => {
    expect(SESSION_ACTION_STATES).toHaveLength(8);
  });
});

describe('isPastReservationCutoff', () => {
  it('draws the line one hour before the start', () => {
    expect(isPastReservationCutoff(START, at(-HOUR - 1))).toBe(false);
    expect(isPastReservationCutoff(START, at(-HOUR))).toBe(true);
  });
});

describe('isVisibleOnPlayerSchedule', () => {
  it('keeps a session that has started but not finished', () => {
    // 5.2: shown as closed, not hidden.
    expect(isVisibleOnPlayerSchedule({ status: 'in_progress', endsAt: END }, at(30 * 60_000))).toBe(
      true,
    );
  });

  it('hides a session that has finished', () => {
    expect(
      isVisibleOnPlayerSchedule({ status: 'scheduled', endsAt: END }, new Date(END.getTime() + 1)),
    ).toBe(false);
    expect(isVisibleOnPlayerSchedule({ status: 'pending_review', endsAt: END }, at(0))).toBe(false);
  });

  it('hides a cancelled session from the schedule', () => {
    expect(isVisibleOnPlayerSchedule({ status: 'cancelled', endsAt: END }, at(-24 * HOUR))).toBe(
      false,
    );
  });
});

describe('groupByAmmanDay', () => {
  it('buckets by the Amman calendar day, not the UTC one', () => {
    // 21:00 UTC on the 24th is 00:00 Amman on the 25th. A naive UTC grouping
    // would file this under the 24th.
    const sessions = [
      { startsAt: parseInstant('2026-08-24T16:00:00Z') },
      { startsAt: parseInstant('2026-08-24T17:30:00Z') },
      { startsAt: parseInstant('2026-08-24T21:00:00Z') },
    ];

    const days = groupByAmmanDay(sessions);

    expect(days.map((day) => day.dayKey)).toEqual(['2026-08-24', '2026-08-25']);
    expect(days[0]?.sessions).toHaveLength(2);
    expect(days[1]?.sessions).toHaveLength(1);
  });

  it('preserves the order it was given', () => {
    const sessions = [
      { id: 'a', startsAt: parseInstant('2026-08-24T16:00:00Z') },
      { id: 'b', startsAt: parseInstant('2026-08-24T17:30:00Z') },
    ];

    expect(groupByAmmanDay(sessions)[0]?.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for nothing', () => {
    expect(groupByAmmanDay([])).toEqual([]);
  });
});
