CREATE TABLE "verification_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_events_target_user_id_idx" ON "verification_events"("target_user_id");

ALTER TABLE "users" ADD CONSTRAINT "users_admin_email_required" CHECK (
    "role" <> 'ADMIN' OR (
        "email_enc" IS NOT NULL
        AND "email_hash" IS NOT NULL
        AND "nit_enc" IS NULL
        AND "nit_hash" IS NULL
        AND "entity_type" IS NULL
    )
);
