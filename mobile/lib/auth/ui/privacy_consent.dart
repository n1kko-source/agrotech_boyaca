import 'package:flutter/material.dart';

import '../models.dart';

class PrivacyConsent extends StatelessWidget {
  const PrivacyConsent({
    super.key,
    required this.policy,
    required this.accepted,
    required this.onChanged,
  });

  final PrivacyPolicy policy;
  final bool accepted;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CheckboxListTile(
          key: const Key('privacy_checkbox'),
          value: accepted,
          onChanged: (value) => onChanged(value ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: Text(policy.acceptLabel, style: const TextStyle(fontSize: 15)),
        ),
        TextButton(
          key: const Key('privacy_read'),
          onPressed: () => _showPolicy(context),
          child: const Text('Leer política de datos'),
        ),
      ],
    );
  }

  void _showPolicy(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.75,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  policy.title,
                  style: Theme.of(ctx).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Versión ${policy.version}',
                  style: Theme.of(ctx).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    child: Text(
                      policy.markdown.isEmpty
                          ? 'No se pudo cargar el texto. Puede aceptar y continuar; el servidor exige el consentimiento.'
                          : policy.markdown,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Cerrar'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
