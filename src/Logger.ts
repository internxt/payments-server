import { FastifyBaseLogger } from 'fastify';
import pino from 'pino';
import { isDevelopment, isTest } from './config';

class Logger {
  private static instance: Logger;
  private pinoLogger: FastifyBaseLogger;

  private constructor() {
    this.pinoLogger = pino({
      level: process.env.LOG_LEVEL || 'info',
      ...(isDevelopment && {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
        msgPrefix: '[PAYMENTS-SERVER]: ',
      }),
      ...(isTest && { level: 'silent' }),
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  getPinoLogger(): FastifyBaseLogger {
    return this.pinoLogger;
  }

  info(message: string, ...args: any[]): void {
    this.pinoLogger.info(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.pinoLogger.error(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.pinoLogger.debug(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.pinoLogger.warn(message, ...args);
  }
}

export default Logger.getInstance();
