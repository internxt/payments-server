import { MongoClient } from 'mongodb';
import { HealthService } from '../../../src/services/health.service';
import { createTestServices } from '../helpers/services-factory';

let healthService: HealthService;
let mockMongoPing: jest.Mock;

const { cacheService } = createTestServices();

describe('Health Service', () => {
  beforeEach(() => {
    mockMongoPing = jest.fn().mockResolvedValue({ ok: 1 });

    const mongoClient = {
      db: jest.fn().mockReturnValue({
        command: mockMongoPing,
      }),
    } as unknown as MongoClient;

    healthService = new HealthService(mongoClient, cacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('When all services are available, then it returns so', async () => {
    jest.spyOn(cacheService, 'ping').mockResolvedValue('PONG');

    const result = await healthService.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.cache?.status).toBe('ok');
    expect(result.database?.status).toBe('ok');
  });

  test('When database is not available, then it returns so', async () => {
    jest.spyOn(cacheService, 'ping').mockResolvedValue('PONG');
    const connectionFailedError = new Error('Connection failed');
    mockMongoPing.mockRejectedValue(connectionFailedError);

    const result = await healthService.checkHealth();

    expect(result.status).toBe('degraded');
    expect(result.cache?.status).toBe('ok');
    expect(result.database?.status).toBe('error');
    expect(result.database?.error).toBe('Connection failed');
  });

  test('When cache is not available, then it returns so', async () => {
    const redisConnectionFailedError = new Error('Redis connection failed');
    jest.spyOn(cacheService, 'ping').mockRejectedValue(redisConnectionFailedError);

    const result = await healthService.checkHealth();

    expect(result.status).toBe('degraded');
    expect(result.cache?.status).toBe('error');
    expect(result.cache?.error).toBe('Redis connection failed');
    expect(result.database?.status).toBe('ok');
  });

  test('When both services are not available, then it returns degraded', async () => {
    const redisError = new Error('Redis failed');
    const mongoError = new Error('MongoDB failed');
    jest.spyOn(cacheService, 'ping').mockRejectedValue(redisError);
    mockMongoPing.mockRejectedValue(mongoError);

    const result = await healthService.checkHealth();

    expect(result.status).toBe('degraded');
    expect(result.cache?.status).toBe('error');
    expect(result.database?.status).toBe('error');
  });

  test('When mongo ping returns invalid response, then it returns error', async () => {
    jest.spyOn(cacheService, 'ping').mockResolvedValue('PONG');
    mockMongoPing.mockResolvedValue({ ok: 0 });

    const result = await healthService.checkHealth();

    expect(result.status).toBe('degraded');
    expect(result.database?.status).toBe('error');
    expect(result.cache?.status).toBe('ok');
  });
});
