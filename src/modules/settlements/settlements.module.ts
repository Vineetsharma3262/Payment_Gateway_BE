import { Module } from '@nestjs/common';
import { SettlementsController } from './presentation/settlements.controller';

/** Settlements context: Settlement aggregate implemented; report import and persistence are Phase 4. */
@Module({ controllers: [SettlementsController] })
export class SettlementsModule {}
