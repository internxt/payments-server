import { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../errors/Errors';
import { verifyRecaptcha } from '../utils/verifyRecaptcha';
import { verifyUserToken } from '../utils/verifyUserToken';

/**
 * Fastify `preHandler` for routes whose body carries a reCAPTCHA token in `captchaToken`.
 *
 * @throws {ForbiddenError} When the captcha is not valid.
 */
export async function verifyCaptchaHook(req: FastifyRequest<{ Body: { captchaToken: string } }>): Promise<void> {
  const isCaptchaValid = await verifyRecaptcha(req.body.captchaToken);

  if (!isCaptchaValid) {
    throw new ForbiddenError('Token verification failed');
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
