-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApiMode" AS ENUM ('test', 'live');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('onboarding', 'active', 'suspended', 'closed');

-- CreateTable
CREATE TABLE "merchants" (
    "id" VARCHAR(40) NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'onboarding',
    "live_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_provider_accounts" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "mode" "ApiMode" NOT NULL,
    "provider_account_id" VARCHAR(100) NOT NULL,
    "provider_status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "mode" "ApiMode" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "secret_hash" VARCHAR(128) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "mode" "ApiMode" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "receipt" VARCHAR(40),
    "notes" JSONB NOT NULL DEFAULT '{}',
    "failure_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_resource_mappings" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "resource_type" VARCHAR(32) NOT NULL,
    "resource_id" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "mode" "ApiMode" NOT NULL,
    "provider_resource_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_resource_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "resource_id" VARCHAR(40),
    "outcome" JSONB,
    "locked_until" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" VARCHAR(40) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(1000),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_provider_accounts_merchant_id_mode_key" ON "merchant_provider_accounts"("merchant_id", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_provider_accounts_provider_mode_provider_account_i_key" ON "merchant_provider_accounts"("provider", "mode", "provider_account_id");

-- CreateIndex
CREATE INDEX "api_keys_merchant_id_idx" ON "api_keys"("merchant_id");

-- CreateIndex
CREATE INDEX "orders_merchant_id_created_at_idx" ON "orders"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_merchant_id_id_key" ON "orders"("merchant_id", "id");

-- CreateIndex
CREATE INDEX "provider_resource_mappings_merchant_id_idx" ON "provider_resource_mappings"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_resource_mappings_provider_mode_resource_type_prov_key" ON "provider_resource_mappings"("provider", "mode", "resource_type", "provider_resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_resource_mappings_resource_type_resource_id_provid_key" ON "provider_resource_mappings"("resource_type", "resource_id", "provider");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_merchant_id_scope_key_key" ON "idempotency_records"("merchant_id", "scope", "key");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_next_attempt_at_idx" ON "outbox_events"("published_at", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "merchant_provider_accounts" ADD CONSTRAINT "merchant_provider_accounts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Constraints Prisma cannot express. Keep in sync with docs/architecture/data-model.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- Money: positive integer cents, USD only during the initial PRD scope.
ALTER TABLE "orders" ADD CONSTRAINT "orders_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_usd" CHECK ("currency" = 'USD');
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid"
  CHECK ("status" IN ('created', 'awaiting_payment', 'paid', 'expired', 'failed'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_version_non_negative" CHECK ("version" >= 0);

-- Provider mappings cover a closed set of PayCo resource types.
ALTER TABLE "provider_resource_mappings" ADD CONSTRAINT "provider_resource_mappings_type_valid"
  CHECK ("resource_type" IN ('order', 'payment', 'refund', 'settlement', 'dispute'));

-- Idempotency outcome is written once.
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_completion_consistent"
  CHECK (("completed_at" IS NULL) = ("outcome" IS NULL));

-- API keys: keyed-hash only (hex HMAC-SHA256), never plaintext.
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_secret_hash_format" CHECK ("secret_hash" ~ '^[0-9a-f]{64}$');

-- Outbox relay scan: unpublished events ordered by next attempt.
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
