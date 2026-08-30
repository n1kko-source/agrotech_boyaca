import 'package:flutter/material.dart';

import 'auth/auth_controller.dart';
import 'auth/auth_scope.dart';
import 'auth/models.dart';
import 'auth/ui/home_screen.dart';
import 'auth/ui/juridica_pending_screen.dart';
import 'auth/ui/role_select_screen.dart';
import 'theme/app_theme.dart';

class AgroTechApp extends StatefulWidget {
  const AgroTechApp({super.key, required this.auth});

  final AuthController auth;

  @override
  State<AgroTechApp> createState() => _AgroTechAppState();
}

class _AgroTechAppState extends State<AgroTechApp> {
  final GlobalKey<NavigatorState> _guestNavKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: widget.auth,
      child: MaterialApp(
        title: 'AgroTech Boyacá',
        theme: AppTheme.light,
        home: AuthGate(guestNavKey: _guestNavKey),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.guestNavKey});

  final GlobalKey<NavigatorState> guestNavKey;

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return switch (auth.phase) {
      AuthPhase.bootstrapping => const _SplashScreen(),
      AuthPhase.guest => Navigator(
        key: guestNavKey,
        onGenerateRoute: (settings) {
          return MaterialPageRoute<void>(
            settings: settings,
            builder: (_) => const RoleSelectScreen(),
          );
        },
      ),
      AuthPhase.pendingJuridica => const JuridicaPendingScreen(),
      AuthPhase.signedIn => const HomeScreen(),
    };
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('AgroTech Boyacá'),
          ],
        ),
      ),
    );
  }
}
