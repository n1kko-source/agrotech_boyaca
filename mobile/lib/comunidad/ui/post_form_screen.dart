import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../sync/models.dart';
import '../../theme/app_fields.dart';
import '../comunidad_scope.dart';
import '../offer_fields.dart';

class PostFormScreen extends StatefulWidget {
  const PostFormScreen({super.key, this.existing});

  final LocalPost? existing;

  @override
  State<PostFormScreen> createState() => _PostFormScreenState();
}

class _PostFormScreenState extends State<PostFormScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _product;
  late final TextEditingController _category;
  late final TextEditingController _quantity;
  late final TextEditingController _unit;
  late final TextEditingController _price;
  late final TextEditingController _location;
  late final TextEditingController _notes;
  final List<Uint8List> _photos = [];
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    final offer = existing == null
        ? const OfferFields(product: '', category: '')
        : OfferFields.fromPost(existing);
    _product = TextEditingController(text: offer.product);
    _category = TextEditingController(text: offer.category);
    _quantity = TextEditingController(text: offer.quantity);
    _unit = TextEditingController(text: offer.unit);
    _price = TextEditingController(text: offer.price);
    _location = TextEditingController(text: offer.location);
    _notes = TextEditingController(text: offer.notes);
    if (existing != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final photos = await ComunidadScope.of(context).photosFor(existing.id);
        if (mounted) {
          setState(() {
            _photos
              ..clear()
              ..addAll(photos);
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _product.dispose();
    _category.dispose();
    _quantity.dispose();
    _unit.dispose();
    _price.dispose();
    _location.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _addPhotos() async {
    final picked = await ComunidadScope.of(
      context,
    ).pickPhotos(already: _photos.length);
    if (picked.isEmpty || !mounted) {
      return;
    }
    setState(() {
      _photos.addAll(picked.take(postPhotosMax - _photos.length));
    });
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) {
      return;
    }
    final fields = OfferFields(
      product: _product.text,
      category: _category.text,
      quantity: _quantity.text,
      unit: _unit.text,
      price: _price.text,
      location: _location.text,
      notes: _notes.text,
    );
    if (fields.toDescription().length > postDescriptionMax) {
      setState(() => _error = 'La descripción es demasiado larga.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ComunidadScope.of(context).saveOffer(
        fields: fields,
        id: widget.existing?.id,
        photos: List.of(_photos),
      );
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() => _error = 'No se pudo guardar. Queda en cola local.');
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.existing != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Editar oferta' : 'Nueva oferta')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LabeledField(
                  label: 'Producto',
                  child: TextFormField(
                    key: const Key('offer_product'),
                    controller: _product,
                    decoration: appHint('Papa criolla'),
                    textCapitalization: TextCapitalization.sentences,
                    maxLength: postTitleMax,
                    validator: (value) {
                      if ((value ?? '').trim().isEmpty) {
                        return 'Indique el producto.';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(height: 12),
                LabeledField(
                  label: 'Categoría',
                  child: TextFormField(
                    key: const Key('offer_category'),
                    controller: _category,
                    decoration: appHint('papa'),
                    maxLength: postCategoryMax,
                    validator: (value) {
                      if ((value ?? '').trim().isEmpty) {
                        return 'Indique la categoría.';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 2,
                      child: LabeledField(
                        label: 'Cantidad',
                        child: TextFormField(
                          key: const Key('offer_quantity'),
                          controller: _quantity,
                          decoration: appHint('50'),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: LabeledField(
                        label: 'Unidad',
                        child: TextFormField(
                          key: const Key('offer_unit'),
                          controller: _unit,
                          decoration: appHint('kg'),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                LabeledField(
                  label: 'Precio (COP por unidad)',
                  child: TextFormField(
                    key: const Key('offer_price'),
                    controller: _price,
                    decoration: appHint('2000'),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(height: 12),
                LabeledField(
                  label: 'Ubicación',
                  child: TextFormField(
                    key: const Key('offer_location'),
                    controller: _location,
                    decoration: appHint('Siachoque'),
                  ),
                ),
                const SizedBox(height: 12),
                LabeledField(
                  label: 'Descripción',
                  child: TextFormField(
                    key: const Key('offer_notes'),
                    controller: _notes,
                    decoration: appHint('Cosecha de esta semana'),
                    maxLines: 4,
                  ),
                ),
                const SizedBox(height: 16),
                Text('Fotos', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < _photos.length; i++)
                      Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.memory(
                              _photos[i],
                              width: 88,
                              height: 88,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            right: 0,
                            top: 0,
                            child: IconButton(
                              visualDensity: VisualDensity.compact,
                              onPressed: () {
                                setState(() => _photos.removeAt(i));
                              },
                              icon: const Icon(Icons.close, size: 18),
                            ),
                          ),
                        ],
                      ),
                    if (_photos.length < postPhotosMax)
                      IconButton(
                        key: const Key('offer_add_photo'),
                        tooltip: 'Agregar foto',
                        onPressed: _addPhotos,
                        icon: const Icon(Icons.add_a_photo),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Las fotos se comprimen en el teléfono. Quedan en este dispositivo; el anuncio de texto sí se encola sin señal.',
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  key: const Key('offer_save'),
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(editing ? 'Guardar cambios' : 'Publicar'),
                ),
              ],
            ),
          ),
        ),
      ).animate().fadeIn(duration: 180.ms),
    );
  }
}
