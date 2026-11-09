import { Module } from '@nestjs/common';
import { PayoutsController } from './presentation/payouts.controller';

/**
 * Payouts context. Recipient, Payout (state machine, maker-checker), limits and
 * partner-balance checks are implemented and unit-tested. No funds move until
 * a payouts partner is selected and its adapter is built (open question Q5).
 */
@Module({ controllers: [PayoutsController] })
export class PayoutsModule {}
