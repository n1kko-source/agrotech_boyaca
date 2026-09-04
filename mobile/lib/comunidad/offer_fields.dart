import '../sync/models.dart';

const int postTitleMax = 120;
const int postDescriptionMax = 2000;
const int postCategoryMax = 60;
const int postPhotosMax = 4;

/// Offer UI fields mapped onto AG-20 `{ title, description, category }`.
/// Quantity, price and location are serialized in [description] so FTS still
/// sees them and the DTO stays unchanged.
class OfferFields {
  const OfferFields({
    required this.product,
    required this.category,
    this.quantity = '',
    this.unit = 'kg',
    this.price = '',
    this.location = '',
    this.notes = '',
  });

  final String product;
  final String category;
  final String quantity;
  final String unit;
  final String price;
  final String location;
  final String notes;

  String toDescription() {
    final lines = <String>[];
    final qty = quantity.trim();
    final unitTrim = unit.trim().isEmpty ? 'kg' : unit.trim();
    if (qty.isNotEmpty) {
      lines.add('Cantidad: $qty $unitTrim');
    }
    final priceTrim = price.trim();
    if (priceTrim.isNotEmpty) {
      lines.add('Precio: $priceTrim COP/$unitTrim');
    }
    final loc = location.trim();
    if (loc.isNotEmpty) {
      lines.add('Ubicación: $loc');
    }
    final body = notes.trim();
    if (body.isNotEmpty) {
      if (lines.isNotEmpty) {
        lines.add('');
      }
      lines.add(body);
    }
    if (lines.isEmpty) {
      return product.trim();
    }
    return lines.join('\n');
  }

  factory OfferFields.fromPost(LocalPost post) {
    final lines = post.description.split('\n');
    var quantity = '';
    var unit = 'kg';
    var price = '';
    var location = '';
    final notes = <String>[];
    var inNotes = false;
    var sawMeta = false;

    for (final raw in lines) {
      if (!inNotes) {
        final cantidad = _cantidad.firstMatch(raw);
        if (cantidad != null) {
          quantity = cantidad.group(1) ?? '';
          unit = cantidad.group(2) ?? unit;
          sawMeta = true;
          continue;
        }
        final precio = _precio.firstMatch(raw);
        if (precio != null) {
          price = precio.group(1) ?? '';
          unit = precio.group(2) ?? unit;
          sawMeta = true;
          continue;
        }
        final ubicacion = _ubicacion.firstMatch(raw);
        if (ubicacion != null) {
          location = ubicacion.group(1)?.trim() ?? '';
          sawMeta = true;
          continue;
        }
        if (raw.trim().isEmpty && sawMeta) {
          inNotes = true;
          continue;
        }
        inNotes = true;
      }
      notes.add(raw);
    }

    return OfferFields(
      product: post.title,
      category: post.category,
      quantity: quantity,
      unit: unit,
      price: price,
      location: location,
      notes: notes.join('\n').trim(),
    );
  }
}

final _cantidad = RegExp(r'^Cantidad:\s+(\S+)(?:\s+(\S+))?\s*$');
final _precio = RegExp(r'^Precio:\s+(\S+)\s+COP(?:/(\S+))?\s*$');
final _ubicacion = RegExp(r'^Ubicación:\s+(.+)\s*$');
