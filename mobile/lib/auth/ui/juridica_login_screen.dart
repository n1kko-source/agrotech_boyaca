import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../theme/app_fields.dart';
import '../auth_scope.dart';
import 'juridica_register_screen.dart';
import 'secure_screen.dart';

class JuridicaLoginScreen extends StatefulWidget {
  const JuridicaLoginScreen({super.key});

  @override
  State<JuridicaLoginScreen> createState() => _JuridicaLoginScreenState();
}

class _JuridicaLoginScreenState extends State<JuridicaLoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) {
      return;
    }
    await AuthScope.of(
      context,
    ).loginJuridica(email: _email.text.trim(), password: _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return SecureScreen(
      child: Scaffold(
        appBar: AppBar(title: const Text('Ingreso jurídica')),
        body: SafeArea(
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                LabeledField(
                  label: 'Correo',
                  child: TextFormField(
                    key: const Key('juridica_email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: appHint('coop.siachoque@example.com'),
                    validator: (value) {
                      final email = value?.trim() ?? '';
                      if (!email.contains('@') || !email.contains('.')) {
                        return 'Ingrese un correo válido.';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(height: 16),
                LabeledField(
                  label: 'Contraseña',
                  child: TextFormField(
                    key: const Key('juridica_password'),
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.password],
                    decoration: appHint(
                      'ClaveSegura1',
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure ? Icons.visibility : Icons.visibility_off,
                        ),
                      ),
                    ),
                    validator: (value) {
                      if ((value ?? '').length < 8) {
                        return 'Mínimo 8 caracteres.';
                      }
                      return null;
                    },
                  ),
                ),
                if (auth.errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    auth.errorMessage!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  key: const Key('juridica_login'),
                  onPressed: auth.busy ? null : _submit,
                  child: auth.busy
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Ingresar'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  key: const Key('juridica_go_register'),
                  onPressed: () {
                    auth.clearError();
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const JuridicaRegisterScreen(),
                      ),
                    );
                  },
                  child: const Text('Crear cuenta'),
                ),
              ],
            ),
          ),
        ),
      ).animate().fadeIn(duration: 180.ms),
    );
  }
}
