# Notas de migración de tier

## Umbral de migración: 500 usuarios activos / mes

Cuando se supere este umbral se debe evaluar:

- Railway Starter → Railway Pro (o VPS propio)
- Upstash Redis 10k req/día → plan pago
- Supabase free → Pro (8 GB DB, edge functions ilimitadas)
- Cloudflare R2 → monitorear egress (5 GB/mes gratis)
