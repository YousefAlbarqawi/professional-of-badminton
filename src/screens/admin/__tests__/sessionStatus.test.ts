/**
 * The staff status helpers. 15.1, 15.4, 5.5.
 */
import type { Session } from '@/features/sessions/types';
import type { Fils } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import {
  isCancellable,
  isEditable,
  showsCourtBoard,
  statusLabelKey,
  statusTone,
} from '../sessionStatus';

const START = parseInstant('2026-08-24T16:00:00Z');
const MINUTE = 60 * 1000;

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    venue: { id: 'v1', name: 'Khalda', area: 'Khalda', googleMapsUrl: null },
    sessionDate: '2026-08-24',
    startsAt: START,
    endsAt: parseInstant('2026-08-24T17:30:00Z'),
    sessionType: 'standard',
    priceFils: 6000 as Fils,
    courtCount: 4,
    rotationCount: 4,
    status: 'scheduled',
    occupancy: { capacity: 16, taken: 8, remaining: 8 },
    notes: null,
    cancellationNote: null,
    ...overrides,
  };
}

describe('statusLabelKey and statusTone', () => {
  it('gives pending_review the one tone that asks for something', () => {
    expect(statusTone('pending_review')).toBe('warning');
    expect(statusLabelKey('pending_review')).toBe('admin.status.pendingReview');
  });
});

describe('isEditable and isCancellable, 5.5', () => {
  it('refuses a locked or cancelled session', () => {
    expect(isEditable('locked')).toBe(false);
    expect(isEditable('cancelled')).toBe(false);
    expect(isEditable('scheduled')).toBe(true);
  });

  it('cancels only what has not happened yet', () => {
    expect(isCancellable('scheduled')).toBe(true);
    expect(isCancellable('in_progress')).toBe(true);
    expect(isCancellable('pending_review')).toBe(false);
  });
});

describe('showsCourtBoard, 15.1', () => {
  it('appears within two hours of the start', () => {
    expect(showsCourtBoard(session(), new Date(START.getTime() - 121 * MINUTE))).toBe(false);
    expect(showsCourtBoard(session(), new Date(START.getTime() - 119 * MINUTE))).toBe(true);
  });

  it('stays through the session and goes when it ends', () => {
    expect(showsCourtBoard(session(), new Date(START.getTime() + 30 * MINUTE))).toBe(true);
    expect(showsCourtBoard(session(), new Date(START.getTime() + 89 * MINUTE))).toBe(true);
    expect(showsCourtBoard(session(), new Date(START.getTime() + 91 * MINUTE))).toBe(false);
  });

  it('never appears on a cancelled session, which has nobody to arrange', () => {
    const cancelled = session({ status: 'cancelled' });
    expect(showsCourtBoard(cancelled, new Date(START.getTime() - 30 * MINUTE))).toBe(false);
  });
});
