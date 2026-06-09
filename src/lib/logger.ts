import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Root application logger.
 *
 * In development  → pretty-prints with colours via pino-pretty.
 * In production   → emits newline-delimited JSON (NDJSON) to stdout,
 *                   ready for ingestion by Datadog / CloudWatch / Loki etc.
 *
 * Use `logger.child({ component: 'MyService' })` to attach a fixed context
 * to every log line emitted by a module.
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export default logger;
export type Logger = pino.Logger;
