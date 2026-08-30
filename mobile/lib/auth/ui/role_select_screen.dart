import 'package:flutter/material.dart';

import '../auth_scope.dart';
import 'juridica_login_screen.dart';
import 'natural_phone_screen.dart';

class RoleSelectScreen extends StatelessWidget {
  const RoleSelectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text(
                'AgroTech Boyacá',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '¿Cómo va a ingresar?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 32),
              _RoleCard(
                key: const Key('role_natural'),
                title: 'Productor / campesino',
                subtitle: 'Celular y código SMS. Persona natural.',
                icon: Icons.grass,
                onTap: () {
                  auth.clearError();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const NaturalPhoneScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
              _RoleCard(
                key: const Key('role_juridica'),
                title: 'Asociación, cooperativa o empresa',
                subtitle: 'Correo, contraseña y NIT. Persona jurídica.',
                icon: Icons.apartment,
                onTap: () {
                  auth.clearError();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const JuridicaLoginScreen(),
                    ),
                  );
                },
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Icon(icon, size: 40, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
