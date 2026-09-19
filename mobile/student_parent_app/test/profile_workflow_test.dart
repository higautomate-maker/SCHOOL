import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _ProfileApi extends HigMobileApi {
  _ProfileApi() : super(baseUrl: 'https://example.invalid', appId: 'test');
  @override
  Future<JsonMap> profilePhoto() async => {'photo': null};
}

void main() {
  testWidgets(
      'profile exposes photo editing, readable identity and working help',
      (tester) async {
    final api = _ProfileApi();
    final publishedPhotos = <String?>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: HigProfileView(
                api: api,
                onLogout: () async {},
                onPhotoChanged: publishedPhotos.add,
                home: {
          'principalType': 'parent',
          'user': {
            'name': 'Parent Tester',
            'email': 'parent.tester@higschool.test'
          }
        }))));
    await tester.pumpAndSettle();
    expect(publishedPhotos, [null]);
    expect(find.text('Change photo'), findsOneWidget);
    expect(find.text('parent.tester@higschool.test'), findsOneWidget);
    await tester.ensureVisible(find.text('Help'));
    await tester.tap(find.text('Help'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Never share your password.'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    api.close();
  });
}
