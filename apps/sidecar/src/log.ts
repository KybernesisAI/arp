import { pino, type Logger } from 'pino';

/**
 * Structured logger for the sidecar. JSON lines to stdout. Level via
 * `ARP_LOG_LEVEL` (default `info`). Redacts any nested `private_key`,
 * `privateKey`, JWS/JWT tokens, and raw cert bodies so a misconfigured
 * downstream call can never leak key material into the log stream.
 */
export function createLogger(): Logger {
  const level = process.env.ARP_LOG_LEVEL ?? 'info';
  return pino({
    level,
    redact: {
      paths: [
        'private_key',
        'privateKey',
        '*.private_key',
        '*.privateKey',
        'keyPem',
        '*.keyPem',
        'certPem',
        '*.certPem',
        'bootstrap_token',
        '*.bootstrap_token',
        'jwt',
        '*.jwt',
        'jws',
        '*.jws',
        'authorization',
        'Authorization',
        'headers.authorization',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Shared logger instance — created lazily on first access. */
let _logger: Logger | null = null;
export function log(): Logger {
  if (!_logger) _logger = createLogger();
  return _logger;
}
