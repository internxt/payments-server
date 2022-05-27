declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production';
      SERVER_PORT: string;
      SERVER_AUTH_SECRET: string;
      MONGO_URI: string;
      REDIS_HOST?: string;
      REDIS_PASSWORD?: string;
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_KEY: string;
    }
  }
}

export {};
