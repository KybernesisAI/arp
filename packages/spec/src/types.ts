/**
 * Cross-schema utility types.
 *
 * Every exported function in arp-spec that can fail returns a `Result<T, E>` so
 * consumers can handle errors without catching across package boundaries.
 * See Phase 1 §0 "error handling contract".
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = SchemaError> = Ok<T> | Err<E>;

export type SchemaError = {
  code: 'invalid';
  message: string;
  issues?: unknown;
};

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
