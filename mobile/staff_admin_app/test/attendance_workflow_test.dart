import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _AttendanceApi extends HigMobileApi {
  _AttendanceApi({this.hasAssignments = true})
      : super(baseUrl: 'https://example.invalid', appId: 'test');
  final bool hasAssignments;
  bool failLesson = false;
  final List<JsonMap> lessons = [];

  final List<JsonMap> writes = [];

  @override
  Future<JsonMap> teachingContexts() async => {
        'contexts': !hasAssignments
            ? <JsonMap>[]
            : <JsonMap>[
                {
                  'id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  'academicSessionId': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  'classId': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  'sectionId': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  'kind': 'class_teacher',
                  'className': 'Grade 8',
                  'sectionName': 'A',
                },
                {
                  'id': 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'academicSessionId': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  'classId': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  'sectionId': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  'subjectId': 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  'kind': 'subject_teacher',
                  'className': 'Grade 8',
                  'sectionName': 'A',
                  'subjectName': 'Mathematics',
                },
              ],
      };

  @override
  Future<JsonMap> lessonAttendance(String date) async =>
      {'attendance': <JsonMap>[]};
  @override
  Future<JsonMap> saveLessonAttendance(JsonMap body) async {
    if (failLesson) throw Exception('Temporary test failure');
    lessons.add(body);
    return {'saved': true};
  }

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
  List<JsonMap> students() => <JsonMap>[
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

  testWidgets('no assignment never exposes the supplied roster',
      (tester) async {
    final api = _AttendanceApi(hasAssignments: false);
    await tester.pumpWidget(
        MaterialApp(home: HigAttendancePage(api: api, students: students())));
    await tester.pumpAndSettle();
    expect(find.text('No class-teacher assignment'), findsOneWidget);
    expect(find.text('Aarav Sharma'), findsNothing);
    expect(api.writes, isEmpty);
  });

  testWidgets(
      'subject lesson saves separately and failed save retains marks for retry',
      (tester) async {
    final api = _AttendanceApi()..failLesson = true;
    await tester.pumpWidget(
        MaterialApp(home: HigAttendancePage(api: api, students: students())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Subject lesson'));
    await tester.pumpAndSettle();
    expect(find.text('Mathematics'), findsOneWidget);
    await tester.ensureVisible(find.text('All present'));
    await tester.tap(find.text('All present'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save 2 students'));
    await tester.pumpAndSettle();
    expect(api.lessons, isEmpty);
    expect(find.textContaining('Your marks are retained'), findsOneWidget);
    api.failLesson = false;
    await tester.tap(find.text('Save 2 students'));
    await tester.pumpAndSettle();
    expect(api.lessons, hasLength(1));
    expect(api.lessons.single['subjectId'],
        'ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(api.lessons.single['lessonId'], 'period-1');
    expect(api.lessons.single['entries'], hasLength(2));
    expect(api.writes, isEmpty);
  });

  testWidgets(
      'teacher marks a class present, changes an exception, and saves once',
      (tester) async {
    final api = _AttendanceApi();

    await tester.pumpWidget(
      MaterialApp(
        theme: higMobileTheme(const Color(0xff2459d3)),
        home: HigAttendancePage(api: api, students: students()),
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
    expect(
        api.writes.every((write) =>
            write['academicSessionId'] ==
                'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' &&
            write['classId'] == 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' &&
            write['sectionId'] == 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        isTrue);
  });

  testWidgets('teacher is warned before discarding marked attendance',
      (tester) async {
    final api = _AttendanceApi();
    await tester.pumpWidget(
      MaterialApp(
        theme: higMobileTheme(const Color(0xff2459d3)),
        home: HigAttendancePage(api: api, students: students()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('All present'));
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Discard attendance changes?'), findsOneWidget);
    expect(find.text('Keep editing'), findsOneWidget);
    expect(find.text('Discard'), findsOneWidget);

    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Take attendance'), findsOneWidget);
    expect(find.text('2 of 2 marked'), findsOneWidget);
    expect(api.writes, isEmpty);
  });
}
