import { MongoClient } from 'mongodb';
import Logger from '../Logger';
import CacheService from './cache.service';

type CheckResult = { status: 'ok' | 'error'; ping?: number; error?: string };
export type HealthStatus = {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  cache?: CheckResult;
  database?: CheckResult;
};

export class HealthService {
  constructor(
    private readonly mongo: MongoClient,
    private readonly cacheService: CacheService,
  ) {}

  private async checkCache(): Promise<CheckResult> {
    const cacheStartTime = Date.now();
    try {
      const ping = await this.cacheService.ping();

      if (ping !== 'PONG') {
        return {
          status: 'error',
          ping: Date.now() - cacheStartTime,
        };
      }

      return {
        status: 'ok',
        ping: Date.now() - cacheStartTime,
      };
    } catch (error) {
      Logger.error(`[HEALTH SERVICE]: Cache check failed. Error: ${error}`);

      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Cache is not healthy',
      };
    }
  }

  private async checkMongo(): Promise<CheckResult> {
    const dbStartTime = Date.now();
    try {
      const mongoPing = await this.mongo.db().admin().ping();

      if (mongoPing.ok !== 1) {
        return {
          status: 'error',
          ping: Date.now(),
        };
      }
      return {
        status: 'ok',
        ping: Date.now() - dbStartTime,
      };
    } catch (error) {
      Logger.error(`[HEALTH SERVICE]: Database check failed. Error: ${error}`);

      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Database is not healthy',
      };
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    const payload: HealthStatus = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    const checks = {
      cache: this.checkCache(),
      database: this.checkMongo(),
    };

    const checksResult = await Promise.allSettled(
      Object.entries(checks).map(async ([name, promise]) => {
        const value = await promise;
        return [name, value] as const;
      }),
    );

    for (const check of checksResult) {
      if (check.status === 'fulfilled') {
        const [name, value] = check.value;
        payload[name as 'cache' | 'database'] = value;
        if (value.status !== 'ok') payload.status = 'degraded';
      } else {
        payload.status = 'degraded';
      }
    }

    return payload;
  }
}
