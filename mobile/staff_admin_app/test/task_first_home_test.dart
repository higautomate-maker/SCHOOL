import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

void main() {
  for (final role in ['school', 'parent']) {
    testWidgets(
        '$role home shows useful actions without duplicate welcome panels',
        (tester) async {
      final keys = role == 'school'
          ? ['attendance', 'diary', 'academics', 'communication']
          : ['homework', 'fees_payments', 'transport_tracking', 'attendance'];
      final opened = <String>[];
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: HigRoleDashboardPage(
        home: {
          'principalType': role,
          'user': {'name': 'Test User'},
          'students': []
        },
        modules: keys
            .map((key) => <String, dynamic>{'key': key, 'label': key})
            .toList(),
        recentKeys: keys,
        onRefresh: () async {},
        onOpen: (item) async {
          opened.add(item['key'].toString());
        },
        onAlerts: () {},
      ))));
      await tester.pumpAndSettle();
      expect(find.text('Recently used'), findsNothing);
      expect(find.textContaining('authorized work areas'), findsNothing);
      await tester.tap(find.text(keys.first).first);
      await tester.pumpAndSettle();
      expect(opened, [keys.first]);
      expect(tester.takeException(), isNull);
    });
  }
}
