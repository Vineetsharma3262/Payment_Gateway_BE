-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "brand_color" VARCHAR(7),
ADD COLUMN     "fee_schedule_id" VARCHAR(40),
ADD COLUMN     "logo_url" VARCHAR(500),
ADD COLUMN     "payment_methods" TEXT[] DEFAULT ARRAY['card']::TEXT[],
ADD COLUMN     "statement_descriptor" VARCHAR(22),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(40) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(40) NOT NULL,
    "user_id" VARCHAR(40) NOT NULL,
    "family_id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40),
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" VARCHAR(40) NOT NULL,
    "user_id" VARCHAR(40) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" VARCHAR(40) NOT NULL,
    "user_id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_user_id" VARCHAR(40) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_applications" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "legal_business_name" VARCHAR(200),
    "doing_business_as" VARCHAR(200),
    "business_type" VARCHAR(32),
    "ein_encrypted" TEXT,
    "ein_last4" VARCHAR(4),
    "website" VARCHAR(300),
    "phone" VARCHAR(32),
    "address" JSONB,
    "owners" JSONB NOT NULL DEFAULT '[]',
    "bank_account" JSONB,
    "provider_requirements" JSONB NOT NULL DEFAULT '[]',
    "provider_terms_accepted_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_documents" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "application_id" VARCHAR(40) NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "retain_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40),
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" VARCHAR(40) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" VARCHAR(40) NOT NULL,
    "request_id" VARCHAR(80),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(40) NOT NULL,
    "api_key_id" VARCHAR(40) NOT NULL,
    "mode" "ApiMode" NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "request_id" VARCHAR(80),
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "memberships_merchant_id_idx" ON "memberships"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_merchant_id_key" ON "memberships"("user_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_merchant_id_idx" ON "invitations"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_applications_merchant_id_key" ON "onboarding_applications"("merchant_id");

-- CreateIndex
CREATE INDEX "onboarding_applications_status_idx" ON "onboarding_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_documents_storage_key_key" ON "onboarding_documents"("storage_key");

-- CreateIndex
CREATE INDEX "onboarding_documents_merchant_id_idx" ON "onboarding_documents"("merchant_id");

-- CreateIndex
CREATE INDEX "audit_records_merchant_id_occurred_at_idx" ON "audit_records"("merchant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_records_resource_type_resource_id_idx" ON "audit_records"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "api_request_logs_merchant_id_created_at_idx" ON "api_request_logs"("merchant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "onboarding_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Constraints Prisma cannot express (see docs/architecture/data-model.md) ───
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_status_valid" CHECK ("status" IN ('active', 'disabled'));
ALTER TABLE "users" ADD CONSTRAINT "users_password_argon2id" CHECK ("password_hash" LIKE '$argon2id$%');
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_valid"
  CHECK ("role" IN ('owner', 'admin', 'developer', 'finance', 'support', 'viewer'));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_valid"
  CHECK ("role" IN ('admin', 'developer', 'finance', 'support', 'viewer'));
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_brand_color_hex" CHECK ("brand_color" IS NULL OR "brand_color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_logo_https" CHECK ("logo_url" IS NULL OR "logo_url" LIKE 'https://%');
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_status_valid"
  CHECK ("status" IN ('draft', 'submitted', 'pending_review', 'needs_information', 'approved', 'rejected'));

-- Audit records are append-only.
CREATE FUNCTION payco_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER audit_records_append_only
  BEFORE UPDATE OR DELETE ON "audit_records"
  FOR EACH ROW EXECUTE FUNCTION payco_forbid_mutation();
