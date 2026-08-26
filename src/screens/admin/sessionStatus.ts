/**
 * The status chip on the staff screens. 15.1 and 15.3.
 *
 * A session's status is set by timestamps and by the coach, never by the
 * client — 5.5 puts `in_progress` and `pending_review` in the hands of a
 * scheduled job. This only turns the value into a label and a colour.
 */
import type { ChipTone } from '@/components/primitives';
import type { Session, SessionStatus } from '@/features/sessions/types';

const LABEL_KEYS: Record<SessionStatus, string> = {
  scheduled: 'admin.status.scheduled',
  in_progress: 'admin.status.inProgress',
  pending_review: 'admin.status.pendingReview',
  confirmed: 'admin.status.confirmed',
  locked: 'admin.status.locked',
  cancelled: 'admin.status.cancelled',
};

const TONES: Record<SessionStatus, ChipTone> = {
  scheduled: 'neutral',
  in_progress: 'info',
  // The one status that needs the coach to do something.
  pending_review: 'warning',
  confirmed: 'success',
  locked: 'neutral',
  cancelled: 'danger',
};

export function statusLabelKey(status: SessionStatus): string {
  return LABEL_KEYS[status];
}

export function statusTone(status: SessionStatus): ChipTone {
  return TONES[status];
}

/** 15.4 and Appendix A: a locked session refuses every staff mutation. */
export function isEditable(status: SessionStatus): boolean {
  return status !== 'locked' && status !== 'cancelled';
}

/** 5.5: only a scheduled or in-progress session can be cancelled. */
export function isCancellable(status: SessionStatus): boolean {
  return status === 'scheduled' || status === 'in_progress';
}

/** 15.1: "A secondary *Court board* button appears within 2 hours of start." */
const COURT_BOARD_LEAD_MS = 2 * 60 * 60 * 1000;

/**
 * Whether the Today card carries its court board shortcut.
 *
 * From two hours before the start until the session ends, which is the window
 * in which the coach is at the venue reading the board aloud. A cancelled
 * session never carries it: there is nobody to arrange. D68 keeps the screen
 * behind it to staff.
 */
export function showsCourtBoard(session: Session, now: Date): boolean {
  if (session.status === 'cancelled') return false;
  const millisecondsToStart = session.startsAt.getTime() - now.getTime();
  return millisecondsToStart <= COURT_BOARD_LEAD_MS && now.getTime() < session.endsAt.getTime();
}

/**
 * 15.1: "a payment summary once the session is past." Ended, not merely
 * started — the same instant `reviewDeadline`/`get_session_money_summary`'s
 * own callers treat as the session being over, and a cancelled session has
 * nothing collected to summarise.
 */
export function isSessionPast(session: Session, now: Date): boolean {
  return session.status !== 'cancelled' && now.getTime() >= session.endsAt.getTime();
}
