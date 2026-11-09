import { Global, Inject, Module, type OnApplicationShutdown, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { REDIS_CLIENT } from './redis.tokens';

/**
 * Redis is used for rate limiting and short-lived coordination only. It is
 * never the source of truth for financial state. When REDIS_URL is not set
 * (allowed in development/test only) the client is `null` and callers fall
 * back to in-process behaviour.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Redis | null =>
        config.redis.url
          ? new Redis(config.redis.url, {
              lazyConnect: false,
              maxRetriesPerRequest: 2,
              enableOfflineQueue: false,
            })
          : null,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
