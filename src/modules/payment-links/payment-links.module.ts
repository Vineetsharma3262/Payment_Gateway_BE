import { Module } from '@nestjs/common';
import { PaymentLinksController } from './presentation/payment-links.controller';

/** Payment Links context: PaymentLink aggregate (expiry, usage limits) implemented; persistence, hosting and API are Phase 5. */
@Module({ controllers: [PaymentLinksController] })
export class PaymentLinksModule {}
