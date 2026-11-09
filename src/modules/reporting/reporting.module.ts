import { Module } from '@nestjs/common';
import { ReportsController } from './presentation/reports.controller';

/** Reporting context: read-model projections and exports are Phase 5. */
@Module({ controllers: [ReportsController] })
export class ReportingModule {}
