# Anti-sleep cron — Render (AG-12)

El plan **Free** de Render hiberna el Web Service tras **15 minutos** de inactividad.
El arranque en frío ronda **1 minuto** (inaceptable en 2G/3G rural si no hay ping).

Se configura un cron externo ([cron-job.org](https://cron-job.org)) que llama
`GET /health` cada **10 minutos**.

## Configuración

| Campo | Valor |
|-------|--------|
| URL | `https://<tu-app>.onrender.com/health` (p. ej. `https://agrotech-8p9b.onrender.com/health`) |
| Método | `GET` |
| Intervalo | cada 10 min (`*/10 * * * *` si el proveedor usa cron) |
| Esperado | HTTP 200 + body con `"status":"ok"` (JSON, no HTML de wake-up) |

Respuesta de referencia:

```json
{
  "status": "ok",
  "service": "agrotech-backend",
  "timestamp": "2026-08-07T14:00:00.000Z"
}
```

Guía completa de aprovisionamiento: [`PROVISIONING.md`](./PROVISIONING.md).
