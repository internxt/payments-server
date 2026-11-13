import { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../config';
import { ForbiddenError } from '../errors/Errors';

/**
 * Checks that the payments token (signed with `signUserToken`) is valid and was issued for that customer.
 *
 * @throws {ForbiddenError} When the token is invalid, has expired or belongs to another customer.
 */
export function verifyUserToken(token: string, customerId: string): void {
  let tokenCustomerId: string | undefined;

  try {
    ({ customerId: tokenCustomerId } = jwt.verify(token, config.JWT_SECRET) as { customerId?: string });
  } catch {
    throw new ForbiddenError();
  }

  if (tokenCustomerId !== customerId) {
    throw new ForbiddenError();
  }
}

/**
 * Fastify `preHandler` for routes whose body carries the payments `token` and the `customerId` it must belong to.
 *
 * @throws {ForbiddenError} When the token is invalid, has expired or belongs to another customer.
 */
export async function verifyUserTokenHook(
  req: FastifyRequest<{ Body: { token: string; customerId: string } }>,
): Promise<void> {
  verifyUserToken(req.body.token, req.body.customerId);
}
