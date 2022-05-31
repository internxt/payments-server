import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      payload: {
        uuid: string;
        networkCredentials: {
          user: string;
          pass: string;
        };
      };
    };
  }
}
