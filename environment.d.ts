declare global {
  namespace NodeJS {
    interface AppEnv {
      NODE_ENV: 'development' | 'production';
      SERVER_PORT: string;
      SERVER_AUTH_SECRET: string;
      MONGO_URI: string;
      REDIS_HOST?: string;
      REDIS_PASSWORD?: string;
      STORAGE_GATEWAY_SECRET?: string;
      STORAGE_GATEWAY_URL?: string;
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_KEY: string;
    }

    interface ProcessEnv extends AppEnv {
      TZ?: string;
    }
  }
}

export {};
