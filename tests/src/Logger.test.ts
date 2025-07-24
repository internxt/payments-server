import pino from 'pino';

jest.mock('pino');
const mockPino = pino as jest.MockedFunction<typeof pino>;

jest.mock('../../src/config', () => ({
  isDevelopment: false,
}));

const mockPinoLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(),
  level: 'info',
} as any;

mockPino.mockReturnValue(mockPinoLogger);

import Logger from '../../src/Logger';

describe('Global Logger tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('When we want to get the logger, then it is called and returned correctly', () => {
    const pinoLogger = Logger.getPinoLogger();

    expect(pinoLogger).toBe(mockPinoLogger);
    expect(pinoLogger).toBeDefined();
  });

  describe('Logger methods', () => {
    test('When the info method is called, then it uses pino logger info method to print the message', () => {
      const infoMessage = 'infoMessage';
      Logger.info(infoMessage);
      expect(mockPinoLogger.info).toHaveBeenCalledWith(infoMessage);
    });

    test('When the error method is called, then it uses pino logger error method to print the message', () => {
      const errorMessage = 'Error message';
      Logger.error(errorMessage);
      expect(mockPinoLogger.error).toHaveBeenCalledWith(errorMessage);
    });

    test('When the debug method is called, then it uses pino logger debug method to print the message', () => {
      const debugMessage = 'Debug message';
      Logger.debug(debugMessage);
      expect(mockPinoLogger.debug).toHaveBeenCalledWith(debugMessage);
    });

    test('When the warn method is called, then it uses pino logger warn method to print the message', () => {
      const warnMessage = 'Warn message';
      Logger.warn(warnMessage);
      expect(mockPinoLogger.warn).toHaveBeenCalledWith(warnMessage);
    });
  });
});
