# Anti-sleep cron — Railway

El plan gratuito de Railway hiberna el servicio tras ~5 min de inactividad.
Se configura un cron externo (cron-job.org) que llama GET /health cada **25 minutos**.

URL: https://<tu-app>.railway.app/health
Intervalo: */25 * * * *
