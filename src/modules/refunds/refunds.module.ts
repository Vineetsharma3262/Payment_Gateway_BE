import { Module } from '@nestjs/common';

/**
 * Refunds context. Domain, refund policy and CreateRefundUseCase are
 * implemented and unit-tested; persistence and wiring of the
 * `POST /v1/payments/:id/refunds` route (declared by the Payments controller)
 * are Phase 4.
 */
@Module({})
export class RefundsModule {}
