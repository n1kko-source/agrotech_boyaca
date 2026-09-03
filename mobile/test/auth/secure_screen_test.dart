import 'package:agrotech_boyaca/auth/ui/secure_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final calls = <String>[];

  setUp(() {
    SecureScreen.resetHolders();
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SecureScreen.channel, (call) async {
          calls.add(call.method);
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SecureScreen.channel, null);
    SecureScreen.resetHolders();
  });

  testWidgets('nested screens enable once and disable only when empty', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SecureScreen(
          child: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => SecureScreen(
                      child: Scaffold(
                        appBar: AppBar(title: const Text('child')),
                        body: const Text('child'),
                      ),
                    ),
                  ),
                );
              },
              child: const Text('go'),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(calls, ['enable']);
    expect(SecureScreen.holderCount, 1);

    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(calls, ['enable']);
    expect(SecureScreen.holderCount, 2);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(calls, ['enable']);
    expect(SecureScreen.holderCount, 1);
  });
}
