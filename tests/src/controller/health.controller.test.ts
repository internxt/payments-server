import { FastifyInstance } from 'fastify';
import { HealthService } from '../../../src/services/health.service';
import { getHealthCheck } from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Health controller', () => {
  test('When all services are available, then it returns so', async () => {
    const healthStatus = getHealthCheck();
    jest.spyOn(HealthService.prototype, 'checkHealth').mockResolvedValue(healthStatus);

    const result = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const parsedBody = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(parsedBody).toStrictEqual(healthStatus);
  });

  test('When database is not available, then it returns so', async () => {
    const healthStatus = getHealthCheck({ status: 'degraded', database: { status: 'error' } });
    jest.spyOn(HealthService.prototype, 'checkHealth').mockResolvedValue(healthStatus);

    const result = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const parsedBody = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(parsedBody.database.status).toStrictEqual('error');
    expect(parsedBody.status).toStrictEqual('degraded');
  });

  test('When cache is not available, then it returns so', async () => {
    const healthStatus = getHealthCheck({ status: 'degraded', cache: { status: 'error' } });
    jest.spyOn(HealthService.prototype, 'checkHealth').mockResolvedValue(healthStatus);

    const result = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const parsedBody = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(parsedBody.cache.status).toStrictEqual('error');
    expect(parsedBody.status).toStrictEqual('degraded');
  });
});
