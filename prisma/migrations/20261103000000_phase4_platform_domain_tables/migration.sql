
-- CreateTable
CREATE TABLE "merchant_profiles" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "title" VARCHAR(16),
    "contact_name" VARCHAR(120),
    "trading_business_name" VARCHAR(240),
    "trading_address" VARCHAR(500),
    "corporate_address" VARCHAR(500),
    "trading_country" VARCHAR(80),
    "corporate_country" VARCHAR(80),
    "trading_state" VARCHAR(80),
    "trading_postal_code" VARCHAR(16),
    "corporate_state" VARCHAR(80),
    "corporate_postal_code" VARCHAR(16),
    "business_phone" VARCHAR(32),
    "contact_phone" VARCHAR(32),
    "secondary_contact_name" VARCHAR(120),
    "registration_number" VARCHAR(60),
    "trading_commencement_date" DATE,
    "date_of_incorporation" DATE,
    "default_time_zone" VARCHAR(60) NOT NULL DEFAULT 'UTC',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_profiles_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "merchant_payment_methods" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "method" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "merchant_payment_methods_pkey" PRIMARY KEY ("merchant_id","method")
);

-- CreateTable
CREATE TABLE "merchant_allowed_services" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "service" VARCHAR(32) NOT NULL,

    CONSTRAINT "merchant_allowed_services_pkey" PRIMARY KEY ("merchant_id","service")
);

-- CreateTable
CREATE TABLE "merchant_allowed_currencies" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "merchant_allowed_currencies_pkey" PRIMARY KEY ("merchant_id","currency")
);

-- CreateTable
CREATE TABLE "merchant_descriptors" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "descriptor" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_descriptors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_token_config" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "token_as_service" BOOLEAN NOT NULL DEFAULT false,
    "token_access_level" VARCHAR(32),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_token_config_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "merchant_kyc_config" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min_verification_level" VARCHAR(16) NOT NULL DEFAULT 'basic',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_kyc_config_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "merchant_limits_charges" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_method" VARCHAR(40) NOT NULL,
    "count_success_hourly" INTEGER NOT NULL DEFAULT 0,
    "count_success_daily" INTEGER NOT NULL DEFAULT 0,
    "count_success_weekly" INTEGER NOT NULL DEFAULT 0,
    "count_success_monthly" INTEGER NOT NULL DEFAULT 0,
    "count_rejected_hourly" INTEGER NOT NULL DEFAULT 0,
    "count_rejected_daily" INTEGER NOT NULL DEFAULT 0,
    "count_rejected_weekly" INTEGER NOT NULL DEFAULT 0,
    "count_rejected_monthly" INTEGER NOT NULL DEFAULT 0,
    "amount_total_hourly" BIGINT NOT NULL DEFAULT 0,
    "amount_total_daily" BIGINT NOT NULL DEFAULT 0,
    "amount_total_weekly" BIGINT NOT NULL DEFAULT 0,
    "amount_total_monthly" BIGINT NOT NULL DEFAULT 0,
    "amount_total_minimum" BIGINT NOT NULL DEFAULT 0,
    "amount_total_maximum" BIGINT NOT NULL DEFAULT 0,
    "amount_rejected_hourly" BIGINT NOT NULL DEFAULT 0,
    "amount_rejected_daily" BIGINT NOT NULL DEFAULT 0,
    "amount_rejected_weekly" BIGINT NOT NULL DEFAULT 0,
    "amount_rejected_monthly" BIGINT NOT NULL DEFAULT 0,
    "merchant_max_per_day_count" INTEGER NOT NULL DEFAULT 0,
    "merchant_max_per_day_total_amount" BIGINT NOT NULL DEFAULT 0,
    "route_to" VARCHAR(32) NOT NULL DEFAULT 'RULE_BASED_ROUTING',
    "transaction_fee_bps" INTEGER NOT NULL DEFAULT 0,
    "refund_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "chargeback_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "annual_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "fraud_refund_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "rolling_reserve_bps" INTEGER NOT NULL DEFAULT 0,
    "amount_unit" VARCHAR(8) NOT NULL DEFAULT 'MAJOR',
    "decline_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_limits_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_documents" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "content_type" VARCHAR(80) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "virus_scan_status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "uploaded_by" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "address" VARCHAR(500),
    "country" VARCHAR(80),
    "state" VARCHAR(80),
    "city" VARCHAR(80),
    "postal_code" VARCHAR(16),
    "email" VARCHAR(254),
    "live_api_url" VARCHAR(500),
    "test_api_url" VARCHAR(500),
    "allowed_currency" CHAR(3),
    "max_refund_days" INTEGER NOT NULL DEFAULT 180,
    "class_name" VARCHAR(120),
    "check_whitelist" BOOLEAN NOT NULL DEFAULT false,
    "is_network_token_allowed" BOOLEAN NOT NULL DEFAULT false,
    "provider_merchant_id_kms" VARCHAR(255),
    "api_secret_kms" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_payment_methods" (
    "bank_id" VARCHAR(40) NOT NULL,
    "method" VARCHAR(40) NOT NULL,

    CONSTRAINT "bank_payment_methods_pkey" PRIMARY KEY ("bank_id","method")
);

