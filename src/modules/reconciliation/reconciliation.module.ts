import { Module } from '@nestjs/common';
import { ReconciliationController } from './presentation/reconciliation.controller';

/** Reconciliation context: matching engine implemented; runs, persistence and worker are Phase 4. */
@Module({ controllers: [ReconciliationController] })
export class ReconciliationModule {}
