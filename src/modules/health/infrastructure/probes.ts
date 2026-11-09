import type Redis from 'ioredis';
import type { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { ReadinessProbe } from '../application/readiness';

export class PostgresReadinessProbe implements ReadinessProbe {
  readonly name = 'postgres';
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

export class RedisReadinessProbe implements ReadinessProbe {
  readonly name = 'redis';
  constructor(private readonly redis: Redis) {}

  async check(): Promise<void> {
    await this.redis.ping();
  }
}