-- CreateTable
CREATE TABLE "mids" (
    "id" VARCHAR(40) NOT NULL,
    "bank_id" VARCHAR(40) NOT NULL,
    "mid" VARCHAR(60) NOT NULL,
    "mid_name" VARCHAR(120),
    "auth_key_kms" VARCHAR(255) NOT NULL,
    "mcc" CHAR(4),
    "status" VARCHAR(16) NOT NULL,
    "allowed_currency" VARCHAR(16) NOT NULL DEFAULT 'ALL',
    "currency_conversion" BOOLEAN NOT NULL DEFAULT false,
    "redirect_from_url" VARCHAR(500),
    "bank_descriptor" VARCHAR(80),
    "min_per_txn" BIGINT NOT NULL DEFAULT 0,
    "max_per_txn" BIGINT NOT NULL DEFAULT 0,
    "daily_amount" BIGINT NOT NULL DEFAULT 0,
    "monthly_amount" BIGINT NOT NULL DEFAULT 0,
    "daily_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mid_payment_methods" (
    "mid_id" VARCHAR(40) NOT NULL,
    "method" VARCHAR(40) NOT NULL,

    CONSTRAINT "mid_payment_methods_pkey" PRIMARY KEY ("mid_id","method")
);

-- CreateTable
CREATE TABLE "mid_extra_fields" (
    "id" VARCHAR(40) NOT NULL,
    "mid_id" VARCHAR(40) NOT NULL,
    "field_name" VARCHAR(80) NOT NULL,
    "field_value" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mid_extra_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mid_acquirer_3ds" (
    "mid_id" VARCHAR(40) NOT NULL,
    "bin" VARCHAR(16),
    "merchant_identifier" VARCHAR(60),
    "country" VARCHAR(80),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mid_acquirer_3ds_pkey" PRIMARY KEY ("mid_id")
);

-- CreateTable
CREATE TABLE "global_mid_limits" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minimum_hit_interval_minutes" INTEGER NOT NULL DEFAULT -1,
    "config_json" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_mid_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_categories" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" VARCHAR(40) NOT NULL,
    "category_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "descriptor" TEXT,
    "priority" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions_json" JSONB NOT NULL,
    "targets_json" JSONB NOT NULL,
    "created_by" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rule_tags" (
    "rule_id" VARCHAR(40) NOT NULL,
    "tag" VARCHAR(60) NOT NULL,

    CONSTRAINT "routing_rule_tags_pkey" PRIMARY KEY ("rule_id","tag")
);

