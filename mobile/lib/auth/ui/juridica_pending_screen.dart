import 'package:flutter/material.dart';

import '../auth_scope.dart';

class JuridicaPendingScreen extends StatelessWidget {
  const JuridicaPendingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Cuenta en revisión')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.hourglass_top, size: 64),
              const SizedBox(height: 16),
              Text(
                'Su cuenta aún no está activa',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              const Text(
                'Confirme el correo que le enviamos y espere la revisión del operador. No podrá ingresar hasta que ambas condiciones se cumplan.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16),
              ),
              if (auth.pendingEmail != null) ...[
                const SizedBox(height: 16),
                Text(
                  auth.pendingEmail!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
              if (auth.errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  auth.errorMessage!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const Spacer(),
              FilledButton(
                key: const Key('pending_resend'),
                onPressed: auth.busy
                    ? null
                    : () async {
                        final ok = await auth.resendJuridicaVerification();
                        if (!context.mounted || !ok) {
                          return;
                        }
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Si el correo existe, le enviamos de nuevo el enlace.',
                            ),
                          ),
                        );
                      },
                child: auth.busy
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Reenviar correo de verificación'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                key: const Key('pending_back'),
                onPressed: auth.leavePending,
                child: const Text('Volver al ingreso'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
