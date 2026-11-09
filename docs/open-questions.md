# Open questions

Recorded from the PRD ("Open questions", §2 gaps, §3 "Requirements on the gateway", §8) and the
engineering brief. **None of these is answered by the code.** Capabilities that depend on them are
marked `unconfirmed` in the provider adapters and refused in live mode.

| # | Question | Source | Blocks | Owner | Status |
|---|---|---|---|---|---|
| Q1 | Does Razorpay US offer a white-label partner / sub-merchant (platform) programme, and on what terms? **Go / no-go.** | PRD §2, Open questions | Everything live; decision gate to fallback gateway | Business / Partnerships | Open |
| Q2 | Are API-created sub-merchant accounts, KYB/KYC submission by API, and webhooks for all sub-accounts delivered to PayCo supported under the proposed contract? How is a sub-account addressed on API calls (header, OAuth, separate keys)? | PRD §3 requirements | Merchant onboarding (P2), all gateway calls | Engineering + Razorpay | Open |
| Q3 | Can hosted checkout, emails, receipts and card statement descriptors be fully PayCo/client branded? Can gateway emails be turned off? | PRD §4, Open questions | Checkout design, `branding.statement_descriptor` | Product + Razorpay | Open |
| Q4 | Is a per-payment platform fee split (application fee) supported, or must PayCo bill clients separately? Is gateway reporting sufficient for billing? | PRD §3, Open questions | Platform fees & billing design (P4) | Finance + Razorpay | Open |
| Q5 | Which US payouts partner (bank with payments APIs vs payouts API company)? What is its FBO account model, rails (ACH, Same Day ACH, RTP/FedNow, wire, push-to-card), screening and approval obligations? | PRD §5.2, Open questions | Payouts (P5) | Business / Compliance | Open |
| Q6 | Which contractual party bears negative balances and merchant losses (chargebacks, ACH returns) under the gateway contract? | PRD §3, §8, Open questions | Risk limits, reserves, ledger accounts for losses | Legal / Finance | Open |
| Q7 | Which capabilities require a fallback gateway (e.g. Stripe Connect), and what are its eligibility and contractual requirements? | PRD §2 decision gate, Open questions | Stripe Connect adapter | Business + Engineering | Open |
| Q8 | What are PayCo's exact onboarding and regulatory obligations (data collected, retention periods, GLBA safeguards, state privacy laws, SOC 2 scope, 1099-K/1099-NEC responsibilities, OFAC screening ownership)? | PRD §8 ("confirm with US payments counsel") | Onboarding data model, document retention, audit | Legal / Compliance | Open |
| Q9 | Is Google Pay supported on Razorpay US? | PRD §2, Open questions | Payment-method configuration | Product + Razorpay | Open |
| Q10 | Does Razorpay US accept an idempotency key on order and refund creation, and does `GET /orders?receipt=` behave as in other regions? | Engineering (PRD §7.2 "passed through to the gateway") | Unknown-outcome recovery for refunds (P4) | Engineering | Open |
| Q11 | What settlement / reconciliation report formats and APIs are available for US sub-accounts (cards T+2, ACH T+5)? | PRD §5.1, §7.3 | Settlement import, nightly reconciliation (P4) | Engineering + Razorpay | Open |
| Q12 | Dispute evidence submission: API or manual? Deadlines per network? | PRD §5.1 | Disputes (P5) | Engineering + Razorpay | Open |
| Q14 | Which transactional email provider (and sending domain) will deliver receipts, resets and invitations? | Engineering (PRD §4 "receipts sent by PayCo") | Password reset / invitations in deployed environments (currently logged, not sent) | Engineering | Open |
| Q15 | How does the gateway accept merchant bank accounts — hosted field / token, Plaid-style verification, or raw numbers over API? | PRD 5.3 step 2 | Onboarding bank-account step (code accepts only a token + last 4) | Engineering + Razorpay | Open |
| Q16 | Retention periods for onboarding documents and KYB data (code assumes 7 years) and deletion obligations | PRD §8 | S3 lifecycle rules, data deletion | Legal / Compliance | Open |
| Q13 | Partner-facing `POST /v1/accounts`: who are the "approved partners", and how do they authenticate? | PRD §7.1 | Partner API | Product | Open |

## Engineering assumptions made pending answers (reversible)

- Sub-merchant scoping is sent as `X-Razorpay-Account` (Razorpay's convention in other regions).
  Isolated in `razorpay-http.client.ts`; change once Q2 is answered.
- PayCo order id is sent as Razorpay `receipt` so an order created during a lost response can be
  found again (Q10).
- Minimum/maximum order amounts are not enforced beyond `amount > 0`; limits will come from the
  merchant's risk configuration once Q6 is answered.

## Cross-reference with `docs/OPEN_QUESTIONS.md`

`docs/OPEN_QUESTIONS.md` (the checklist referenced by `AGENTS.md` and `BACKEND_ARCHITECTURE.md`)
tracks the same concerns at a coarser level. Mapping, so the two stay consistent until they are
consolidated into one file:

| `OPEN_QUESTIONS.md` item | Detailed entry here |
|---|---|
| US platform/sub-merchant programme eligibility and account model | Q1, Q2 |
| White-label checkout, hosted fields, receipts, emails, statement descriptors | Q3 |
| Platform fee collection/split settlement | Q4 |
| Connected-account webhook coverage and signature verification | Q2 |
| Liability for negative balances, disputes, chargebacks, reserves, fraud | Q6, Q12 |
| Settlement timing, currencies, reports, reconciliation files, bank-account requirements | Q11 |
| Payouts scope and payout partner | Q5 |
| US payments counsel review (licensing, money movement, KYB, privacy, contracts) | Q8 |
| Validate current provider API capabilities and commercial terms | Q7, Q9, Q10, Q13 |
