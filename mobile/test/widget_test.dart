import 'package:flutter_test/flutter_test.dart';

import 'package:agrotech_boyaca/main.dart';

void main() {
  testWidgets('app boots with AgroTech Boyacá title', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.byType(MyApp), findsOneWidget);
  });
}
