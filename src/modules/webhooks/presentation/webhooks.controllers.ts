import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeController,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  JwtAuthGuard,
  RequirePermissions,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import { PUBLIC_EVENT_TYPES } from '../domain/event-catalog';

const endpointSchema = z
  .object({
    url: z.url().max(500),
    enabled_events: z.array(z.enum(PUBLIC_EVENT_TYPES)).min(1),
    description: z.string().max(200).optional(),
  })
  .strict();

/** Dashboard: merchant webhook endpoints and delivery logs (PRD 7.3). */
@ApiTags('Webhooks')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class WebhookEndpointsController {
  @Post('webhook-endpoints')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({
    summary: 'Register a webhook endpoint; the signing secret is returned once (Phase 4)',
  })
  @ApiBody({ schema: toOpenApiSchema(endpointSchema) })
  create(@Body(new ZodValidationPipe(endpointSchema)) _b: z.infer<typeof endpointSchema>) {
    return planned('webhook_endpoints.create', 'Phase 4');
  }

  @Get('webhook-endpoints')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'List webhook endpoints (Phase 4)' })
  list() {
    return planned('webhook_endpoints.list', 'Phase 4');
  }

  @Delete('webhook-endpoints/:endpointId')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Delete a webhook endpoint (Phase 4)' })
  remove(@Param('endpointId') _id: string) {
    return planned('webhook_endpoints.delete', 'Phase 4');
  }

  @Post('webhook-endpoints/:endpointId/rotate-secret')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Rotate the signing secret (old secret valid for 24h) (Phase 4)' })
  rotate(@Param('endpointId') _id: string) {
    return planned('webhook_endpoints.rotate_secret', 'Phase 4');
  }

  @Get('webhook-endpoints/:endpointId/deliveries')
  @RequirePermissions('developers:read')
  @ApiOperation({ summary: 'Delivery history with attempts and response codes (Phase 4)' })
  deliveries(
    @Param('endpointId') _id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) _q: z.infer<typeof paginationQuerySchema>,
  ) {
    return planned('webhook_deliveries.list', 'Phase 4');
  }

  @Post('webhook-deliveries/:deliveryId/replay')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Replay a delivery (audited) (Phase 4)' })
  replay(@Param('deliveryId') _id: string) {
    return planned('webhook_deliveries.replay', 'Phase 4');
  }
}

/**
 * Gateway → PayCo. Authenticated by the provider signature over the raw body,
 * not by PayCo credentials. Not part of the public API documentation.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller({ path: 'webhooks/providers', version: VERSION_NEUTRAL })
export class ProviderWebhooksController {
  @Post(':provider/:mode')
  @HttpCode(HttpStatus.OK)
  receive(@Param('provider') _provider: string, @Param('mode') _mode: string) {
    return planned('provider_webhooks.ingest', 'Phase 3');
  }
}
