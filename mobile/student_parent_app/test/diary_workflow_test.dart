import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _DiaryApi extends HigMobileApi {
  _DiaryApi({this.offline = false})
      : super(baseUrl: 'https://example.invalid', appId: 'test');
  final bool offline;
  final dates = <String>[];
  final writes = <JsonMap>[];
  @override
  Future<JsonMap> diary(String date) async {
    dates.add(date);
    return {
      'offline': offline,
      'records': <JsonMap>[
        {
          'id': 'diary-1',
          'studentId': 'child-1',
          'subjectName': 'Mathematics',
          'className': 'Grade 8',
          'sectionName': 'A',
          'title': 'Fractions',
          'description': 'Exercises 1 to 5',
          'dueDate': date,
          'studentName': 'Aarav',
          'completed': writes.isNotEmpty
        }
      ]
    };
  }

  @override
  Future<JsonMap> diaryUpdate(JsonMap body) async {
    writes.add(body);
    return {'saved': true};
  }
}

void main() {
  testWidgets(
      'parent can browse another date and acknowledge the linked child homework',
      (tester) async {
    final api = _DiaryApi();
    await tester
        .pumpWidget(MaterialApp(home: HigDiaryPage(api: api, role: 'parent')));
    await tester.pumpAndSettle();
    expect(find.text('Fractions'), findsOneWidget);
    final first = api.dates.last;
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    expect(
        DateTime.parse(api.dates.last).difference(DateTime.parse(first)).inDays,
        -1);
    await tester.tap(find.text('Completed at home'));
    await tester.pumpAndSettle();
    expect(api.writes.single, {
      'action': 'complete',
      'diaryId': 'diary-1',
      'studentId': 'child-1',
      'completed': true
    });
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        true);
    api.close();
  });
  testWidgets('offline diary never queues a misleading completion',
      (tester) async {
    final api = _DiaryApi(offline: true);
    await tester
        .pumpWidget(MaterialApp(home: HigDiaryPage(api: api, role: 'parent')));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<CheckboxListTile>(find.byType(CheckboxListTile))
            .onChanged,
        isNull);
    expect(find.textContaining('Saved diary.'), findsOneWidget);
    expect(api.writes, isEmpty);
    api.close();
  });
}
