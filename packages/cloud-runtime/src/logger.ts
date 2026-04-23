/**
 * Default logger — pino wrapped behind our narrow CloudRuntimeLogger
 * interface so downstream modules don't depend on pino directly.
 */

import pino, { type Logger } from 'pino';
import type { CloudRuntimeLogger } from './types.js';

export function createLogger(opts: { level?: string; bindings?: Record<string, unknown> } = {}): CloudRuntimeLogger {
  const p = pino({
    level: opts.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: opts.bindings ?? {},
    messageKey: 'msg',
  });
  return wrap(p);
}

function wrap(p: Logger): CloudRuntimeLogger {
  return {
    info: (data, msg) => p.info(data, msg ?? ''),
    warn: (data, msg) => p.warn(data, msg ?? ''),
    error: (data, msg) => p.error(data, msg ?? ''),
    debug: (data, msg) => p.debug(data, msg ?? ''),
    child: (bindings) => wrap(p.child(bindings)),
  };
}

/** Silent logger for tests. */
export function createSilentLogger(): CloudRuntimeLogger {
  const noop = (_data: Record<string, unknown>, _msg?: string) => {
    void _data;
    void _msg;
  };
  const self: CloudRuntimeLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => self,
  };
  return self;
}
