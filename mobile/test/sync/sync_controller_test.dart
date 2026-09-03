import 'dart:async';

import 'package:agrotech_boyaca/app.dart';
import 'package:agrotech_boyaca/auth/auth_controller.dart';
import 'package:agrotech_boyaca/auth/auth_scope.dart';
import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';
import 'package:agrotech_boyaca/auth/ui/home_screen.dart';
import 'package:agrotech_boyaca/sync/models.dart';
import 'package:agrotech_boyaca/sync/sync.constants.dart';
import 'package:agrotech_boyaca/sync/sync_controller.dart';
import 'package:agrotech_boyaca/sync/sync_engine.dart';
import 'package:agrotech_boyaca/sync/sync_scope.dart';
import 'package:agrotech_boyaca/sync/ui/sync_status_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_auth.dart';
import '../helpers/fake_sync.dart';

void main() {
  testWidgets('banner labels the three sync states', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: SyncStatusBanner(status: SyncUiStatus.offline)),
    );
    expect(find.text('Sin conexión'), findsOneWidget);

    await tester.pumpWidget(
      const MaterialApp(home: SyncStatusBanner(status: SyncUiStatus.syncing)),
    );
    expect(find.text('Sincronizando…'), findsOneWidget);

    await tester.pumpWidget(
      const MaterialApp(home: SyncStatusBanner(status: SyncUiStatus.synced)),
    );
    expect(find.text('Sincronizado'), findsOneWidget);
  });

  testWidgets('home shows offline then synced after signal returns', (
    tester,
  ) async {
    final env = await _signedIn();
    await tester.pumpWidget(
      AuthScope(
        controller: env.auth,
        child: SyncScope(
          controller: env.sync,
          child: const MaterialApp(home: HomeScreen()),
        ),
      ),
    );
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await tester.pump();
    expect(find.byKey(const Key('sync_status')), findsOneWidget);
    expect(find.text('Sin conexión'), findsOneWidget);

    env.network.goOnline();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
    expect(find.text('Sincronizado'), findsOneWidget);
    expect(env.api.calls, 1);
  });

  testWidgets('resumed flushes without waiting for backoff', (tester) async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await tester.pumpWidget(AgroTechApp(auth: env.auth, sync: env.sync));
    await tester.pump();

    env.api.error = const NetworkException();
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
    expect(env.api.calls, 1);
    expect(find.text('Sincronizando…'), findsOneWidget);

    env.api.error = null;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));

    expect(env.api.calls, 2);
    expect(env.sync.pendingCount, 0);
    expect(find.text('Sincronizado'), findsOneWidget);
  });

  test('controller flushes the queue when connectivity returns', () async {
    final env = await _signedIn();
    await _drain();
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    expect(env.sync.status, SyncUiStatus.offline);
    expect(env.sync.pendingCount, 1);
    expect(env.api.calls, 0);

    env.network.goOnline();
    await _drain();

    expect(env.sync.status, SyncUiStatus.synced);
    expect(env.sync.pendingCount, 0);
    expect(env.api.calls, 1);
    expect(env.api.lastOps, hasLength(1));
    expect(env.api.lastOps.single.entity, SyncEntity.post);
  });

  test('NetworkException retries after 5s without a radio event', () async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await _drain();
    env.api.error = const NetworkException();
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await _drain();

    expect(env.api.calls, 1);
    expect(env.sync.pendingCount, 1);
    expect(env.sync.status, SyncUiStatus.syncing);
    expect(clock.delay, syncRetryDelays.first);
    expect(clock.scheduled, 1);

    clock.fire();
    await _drain();

    expect(env.api.calls, 2);
    expect(env.sync.pendingCount, 1);
    expect(clock.delay, syncRetryDelays[1]);
  });

  test('radio down cancels the retry timer', () async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await _drain();
    env.api.error = const NetworkException();
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await _drain();
    expect(env.api.calls, 1);
    expect(clock.scheduled, 1);

    env.network.goOffline();
    await _drain();
    expect(env.sync.status, SyncUiStatus.offline);

    clock.fire();
    await _drain();
    expect(env.api.calls, 1);
    expect(clock.scheduled, 1);
  });

  test('5xx keeps Sincronizando while the queue is not empty', () async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await _drain();
    env.api.error = const ApiException(
      status: 500,
      code: 'INTERNAL',
      message: 'down',
    );
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await _drain();

    expect(env.sync.status, SyncUiStatus.syncing);
    expect(env.sync.pendingCount, 1);
    expect(clock.delay, syncRetryDelays.first);

    env.api.error = null;
    clock.fire();
    await _drain();

    expect(env.api.calls, 2);
    expect(env.sync.pendingCount, 0);
    expect(env.sync.status, SyncUiStatus.synced);
  });

  test('400 retries at the 45s cap and does not mark synced', () async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await _drain();
    env.api.error = const ApiException(
      status: 400,
      code: 'VALIDATION',
      message: 'bad',
    );
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await _drain();

    expect(env.sync.status, SyncUiStatus.syncing);
    expect(env.sync.pendingCount, 1);
    expect(clock.delay, syncRetryDelays.last);
  });

  test('resume resets backoff and flushes immediately', () async {
    final clock = _ManualScheduler();
    final env = await _signedIn(online: true, scheduler: clock);
    await _drain();
    env.api.error = const NetworkException();
    await env.sync.createPost(
      title: 'Papa',
      description: 'Siachoque',
      category: 'papa',
    );
    await _drain();
    expect(env.api.calls, 1);
    expect(clock.delay, syncRetryDelays.first);

    env.api.error = null;
    env.sync.onAppResumed();
    await _drain();

    expect(env.api.calls, 2);
    expect(env.sync.pendingCount, 0);
    expect(env.sync.status, SyncUiStatus.synced);
  });
}

Future<void> _drain() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

Future<
  ({
    AuthController auth,
    SyncController sync,
    FakeSyncGateway api,
    FakeNetworkStatus network,
  })
>
_signedIn({bool online = false, _ManualScheduler? scheduler}) async {
  final tokens = MemoryTokenStore();
  final authApi = FakeAuthGateway(tokens);
  final auth = AuthController(store: tokens, api: authApi);
  await auth.restore();
  await auth.sendOtp('+573001112233');
  await auth.verifyOtp(code: '123456', acceptPrivacyPolicy: true);

  final store = MemoryLocalStore();
  final api = FakeSyncGateway();
  final network = FakeNetworkStatus(online: online);
  final sync = SyncController(
    engine: SyncEngine(store: store, api: api),
    auth: auth,
    network: network,
    scheduleTimer: scheduler?.call,
  );
  addTearDown(() {
    sync.dispose();
    unawaited(network.close());
  });
  return (auth: auth, sync: sync, api: api, network: network);
}

class _ManualTimer implements Timer {
  _ManualTimer(this._callback);

  final void Function() _callback;
  bool _isActive = true;

  @override
  void cancel() => _isActive = false;

  @override
  bool get isActive => _isActive;

  @override
  int get tick => 0;

  void fire() {
    if (!_isActive) {
      return;
    }
    _isActive = false;
    _callback();
  }
}

class _ManualScheduler {
  _ManualTimer? timer;
  Duration? delay;
  int scheduled = 0;

  Timer call(Duration duration, void Function() callback) {
    timer?.cancel();
    delay = duration;
    scheduled++;
    timer = _ManualTimer(callback);
    return timer!;
  }

  void fire() {
    final current = timer;
    timer = null;
    current?.fire();
  }
}
