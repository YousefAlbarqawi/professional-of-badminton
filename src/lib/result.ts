/**
 * A Result type for operations that fail in ways the UI must handle by name.
 *
 * Every server error in Appendix A is a string code, and the client maps that
 * code to a string key rather than showing a raw message. Modelling those as
 * values instead of thrown exceptions keeps the mapping exhaustive and keeps
 * `catch` blocks from swallowing codes the UI needed to see.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** The value, or a fallback when the result is an error. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Transform the success value, leaving an error untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}
