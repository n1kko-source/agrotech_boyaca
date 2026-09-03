-- AG-29: listing gate. Status is derived from current_period_end (no stored enum).
-- Payments are off-platform; ADMIN records them. No PII.
CREATE TABLE "subscriptions" (
    "user_id" UUID NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "reminded_expiry_at" TIMESTAMP(3),
    "reminded_grace_at" TIMESTAMP(3),
    "reminded_hidden_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "reference" TEXT,
    "period_end_after" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_payments_target_user_id_channel_reference_key"
  ON "subscription_payments"("target_user_id", "channel", "reference");

CREATE INDEX "subscription_payments_target_user_id_idx"
  ON "subscription_payments"("target_user_id");

ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
