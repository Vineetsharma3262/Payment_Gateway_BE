# PayCo Backend Architecture

## Purpose
This document is the initial technical blueprint for the PayCo white-label payments platform. The product PRD in `PRD_White_Label_Payments.pdf` remains the business source of truth.

## Initial technology decisions
- NestJS + TypeScript
- Domain-Driven Design (DDD) and Hexagonal Architecture
- Modular monolith initially
- PostgreSQL + Prisma
- Redis for caching/short-lived coordination where appropriate
- AWS-managed infrastructure and asynchronous workers where justified
- Jest for unit and integration tests
- OpenAPI/Swagger for API documentation
- Structured logging with sensitive data redaction

## Architectural rules
1. Domain layers must not import NestJS, Prisma, AWS SDKs, or payment-provider SDKs.
2. Application layers coordinate use cases and depend on domain abstractions.
3. Infrastructure implements repository, messaging, storage, and provider ports.
4. Presentation/controllers validate transport input and invoke application use cases.
5. Keep modules cohesive; avoid a single giant shared service or cross-module database coupling.
6. Use internal PayCo IDs for public API resources; keep provider IDs internal unless explicitly required.
7. Store USD amounts as integer minor units (cents); never use floating-point arithmetic for money.
8. Never store raw card numbers or CVV. Use provider-hosted fields/tokenization or approved hosted checkout.
9. Use idempotency keys for externally retried create/payment operations.
10. Verify provider webhook signatures against the raw request body, deduplicate events, and handle out-of-order delivery.
11. Use a transactional outbox or equivalent reliable delivery pattern for database changes that trigger asynchronous work.
12. Implement an immutable, balanced double-entry ledger and reconciliation workflows before relying on financial reports.
13. Do not assume the platform may hold or pool merchant funds. Follow the PRD's direct-to-merchant settlement model unless qualified payments counsel and the provider confirm otherwise.
14. Do not represent an unconfirmed provider capability as available. Track it in `OPEN_QUESTIONS.md`.

## Suggested module layout
Each business module may use this structure as it grows:

```text
module-name/
  domain/
    entities/
    value-objects/
    services/
    events/
    repositories/
    errors/
  application/
    use-cases/
    dto/
    ports/
  infrastructure/
    persistence/
    adapters/
  presentation/
    http/
    dto/
    guards/
```

Do not create every folder mechanically on day one. Add the layers needed for the first vertical slice and expand when complexity warrants it.

## Initial business modules
- identity-access
- merchant-onboarding
- merchants
- team-access
- api-credentials
- customers
- orders
- payments
- refunds
- payment-links
- ledger
- platform-fees
- settlements
- reconciliation
- disputes
- webhooks
- notifications
- invoices
- subscriptions
- payouts
- reporting
- audit
- health

## Provider abstraction
Define PayCo-owned ports/interfaces for payment operations and implement provider adapters separately. The application layer must not call Razorpay or Stripe SDKs directly. Treat Stripe Connect as a potential alternative only after validating its suitability and commercial/legal requirements.

## Payment lifecycle and reliability
- Persist idempotency key, request fingerprint, status, and response mapping.
- Model pending/unknown outcomes explicitly; do not blindly retry a request when the provider may have processed it.
- Store provider webhook events durably before asynchronous processing.
- Make event processing idempotent and safe for duplicates and out-of-order delivery.
- Reconcile provider transactions, fees, and settlement reports against PayCo records on a schedule.
- Keep audit trails for sensitive administrative and financial actions.

## Suggested implementation sequence
1. Bootstrap NestJS, linting, formatting, configuration validation, health endpoint, structured logging, and tests.
2. Implement identity/access and merchant onboarding skeleton.
3. Implement provider ports plus a fake provider adapter for tests.
4. Implement one vertical slice: create order -> initiate payment -> process provider event -> query payment.
5. Add ledger invariants, refunds, fees, settlement records, and reconciliation.
6. Add payment links, webhooks, notifications, reporting, and later-phase payouts according to PRD priority.

## Important unresolved questions
Confirm with the provider and qualified US payments counsel:
- Whether the required US platform/sub-merchant programme is supported.
- Whether checkout, emails, receipts, and statement descriptors can be branded as required.
- Whether platform fees/split settlement and webhooks across connected accounts are supported.
- Who bears negative balances, fraud losses, chargebacks, and reserves.
- What payout partner and legal model are required for any future payouts.
- Which licensing, KYB, privacy, recordkeeping, and contractual obligations apply to PayCo.
