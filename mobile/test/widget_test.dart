import 'package:agrotech_boyaca/app.dart';
import 'package:agrotech_boyaca/auth/auth_controller.dart';
import 'package:agrotech_boyaca/auth/auth_scope.dart';
import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';
import 'package:agrotech_boyaca/auth/ui/natural_otp_screen.dart';
import 'package:agrotech_boyaca/auth/ui/secure_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fake_auth.dart';

void main() {
  setUp(SecureScreen.resetHolders);
  tearDown(SecureScreen.resetHolders);

  testWidgets('role select branches NATURAL vs JURIDICA', (tester) async {
    final env = await _env();
    await tester.pumpWidget(AgroTechApp(auth: env.auth));
    await tester.pump();

    expect(find.text('¿Cómo va a ingresar?'), findsOneWidget);
    expect(find.byKey(const Key('role_natural')), findsOneWidget);
    expect(find.byKey(const Key('role_juridica')), findsOneWidget);

    await tester.tap(find.byKey(const Key('role_natural')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phone_field')), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('role_juridica')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('juridica_email')), findsOneWidget);
    expect(find.byKey(const Key('juridica_go_register')), findsOneWidget);
  });

  testWidgets('NATURAL phone → OTP → session', (tester) async {
    final env = await _env();
    await tester.pumpWidget(AgroTechApp(auth: env.auth));
    await tester.pump();

    await tester.tap(find.byKey(const Key('role_natural')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('phone_field')), '3001112233');
    await tester.tap(find.byKey(const Key('send_otp')));
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('otp_field')), findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const Key('resend_otp')))
          .onPressed,
      isNull,
    );

    await tester.enterText(find.byKey(const Key('otp_field')), '123456');
    await tester.tap(find.byKey(const Key('privacy_checkbox')));
    await tester.tap(find.byKey(const Key('verify_otp')));
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home_role')), findsOneWidget);
    expect(env.auth.phase, AuthPhase.signedIn);
    expect(env.api.lastPhone, '+573001112233');
  });

  testWidgets('OTP resend enables after countdown', (tester) async {
    final env = await _env();
    env.auth.otpPhone = '+573001112233';
    await tester.pumpWidget(
      AuthScope(
        controller: env.auth,
        child: const MaterialApp(home: NaturalOtpScreen(cooldownSeconds: 1)),
      ),
    );
    await tester.pump();
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const Key('resend_otp')))
          .onPressed,
      isNull,
    );
    await tester.pump(const Duration(seconds: 2));
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const Key('resend_otp')))
          .onPressed,
      isNotNull,
    );
  });

  testWidgets('JURIDICA login pending shows review screen', (tester) async {
    final env = await _env();
    env.api.loginForbidden = true;
    await tester.pumpWidget(AgroTechApp(auth: env.auth));
    await tester.pump();

    await tester.tap(find.byKey(const Key('role_juridica')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('juridica_email')),
      'coop@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('juridica_password')),
      'ClaveSegura1',
    );
    await tester.tap(find.byKey(const Key('juridica_login')));
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Su cuenta aún no está activa'), findsOneWidget);
    expect(find.byKey(const Key('pending_resend')), findsOneWidget);
    expect(env.auth.phase, AuthPhase.pendingJuridica);
  });

  testWidgets('JURIDICA register form reaches pending', (tester) async {
    final env = await _env();
    await tester.pumpWidget(AgroTechApp(auth: env.auth));
    await tester.pump();

    await tester.tap(find.byKey(const Key('role_juridica')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('juridica_go_register')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('register_email')),
      'coop@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('register_password')),
      'ClaveSegura1',
    );
    await tester.enterText(
      find.byKey(const Key('register_nit')),
      '800.197.268-4',
    );
    await tester.tap(find.byKey(const Key('register_entity_type')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cooperativa').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('register_submit')));
    await tester.tap(find.byKey(const Key('privacy_checkbox')));
    await tester.tap(find.byKey(const Key('register_submit')));
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Su cuenta aún no está activa'), findsOneWidget);
    expect(env.api.registerCalls, 1);
  });
}

Future<({AuthController auth, FakeAuthGateway api})> _env() async {
  final store = MemoryTokenStore();
  final api = FakeAuthGateway(store);
  final auth = AuthController(store: store, api: api);
  await auth.restore();
  return (auth: auth, api: api);
}
