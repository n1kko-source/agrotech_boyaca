/// Matches backend `SYNC_OPS_MAX` / `MESSAGE_BODY_*`.
const int syncOpsMax = 50;
const int messageBodyMin = 1;
const int messageBodyMax = 500;
const String pricesUnidadDefault = 'kg';
const String pricesMonedaDefault = 'COP';
const String sqliteDbFileName = 'agrotech.db';

/// Backoff after a failed `POST /sync` while the radio is still up.
/// 5xx / timeout / 429 walk the series; 400/403 jump to the cap.
const List<Duration> syncRetryDelays = [
  Duration(seconds: 5),
  Duration(seconds: 15),
  Duration(seconds: 45),
];
