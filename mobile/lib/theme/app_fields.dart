import 'package:flutter/material.dart';

/// Title sits above the control; [hint] is the example inside the box.
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        child,
      ],
    );
  }
}

InputDecoration appHint(
  String hint, {
  Widget? suffixIcon,
  String? errorText,
  String? prefixText,
  String? counterText,
}) {
  return InputDecoration(
    hintText: hint,
    suffixIcon: suffixIcon,
    errorText: errorText,
    prefixText: prefixText,
    counterText: counterText,
    floatingLabelBehavior: FloatingLabelBehavior.never,
  );
}
