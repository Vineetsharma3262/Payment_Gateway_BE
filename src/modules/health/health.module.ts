import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/cache/redis.tokens';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { CheckReadinessUseCase, type ReadinessProbe } from './application/readiness';
import { PostgresReadinessProbe, RedisReadinessProbe } from './infrastructure/probes';
import { HealthController } from './presentation/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: CheckReadinessUseCase,
      inject: [PrismaService, REDIS_CLIENT],
      useFactory: (prisma: PrismaService, redis: Redis | null) => {
        const probes: ReadinessProbe[] = [new PostgresReadinessProbe(prisma)];
        if (redis) probes.push(new RedisReadinessProbe(redis));
        return new CheckReadinessUseCase(probes);
      },
    },
  ],
})
export class HealthModule {}
