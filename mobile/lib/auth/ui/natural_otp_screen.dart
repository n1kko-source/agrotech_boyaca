import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/api_config.dart';
import '../auth_scope.dart';
import '../models.dart';
import 'privacy_consent.dart';

class NaturalOtpScreen extends StatefulWidget {
  const NaturalOtpScreen({super.key, this.cooldownSeconds});

  final int? cooldownSeconds;

  @override
  State<NaturalOtpScreen> createState() => _NaturalOtpScreenState();
}

class _NaturalOtpScreenState extends State<NaturalOtpScreen> {
  final _code = TextEditingController();
  late int _remaining;
  Timer? _timer;
  bool _accepted = false;
  PrivacyPolicy _policy = PrivacyPolicy.fallback;
  String? _fieldError;

  @override
  void initState() {
    super.initState();
    _remaining = widget.cooldownSeconds ?? ApiConfig.otpCooldownSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_remaining <= 0) {
        return;
      }
      setState(() => _remaining -= 1);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final policy = await AuthScope.of(context).loadPrivacyPolicy();
      if (mounted) {
        setState(() => _policy = policy);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _resend() async {
    final auth = AuthScope.of(context);
    final phone = auth.otpPhone;
    if (phone == null) {
      return;
    }
    final ok = await auth.sendOtp(phone);
    if (!mounted || !ok) {
      return;
    }
    setState(() {
      _remaining = widget.cooldownSeconds ?? ApiConfig.otpCooldownSeconds;
    });
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _fieldError = 'El código tiene 6 dígitos.');
      return;
    }
    if (!_accepted) {
      setState(() => _fieldError = 'Debe aceptar la política de datos.');
      return;
    }
    setState(() => _fieldError = null);
    await AuthScope.of(context).verifyOtp(
      code: code,
      acceptPrivacyPolicy: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final canResend = _remaining <= 0 && !auth.busy;
    return Scaffold(
      appBar: AppBar(title: const Text('Código SMS')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Ingrese el código de 6 dígitos. Si no llega, puede reenviar cuando el tiempo termine.',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 24),
            TextField(
              key: const Key('otp_field'),
              controller: _code,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: 'Código',
                counterText: '',
                errorText: _fieldError,
              ),
              onSubmitted: (_) => _verify(),
            ),
            const SizedBox(height: 8),
            PrivacyConsent(
              policy: _policy,
              accepted: _accepted,
              onChanged: (value) => setState(() => _accepted = value),
            ),
            if (auth.errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                auth.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('verify_otp'),
              onPressed: auth.busy ? null : _verify,
              child: auth.busy
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Verificar e ingresar'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              key: const Key('resend_otp'),
              onPressed: canResend ? _resend : null,
              child: Text(
                canResend
                    ? 'Reenviar código'
                    : 'Reenviar en 0:${_remaining.toString().padLeft(2, '0')}',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
