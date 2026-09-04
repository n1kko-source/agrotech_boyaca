import 'package:flutter/material.dart';

import 'auth/auth_controller.dart';
import 'auth/auth_scope.dart';
import 'auth/models.dart';
import 'auth/ui/home_screen.dart';
import 'auth/ui/juridica_pending_screen.dart';
import 'auth/ui/role_select_screen.dart';
import 'comunidad/comunidad_scope.dart';
import 'comunidad/posts_controller.dart';
import 'sync/sync_controller.dart';
import 'sync/sync_scope.dart';
import 'theme/app_theme.dart';

class AgroTechApp extends StatefulWidget {
  const AgroTechApp({super.key, required this.auth, this.sync, this.posts});

  final AuthController auth;
  final SyncController? sync;
  final PostsController? posts;

  @override
  State<AgroTechApp> createState() => _AgroTechAppState();
}

class _AgroTechAppState extends State<AgroTechApp> with WidgetsBindingObserver {
  final GlobalKey<NavigatorState> _guestNavKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      widget.sync?.onAppResumed();
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget app = MaterialApp(
      title: 'AgroTech Boyacá',
      theme: AppTheme.light,
      home: AuthGate(guestNavKey: _guestNavKey),
    );
    final posts = widget.posts;
    if (posts != null) {
      app = ComunidadScope(controller: posts, child: app);
    }
    final sync = widget.sync;
    if (sync != null) {
      app = SyncScope(controller: sync, child: app);
    }
    return AuthScope(controller: widget.auth, child: app);
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
