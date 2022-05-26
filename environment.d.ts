declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production';
      SERVER_PORT: string;
      SERVER_AUTH_SECRET: string;
      MONGO_URI: string;
    }
  }
}

export {};
