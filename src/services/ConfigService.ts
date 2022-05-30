export class ConfigService {
  private readonly env: typeof process.env;

  constructor(env: typeof process.env) {
    if (!env.STORAGE_GATEWAY_SECRET) {
      throw new Error('STORAGE_GATEWAY_SECRET must be defined');
    }

    if (!env.REDIS_HOST && process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_HOST must be defined');
    }

    if (!env.REDIS_PASSWORD && process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_PASSWORD must be defined');
    }

    if (!env.STORAGE_GATEWAY_URL) {
      throw new Error('STORAGE_GATEWAY_URL must be defined');
    }

    this.env = {
      ...env,
      REDIS_HOST: env.REDIS_HOST,
      REDIS_PASSWORD: env.REDIS_PASSWORD,
      STORAGE_GATEWAY_SECRET: env.STORAGE_GATEWAY_SECRET,
      STORAGE_GATEWAY_URL: env.STORAGE_GATEWAY_URL,
    };
  }

  getEnvironment(): typeof process.env {
    return this.env;
  }
}
