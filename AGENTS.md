# AI Coding Instructions for PayCo

Before implementing a feature, read:
1. `docs/PRD_White_Label_Payments.pdf`
2. `docs/BACKEND_ARCHITECTURE.md`
3. `docs/OPEN_QUESTIONS.md`

## Rules
- Treat the PRD as the business source of truth and architecture documentation as the technical baseline.
- Use NestJS + TypeScript, DDD, and Hexagonal Architecture unless a documented decision changes this.
- Keep domain logic independent of NestJS, Prisma, AWS SDKs, and provider SDKs.
- Use integer cents for USD; never use floating-point values for money.
- Never store raw card data or CVV.
- Implement idempotency, webhook signature verification, durable event processing, auditability, and reconciliation for relevant flows.
- Do not assume that Razorpay US supports a capability unless it is confirmed in current provider documentation or written confirmation.
- Do not design a pooled merchant-funds flow. Follow the PRD's direct-to-merchant settlement approach unless the legal/provider model is formally confirmed otherwise.
- Call out assumptions and unresolved requirements explicitly.
- For each change, include tests and update the relevant documentation.
- Do not add secrets to source control. Keep `.env.example` limited to placeholder values.
