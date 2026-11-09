import { Inject, Injectable } from '@nestjs/common';
import type { Order as OrderRow, Prisma } from '@prisma/client';
import { ConcurrencyConflictError } from '../../../../shared/application/application-error';
import { ID_GENERATOR, type IdGenerator } from '../../../../shared/application/id-generator.port';
import { TransactionHost } from '../../../../shared/infrastructure/database/transaction-host';
import { Money, type Currency } from '../../../../shared/domain/money';
import { Order } from '../../domain/entities/order';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import type { OrderStatus } from '../../domain/value-objects/order-status';
import { ProviderOrderRef } from '../../domain/value-objects/provider-order-ref';

const RESOURCE_TYPE = 'order';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(
    private readonly host: TransactionHost,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async findForMerchant(merchantId: string, orderId: string): Promise<Order | null> {
    const row = await this.host.client.order.findUnique({
      where: { merchantId_id: { merchantId, id: orderId } },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByProviderOrder(provider: string, providerOrderId: string): Promise<Order | null> {
    const mapping = await this.host.client.providerResourceMapping.findFirst({
      where: { provider, resourceType: RESOURCE_TYPE, providerResourceId: providerOrderId },
    });
    if (!mapping) return null;
    return this.findForMerchant(mapping.merchantId, mapping.resourceId);
  }

  async insert(order: Order): Promise<void> {
    await this.host.client.order.create({ data: { ...this.toRow(order), version: 0 } });
    await this.writeProviderMapping(order);
    order.markPersisted(0);
  }

  async save(order: Order): Promise<void> {
    const next = order.version + 1;
    const result = await this.host.client.order.updateMany({
      where: { id: order.id, merchantId: order.merchantId, version: order.version },
      data: { ...this.toRow(order), version: next },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError('order', order.id);
    await this.writeProviderMapping(order);
    order.markPersisted(next);
  }

  private async writeProviderMapping(order: Order): Promise<void> {
    const ref = order.providerOrder;
    if (!ref) return;
    await this.host.client.providerResourceMapping.createMany({
      data: [
        {
          id: this.ids.next('map'),
          merchantId: order.merchantId,
          resourceType: RESOURCE_TYPE,
          resourceId: order.id,
          provider: ref.provider,
          mode: order.mode,
          providerResourceId: ref.providerOrderId,
        },
      ],
      skipDuplicates: true,
    });
  }

  private toRow(order: Order): Omit<Prisma.OrderUncheckedCreateInput, 'version'> {
    return {
      id: order.id,
      merchantId: order.merchantId,
      mode: order.mode,
      amountMinor: BigInt(order.amount.amountMinor),
      currency: order.amount.currency,
      status: order.status,
      receipt: order.receipt,
      notes: { ...order.notes },
      failureReason: order.failureReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async toDomain(row: OrderRow): Promise<Order> {
    const mapping = await this.host.client.providerResourceMapping.findFirst({
      where: { resourceType: RESOURCE_TYPE, resourceId: row.id },
    });
    return Order.rehydrate({
      id: row.id,
      merchantId: row.merchantId,
      mode: row.mode,
      amount: Money.of(Number(row.amountMinor), row.currency as Currency),
      status: row.status as OrderStatus,
      receipt: row.receipt,
      notes: row.notes as Record<string, string>,
      providerOrder: mapping
        ? ProviderOrderRef.of(mapping.provider, mapping.providerResourceId)
        : null,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  }
}
