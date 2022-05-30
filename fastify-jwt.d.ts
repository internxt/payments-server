import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      uuid: string;
      networkCredentials: {
        user: string;
        pass: string;
      };
    };
  }
}
