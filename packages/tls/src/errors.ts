/**
 * Structured TLS errors. Surfaced via `Result<T, E>` at package boundaries.
 */

export type TlsErrorCode =
  | 'invalid_input'
  | 'cert_generation_failed'
  | 'fingerprint_mismatch'
  | 'parse_failed';

export interface TlsError {
  code: TlsErrorCode;
  message: string;
  cause?: unknown;
}

export function tlsError(code: TlsErrorCode, message: string, cause?: unknown): TlsError {
  return { code, message, cause };
}
