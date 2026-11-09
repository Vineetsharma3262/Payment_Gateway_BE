import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type DbClient = Prisma.TransactionClient;

/**
 * Carries the ambient Prisma transaction through async calls so repositories
 * join the caller's unit of work without passing a transaction handle around.
 */
@Injectable()
export class TransactionHost {
  private readonly storage = new AsyncLocalStorage<DbClient>();

  constructor(private readonly prisma: PrismaService) {}

  /** The transaction client if inside a unit of work, otherwise the root client. */
  get client(): DbClient {
    return this.storage.getStore() ?? this.prisma;
  }

  get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  runWith<T>(tx: DbClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}
