import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UnitOfWork } from '../../application/unit-of-work.port';
import { PrismaService } from './prisma.service';
import { TransactionHost } from './transaction-host';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly host: TransactionHost,
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.host.inTransaction) return work(); // nested: join the outer transaction
    return this.prisma.$transaction((tx) => this.host.runWith(tx, work), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 2_000,
      timeout: 5_000,
    });
  }
}
