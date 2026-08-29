# Notas de migración de tier

## Umbral de migración: 500 usuarios activos / mes

Cuando se supere este umbral se debe evaluar:

- Render Free → instancia de pago (sin spin-down) o VPS propio
- Upstash Redis 10k req/día → plan pago
- Supabase free → Pro (8 GB DB, edge functions ilimitadas)
- Cloudflare R2 → monitorear egress (5 GB/mes gratis)
- Supabase Free → Pro **incluye PITR**; hasta entonces el dump a R2 (AG-40) es el único respaldo

Aprovisionamiento inicial free-tier: [`PROVISIONING.md`](./PROVISIONING.md).
