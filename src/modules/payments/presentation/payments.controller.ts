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

const listSchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'authorized', 'captured', 'failed']).optional(),
  order_id: z.string().max(40).optional(),
});
const verifySchema = z
  .object({ checkout_reference: z.string().max(100), signature: z.string().max(200) })
  .strict()
  .describe('Values returned to the PayCo checkout on completion.');
const refundSchema = z
  .object({
    amount: z.number().int().positive().optional().describe('Cents; omit for a full refund.'),
    reason: z.string().max(200).optional(),
  })
  .strict();

/** Merchant API. Contract published now; implementation scheduled (see docs/implementation-checklist.md). */
@ApiTags('Payments')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyAuthGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  @Get()
  @ApiOperation({ summary: 'List payments (Phase 3)' })
  list(@Query(new ZodValidationPipe(listSchema)) _q: z.infer<typeof listSchema>) {
    return planned('payments.list', 'Phase 3');
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Retrieve a payment (Phase 3)' })
  retrieve(@Param('paymentId') _id: string) {
    return planned('payments.retrieve', 'Phase 3');
  }

  @Post(':paymentId/verify')
  @ApiOperation({ summary: 'Verify a checkout completion signature (Phase 3)' })
  @ApiBody({ schema: toOpenApiSchema(verifySchema) })
  verify(
    @Param('paymentId') _id: string,
    @Body(new ZodValidationPipe(verifySchema)) _b: z.infer<typeof verifySchema>,
  ) {
    return planned('payments.verify', 'Phase 3');
  }

  @Post(':paymentId/refunds')
  @ApiOperation({ summary: 'Refund a payment, fully or partially (Phase 4)' })
  @ApiIdempotencyKeyHeader()
  @ApiBody({ schema: toOpenApiSchema(refundSchema) })
  refund(
    @Param('paymentId') _id: string,
    @IdempotencyKey() _key: string,
    @Body(new ZodValidationPipe(refundSchema)) _b: z.infer<typeof refundSchema>,
  ) {
    return planned('refunds.create', 'Phase 4');
  }
}
