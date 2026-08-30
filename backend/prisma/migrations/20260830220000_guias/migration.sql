-- AG-26: technical guides metadata (PDF/audio). Objects live in R2 prefix guias/.
CREATE TABLE "guias" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "subsector" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guias_object_key_key" ON "guias"("object_key");

CREATE INDEX "guias_categoria_created_at_idx" ON "guias"("categoria", "created_at");

ALTER TABLE "guias"
  ADD CONSTRAINT "guias_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "r2_monthly_reads" (
    "month" TEXT NOT NULL,
    "reads" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "r2_monthly_reads_pkey" PRIMARY KEY ("month")
);
