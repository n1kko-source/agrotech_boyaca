import 'package:connectivity_plus/connectivity_plus.dart';

abstract class NetworkStatus {
  Future<bool> get isOnline;

  Stream<bool> get changes;
}

class ConnectivityNetworkStatus implements NetworkStatus {
  ConnectivityNetworkStatus({Connectivity? connectivity})
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<bool> get isOnline async {
    final results = await _connectivity.checkConnectivity();
    return hasLink(results);
  }

  @override
  Stream<bool> get changes {
    return _connectivity.onConnectivityChanged.map(hasLink);
  }
}

bool hasLink(List<ConnectivityResult> results) {
  return results.any((result) => result != ConnectivityResult.none);
}
