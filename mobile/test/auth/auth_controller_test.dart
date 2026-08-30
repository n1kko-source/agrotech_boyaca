import 'package:agrotech_boyaca/auth/auth_controller.dart';
import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_auth.dart';

void main() {
  late MemoryTokenStore store;
  late FakeAuthGateway api;
  late AuthController auth;

  setUp(() {
    store = MemoryTokenStore();
    api = FakeAuthGateway(store);
    auth = AuthController(store: store, api: api);
  });

  test('restore with empty store is guest', () async {
    await auth.restore();
    expect(auth.phase, AuthPhase.guest);
    expect(api.meCalls, 0);
  });

  test('NATURAL verify stores session and signs in', () async {
    await auth.restore();
    expect(await auth.sendOtp('+573001112233'), isTrue);
    expect(
      await auth.verifyOtp(code: '123456', acceptPrivacyPolicy: true),
      isTrue,
    );
    expect(auth.phase, AuthPhase.signedIn);
    expect(auth.session?.role, AppRole.natural);
    expect(await store.read(), isNotNull);
  });

  test('JURIDICA login 403 becomes pending', () async {
    api.loginForbidden = true;
    await auth.restore();
    expect(
      await auth.loginJuridica(
        email: 'coop@example.com',
        password: 'ClaveSegura1',
      ),
      isTrue,
    );
    expect(auth.phase, AuthPhase.pendingJuridica);
    expect(auth.pendingEmail, 'coop@example.com');
    expect(await store.read(), isNull);
  });

  test('JURIDICA register goes to pending without tokens', () async {
    await auth.restore();
    expect(
      await auth.registerJuridica(
        email: 'coop@example.com',
        password: 'ClaveSegura1',
        nit: '8001972684',
        entityType: EntityType.cooperativa,
        acceptPrivacyPolicy: true,
      ),
      isTrue,
    );
    expect(auth.phase, AuthPhase.pendingJuridica);
    expect(await store.read(), isNull);
  });
}
