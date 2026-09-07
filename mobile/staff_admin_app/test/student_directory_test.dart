import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _DirectoryApi extends HigMobileApi {
  _DirectoryApi() : super(baseUrl: 'https://example.invalid', appId: 'test');
  bool allowed = true;
  bool fail = false;
  @override
  Future<JsonMap> home({bool allowCache = true}) async {
    if (allowCache) throw StateError('Directory must fetch current access');
    if (fail) throw StateError('Offline');
    return {
      'home': {
        'principalType': 'school',
        'access': {
          'modules': allowed
              ? [
                  {'key': 'student_information'}
                ]
              : []
        },
        'students': [
          {
            'id': 'one',
            'fullName': 'Anaya Sharma',
            'className': 'Grade 8',
            'sectionName': 'A',
            'rollNumber': 1,
            'admissionNumber': 'GF-001'
          },
          {
            'id': 'two',
            'fullName': 'Diya Patel',
            'className': 'Grade 9',
            'sectionName': 'B',
            'rollNumber': 2,
            'admissionNumber': 'GF-002'
          },
        ],
      }
    };
  }
}

void main() {
  testWidgets('students can be searched and their details opened',
      (tester) async {
    final api = _DirectoryApi();
    await tester
        .pumpWidget(MaterialApp(home: HigStudentDirectoryPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('2 students'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'GF-001');
    await tester.pumpAndSettle();
    expect(find.text('Anaya Sharma'), findsOneWidget);
    expect(find.text('Diya Patel'), findsNothing);
    await tester.tap(find.text('Anaya Sharma'));
    await tester.pumpAndSettle();
    expect(find.text('Admission number: GF-001'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    api.allowed = false;
    await tester.tap(find.byTooltip('Refresh students'));
    await tester.pumpAndSettle();
    expect(find.text('Anaya Sharma'), findsNothing);
    expect(
        find.textContaining('Student access is not available'), findsOneWidget);
  });

  testWidgets('failed refresh does not retain a stale student roster',
      (tester) async {
    final api = _DirectoryApi();
    await tester
        .pumpWidget(MaterialApp(home: HigStudentDirectoryPage(api: api)));
    await tester.pumpAndSettle();
    api.fail = true;
    await tester.tap(find.byTooltip('Refresh students'));
    await tester.pumpAndSettle();
    expect(find.text('Anaya Sharma'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
  });
}
