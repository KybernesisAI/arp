/**
 * Structured resolver errors. Transport across package boundaries via the
 * `Result<T, E>` pattern defined in `@kybernesis/arp-spec`.
 */

export type ResolverErrorCode =
  | 'invalid_did'
  | 'unsupported_method'
  | 'doh_failure'
  | 'http_failure'
  | 'parse_failure'
  | 'not_found';

export interface ResolverError {
  code: ResolverErrorCode;
  message: string;
  cause?: unknown;
}

export function resolverError(
  code: ResolverErrorCode,
  message: string,
  cause?: unknown,
): ResolverError {
  return { code, message, cause };
}
