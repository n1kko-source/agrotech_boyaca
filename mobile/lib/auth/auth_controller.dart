import 'package:flutter/foundation.dart';

import 'auth_api.dart';
import 'models.dart';
import 'token_store.dart';

class AuthController extends ChangeNotifier {
  AuthController({required TokenStore store, required AuthGateway api})
    : this._(store, api);

  AuthController._(this._store, this._api);

  final TokenStore _store;
  final AuthGateway _api;

  AuthPhase phase = AuthPhase.bootstrapping;
  Session? session;
  String? errorMessage;
  bool busy = false;

  String? pendingEmail;
  String? _pendingPassword;
  String? otpPhone;

  Future<void> restore() async {
    phase = AuthPhase.bootstrapping;
    notifyListeners();
    final local = await _store.read();
    if (local == null) {
      _becomeGuest();
      return;
    }
    session = local;
    try {
      final me = await _api.me();
      final latest = await _store.read();
      if (latest == null) {
        _becomeGuest();
        return;
      }
      session = Session(
        accessToken: latest.accessToken,
        refreshToken: latest.refreshToken,
        accessExpiresAt: latest.accessExpiresAt,
        sub: me.sub,
        role: me.role,
        entityType: me.entityType,
      );
      await _store.write(session!);
      phase = AuthPhase.signedIn;
      errorMessage = null;
      notifyListeners();
    } on NetworkException {
      phase = AuthPhase.signedIn;
      notifyListeners();
    } on ApiException catch (err) {
      await _store.clear();
      if (err.isUnauthorized) {
        _becomeGuest();
        return;
      }
      _becomeGuest();
    } catch (_) {
      await _store.clear();
      _becomeGuest();
    }
  }

  Future<bool> sendOtp(String phoneE164) async {
    return _run(() async {
      otpPhone = phoneE164;
      await _api.sendOtp(phoneE164);
    });
  }

  Future<bool> verifyOtp({
    required String code,
    required bool acceptPrivacyPolicy,
  }) async {
    final phone = otpPhone;
    if (phone == null) {
      errorMessage = 'Ingrese primero su celular.';
      notifyListeners();
      return false;
    }
    return _run(() async {
      await _api.verifyOtp(
        phone: phone,
        code: code,
        acceptPrivacyPolicy: acceptPrivacyPolicy,
      );
      await _loadSignedIn();
    });
  }

  Future<bool> registerJuridica({
    required String email,
    required String password,
    required String nit,
    required EntityType entityType,
    required bool acceptPrivacyPolicy,
  }) async {
    return _run(() async {
      await _api.registerJuridica(
        email: email,
        password: password,
        nit: nit,
        entityType: entityType,
        acceptPrivacyPolicy: acceptPrivacyPolicy,
      );
      pendingEmail = email;
      _pendingPassword = password;
      phase = AuthPhase.pendingJuridica;
    });
  }

  Future<bool> loginJuridica({
    required String email,
    required String password,
  }) async {
    return _run(() async {
      try {
        await _api.loginJuridica(email: email, password: password);
        await _loadSignedIn();
      } on PendingVerificationException {
        pendingEmail = email;
        _pendingPassword = password;
        phase = AuthPhase.pendingJuridica;
      }
    });
  }

  Future<bool> resendJuridicaVerification() async {
    final email = pendingEmail;
    final password = _pendingPassword;
    if (email == null || password == null) {
      errorMessage = 'Vuelva a ingresar con su correo y contraseña.';
      notifyListeners();
      return false;
    }
    return _run(() async {
      await _api.resendJuridicaVerification(email: email, password: password);
    });
  }

  Future<PrivacyPolicy> loadPrivacyPolicy() async {
    try {
      return await _api.privacyPolicy();
    } catch (_) {
      return PrivacyPolicy.fallback;
    }
  }

  Future<void> logout() async {
    busy = true;
    notifyListeners();
    try {
      await _api.logout();
    } finally {
      pendingEmail = null;
      _pendingPassword = null;
      otpPhone = null;
      session = null;
      busy = false;
      _becomeGuest();
    }
  }

  void clearError() {
    if (errorMessage == null) {
      return;
    }
    errorMessage = null;
    notifyListeners();
  }

  void leavePending() {
    pendingEmail = null;
    _pendingPassword = null;
    _becomeGuest();
  }

  void _becomeGuest() {
    session = null;
    phase = AuthPhase.guest;
    notifyListeners();
  }

  Future<void> _loadSignedIn() async {
    final local = await _store.read();
    if (local == null) {
      throw const ApiException(
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      );
    }
    session = local;
    otpPhone = null;
    pendingEmail = null;
    _pendingPassword = null;
    phase = AuthPhase.signedIn;
  }

  Future<bool> _run(Future<void> Function() action) async {
    busy = true;
    errorMessage = null;
    notifyListeners();
    try {
      await action();
      return true;
    } on NetworkException {
      errorMessage = 'Sin conexión. Revise la señal e intente de nuevo.';
      return false;
    } on ApiException catch (err) {
      errorMessage = _messageFor(err);
      return false;
    } catch (_) {
      errorMessage = 'No se pudo completar. Intente de nuevo.';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  String _messageFor(ApiException err) {
    if (err.isThrottled) {
      return 'Demasiados intentos. Espere un minuto.';
    }
    if (err.isConflict) {
      return 'Ya existe una cuenta con esos datos.';
    }
    if (err.isUnauthorized) {
      return 'Datos incorrectos. Intente de nuevo.';
    }
    if (err.code == 'VALIDATION_ERROR') {
      return 'Revise los datos ingresados.';
    }
    return 'No se pudo completar. Intente de nuevo.';
  }
}
