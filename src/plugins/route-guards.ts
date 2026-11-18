import { FastifyRequest } from 'fastify';
import { type AppConfig } from '../config';
import { ForbiddenError } from '../errors/Errors';
import { verifyRecaptcha } from '../utils/verifyRecaptcha';
import { verifyUserToken } from '../utils/verifyUserToken';

export type RouteGuards = ReturnType<typeof createRouteGuards>;

export function createRouteGuards(
  config: Pick<
    AppConfig,
    'JWT_SECRET' | 'RECAPTCHA_V3_ENDPOINT' | 'RECAPTCHA_V3' | 'RECAPTCHA_V3_SCORE_THRESHOLD' | 'isProduction'
  >,
) {
  return {
    /**
     * Fastify `preHandler` for routes whose body carries a reCAPTCHA token in `captchaToken`.
     *
     * @throws {ForbiddenError} When the captcha is not valid.
     */
    async verifyCaptchaHook(req: FastifyRequest<{ Body: { captchaToken: string } }>): Promise<void> {
      const isCaptchaValid = await verifyRecaptcha(req.body.captchaToken, config);

      if (!isCaptchaValid) {
        throw new ForbiddenError('Token verification failed');
      }
    },

    /**
     * Fastify `preHandler` for routes whose body carries the payments `token` and the `customerId` it must belong to.
     *
     * @throws {ForbiddenError} When the token is invalid, has expired or belongs to another customer.
     */
    async verifyUserTokenHook(req: FastifyRequest<{ Body: { token: string; customerId: string } }>): Promise<void> {
      verifyUserToken(req.body.token, req.body.customerId, config.JWT_SECRET);
    },
  };
}
