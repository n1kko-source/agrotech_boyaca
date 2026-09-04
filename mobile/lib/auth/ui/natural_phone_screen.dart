import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../theme/app_fields.dart';
import '../auth_scope.dart';
import '../phone.dart';
import 'natural_otp_screen.dart';

class NaturalPhoneScreen extends StatefulWidget {
  const NaturalPhoneScreen({super.key});

  @override
  State<NaturalPhoneScreen> createState() => _NaturalPhoneScreenState();
}

class _NaturalPhoneScreenState extends State<NaturalPhoneScreen> {
  final _phone = TextEditingController();
  String? _fieldError;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final e164 = normalizeCoMobile(_phone.text);
    if (e164 == null) {
      setState(() {
        _fieldError = 'Ingrese un celular colombiano (3XX XXX XXXX).';
      });
      return;
    }
    setState(() => _fieldError = null);
    final auth = AuthScope.of(context);
    final ok = await auth.sendOtp(e164);
    if (!mounted) {
      return;
    }
    if (ok) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const NaturalOtpScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Ingreso con celular')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Le enviaremos un código de 6 dígitos por SMS.',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 24),
            LabeledField(
              label: 'Celular',
              child: TextField(
                key: const Key('phone_field'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.telephoneNumber],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s-]')),
                ],
                decoration: appHint(
                  '300 111 2233',
                  prefixText: '+57 ',
                  errorText: _fieldError,
                ),
                onSubmitted: (_) => _submit(),
              ),
            ),
            if (auth.errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                auth.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('send_otp'),
              onPressed: auth.busy ? null : _submit,
              child: auth.busy
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                    : const Text('Enviar código'),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 180.ms);
  }
}
