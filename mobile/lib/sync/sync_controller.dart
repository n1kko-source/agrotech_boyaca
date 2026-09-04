import 'dart:async';

import 'package:flutter/foundation.dart';

import '../auth/auth_controller.dart';
import '../auth/models.dart';
import 'models.dart';
import 'network_status.dart';
import 'sync.constants.dart';
import 'sync_engine.dart';

typedef SyncTimerFactory =
    Timer Function(Duration duration, void Function() callback);

/// Owns the visual sync state and fires `POST /sync` when the radio
/// comes back. Feature screens write through this facade so the banner
/// stays in lockstep with the queue.
class SyncController extends ChangeNotifier {
  SyncController({
    required SyncEngine engine,
    required AuthController auth,
    required NetworkStatus network,
    SyncTimerFactory? scheduleTimer,
  }) : this._(engine, auth, network, scheduleTimer ?? Timer.new);

  SyncController._(
    this._engine,
    this._auth,
    this._network,
    this._scheduleTimer,
  ) {
    _auth.addListener(_onAuthChanged);
    _networkSub = _network.changes.listen(_onNetwork);
    unawaited(_bootstrap());
  }

  final SyncEngine _engine;
  final AuthController _auth;
  final NetworkStatus _network;
  final SyncTimerFactory _scheduleTimer;
  StreamSubscription<bool>? _networkSub;
  Timer? _retryTimer;
  int _retryStep = 0;
  bool _flushFailed = false;

  SyncUiStatus status = SyncUiStatus.offline;
  int pendingCount = 0;
  bool _online = false;
  bool _flushing = false;
  bool _needsReflush = false;

  SyncEngine get engine => _engine;

  Future<LocalPost> createPost({
    required String title,
    required String description,
    required String category,
  }) {
    return _write(
      (userId) => _engine.createPost(
        userId: userId,
        title: title,
        description: description,
        category: category,
      ),
    );
  }

  Future<LocalPost> updatePost({
    required String id,
    required String title,
    required String description,
    required String category,
  }) {
    return _write(
      (userId) => _engine.updatePost(
        userId: userId,
        id: id,
        title: title,
        description: description,
        category: category,
      ),
    );
  }

  Future<LocalProfile> upsertProfile({
    required String displayName,
    required String municipality,
    required String category,
    String bio = '',
  }) {
    return _write(
      (userId) => _engine.upsertProfile(
        userId: userId,
        displayName: displayName,
        municipality: municipality,
        category: category,
        bio: bio,
      ),
    );
  }

  Future<LocalConversation> startConversation({required String postId}) {
    return _write(
      (userId) => _engine.startConversation(userId: userId, postId: postId),
    );
  }

  Future<LocalMessage> sendMessage({
    required String conversationId,
    required String body,
  }) {
    return _write(
      (userId) => _engine.sendMessage(
        userId: userId,
        conversationId: conversationId,
        body: body,
      ),
    );
  }

  Future<LocalPrice> upsertPrice({
    required String producto,
    required String region,
    required double precio,
    String unidad = 'kg',
  }) {
    return _write(
      (userId) => _engine.upsertPrice(
        userId: userId,
        producto: producto,
        region: region,
        precio: precio,
        unidad: unidad,
      ),
    );
  }

  Future<void> flushNow() => _flush();

  /// Radio still up after the process returns to the foreground:
  /// flush now and restart the backoff series.
  void onAppResumed() {
    if (!_online) {
      return;
    }
    _resetBackoff();
    unawaited(_flush());
  }

  @override
  void dispose() {
    _auth.removeListener(_onAuthChanged);
    unawaited(_networkSub?.cancel());
    _cancelRetryTimer();
    super.dispose();
  }

  void _onAuthChanged() {
    unawaited(_reconcile());
  }

