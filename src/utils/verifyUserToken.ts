import jwt from 'jsonwebtoken';
import { ForbiddenError } from '../errors/Errors';

/**
 * Checks that the payments token (signed with `signUserToken`) is valid and was issued for that customer.
 *
 * @throws {ForbiddenError} When the token is invalid, has expired or belongs to another customer.
 */
export function verifyUserToken(token: string, customerId: string, secret: string): void {
  let tokenCustomerId: string | undefined;

  try {
    ({ customerId: tokenCustomerId } = jwt.verify(token, secret) as { customerId?: string });
  } catch {
    throw new ForbiddenError();
  }

  if (tokenCustomerId !== customerId) {
    throw new ForbiddenError();
  }
}