-- CreateTable
CREATE TABLE "card_validation_rules" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rules_json" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_validation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_retry_config" (
    "merchant_id" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_attempts" INTEGER NOT NULL DEFAULT 2,
    "retry_on_different_mid" BOOLEAN NOT NULL DEFAULT true,
    "retry_window_seconds" INTEGER NOT NULL DEFAULT 300,
    "retryable_codes" JSONB NOT NULL DEFAULT '[]',
    "excluded_methods" JSONB NOT NULL DEFAULT '[]',
    "selected_category_ids" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_retry_config_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "cascading" (
    "bank_id" VARCHAR(40) NOT NULL,
    "processor_code" VARCHAR(60) NOT NULL,
    "allowed_banks" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cascading_pkey" PRIMARY KEY ("bank_id","processor_code")
);

-- CreateTable
CREATE TABLE "block_entries" (
    "id" VARCHAR(40) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "merchant_id" VARCHAR(40),
    "source" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(255),
    "triggered_by_rule_id" VARCHAR(40),
    "expires_at" TIMESTAMPTZ(3),
    "added_by" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "block_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_code_mappings" (
    "id" VARCHAR(40) NOT NULL,
    "bank_id" VARCHAR(40) NOT NULL,
    "paysecure_code" VARCHAR(60) NOT NULL,
    "processor_code" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_code_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_categories" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_category_mappings" (
    "id" VARCHAR(40) NOT NULL,
    "paysecure_code" VARCHAR(60) NOT NULL,
    "category_id" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_category_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_code_actions" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "processor" VARCHAR(60) NOT NULL DEFAULT 'Any processor',
    "error_codes" JSONB NOT NULL,
    "applies_to" VARCHAR(16) NOT NULL DEFAULT 'Include',
    "bin_ranges" JSONB NOT NULL DEFAULT '[]',
    "threshold_errors" INTEGER NOT NULL,
    "threshold_window" INTEGER NOT NULL,
    "threshold_unit" VARCHAR(8) NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "block_target" VARCHAR(16) NOT NULL,
    "block_scope" VARCHAR(16) NOT NULL,
    "cooldown_minutes" INTEGER NOT NULL,
    "amount_check_enabled" BOOLEAN NOT NULL DEFAULT false,
    "amount_min_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_max_minor" BIGINT NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_code_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_configs" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "payment_method" VARCHAR(40) NOT NULL,
    "settlement_fee" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "settlement_fee_kind" VARCHAR(16) NOT NULL DEFAULT 'Fixed',
    "start_date" DATE,
    "last_settlement_date" DATE,
    "last_run_on" DATE,
    "max_rr" INTEGER NOT NULL DEFAULT -1,
    "released_frequency" VARCHAR(16) NOT NULL DEFAULT 'Default',
    "settlement_currency" CHAR(3),
    "minimum_payout_minor" BIGINT NOT NULL DEFAULT 0,
    "t_plus_days" INTEGER NOT NULL DEFAULT 0,
    "rolling_period_days" INTEGER NOT NULL DEFAULT 0,
    "rolling_reserve_pct_bps" INTEGER NOT NULL DEFAULT 0,
    "settlement_risk_factor" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "frequency_type" VARCHAR(16),
    "settlement_frequency" JSONB,
    "payout_start_date" DATE,
    "payout_start_date_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "payment_method" VARCHAR(40) NOT NULL,
    "order_start_date" TIMESTAMPTZ(3) NOT NULL,
    "order_end_date" TIMESTAMPTZ(3) NOT NULL,
    "settlement_date" TIMESTAMPTZ(3),
    "gross_amount_minor" BIGINT NOT NULL,
    "settlement_fee_minor" BIGINT NOT NULL,
    "net_amount_minor" BIGINT NOT NULL,
    "payable_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "utr" VARCHAR(60),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" VARCHAR(40) NOT NULL,
    "settlement_id" VARCHAR(40) NOT NULL,
    "payment_id" VARCHAR(40),
    "refund_id" VARCHAR(40),
    "chargeback_id" VARCHAR(40),
    "kind" VARCHAR(16) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "fee_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "beneficiary_name" VARCHAR(240) NOT NULL,
    "beneficiary_bank" VARCHAR(120),
    "beneficiary_account_last4" CHAR(4),
    "beneficiary_ifsc" VARCHAR(16),
    "beneficiary_vpa" VARCHAR(80),
    "reference_id" VARCHAR(60),
    "utr" VARCHAR(60),
    "failure_reason" VARCHAR(255),
    "status_source" VARCHAR(32),
    "idempotency_key" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_events" (
    "id" BIGSERIAL NOT NULL,
    "payout_id" VARCHAR(40) NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(240),
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "country" CHAR(2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" VARCHAR(40) NOT NULL,
    "owner_user_id" VARCHAR(40) NOT NULL,
    "scope" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "filters_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "environment" "ApiMode" NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "subscribed_events" JSONB NOT NULL,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "live_mode" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" VARCHAR(40) NOT NULL,
    "webhook_event_id" VARCHAR(40) NOT NULL,
    "endpoint_id" VARCHAR(40) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "http_status" INTEGER,
    "response_body" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "next_retry_at" TIMESTAMPTZ(3),
    "succeeded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_payment_methods_merchant_id_sort_order_idx" ON "merchant_payment_methods"("merchant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_descriptors_merchant_id_descriptor_key" ON "merchant_descriptors"("merchant_id", "descriptor");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_limits_charges_merchant_id_currency_payment_method_key" ON "merchant_limits_charges"("merchant_id", "currency", "payment_method");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_documents_storage_key_key" ON "merchant_documents"("storage_key");

-- CreateIndex
CREATE INDEX "merchant_documents_merchant_id_category_idx" ON "merchant_documents"("merchant_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");

-- CreateIndex
CREATE INDEX "banks_enabled_status_idx" ON "banks"("enabled", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mids_bank_id_mid_key" ON "mids"("bank_id", "mid");

-- CreateIndex
CREATE UNIQUE INDEX "mid_extra_fields_mid_id_field_name_key" ON "mid_extra_fields"("mid_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "rule_categories_name_key" ON "rule_categories"("name");

-- CreateIndex
CREATE INDEX "routing_rules_category_id_priority_idx" ON "routing_rules"("category_id", "priority");

-- CreateIndex
CREATE INDEX "block_entries_type_expires_at_idx" ON "block_entries"("type", "expires_at");

-- CreateIndex
CREATE INDEX "block_entries_merchant_id_type_idx" ON "block_entries"("merchant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "error_code_mappings_bank_id_paysecure_code_key" ON "error_code_mappings"("bank_id", "paysecure_code");

-- CreateIndex
CREATE UNIQUE INDEX "error_categories_name_key" ON "error_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "error_category_mappings_paysecure_code_key" ON "error_category_mappings"("paysecure_code");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_configs_merchant_id_payment_method_key" ON "settlement_configs"("merchant_id", "payment_method");

-- CreateIndex
CREATE INDEX "settlements_merchant_id_settlement_date_idx" ON "settlements"("merchant_id", "settlement_date");

-- CreateIndex
CREATE INDEX "settlement_items_settlement_id_idx" ON "settlement_items"("settlement_id");

-- CreateIndex
CREATE INDEX "payouts_merchant_id_created_at_idx" ON "payouts"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_merchant_id_idempotency_key_key" ON "payouts"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payout_events_payout_id_created_at_idx" ON "payout_events"("payout_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_merchant_id_idx" ON "customers"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_merchant_id_email_key" ON "customers"("merchant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_owner_user_id_scope_name_key" ON "saved_views"("owner_user_id", "scope", "name");

-- CreateIndex
CREATE INDEX "webhook_endpoints_merchant_id_environment_idx" ON "webhook_endpoints"("merchant_id", "environment");

-- CreateIndex
CREATE INDEX "webhook_events_merchant_id_created_at_idx" ON "webhook_events"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_event_id_attempt_idx" ON "webhook_deliveries"("webhook_event_id", "attempt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_started_at_idx" ON "webhook_deliveries"("endpoint_id", "started_at");

-- AddForeignKey
ALTER TABLE "merchant_profiles" ADD CONSTRAINT "merchant_profiles_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_payment_methods" ADD CONSTRAINT "merchant_payment_methods_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_allowed_services" ADD CONSTRAINT "merchant_allowed_services_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_allowed_currencies" ADD CONSTRAINT "merchant_allowed_currencies_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_descriptors" ADD CONSTRAINT "merchant_descriptors_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_token_config" ADD CONSTRAINT "merchant_token_config_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_kyc_config" ADD CONSTRAINT "merchant_kyc_config_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_limits_charges" ADD CONSTRAINT "merchant_limits_charges_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_documents" ADD CONSTRAINT "merchant_documents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_methods" ADD CONSTRAINT "bank_payment_methods_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mids" ADD CONSTRAINT "mids_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mid_payment_methods" ADD CONSTRAINT "mid_payment_methods_mid_id_fkey" FOREIGN KEY ("mid_id") REFERENCES "mids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mid_extra_fields" ADD CONSTRAINT "mid_extra_fields_mid_id_fkey" FOREIGN KEY ("mid_id") REFERENCES "mids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mid_acquirer_3ds" ADD CONSTRAINT "mid_acquirer_3ds_mid_id_fkey" FOREIGN KEY ("mid_id") REFERENCES "mids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "rule_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rule_tags" ADD CONSTRAINT "routing_rule_tags_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "routing_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_retry_config" ADD CONSTRAINT "smart_retry_config_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cascading" ADD CONSTRAINT "cascading_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_entries" ADD CONSTRAINT "block_entries_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_code_mappings" ADD CONSTRAINT "error_code_mappings_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_category_mappings" ADD CONSTRAINT "error_category_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "error_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_configs" ADD CONSTRAINT "settlement_configs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

