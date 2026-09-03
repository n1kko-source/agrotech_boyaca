import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Sets Android FLAG_SECURE while this route is visible (OTP / password).
/// Nested screens share a holder count so popping register does not clear
/// FLAG_SECURE while login is still on the stack.
class SecureScreen extends StatefulWidget {
  const SecureScreen({super.key, required this.child});

  final Widget child;

  static const MethodChannel channel = MethodChannel(
    'co.agrotech.boyaca/secure_screen',
  );

  /// Nested [SecureScreen] widgets currently mounted.
  @visibleForTesting
  static int holderCount = 0;

  @visibleForTesting
  static void resetHolders() {
    holderCount = 0;
  }

  @override
  State<SecureScreen> createState() => _SecureScreenState();
}

class _SecureScreenState extends State<SecureScreen> {
  @override
  void initState() {
    super.initState();
    SecureScreen.holderCount += 1;
    if (SecureScreen.holderCount == 1) {
      unawaited(_invoke('enable'));
    }
  }

  @override
  void dispose() {
    if (SecureScreen.holderCount > 0) {
      SecureScreen.holderCount -= 1;
    }
    if (SecureScreen.holderCount == 0) {
      unawaited(_invoke('disable'));
    }
    super.dispose();
  }

  Future<void> _invoke(String method) async {
    try {
      await SecureScreen.channel.invokeMethod<void>(method);
    } on MissingPluginException {
      // Widget tests and iOS: no-op.
    } on PlatformException {
      // Ignore native failures; auth UI still works.
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
