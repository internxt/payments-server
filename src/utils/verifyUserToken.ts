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
