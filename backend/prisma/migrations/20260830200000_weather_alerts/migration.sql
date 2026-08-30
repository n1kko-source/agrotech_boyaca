-- AG-25: configurable weather alerts per user + municipality (no PII).
CREATE TABLE "weather_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "municipio" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weather_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weather_alerts_user_id_municipio_kind_key" ON "weather_alerts"("user_id", "municipio", "kind");

CREATE INDEX "weather_alerts_enabled_municipio_idx" ON "weather_alerts"("enabled", "municipio");

ALTER TABLE "weather_alerts"
  ADD CONSTRAINT "weather_alerts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
