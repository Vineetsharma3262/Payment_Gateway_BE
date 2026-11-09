import { Module } from '@nestjs/common';
import { PaymentsController } from './presentation/payments.controller';

/**
 * Payments context. Domain (Payment aggregate) and the provider-event use case
 * are implemented and unit-tested; persistence, read endpoints and checkout
 * verification are Phase 3. Use cases are wired once PaymentRepository has a
 * Prisma adapter.
 */
@Module({ controllers: [PaymentsController] })
export class PaymentsModule {}