  void _onNetwork(bool online) {
    final wasOffline = !_online;
    _online = online;
    if (!online) {
      _resetBackoff();
      _publishStatus();
      return;
    }
    if (wasOffline) {
      _resetBackoff();
      unawaited(_flush());
      return;
    }
    unawaited(_refreshPending().then((_) => _publishStatus()));
  }

  Future<void> _bootstrap() async {
    _online = await _network.isOnline;
    await _reconcile();
  }

  Future<void> _reconcile() async {
    if (!_signedIn) {
      pendingCount = 0;
      _flushFailed = false;
      _resetBackoff();
      _publishStatus();
      return;
    }
    await _refreshPending();
    if (!_online) {
      _resetBackoff();
      _publishStatus();
      return;
    }
    await _flush();
  }

  Future<T> _write<T>(Future<T> Function(String userId) action) async {
    final userId = _auth.session?.sub;
    if (userId == null) {
      throw StateError('No session');
    }
    final result = await action(userId);
    await _refreshPending();
    if (_online) {
      _resetBackoff();
      unawaited(_flush());
    } else {
      _publishStatus();
    }
    return result;
  }

  Future<void> _flush() async {
    if (!_signedIn) {
      return;
    }
    if (!_online) {
      _resetBackoff();
      _publishStatus();
      return;
    }
    if (_flushing) {
      _needsReflush = true;
      return;
    }
    _cancelRetryTimer();
    _flushing = true;
    _publishStatus();
    try {
      do {
        _needsReflush = false;
        await _engine.flush(_auth.session!.sub);
        await _refreshPending();
      } while (_needsReflush && _online);
      _flushFailed = false;
      _retryStep = 0;
      if (_online && pendingCount > 0) {
        _scheduleRetry(useCapOnly: false);
      }
    } on NetworkException {
      _flushFailed = true;
      await _refreshPending();
      _scheduleRetry(useCapOnly: false);
    } on ApiException catch (error) {
      _flushFailed = true;
      await _refreshPending();
      if (error.isUnauthorized) {
        return;
      }
      if (error.isThrottled || error.status >= 500) {
        _scheduleRetry(useCapOnly: false);
        return;
      }
      _scheduleRetry(useCapOnly: true);
    } finally {
      _flushing = false;
      _publishStatus();
    }
  }

  Future<void> _refreshPending() async {
    final userId = _auth.session?.sub;
    pendingCount = userId == null ? 0 : await _engine.pendingCount(userId);
    notifyListeners();
  }

  void _scheduleRetry({required bool useCapOnly}) {
    _cancelRetryTimer();
    if (!_online || !_signedIn) {
      _publishStatus();
      return;
    }
    if (pendingCount == 0 && !_flushFailed) {
      _publishStatus();
      return;
    }
    final Duration delay;
    if (useCapOnly) {
      delay = syncRetryDelays.last;
      _retryStep = syncRetryDelays.length - 1;
    } else {
      final index = _retryStep.clamp(0, syncRetryDelays.length - 1);
      delay = syncRetryDelays[index];
      if (_retryStep < syncRetryDelays.length - 1) {
        _retryStep++;
      }
    }
    _retryTimer = _scheduleTimer(delay, () {
      _retryTimer = null;
      unawaited(_flush());
    });
    _publishStatus();
  }

  void _resetBackoff() {
    _retryStep = 0;
    _cancelRetryTimer();
  }

  void _cancelRetryTimer() {
    _retryTimer?.cancel();
    _retryTimer = null;
  }

  void _publishStatus() {
    if (!_online) {
      status = SyncUiStatus.offline;
      notifyListeners();
      return;
    }
    if (!_signedIn) {
      status = SyncUiStatus.synced;
      notifyListeners();
      return;
    }
    if (_flushing || _retryTimer != null || pendingCount > 0 || _flushFailed) {
      status = SyncUiStatus.syncing;
      notifyListeners();
      return;
    }
    status = SyncUiStatus.synced;
    notifyListeners();
  }

  bool get _signedIn =>
      _auth.phase == AuthPhase.signedIn && _auth.session != null;
}
