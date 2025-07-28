// tests/error-handler.test.ts
import fastify, { FastifyInstance } from 'fastify';
import { testRoutes } from '../utils/error-test-routes';
import { registerErrorHandler } from '../../../src/plugins/error-handler';

let app: FastifyInstance;

beforeAll(async () => {
  app = fastify();
  registerErrorHandler(app);
  await testRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Custom error handler', () => {
  it('When a Bad Request Error is thrown, then returns the correct status code and message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bad-request',
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      message: 'Missing parameter',
    });
  });

  it('When a Not Found Error is thrown, then returns the correct status code and message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/not-found',
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      message: 'User not found',
    });
  });

  it('When an Internal Server Error is thrown, then returns the correct status code and message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/unhandled',
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      message: 'Internal Server Error',
    });
  });
});
