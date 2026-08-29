CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "Role" AS ENUM ('NATURAL', 'JURIDICA');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'NATURAL',
    "phone_enc" BYTEA NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "firebase_uid" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
