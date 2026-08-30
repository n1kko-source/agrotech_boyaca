-- AG-23: latest COP price per agricultural product + region (no PII).
CREATE TABLE "commodity_prices" (
    "id" UUID NOT NULL,
    "producto" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'kg',
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "reported_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commodity_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commodity_prices_producto_region_key" ON "commodity_prices"("producto", "region");

ALTER TABLE "commodity_prices"
  ADD CONSTRAINT "commodity_prices_reported_by_fkey"
  FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
