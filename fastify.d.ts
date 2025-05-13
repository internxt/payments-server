import 'fastify';

declare module 'fastify' {
  interface FastifyContextConfig {
    skipAuth?: boolean;
    allowAnonymous?: boolean;
  }
}
