// routes/test-routes.ts
import { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError } from '../../../src/errors/Errors';

export async function testRoutes(app: FastifyInstance) {
  app.get('/bad-request', async () => {
    throw new BadRequestError('Missing parameter');
  });

  app.get('/not-found', async () => {
    throw new NotFoundError('User not found');
  });

  app.get('/unhandled', async () => {
    throw new Error('Something went wrong');
  });
}
