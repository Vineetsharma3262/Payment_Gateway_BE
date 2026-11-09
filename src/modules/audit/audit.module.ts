import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG } from '../../shared/application/audit-log.port';
import { AUDIT_QUERY } from './application/audit-query';
import { PrismaAuditLog } from './infrastructure/prisma-audit-log';
import { AdminAuditController } from './presentation/admin-audit.controller';

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [
    PrismaAuditLog,
    { provide: AUDIT_LOG, useExisting: PrismaAuditLog },
    { provide: AUDIT_QUERY, useExisting: PrismaAuditLog },
  ],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
