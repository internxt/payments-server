import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      payload: {
        email: string;
        uuid: string;
        name: string;
        lastname: string;
        username: string;
        sharedWorkspace: boolean,
        networkCredentials: {
          user: string;
          pass: string;
        };
      };
    };
  }
}
