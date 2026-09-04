import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../auth/auth_scope.dart';
import '../../sync/models.dart';
import '../comunidad_scope.dart';
import '../offer_fields.dart';
import 'post_form_screen.dart';

class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({super.key, required this.postId});

  final String postId;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  LocalPost? _post;
  List<Uint8List> _photos = const [];
  bool _loading = true;
  bool _contacting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final posts = ComunidadScope.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    final post = await posts.loadDetail(widget.postId);
    final photos = post == null
        ? const <Uint8List>[]
        : await posts.photosFor(post.id);
    if (!mounted) {
      return;
    }
    setState(() {
      _post = post;
      _photos = photos;
      _loading = false;
      if (post == null) {
        _error = 'Esta oferta no está disponible.';
      }
    });
  }

  Future<void> _contact() async {
    final posts = ComunidadScope.of(context);
    setState(() => _contacting = true);
    try {
      await posts.contactAuthor(widget.postId);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Conversación lista. El mensaje se envía al recuperar señal si está sin conexión.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir el contacto.')),
      );
    } finally {
      if (mounted) {
        setState(() => _contacting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AuthScope.of(context).session;
    final post = _post;
    final offer = post == null ? null : OfferFields.fromPost(post);
    final isOwner = post != null && session?.sub == post.authorId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle de oferta'),
        actions: [
          if (isOwner)
            IconButton(
              key: const Key('edit_post'),
              tooltip: 'Editar',
              onPressed: () async {
                await Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => PostFormScreen(existing: post),
                  ),
                );
                if (mounted) {
                  await _load();
                }
              },
              icon: const Icon(Icons.edit),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : post == null || offer == null
          ? Center(child: Text(_error ?? 'No encontrada'))
          : ListView(
              padding: const EdgeInsets.all(24),
              children: [
                if (_photos.isNotEmpty) ...[
                  SizedBox(
                    height: 200,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _photos.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        return ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            _photos[index],
                            width: 200,
                            height: 200,
                            fit: BoxFit.cover,
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                Text(
                  offer.product,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(offer.category, key: const Key('detail_category')),
                const SizedBox(height: 16),
                _row('Cantidad', _qty(offer)),
                _row(
                  'Precio',
                  offer.price.isEmpty
                      ? 'No indicado'
                      : '${offer.price} COP/${offer.unit}',
                ),
                _row(
                  'Ubicación',
                  offer.location.isEmpty ? 'No indicada' : offer.location,
                ),
                if (offer.notes.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(offer.notes, key: const Key('detail_notes')),
                ],
                const SizedBox(height: 32),
                if (!isOwner)
                  FilledButton(
                    key: const Key('contactar'),
                    onPressed: _contacting ? null : _contact,
                    child: _contacting
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Contactar'),
                  ),
              ],
            ),
    );
  }

  String _qty(OfferFields offer) {
    if (offer.quantity.isEmpty) {
      return 'No indicada';
    }
    return '${offer.quantity} ${offer.unit}';
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
