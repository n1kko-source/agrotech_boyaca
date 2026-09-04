import 'package:agrotech_boyaca/comunidad/offer_fields.dart';
import 'package:agrotech_boyaca/sync/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('round-trips quantity, price and location through description', () {
    const fields = OfferFields(
      product: 'Papa criolla',
      category: 'papa',
      quantity: '50',
      unit: 'kg',
      price: '2000',
      location: 'Siachoque',
      notes: 'Cosecha de esta semana',
    );
    final description = fields.toDescription();
    expect(description, contains('Cantidad: 50 kg'));
    expect(description, contains('Precio: 2000 COP/kg'));
    expect(description, contains('Ubicación: Siachoque'));
    expect(description.length, lessThanOrEqualTo(postDescriptionMax));

    final parsed = OfferFields.fromPost(
      LocalPost(
        id: 'p1',
        authorId: 'u1',
        title: 'Papa criolla',
        description: description,
        category: 'papa',
        createdAt: DateTime.utc(2026, 9, 1),
        updatedAt: DateTime.utc(2026, 9, 1),
      ),
    );
    expect(parsed.product, 'Papa criolla');
    expect(parsed.quantity, '50');
    expect(parsed.unit, 'kg');
    expect(parsed.price, '2000');
    expect(parsed.location, 'Siachoque');
    expect(parsed.notes, 'Cosecha de esta semana');
  });

  test('plain description stays in notes', () {
    final parsed = OfferFields.fromPost(
      LocalPost(
        id: 'p1',
        authorId: 'u1',
        title: 'Habas',
        description: 'Tunja, bultos de 50 kg',
        category: 'haba',
        createdAt: DateTime.utc(2026, 9, 1),
        updatedAt: DateTime.utc(2026, 9, 1),
      ),
    );
    expect(parsed.quantity, isEmpty);
    expect(parsed.notes, 'Tunja, bultos de 50 kg');
  });
}
