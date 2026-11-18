import pino from 'pino';
import { addLogContext, loggerOptions, runWithLogContext } from '../../src/Logger';

const buildLogger = () => {
  const lines: string[] = [];
  const logger = pino({ ...loggerOptions, level: 'info' }, { write: (line: string) => lines.push(line) });
  const loggedLine = (index = 0) => JSON.parse(lines[index]);

  return { logger, lines, loggedLine };
};

describe('App logger', () => {
  test('When something is logged, then the line says which service, environment and version wrote it', () => {
    const { logger, loggedLine } = buildLogger();

    logger.info('Subscription created');

    expect(loggedLine()).toMatchObject({
      service: 'payments',
      env: 'test',
      version: expect.any(String),
      msg: 'Subscription created',
    });
  });

  test('When something is logged while a request is handled, then the line carries the request id', () => {
    const { logger, loggedLine } = buildLogger();

    runWithLogContext({ reqId: 'req-1' }, () => logger.info('Fetching invoices'));

    expect(loggedLine()).toMatchObject({ reqId: 'req-1', msg: 'Fetching invoices' });
  });

  test('When a Stripe event is added to the request context, then later lines carry its id and type', () => {
    const { logger, loggedLine } = buildLogger();

    runWithLogContext({ reqId: 'req-2' }, () => {
      addLogContext({ stripeEventId: 'evt_123', stripeEventType: 'invoice.paid' });
      logger.error('Could not update the user tier');
    });

    expect(loggedLine()).toMatchObject({
      reqId: 'req-2',
      stripeEventId: 'evt_123',
      stripeEventType: 'invoice.paid',
    });
  });

  test('When the request logger already carries the request id, then the line does not repeat it', () => {
    const { logger, lines } = buildLogger();

    runWithLogContext({ reqId: 'req-3' }, () => logger.child({ reqId: 'req-3' }).info('request completed'));

    expect(lines[0].match(/"reqId"/g)).toHaveLength(1);
  });

  test('When nothing is being handled, then the line has no request or event fields', () => {
    const { logger, loggedLine } = buildLogger();

    logger.info('Server started');

    expect(loggedLine()).not.toHaveProperty('reqId');
    expect(loggedLine()).not.toHaveProperty('stripeEventId');
  });

  test('When a log carries a token, captcha, authorization header or VAT id, then those values are redacted', () => {
    const { logger, loggedLine } = buildLogger();

    logger.info(
      {
        token: 'payments-token',
        captchaToken: 'captcha',
        confirmationTokenId: 'ctoken_1',
        companyVatId: 'ESB12345678',
        headers: { authorization: 'Bearer secret' },
      },
      'Request data',
    );

    expect(loggedLine()).toMatchObject({
      token: '[Redacted]',
      captchaToken: '[Redacted]',
      confirmationTokenId: '[Redacted]',
      companyVatId: '[Redacted]',
      headers: { authorization: '[Redacted]' },
    });
  });

  test('When the app runs the tests, then the logger is silent', () => {
    expect(loggerOptions.level).toBe('silent');
  });
});
