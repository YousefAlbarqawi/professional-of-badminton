/**
 * Server error codes from the lineup RPCs in migration 0033, turned into
 * string keys. Appendix A is the register; these five were added by phase 7
 * under the section 0 rule 2 procedure and are recorded in assumption A62.
 */

export type LineupErrorCode =
  | 'not_authorized'
  | 'session_not_found'
  | 'session_locked'
  | 'rotation_not_found'
  | 'assignment_not_found'
  /** 13.9: "Swapping into or out of a locked court is blocked with a toast." */
  | 'court_locked'
  /** 13.4 rule 3: a locked court holds exactly four, so a singles court cannot lock. */
  | 'court_not_full'
  | 'invalid_lineup'
  | 'same_player'
  | 'network'
  | 'unknown';

export interface AppLineupError {
  code: LineupErrorCode;
  messageKey: string;
}

const MESSAGE_KEYS: Record<LineupErrorCode, string> = {
  not_authorized: 'error.generic',
  session_not_found: 'error.sessionNotFound',
  session_locked: 'admin.error.sessionLocked',
  rotation_not_found: 'error.generic',
  assignment_not_found: 'error.generic',
  court_locked: 'admin.board.error.courtLocked',
  court_not_full: 'admin.board.error.courtNotFull',
  invalid_lineup: 'error.generic',
  same_player: 'error.generic',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isLineupErrorCode(value: string): value is LineupErrorCode {
  return KNOWN_CODES.has(value);
}

export function toAppLineupError(error: unknown): AppLineupError {
  if (error instanceof TypeError) {
    return { code: 'network', messageKey: MESSAGE_KEYS.network };
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isLineupErrorCode(raised)) {
        return { code: raised, messageKey: MESSAGE_KEYS[raised] };
      }
      const lowered = raised.toLowerCase();
      if (
        lowered.includes('network') ||
        lowered.includes('failed to fetch') ||
        lowered.includes('load failed')
      ) {
        return { code: 'network', messageKey: MESSAGE_KEYS.network };
      }
    }
  }

  return { code: 'unknown', messageKey: MESSAGE_KEYS.unknown };
}

export function lineupErrorMessageKey(error: unknown): string {
  return toAppLineupError(error).messageKey;
}
