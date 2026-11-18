import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FastifyBaseLogger } from 'fastify';
import pino, { LoggerOptions } from 'pino';

type LogContext = { reqId?: string; stripeEventId?: string; stripeEventType?: string };

const logContext = new AsyncLocalStorage<LogContext>();
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const env = process.env.NODE_ENV;

export const loggerOptions: LoggerOptions = {
  level: env === 'test' ? 'silent' : 'info',
  base: { service: 'payments', env, version },
  redact: ['headers.authorization', 'token', 'captchaToken', 'confirmationTokenId', 'companyVatId'],
  mixin: (_obj, _level, logger) => {
    const { reqId, ...context } = logContext.getStore() ?? {};
    return logger.bindings().reqId ? context : { reqId, ...context };
  },
  ...(env === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } },
  }),
};

export const runWithLogContext = <T>(context: LogContext, fn: () => T): T =>
  logContext.run({ ...logContext.getStore(), ...context }, fn);

export const addLogContext = (context: LogContext): void => {
  Object.assign(logContext.getStore() ?? {}, context);
};

const Logger: FastifyBaseLogger = pino(loggerOptions);

export default Logger;
