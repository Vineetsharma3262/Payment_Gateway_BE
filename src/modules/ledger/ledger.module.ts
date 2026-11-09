import { Module } from '@nestjs/common';

/**
 * Ledger context. Chart of accounts, balanced immutable journal transactions,
 * posting rules, reversals and LedgerService are implemented and unit-tested.
 * Prisma persistence (with a deferred balance-check trigger and append-only
 * trigger) and the event consumers that post entries are Phase 4.
 */
@Module({})
export class LedgerModule {}
