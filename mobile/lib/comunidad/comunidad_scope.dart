import 'package:flutter/material.dart';

import 'posts_controller.dart';

class ComunidadScope extends InheritedNotifier<PostsController> {
  const ComunidadScope({
    super.key,
    required PostsController controller,
    required super.child,
  }) : super(notifier: controller);

  static PostsController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<ComunidadScope>();
    assert(scope != null, 'ComunidadScope not found');
    return scope!.notifier!;
  }

  static PostsController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<ComunidadScope>()
        ?.notifier;
  }
}
