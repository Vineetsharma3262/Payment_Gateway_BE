-- Phase 3: platform roles (super_admin / admin / staff).
--
-- `is_platform_admin` is kept as a cached boolean for existing authorisation
-- paths; it is TRUE iff `platform_role` ∈ ('super_admin','admin'). NULL
-- `platform_role` means the user is a tenant user (merchant staff) only.

ALTER TABLE "users"
  ADD COLUMN "platform_role" VARCHAR(32);

ALTER TABLE "users"
  ADD CONSTRAINT "users_platform_role_check"
  CHECK (
    "platform_role" IS NULL
    OR "platform_role" IN ('super_admin', 'admin', 'staff')
  );

-- Backfill: any user already flagged as platform admin becomes `admin`.
UPDATE "users" SET "platform_role" = 'admin' WHERE "is_platform_admin" = TRUE;

-- Keep the cached boolean in sync with the role.
ALTER TABLE "users"
  ADD CONSTRAINT "users_platform_role_boolean_consistent"
  CHECK (
    ("platform_role" IS NULL AND "is_platform_admin" = FALSE)
    OR ("platform_role" = 'staff' AND "is_platform_admin" = FALSE)
    OR ("platform_role" IN ('super_admin', 'admin') AND "is_platform_admin" = TRUE)
  );

CREATE INDEX "users_platform_role_idx"
  ON "users" ("platform_role")
  WHERE "platform_role" IS NOT NULL;
