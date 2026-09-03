import 'package:flutter/material.dart';

import 'sync_controller.dart';

class SyncScope extends InheritedNotifier<SyncController> {
  const SyncScope({
    super.key,
    required SyncController controller,
    required super.child,
  }) : super(notifier: controller);

  static SyncController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SyncScope>();
    assert(scope != null, 'SyncScope not found');
    return scope!.notifier!;
  }

  static SyncController? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<SyncScope>()?.notifier;
  }
}
