import { Inject, Injectable } from '@nestjs/common';
import type { Merchant as MerchantRow } from '@prisma/client';
import { ConcurrencyConflictError } from '../../../shared/application/application-error';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/application/id-generator.port';
import type { ApiMode } from '../../../shared/application/merchant-context';
import { toPage, type Page, type PageRequest } from '../../../shared/application/pagination';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import { Merchant, type MerchantStatus, type PaymentMethod } from '../domain/merchant';
import type { MerchantRepository, ProviderAccountRecord } from '../domain/merchant.repository';

const toDomain = (r: MerchantRow) =>
  Merchant.rehydrate({ ...r, paymentMethods: r.paymentMethods as PaymentMethod[] });

@Injectable()
export class PrismaMerchantRepository implements MerchantRepository {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async findById(id: string): Promise<Merchant | null> {
    const row = await this.host.client.merchant.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter: { status?: MerchantStatus }, page: PageRequest): Promise<Page<Merchant>> {
    const rows = await this.host.client.merchant.findMany({
      where: { status: filter.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.startingAfter ? { cursor: { id: page.startingAfter }, skip: 1 } : {}),
    });
    return toPage(rows.map(toDomain), page.limit);
  }

  async insert(merchant: Merchant): Promise<void> {
    await this.host.client.merchant.create({ data: { ...merchant.toProps(), version: 0 } });
    merchant.markPersisted(0);
  }

  async save(merchant: Merchant): Promise<void> {
    const { id, version, createdAt: _c, ...data } = merchant.toProps();
    const result = await this.host.client.merchant.updateMany({
      where: { id, version },
      data: { ...data, version: version + 1 },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError('merchant', id);
    merchant.markPersisted(version + 1);
  }

  async findProviderAccount(
    merchantId: string,
    mode: ApiMode,
  ): Promise<ProviderAccountRecord | null> {
    return this.host.client.merchantProviderAccount.findUnique({
      where: { merchantId_mode: { merchantId, mode } },
    });
  }

  async saveProviderAccount(merchantId: string, account: ProviderAccountRecord): Promise<void> {
    await this.host.client.merchantProviderAccount.upsert({
      where: { merchantId_mode: { merchantId, mode: account.mode } },
      create: { id: this.ids.next('mpa'), merchantId, ...account },
      update: { providerStatus: account.providerStatus },
    });
  }
}
