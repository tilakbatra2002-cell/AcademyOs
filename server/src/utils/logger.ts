/* Minimal structured logger (no external dependency). */
const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof levels;

const current: Level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === 'test' ? 'error' : 'info');

function log(level: Level, msg: unknown, meta?: unknown) {
  if (levels[level] > levels[current]) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, meta);
  } else {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line);
  }
}

export const logger = {
  error: (m: unknown, meta?: unknown) => log('error', m, meta),
  warn: (m: unknown, meta?: unknown) => log('warn', m, meta),
  info: (m: unknown, meta?: unknown) => log('info', m, meta),
  debug: (m: unknown, meta?: unknown) => log('debug', m, meta),
};
