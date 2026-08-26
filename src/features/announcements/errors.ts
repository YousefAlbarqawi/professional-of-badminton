/**
 * Server error codes from the announcement RPCs, turned into string keys.
 *
 * Three codes Appendix A does not list, recorded there and as assumption A67:
 * `invalid_announcement_body` and `invalid_language` are 6.2's two CHECK
 * constraints restated as rejections, and `announcement_not_found` is a delete
 * of a row that has gone. `not_authorized` is already in circulation from the
 * staff session RPCs (A33).
 *
 * The body one is the only rejection the composer can actually provoke, and
 * only by racing its own validation, so it is the only one with a message of
 * its own. The rest map to the generic message a crafted call deserves.
 */
export type AnnouncementErrorCode =
  | 'not_authorized'
  | 'invalid_announcement_body'
  | 'invalid_language'
  | 'announcement_not_found'
  | 'network'
  | 'unknown';

const MESSAGE_KEYS: Record<AnnouncementErrorCode, string> = {
  not_authorized: 'error.generic',
  invalid_announcement_body: 'validation.announcementTooLong',
  invalid_language: 'error.generic',
  announcement_not_found: 'error.generic',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isAnnouncementErrorCode(value: string): value is AnnouncementErrorCode {
  return KNOWN_CODES.has(value);
}

function isNetworkMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('network') || text.includes('failed to fetch') || text.includes('load failed')
  );
}

export function announcementErrorMessageKey(error: unknown): string {
  // D78: the app is online only, so a dead connection is a real state with its
  // own copy rather than a generic failure.
  if (error instanceof TypeError) return MESSAGE_KEYS.network;

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isAnnouncementErrorCode(raised)) return MESSAGE_KEYS[raised];
      if (isNetworkMessage(raised)) return MESSAGE_KEYS.network;
    }
  }

  return MESSAGE_KEYS.unknown;
}
