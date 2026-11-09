import { Module } from '@nestjs/common';
import { AdminPricingController } from './presentation/admin-pricing.controller';

/**
 * Platform Fees context. Versioned fee schedules and fee calculation are
 * implemented and unit-tested against PRD §9; persisted schedules, fee records
 * and billing are Phase 4.
 */
@Module({ controllers: [AdminPricingController] })
export class PlatformFeesModule {}
