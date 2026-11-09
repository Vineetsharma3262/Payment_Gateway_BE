import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/application/id-generator.port';
import { toPage } from '../../../shared/application/pagination';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import { ApiKey } from '../domain/api-key';
import type {
  ApiKeyRepository,
  ApiRequestLogEntry,
  ApiRequestLogStore,
} from '../domain/api-key.repository';

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly host: TransactionHost) {}

  async findById(id: string): Promise<ApiKey | null> {
    const row = await this.host.client.apiKey.findUnique({ where: { id } });
    return row ? ApiKey.rehydrate(row) : null;
  }

  async listForMerchant(merchantId: string): Promise<ApiKey[]> {
    const rows = await this.host.client.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ApiKey.rehydrate(r));
  }

  async insert(key: ApiKey): Promise<void> {
    await this.host.client.apiKey.create({ data: key.toProps() });
  }

  async save(key: ApiKey): Promise<void> {
    const { id, merchantId, revokedAt, expiresAt } = key.toProps();
    await this.host.client.apiKey.updateMany({
      where: { id, merchantId },
      data: { revokedAt, expiresAt },
    });
  }
}

@Injectable()
export class PrismaApiRequestLogStore implements ApiRequestLogStore {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async append(entry: ApiRequestLogEntry): Promise<void> {
    await this.host.client.apiRequestLog.create({
      data: { id: this.ids.next('log'), ...entry, createdAt: new Date() },
    });
  }

  async list(merchantId: string, page: { limit: number; startingAfter?: string }) {
    const rows = await this.host.client.apiRequestLog.findMany({
      where: { merchantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.startingAfter ? { cursor: { id: page.startingAfter }, skip: 1 } : {}),
    });
    return toPage(rows, page.limit);
  }
}
