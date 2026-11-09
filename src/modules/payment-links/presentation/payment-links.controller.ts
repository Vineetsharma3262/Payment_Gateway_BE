import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../../shared/presentation/decorators/idempotency-key.decorator';
import { ApiKeyAuthGuard } from '../../../shared/presentation/guards/api-key-auth.guard';
import { planned } from '../../../shared/presentation/planned';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';

const createSchema = z
  .object({
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    description: z.string().min(1).max(500),
    expires_at: z.iso.datetime().optional(),
    max_uses: z.number().int().positive().optional(),
  })
  .strict();

/** Merchant API: branded payment links on PayCo's domain. */
@ApiTags('Payment Links')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyAuthGuard)
@Controller({ path: 'payment-links', version: '1' })
export class PaymentLinksController {
  @Post()
  @ApiOperation({ summary: 'Create a payment link (Phase 5)' })
  @ApiIdempotencyKeyHeader()
  @ApiBody({ schema: toOpenApiSchema(createSchema) })
  create(
    @IdempotencyKey() _key: string,
    @Body(new ZodValidationPipe(createSchema)) _b: z.infer<typeof createSchema>,
  ) {
    return planned('payment_links.create', 'Phase 5');
  }

  @Get()
  @ApiOperation({ summary: 'List payment links (Phase 5)' })
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) _q: z.infer<typeof paginationQuerySchema>,
  ) {
    return planned('payment_links.list', 'Phase 5');
  }

  @Get(':linkId')
  @ApiOperation({ summary: 'Retrieve a payment link (Phase 5)' })
  retrieve(@Param('linkId') _id: string) {
    return planned('payment_links.retrieve', 'Phase 5');
  }
}
