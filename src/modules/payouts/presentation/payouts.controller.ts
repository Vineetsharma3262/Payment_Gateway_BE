import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../../shared/presentation/decorators/idempotency-key.decorator';
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

const recipientSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.enum(['bank_account', 'debit_card']),
    destination_token: z
      .string()
      .min(4)
      .max(200)
      .describe('Token from the payouts partner’s hosted field.'),
  })
  .strict();
const payoutSchema = z
  .object({
    recipient_id: z.string().max(40),
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    rail: z.enum(['ach', 'same_day_ach', 'rtp', 'fednow', 'wire', 'push_to_card']),
  })
  .strict();

/**
 * Supplier payouts through a separate US payouts partner (PRD 5.2). Contract
 * published; implementation waits for partner selection (open question Q5).
 * Dashboard-authenticated so that approvals carry a named user.
 */
@ApiTags('Payouts')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class PayoutsController {
  @Post('recipients')
  @RequirePermissions('payouts:create')
  @ApiOperation({ summary: 'Create a payout recipient (OFAC screening by partner) (Phase 5)' })
  @ApiBody({ schema: toOpenApiSchema(recipientSchema) })
  createRecipient(
    @Body(new ZodValidationPipe(recipientSchema)) _b: z.infer<typeof recipientSchema>,
  ) {
    return planned('recipients.create', 'Phase 5');
  }

  @Get('recipients')
  @RequirePermissions('payouts:create')
  @ApiOperation({ summary: 'List recipients (Phase 5)' })
  listRecipients(
    @Query(new ZodValidationPipe(paginationQuerySchema)) _q: z.infer<typeof paginationQuerySchema>,
  ) {
    return planned('recipients.list', 'Phase 5');
  }

  @Get('recipients/:recipientId')
  @RequirePermissions('payouts:create')
  @ApiOperation({ summary: 'Retrieve a recipient (Phase 5)' })
  getRecipient(@Param('recipientId') _id: string) {
    return planned('recipients.retrieve', 'Phase 5');
  }

  @Post('payouts')
  @RequirePermissions('payouts:create')
  @ApiOperation({ summary: 'Request a payout (limits, approvals, idempotency) (Phase 5)' })
  @ApiIdempotencyKeyHeader()
  @ApiBody({ schema: toOpenApiSchema(payoutSchema) })
  createPayout(
    @IdempotencyKey() _key: string,
    @Body(new ZodValidationPipe(payoutSchema)) _b: z.infer<typeof payoutSchema>,
  ) {
    return planned('payouts.create', 'Phase 5');
  }

  @Get('payouts/:payoutId')
  @RequirePermissions('payouts:create')
  @ApiOperation({ summary: 'Payout status (Phase 5)' })
  getPayout(@Param('payoutId') _id: string) {
    return planned('payouts.retrieve', 'Phase 5');
  }

  @Post('payouts/:payoutId/approve')
  @RequirePermissions('payouts:approve')
  @ApiOperation({ summary: 'Approve a payout (approver must differ from creator) (Phase 5)' })
  approve(@Param('payoutId') _id: string) {
    return planned('payouts.approve', 'Phase 5');
  }

  @Post('payouts/:payoutId/reject')
  @RequirePermissions('payouts:approve')
  @ApiOperation({ summary: 'Reject a payout awaiting approval (Phase 5)' })
  reject(@Param('payoutId') _id: string) {
    return planned('payouts.reject', 'Phase 5');
  }
}
