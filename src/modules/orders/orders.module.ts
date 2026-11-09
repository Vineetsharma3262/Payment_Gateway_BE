import { Module } from '@nestjs/common';
import type { Clock } from '../../shared/application/clock.port';
import { CLOCK } from '../../shared/application/clock.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../shared/application/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import {
  IDEMPOTENCY_STORE,
  type IdempotencyStore,
} from '../../shared/application/idempotency.port';
import { HASHER, type Hasher } from '../../shared/application/request-hash';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderRegistry,
} from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import {
  MERCHANT_PAYMENT_PROFILE_READER,
  type MerchantPaymentProfileReader,
} from '../merchants/public-api';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { OrderPaymentRecorderService } from './application/use-cases/order-payment-recorder';
import { ORDER_PAYMENT_RECORDER } from './public-api';
import { ORDER_REPOSITORY, type OrderRepository } from './domain/repositories/order.repository';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository';
import { CREATE_ORDER_USE_CASE, GET_ORDER_USE_CASE } from './orders.tokens';
import { OrdersController } from './presentation/controllers/orders.controller';

/**
 * Orders bounded context — the Phase 1 reference slice. Use cases are plain
 * classes wired here with factories, so the application layer has no NestJS
 * dependency and is tested with in-memory fakes.
 */
@Module({
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    {
      provide: CREATE_ORDER_USE_CASE,
      inject: [
        UNIT_OF_WORK,
        ORDER_REPOSITORY,
        IDEMPOTENCY_STORE,
        DOMAIN_EVENT_PUBLISHER,
        MERCHANT_PAYMENT_PROFILE_READER,
        PAYMENT_PROVIDER_REGISTRY,
        ID_GENERATOR,
        CLOCK,
        HASHER,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        orders: OrderRepository,
        idempotency: IdempotencyStore,
        events: DomainEventPublisher,
        merchants: MerchantPaymentProfileReader,
        providers: PaymentProviderRegistry,
        ids: IdGenerator,
        clock: Clock,
        hasher: Hasher,
      ) =>
        new CreateOrderUseCase({
          unitOfWork,
          orders,
          idempotency,
          events,
          merchants,
          providers,
          ids,
          clock,
          hasher,
        }),
    },
    {
      provide: GET_ORDER_USE_CASE,
      inject: [ORDER_REPOSITORY],
      useFactory: (orders: OrderRepository) => new GetOrderUseCase(orders),
    },
    {
      provide: ORDER_PAYMENT_RECORDER,
      inject: [ORDER_REPOSITORY, DOMAIN_EVENT_PUBLISHER, CLOCK],
      useFactory: (orders: OrderRepository, events: DomainEventPublisher, clock: Clock) =>
        new OrderPaymentRecorderService(orders, events, clock),
    },
  ],
  exports: [ORDER_PAYMENT_RECORDER],
})
export class OrdersModule {}
