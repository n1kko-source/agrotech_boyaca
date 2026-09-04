import 'package:flutter/material.dart';

import '../offer_fields.dart';
import '../../sync/models.dart';

class PostTile extends StatelessWidget {
  const PostTile({super.key, required this.post, required this.onTap});

  final LocalPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final offer = OfferFields.fromPost(post);
    final subtitle = [
      if (offer.quantity.isNotEmpty) '${offer.quantity} ${offer.unit}',
      if (offer.price.isNotEmpty) '${offer.price} COP/${offer.unit}',
      if (offer.location.isNotEmpty) offer.location,
    ].join(' · ');
    return ListTile(
      key: Key('post_${post.id}'),
      title: Text(post.title),
      subtitle: Text(
        subtitle.isEmpty ? post.category : '$subtitle\n${post.category}',
      ),
      isThreeLine: subtitle.isNotEmpty,
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
