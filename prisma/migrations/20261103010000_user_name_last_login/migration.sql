-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" VARCHAR(120);
