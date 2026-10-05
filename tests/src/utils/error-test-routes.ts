// routes/test-routes.ts
import { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError } from '../../../src/errors/Errors';
import {
  DriveAccountAlreadyExistsError,
  PreCreatedUserPendingSetupError,
} from '../../../src/errors/PreCreatedUsersErrors';

export async function testRoutes(app: FastifyInstance) {
  app.get('/bad-request', async () => {
    throw new BadRequestError('Missing parameter');
  });

  app.get('/not-found', async () => {
    throw new NotFoundError('User not found');
  });

  app.get('/account-setup-pending', async () => {
    throw new PreCreatedUserPendingSetupError();
  });

  app.get('/account-already-exists', async () => {
    throw new DriveAccountAlreadyExistsError();
  });

  app.get('/unhandled', async () => {
    throw new Error('Something went wrong');
  });
}
