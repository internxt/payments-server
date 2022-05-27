export class ConfigService {
  private readonly env: Required<NodeJS.AppEnv>;

  constructor(env: NodeJS.AppEnv) {
    if (!env.STORAGE_GATEWAY_SECRET) {
      throw new Error('STORAGE_GATEWAY_SECRET must be defined');
    }

    if (!env.REDIS_HOST) {
      throw new Error('REDIS_HOST must be defined');
    }

    if (!env.REDIS_PASSWORD) {
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
      STORAGE_GATEWAY_URL: env.STORAGE_GATEWAY_URL
    };
  }

  getEnvironment(): Required<NodeJS.AppEnv> {
    return this.env;
  }
}
