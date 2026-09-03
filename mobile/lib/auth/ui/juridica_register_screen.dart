import 'package:flutter/material.dart';

import '../auth_scope.dart';
import '../models.dart';
import '../nit.dart';
import 'privacy_consent.dart';
import 'secure_screen.dart';

class JuridicaRegisterScreen extends StatefulWidget {
  const JuridicaRegisterScreen({super.key});

  @override
  State<JuridicaRegisterScreen> createState() => _JuridicaRegisterScreenState();
}

class _JuridicaRegisterScreenState extends State<JuridicaRegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _nit = TextEditingController();
  EntityType? _entityType;
  bool _accepted = false;
  bool _obscure = true;
  PrivacyPolicy _policy = PrivacyPolicy.fallback;
  String? _consentError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final policy = await AuthScope.of(context).loadPrivacyPolicy();
      if (mounted) {
        setState(() => _policy = policy);
      }
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _nit.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final valid = _form.currentState?.validate() ?? false;
    if (!_accepted) {
      setState(() => _consentError = 'Debe aceptar la política de datos.');
      return;
    }
    setState(() => _consentError = null);
    if (!valid || _entityType == null) {
      return;
    }
    final nit = normalizeNit(_nit.text);
    if (nit == null) {
      return;
    }
    await AuthScope.of(context).registerJuridica(
      email: _email.text.trim(),
      password: _password.text,
      nit: nit,
      entityType: _entityType!,
      acceptPrivacyPolicy: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return SecureScreen(
      child: Scaffold(
        appBar: AppBar(title: const Text('Registro jurídica')),
        body: SafeArea(
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                TextFormField(
                  key: const Key('register_email'),
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Correo'),
                  validator: (value) {
                    final email = value?.trim() ?? '';
                    if (!email.contains('@') || !email.contains('.')) {
                      return 'Ingrese un correo válido.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('register_password'),
                  controller: _password,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: InputDecoration(
                    labelText: 'Contraseña',
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure ? Icons.visibility : Icons.visibility_off,
                      ),
                    ),
                  ),
                  validator: (value) {
                    final password = value ?? '';
                    if (password.length < 8 || password.length > 100) {
                      return 'Entre 8 y 100 caracteres.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('register_nit'),
                  controller: _nit,
                  keyboardType: TextInputType.text,
                  decoration: const InputDecoration(
                    labelText: 'NIT',
                    hintText: '800.197.268-4',
                  ),
                  validator: (value) {
                    if (normalizeNit(value ?? '') == null) {
                      return 'NIT inválido.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<EntityType>(
                  key: const Key('register_entity_type'),
                  // ignore: deprecated_member_use
                  value: _entityType,
                  decoration: const InputDecoration(
                    labelText: 'Tipo de entidad',
                  ),
                  items: [
                    for (final type in EntityType.values)
                      DropdownMenuItem(value: type, child: Text(type.label)),
                  ],
                  onChanged: (value) => setState(() => _entityType = value),
                  validator: (value) =>
                      value == null ? 'Seleccione el tipo de entidad.' : null,
                ),
                const SizedBox(height: 8),
                PrivacyConsent(
                  policy: _policy,
                  accepted: _accepted,
                  onChanged: (value) => setState(() {
                    _accepted = value;
                    _consentError = null;
                  }),
                ),
                if (_consentError != null)
                  Text(
                    _consentError!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                if (auth.errorMessage != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    auth.errorMessage!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('register_submit'),
                  onPressed: auth.busy ? null : _submit,
                  child: auth.busy
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Crear cuenta'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
