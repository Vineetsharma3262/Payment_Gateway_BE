import { Global, Module } from '@nestjs/common';
import { CLOCK } from '../../application/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../application/domain-event-publisher.port';
import { ID_GENERATOR } from '../../application/id-generator.port';
import { IDEMPOTENCY_STORE } from '../../application/idempotency.port';
import { HASHER } from '../../application/request-hash';
import { SECURE_TOKEN_GENERATOR } from '../../application/secure-token.port';
import { UNIT_OF_WORK } from '../../application/unit-of-work.port';
import { PrismaIdempotencyStore } from '../idempotency/prisma-idempotency.store';
import { NodeHasher } from '../system/node-hasher';
import { RandomIdGenerator } from '../system/random-id-generator';
import { RandomTokenGenerator } from '../system/random-token-generator';
import { SystemClock } from '../system/system-clock';
import { OutboxEventPublisher } from './outbox-event-publisher';
import { PrismaService } from './prisma.service';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { TransactionHost } from './transaction-host';

/** Platform persistence and cross-cutting application ports shared by all modules. */
@Global()
@Module({
  providers: [
    PrismaService,
    TransactionHost,
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxEventPublisher },
    { provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: RandomIdGenerator },
    { provide: HASHER, useClass: NodeHasher },
    { provide: SECURE_TOKEN_GENERATOR, useClass: RandomTokenGenerator },
  ],
  exports: [
    PrismaService,
    TransactionHost,
    UNIT_OF_WORK,
    DOMAIN_EVENT_PUBLISHER,
    IDEMPOTENCY_STORE,
    CLOCK,
    ID_GENERATOR,
    HASHER,
    SECURE_TOKEN_GENERATOR,
  ],
})
export class DatabaseModule {}
