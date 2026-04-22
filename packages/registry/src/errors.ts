export type RegistryErrorCode =
  | 'not_found'
  | 'conflict'
  | 'revoked'
  | 'invalid_input'
  | 'storage_failure';

export interface RegistryError {
  code: RegistryErrorCode;
  message: string;
  cause?: unknown;
}

export function registryError(
  code: RegistryErrorCode,
  message: string,
  cause?: unknown,
): RegistryError {
  return { code, message, cause };
}

export class RegistryError_ extends Error {
  readonly code: RegistryErrorCode;
  constructor(code: RegistryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}
