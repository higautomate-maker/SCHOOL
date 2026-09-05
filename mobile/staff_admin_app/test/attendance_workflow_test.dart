import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _AttendanceApi extends HigMobileApi {
  _AttendanceApi() : super(baseUrl: 'https://example.invalid', appId: 'test');

  final List<JsonMap> writes = [];

  @override
  Future<JsonMap> operations() async => {
        'operations': {
          'attendance': <JsonMap>[],
          'invoices': <JsonMap>[],
          'payments': <JsonMap>[],
          'metrics': <String, int>{},
        },
      };

  @override
  Future<JsonMap> operation(
    JsonMap body, {
    bool queueWhenOffline = true,
  }) async {
    writes.add(body);
    return {'operations': <String, dynamic>{}};
  }
}

void main() {
  testWidgets(
      'teacher marks a class present, changes an exception, and saves once',
      (tester) async {
    final api = _AttendanceApi();
    final students = <JsonMap>[
      {
        'id': '11111111-1111-4111-8111-111111111111',
        'fullName': 'Aarav Sharma',
        'admissionNumber': 'GF-001',
        'rollNumber': '1',
        'className': 'Grade 8',
        'sectionName': 'A',
      },
      {
        'id': '22222222-2222-4222-8222-222222222222',
        'fullName': 'Anaya Sharma',
        'admissionNumber': 'GF-002',
        'rollNumber': '2',
        'className': 'Grade 8',
        'sectionName': 'A',
      },
    ];

    await tester.pumpWidget(
      MaterialApp(
        theme: higMobileTheme(const Color(0xff2459d3)),
        home: HigAttendancePage(api: api, students: students),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Take attendance'), findsOneWidget);
    expect(find.text('Grade 8 · A'), findsOneWidget);
    expect(find.text('Attendance date'), findsOneWidget);
    expect(find.text('0 of 2 marked'), findsOneWidget);
    expect(find.text('Mark every student to save'), findsOneWidget);

    await tester.tap(find.text('All present'));
    await tester.pumpAndSettle();
    expect(find.text('2 of 2 marked'), findsOneWidget);
    expect(find.text('Save 2 students'), findsOneWidget);

    await tester.tap(find.text('Present').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Absent').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save 2 students'));
    await tester.pumpAndSettle();

    expect(api.writes, hasLength(2));
    expect(
        api.writes.where((write) => write['status'] == 'absent'), hasLength(1));
    expect(
        api.writes.every((write) => write['attendanceDate'] != null), isTrue);
  });
}
