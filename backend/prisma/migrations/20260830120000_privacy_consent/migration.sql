ALTER TABLE "users" ADD COLUMN "privacy_policy_version" TEXT;
ALTER TABLE "users" ADD COLUMN "privacy_policy_accepted_at" TIMESTAMPTZ(6);

ALTER TABLE "users" ADD CONSTRAINT "users_privacy_consent_paired" CHECK (
    ("privacy_policy_version" IS NULL AND "privacy_policy_accepted_at" IS NULL)
    OR ("privacy_policy_version" IS NOT NULL AND "privacy_policy_accepted_at" IS NOT NULL)
);

CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deletion_requests_user_id_key" ON "deletion_requests"("user_id");
