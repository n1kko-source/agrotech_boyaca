import 'package:flutter/material.dart';

import '../../comunidad/comunidad_scope.dart';
import '../../comunidad/posts_controller.dart';
import '../../comunidad/ui/post_detail_screen.dart';
import '../../comunidad/ui/post_form_screen.dart';
import '../../comunidad/ui/post_search_screen.dart';
import '../../comunidad/ui/post_tile.dart';
import '../../sync/sync_scope.dart';
import '../../sync/ui/sync_status_banner.dart';
import '../auth_scope.dart';
import '../models.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ComunidadScope.maybeOf(context)?.refreshFeed();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) {
      return;
    }
    final posts = ComunidadScope.maybeOf(context);
    if (posts == null || posts.feedLoadingMore || posts.feedCursor == null) {
      return;
    }
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 240) {
      posts.loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final sync = SyncScope.maybeOf(context);
    final posts = ComunidadScope.maybeOf(context);
    final session = auth.session;
    final roleLabel = switch (session?.role) {
      AppRole.natural => 'Productor (persona natural)',
      AppRole.juridica => session?.entityType?.label ?? 'Persona jurídica',
      null => 'Sesión',
    };
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('AgroTech Boyacá'),
            Text(
              roleLabel,
              key: const Key('home_role'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          IconButton(
            key: const Key('open_search'),
            tooltip: 'Buscar',
            onPressed: posts == null
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const PostSearchScreen(),
                      ),
                    );
                  },
            icon: const Icon(Icons.search),
          ),
          IconButton(
            key: const Key('logout'),
            tooltip: 'Cerrar sesión',
            onPressed: auth.busy ? null : auth.logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: posts == null
          ? null
          : FloatingActionButton(
              key: const Key('create_post'),
              tooltip: 'Nueva oferta',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PostFormScreen(),
                  ),
                );
              },
              child: const Icon(Icons.add),
            ),
      body: Column(
        children: [
          if (sync != null) SyncStatusBanner(status: sync.status),
          Expanded(child: _feed(posts)),
        ],
      ),
    );
  }

  Widget _feed(PostsController? posts) {
    if (posts == null) {
      return const Center(child: Text('Marketplace no disponible.'));
    }
    return RefreshIndicator(
      key: const Key('feed_refresh'),
      onRefresh: posts.refreshFeed,
      child: posts.feedLoading && posts.feed.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                SizedBox(height: 120),
                Center(child: CircularProgressIndicator()),
              ],
            )
          : posts.feed.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 48),
                Text(
                  posts.feedFromCache
                      ? 'Sin ofertas en este teléfono. Publique una o busque cuando haya señal.'
                      : 'Aún no hay ofertas en el marketplace.',
                  textAlign: TextAlign.center,
                ),
              ],
            )
          : ListView.separated(
              controller: _scroll,
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: posts.feed.length + (posts.feedLoadingMore ? 1 : 0),
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                if (index >= posts.feed.length) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  );
                }
                final post = posts.feed[index];
                return PostTile(
                  post: post,
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PostDetailScreen(postId: post.id),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}
