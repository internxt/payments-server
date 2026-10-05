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

  it('When the account setup of the buyer is pending, then returns a conflict with the code the checkout recognizes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/account-setup-pending',
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toEqual({
      message: 'User needs to setup his account',
      code: 'AccountSetupPending',
    });
  });

  it('When the email already has a Drive account, then returns a conflict without code', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/account-already-exists',
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toEqual({
      message: 'The email already has an account, log in to continue',
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
