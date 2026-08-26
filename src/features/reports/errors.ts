/**
 * Report error codes. Same shape and same reason as
 * features/payments/errors.ts: `RAISE EXCEPTION 'not_authorized'` reaches the
 * client as a PostgrestError whose message is that text, so the text is what
 * is matched on. Nothing renders `error.message` itself.
 *
 * There is only one code worth naming here, because a report reads and never
 * writes: an admin was refused. 15.12 says he "sees a permission denied state,
 * and the API refuses the query as well", so the screen has to be able to tell
 * that refusal apart from a dropped connection.
 */
export type ReportErrorCode = 'not_authorized' | 'network' | 'unknown';

const MESSAGE_KEYS: Record<ReportErrorCode, string> = {
  not_authorized: 'admin.error.coachOnly',
  network: 'error.network',
  unknown: 'error.generic',
};

export function toReportErrorCode(error: unknown): ReportErrorCode {
  // D78: the app is online only, so a dropped connection is a real state with
  // its own copy rather than a crash.
  if (error instanceof TypeError) return 'network';

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (raised === 'not_authorized') return 'not_authorized';

      const text = raised.toLowerCase();
      if (
        text.includes('network') ||
        text.includes('failed to fetch') ||
        text.includes('load failed')
      ) {
        return 'network';
      }
      // PostgREST refuses an ungranted function before it is ever entered, and
      // says so in its own words rather than the function's. D73 either way.
      if (text.includes('permission denied') || text.includes('not authorized')) {
        return 'not_authorized';
      }
    }
  }

  return 'unknown';
}

export function reportErrorMessageKey(error: unknown): string {
  return MESSAGE_KEYS[toReportErrorCode(error)];
}

/** True when this account is not the coach. D73, D16. */
export function isCoachOnly(error: unknown): boolean {
  return toReportErrorCode(error) === 'not_authorized';
}
