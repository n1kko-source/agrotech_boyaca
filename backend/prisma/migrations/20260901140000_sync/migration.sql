-- AG-27: offline batch sync log + LWW clocks (no PII).
CREATE TABLE "sync_ops" (
    "op_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "record" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_ops_pkey" PRIMARY KEY ("op_id")
);

CREATE INDEX "sync_ops_user_id_created_at_idx" ON "sync_ops"("user_id", "created_at");

ALTER TABLE "sync_ops"
  ADD CONSTRAINT "sync_ops_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sync_clocks" (
    "entity" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "last_write_at" TIMESTAMP(3) NOT NULL,
    "last_op_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sync_clocks_pkey" PRIMARY KEY ("entity", "entity_key")
);

CREATE INDEX "sync_clocks_user_id_idx" ON "sync_clocks"("user_id");

ALTER TABLE "sync_clocks"
  ADD CONSTRAINT "sync_clocks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
