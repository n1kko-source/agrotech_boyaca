# Anti-sleep cron — Railway (AG-12)

El plan gratuito de Railway hiberna el servicio tras inactividad.
Se configura un cron externo ([cron-job.org](https://cron-job.org)) que llama
`GET /health` cada **25 minutos**.

## Configuración

| Campo | Valor |
|-------|--------|
| URL | `https://<tu-app>.up.railway.app/health` |
| Método | `GET` |
| Intervalo | cada 25 min (`*/25 * * * *` si el proveedor usa cron) |
| Esperado | HTTP 200 + body con `"status":"ok"` |

Respuesta de referencia:

```json
{
  "status": "ok",
  "service": "agrotech-backend",
  "timestamp": "2026-08-07T14:00:00.000Z"
}
```

Guía completa de aprovisionamiento: [`PROVISIONING.md`](./PROVISIONING.md).
