import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/Errors';
import { isTest } from '../config';
import { Algorithm } from 'jsonwebtoken';
import Logger from '../Logger';

interface RateLimitOptions {
  max: number;
  timeWindow: string;
}

interface WithAuthOptions {
  secret: string | { public: string };
  jwtOptions?: {
    algorithms?: Algorithm[];
  };
  rateLimit?: RateLimitOptions;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  max: 1000,
  timeWindow: '1 minute',
};

export async function withAuth(fastify: FastifyInstance, options: WithAuthOptions): Promise<void> {
  const jwtConfig: Parameters<typeof fastifyJwt>[1] = {
    secret: options.secret,
  };

  if (options.jwtOptions?.algorithms) {
    jwtConfig.verify = { algorithms: options.jwtOptions.algorithms };
  }

  fastify.register(fastifyJwt, jwtConfig);

  if (!isTest) {
    fastify.register(fastifyRateLimit, options.rateLimit ?? DEFAULT_RATE_LIMIT);
  }

  fastify.addHook('onRequest', async (request) => {
    const skipAuth = request.routeOptions?.config?.skipAuth;
    const allowAnonymous = request.routeOptions?.config?.allowAnonymous;

    if (skipAuth) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch (err) {
      if (allowAnonymous) {
        return;
      }
      Logger.warn(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedError();
    }
  });
}
