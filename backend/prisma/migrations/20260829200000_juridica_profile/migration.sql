CREATE TYPE "EntityType" AS ENUM ('ASOCIACION', 'COOPERATIVA', 'EMPRESA');

ALTER TABLE "users" ALTER COLUMN "phone_enc" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "phone_hash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "email_enc" BYTEA;
ALTER TABLE "users" ADD COLUMN "email_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "nit_enc" BYTEA;
ALTER TABLE "users" ADD COLUMN "nit_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "entity_type" "EntityType";
ALTER TABLE "users" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");
CREATE UNIQUE INDEX "users_nit_hash_key" ON "users"("nit_hash");

ALTER TABLE "users" ADD CONSTRAINT "users_natural_phone_required" CHECK (
    "role" <> 'NATURAL' OR ("phone_enc" IS NOT NULL AND "phone_hash" IS NOT NULL)
);

ALTER TABLE "users" ADD CONSTRAINT "users_juridica_profile_required" CHECK (
    "role" <> 'JURIDICA' OR (
        "email_enc" IS NOT NULL
        AND "email_hash" IS NOT NULL
        AND "nit_enc" IS NOT NULL
        AND "nit_hash" IS NOT NULL
        AND "entity_type" IS NOT NULL
    )
);

UPDATE "users" SET "verified" = true WHERE "role" = 'NATURAL';
