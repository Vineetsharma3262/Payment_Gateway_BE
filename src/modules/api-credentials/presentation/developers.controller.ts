import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { UserContext } from '../../../shared/application/user-context';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import {
  JwtAuthGuard,
  RequirePermissions,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import { API_KEY_USE_CASES } from '../api-credentials.tokens';
import type { ApiKeyUseCases } from '../application/api-key.use-cases';
import { API_REQUEST_LOG_STORE, type ApiRequestLogStore } from '../domain/api-key.repository';

const issueSchema = z
  .object({ mode: z.enum(['test', 'live']), label: z.string().trim().min(1).max(100) })
  .strict();

/** Dashboard developer tools (JWT session + RBAC). */
@ApiTags('Developers')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'developers', version: '1' })
export class DevelopersController {
  constructor(
    @Inject(API_KEY_USE_CASES) private readonly keys: ApiKeyUseCases,
    @Inject(API_REQUEST_LOG_STORE) private readonly logs: ApiRequestLogStore,
  ) {}

  @Get('api-keys')
  @RequirePermissions('api_keys:read')
  @ApiOperation({ summary: 'List API keys (secrets are never returned)' })
  async list(@CurrentUser() user: UserContext) {
    return (await this.keys.list(user.merchantId!)).map((k) => ({
      id: k.id,
      mode: k.mode,
      label: k.label,
      last4: k.last4,
      created_at: k.createdAt,
      revoked_at: k.revokedAt,
    }));
  }

  @Post('api-keys')
  @RequirePermissions('api_keys:write')
  @ApiOperation({ summary: 'Create an API key — the secret is returned once' })
  @ApiBody({ schema: toOpenApiSchema(issueSchema) })
  async issue(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(issueSchema)) body: z.infer<typeof issueSchema>,
  ) {
    const key = await this.keys.issue({
      merchantId: user.merchantId!,
      mode: body.mode,
      label: body.label,
      actor: { type: 'user', id: user.userId },
    });
    return {
      id: key.id,
      secret: key.secret,
      mode: key.mode,
      label: key.label,
      last4: key.last4,
      created_at: key.createdAt,
    };
  }

  @Delete('api-keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('api_keys:write')
  @ApiOperation({ summary: 'Revoke an API key (immediate)' })
  async revoke(@CurrentUser() user: UserContext, @Param('keyId') keyId: string): Promise<void> {
    await this.keys.revoke(user.merchantId!, keyId, { type: 'user', id: user.userId });
  }

  @Get('request-logs')
  @RequirePermissions('developers:read')
  @ApiOperation({ summary: 'API request logs (metadata only)' })
  async requestLogs(
    @CurrentUser() user: UserContext,
    @Query(new ZodValidationPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>,
  ) {
    const page = await this.logs.list(user.merchantId!, {
      limit: q.limit,
      startingAfter: q.starting_after,
    });
    return {
      ...page,
      items: page.items.map((l) => ({
        id: l.id,
        api_key_id: l.apiKeyId,
        mode: l.mode,
        method: l.method,
        route: l.route,
        status_code: l.statusCode,
        duration_ms: l.durationMs,
        request_id: l.requestId,
        idempotency_key: l.idempotencyKey,
        created_at: l.createdAt.toISOString(),
      })),
    };
  }
}
