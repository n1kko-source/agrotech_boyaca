import 'package:flutter/material.dart';

import '../../theme/app_fields.dart';
import '../comunidad_scope.dart';
import '../posts_controller.dart';
import 'post_detail_screen.dart';
import 'post_tile.dart';

class PostSearchScreen extends StatefulWidget {
  const PostSearchScreen({super.key});

  @override
  State<PostSearchScreen> createState() => _PostSearchScreenState();
}

class _PostSearchScreenState extends State<PostSearchScreen> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    await ComunidadScope.of(context).search(_query.text);
  }

  @override
  Widget build(BuildContext context) {
    final posts = ComunidadScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Buscar ofertas')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: LabeledField(
              label: 'Buscar',
              child: TextField(
                key: const Key('search_field'),
                controller: _query,
                textInputAction: TextInputAction.search,
                decoration: appHint(
                  'papa, Siachoque',
                  suffixIcon: IconButton(
                    key: const Key('search_submit'),
                    tooltip: 'Buscar',
                    onPressed: posts.searchLoading ? null : _run,
                    icon: const Icon(Icons.search),
                  ),
                ),
                onSubmitted: (_) => _run(),
              ),
            ),
          ),
          if (posts.searchLoading) const LinearProgressIndicator(),
          if (posts.searchError != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                posts.searchError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(child: _results(posts)),
        ],
      ),
    );
  }

  Widget _results(PostsController posts) {
    if (posts.searchEmpty && posts.lastQuery.isNotEmpty) {
      return Center(
        key: const Key('search_empty'),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Sin resultados para «${posts.lastQuery}».\nPruebe con otro producto o municipio.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    if (posts.searchHits.isEmpty) {
      return const Center(
        child: Text('Escriba un producto, por ejemplo papa o Siachoque.'),
      );
    }
    return ListView.separated(
      itemCount: posts.searchHits.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final post = posts.searchHits[index];
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
    );
  }
}
