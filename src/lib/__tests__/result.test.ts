import { err, isErr, isOk, mapResult, ok, unwrapOr, type Result } from '../result';

describe('Result', () => {
  it('carries a success value', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('carries an error code', () => {
    // Error codes are the ones in Appendix A.
    const result = err('session_full');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('session_full');
  });

  it('narrows through the type guards', () => {
    const result: Result<number, string> = ok(1);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(1);
    }
  });

  it('falls back on error', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err<string>('booking_window_closed'), 0)).toBe(0);
  });

  it('maps the success value and passes an error through untouched', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });
    const failure: Result<number, string> = err<string>('already_booked');
    expect(mapResult(failure, (n: number) => n * 2)).toBe(failure);
  });
});
