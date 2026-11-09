# Module ownership and dependency rules

## Layer rules (enforced by ESLint and `src/tests/architecture`)

| Layer | May import | Must not import |
|---|---|---|
| `domain/` | its own module's domain, `shared/domain` | NestJS, Prisma, AWS SDK, ioredis, express, pino, provider SDKs; any application/infrastructure/presentation/integrations code |
| `application/` | domain, `shared/application`, other modules' `public-api.ts`, `integrations/*/domain-ports` | NestJS, Prisma, AWS SDK, ioredis, express; infrastructure; presentation; provider adapters |
| `infrastructure/` | anything inward + frameworks/SDKs | presentation |
| `presentation/` | application, shared/presentation, NestJS, Swagger, Zod | integrations (provider types never reach response DTOs) |
| `integrations/` | `shared/domain`, `shared/application` | business modules |

Use cases are plain classes; each `*.module.ts` wires them with `useFactory`, so the application
layer has no framework dependency and is tested with in-memory fakes.

## Cross-module rules

1. A module talks to another **only** through that module's `public-api.ts` (types + DI tokens,
   framework-free) or, in `*.module.ts`, by importing the other Nest module for wiring.
2. A module's tables are read and written **only** by that module's infrastructure layer. No
   cross-module joins in repositories; compose in the application layer via public APIs, or build a
   read model in Reporting from events.
3. Cross-context side effects go through **domain events in the outbox**, not synchronous calls,
   unless the caller needs the answer to proceed (then a public-api query).
4. Provider identifiers live only in `provider_resource_mappings` and `merchant_provider_accounts`.

## Ownership

Status: ✅ implemented (persisted, endpoints live) · 🧩 core (domain + use cases tested; routes answer 501) · ⏳ planned

| Context (module) | Owns (aggregates / tables) | Exposes to others (`public-api.ts`) | Status |
|---|---|---|---|
| Identity & Access (`identity-access`) | User, RefreshSession (`refresh_tokens`), PasswordResetToken | `UserDirectory`; `ACCESS_TOKEN_VERIFIER` for the JWT guard | ✅ |
| Team Access (`team-access`) | Membership, Invitation | `TeamDirectory`; `PERMISSION_CHECKER` | ✅ |
| Merchant Onboarding (`merchant-onboarding`) | OnboardingApplication, OnboardingDocument | `OnboardingStarter` | ✅ |
| Merchant Management (`merchants`) | Merchant, MerchantProviderAccount | `MerchantPaymentProfileReader`, `MerchantRegistrar`, `MerchantLifecycle` | ✅ |
| API Credentials (`api-credentials`) | ApiKey, ApiRequestLog | `ApiKeyIssuer`; `API_KEY_AUTHENTICATOR` for the API-key guard | ✅ |
| Audit (`audit`) | AuditRecord (append-only) | `AUDIT_LOG` port (shared) | ✅ |
| Notifications (`notifications`) | — (templates later) | `EMAIL_SENDER` port | ✅ port / ⏳ vendor |
| Orders (`orders`) | Order | `OrderPaymentRecorder` | ✅ |
| Health (`health`) | — | — | ✅ |
| Customers (`customers`) | Customer | — | 🧩 |
| Payments (`payments`) | Payment | `PaymentReader` | 🧩 |
| Refunds (`refunds`) | Refund | — | 🧩 |
| Payment Links (`payment-links`) | PaymentLink | — | 🧩 |
| Ledger (`ledger`) | JournalTransaction (+ chart of accounts) | `LedgerService` | 🧩 |
| Platform Fees (`platform-fees`) | FeeSchedule (versioned), FeeRecord | default schedule | 🧩 (GET live) |
| Settlements (`settlements`) | Settlement | — | 🧩 |
| Reconciliation (`reconciliation`) | match results / runs | `reconcile()` | 🧩 |
| Disputes (`disputes`) | Dispute | — | 🧩 |
| Webhooks (`webhooks`) | ProviderEvent, WebhookEndpoint, WebhookDelivery | event catalogue, signer | 🧩 |
| Invoices (`invoices`) | Invoice | — | 🧩 |
| Subscriptions (`subscriptions`) | Subscription | — | 🧩 |
| Payouts (`payouts`) | Recipient, Payout, limits | — | 🧩 (partner TBD) |
| Reporting (`reporting`) | read models only | — | ⏳ |
| Platform (`shared/infrastructure`) | IdempotencyRecord, OutboxEvent | `IdempotencyStore`, `DomainEventPublisher`, `UnitOfWork` | ✅ |
| Integration mapping | ProviderResourceMapping (written by owning module) | provider-id → PayCo-id lookup | ✅ (orders) |

Cross-context calls currently in use: Identity → Merchants/Team/Onboarding/API Credentials
(registration, one transaction); Onboarding → Merchants (`ensureProviderAccount`, `enableLiveCharges`);
API Credentials → Merchants (live-key gating); Orders → Merchants (payment profile);
Payments → Orders (`markPaid`); Refunds → Payments (`PaymentReader`). Modules that publish
cross-context ports are `@Global()` to avoid circular Nest imports.

## Endpoint visibility

| Audience | Auth | Endpoints |
|---|---|---|
| Merchant server (public API) | secret API key | `/v1/orders`, `/v1/payments`, `/v1/payments/:id/refunds`, `/v1/payment-links`, `/v1/settlements`, `/v1/recipients`, `/v1/payouts`, `/v1/webhook-endpoints` |
| Merchant dashboard users | JWT session + RBAC | onboarding, team, API credentials, webhook delivery logs, request logs, reports, reconciliation records |
| Approved partners | partner credential (mTLS/OAuth, TBD) | `POST /v1/accounts` (PRD §7.1 "partner use") |
| PayCo internal administrators | SSO + admin RBAC, separate network path | merchant management, onboarding review status, pricing configuration, audit queries, DLQ replay |
| Infrastructure | none (private network) | `/health/live`, `/health/ready` |
| Gateway | provider signature | `/webhooks/providers/:provider/:mode` |

Live today: orders, auth, team, merchant settings, onboarding, developers (API keys, request
logs), admin (merchants, onboarding decisions, audit, fee-schedule list), health. Every other route
listed in the brief is published in OpenAPI and answers `501 not_implemented` after authentication
and validation.
