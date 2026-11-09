# ADR-0001: NestJS modular monolith with DDD and hexagonal architecture

- Status: Accepted
- Date: 2026-10-27

## Context

PayCo must ship branded USD pay-in in 10–14 weeks (PRD §1) while keeping the gateway replaceable
(§1 goals, §8 key risks) and adding payouts through a different partner later (§5.2). The domain
has strict invariants (money, idempotency, tenant isolation, ledger balance) and several
asynchronous flows (webhooks, reconciliation). The team is small; operational overhead must stay low.

## Decision

1. **Modular monolith.** One NestJS codebase and image; bounded contexts are modules under
   `src/modules/*` with private tables. Workers are separate processes from the same image.
   Extraction to services is possible later along module boundaries, but not planned.
2. **DDD tactical patterns** where invariants live: aggregates with versioning, value objects
   (`Money`), domain events, repository interfaces in the domain. CRUD-only contexts (e.g. health)
   do not get ceremonial layers.
3. **Hexagonal architecture.** Application use cases depend on ports (`OrderRepository`,
   `PaymentProvider`, `UnitOfWork`, `IdempotencyStore`, `DomainEventPublisher`, `Clock`,
   `SecretsProvider`). Adapters live in `infrastructure/` and `integrations/`.
4. **Framework-free core.** Domain and application layers import no NestJS, Prisma, AWS or provider
   SDK code. Use cases are plain classes wired by `useFactory` in each Nest module.
5. **Enforcement in CI**: ESLint layer rules + architecture tests over the import graph.
6. **Validation: Zod only** for HTTP input and environment; schemas also generate OpenAPI.
7. **Persistence: PostgreSQL via Prisma**, transactions through an `AsyncLocalStorage`-based
   `TransactionHost` so repositories join the ambient unit of work.
8. **Dependency lines**: NestJS 11, Prisma 6, TypeScript 5.9, Jest 29, ESLint 9, Zod 4, Node 22.
   Newer majors existed at the time (NestJS 12, Prisma 7/8, TypeScript 7) but were not adopted for
   the foundation: Prisma 7+ changes client generation and requires driver adapters; TypeScript 7
   tooling compatibility with ts-jest/ESLint was unverified. Upgrades are tracked in the checklist.

## Consequences

- + Fast to build and deploy; one transaction can span modules' tables when a use case needs it
  (rare, explicit, through ports).
- + Provider swap is a new adapter + data migration of `merchant_provider_accounts`, with no client
  API change.
- + Application logic is unit-tested in milliseconds with fakes.
- − Requires discipline: table ownership is a convention backed by tests, not by separate databases.
  Mitigation: architecture tests; optional per-module PostgreSQL schemas/roles later.
- − Factory wiring is more verbose than `@Injectable()` in use cases. Accepted for a clean core.
