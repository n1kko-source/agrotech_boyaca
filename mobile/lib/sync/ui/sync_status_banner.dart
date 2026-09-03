import 'package:flutter/material.dart';

import '../models.dart';

class SyncStatusBanner extends StatelessWidget {
  const SyncStatusBanner({super.key, required this.status});

  final SyncUiStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      SyncUiStatus.offline => (
        'Sin conexión',
        const Color(0xFFEF6C00),
        Icons.cloud_off,
      ),
      SyncUiStatus.syncing => (
        'Sincronizando…',
        const Color(0xFF1565C0),
        Icons.sync,
      ),
      SyncUiStatus.synced => (
        'Sincronizado',
        const Color(0xFF2E7D32),
        Icons.cloud_done,
      ),
    };
    return Semantics(
      container: true,
      liveRegion: true,
      child: Material(
        color: color,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  key: const Key('sync_status'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (status == SyncUiStatus.syncing)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
