import { Controller, Get, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { RawResponse } from '../../../shared/presentation/interceptors/response-envelope.interceptor';
import { CheckReadinessUseCase, type ReadinessReport } from '../application/readiness';

/** Internal: consumed by the load balancer / orchestrator, not part of the public API. */
@ApiExcludeController()
@SkipThrottle()
@RawResponse()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(CheckReadinessUseCase) private readonly readiness: CheckReadinessUseCase) {}

  /** Liveness: the process is running. Never checks dependencies, to avoid restart storms. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable; 503 removes the instance from rotation. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.readiness.execute();
    if (report.status !== 'ok') res.status(503);
    return report;
  }
}
