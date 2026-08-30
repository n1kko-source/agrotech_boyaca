import 'package:flutter/material.dart';

import '../auth_scope.dart';
import '../models.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final session = auth.session;
    final roleLabel = switch (session?.role) {
      AppRole.natural => 'Productor (persona natural)',
      AppRole.juridica => session?.entityType?.label ?? 'Persona jurídica',
      null => 'Sesión',
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('AgroTech Boyacá'),
        actions: [
          IconButton(
            key: const Key('logout'),
            tooltip: 'Cerrar sesión',
            onPressed: auth.busy ? null : auth.logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Sesión iniciada', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(roleLabel, key: const Key('home_role')),
              const SizedBox(height: 24),
              const Text(
                'El listado del marketplace y el resto de la app se habilitarán en los siguientes tickets.',
              ),
              const Spacer(),
              OutlinedButton(
                onPressed: auth.busy ? null : auth.logout,
                child: const Text('Cerrar sesión'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
