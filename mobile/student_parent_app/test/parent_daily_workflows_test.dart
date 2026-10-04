import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _DailyApi extends HigMobileApi {
  _DailyApi() : super(baseUrl: 'https://example.invalid', appId: 'test');

  JsonMap? submitted;

  @override
  Future<JsonMap> content({String? featureKey, String? moduleKey}) async => {
        'content': {
          'records': featureKey == 'school_events'
              ? <JsonMap>[
                  {
                    'id': 'event-1',
                    'workflow': 'school event',
                    'title': 'Sports day',
                    'description': 'On campus',
                    'recordDate': '2026-10-10',
                    'status': 'open',
                  }
                ]
              : <JsonMap>[],
        },
      };

  @override
  Future<JsonMap> contentAction(JsonMap body,
      {bool queueWhenOffline = true}) async {
    submitted = body;
    return {
      'content': {'records': <JsonMap>[]}
    };
  }
}

void main() {
  testWidgets('home hides bus ETA when the location is delayed',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: HigRoleDashboardPage(
        home: const {
          'principalType': 'parent',
          'user': {'name': 'Parent'},
          'transportOverview': [
            {
              'studentName': 'Anaya',
              'tripActive': true,
              'freshness': 'delayed',
              'etaMinutes': null,
            }
          ],
        },
        modules: const [
          {'key': 'transport_tracking', 'label': 'Transport'}
        ],
        recentKeys: const [],
        onRefresh: () async {},
        onOpen: (_) async {},
        onAlerts: () {},
      ),
    ));
    expect(find.textContaining('Location delayed — ETA unavailable'),
        findsOneWidget);
    expect(find.textContaining('min away'), findsNothing);
  });

  testWidgets('leave request sends linked child and an explicit date range',
      (tester) async {
    final api = _DailyApi();
    await tester.pumpWidget(MaterialApp(
      home: ModuleDetailPage(
        api: api,
        principalType: 'parent',
        item: const {'key': 'leave_requests', 'label': 'Leave'},
        availableStudents: const [
          {'id': 'c1000000-0000-4000-8000-000000000001', 'fullName': 'Anaya'}
        ],
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send request'));
    await tester.pumpAndSettle();
    expect(find.text('Request leave'), findsOneWidget);
    expect(find.text('First day'), findsOneWidget);
    expect(find.text('Last day'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).last, 'Family event');
    await tester.tap(find.widgetWithText(FilledButton, 'Send request'));
    await tester.pumpAndSettle();
    expect(api.submitted?['requestType'], 'leave_request');
    expect(api.submitted?['studentId'], 'c1000000-0000-4000-8000-000000000001');
    expect(api.submitted?['startDate'], isNotNull);
    expect(api.submitted?['endDate'], isNotNull);
    api.close();
  });

  testWidgets('calendar opens authorized events on their day', (tester) async {
    final api = _DailyApi();
    await tester.pumpWidget(MaterialApp(
      home: HigSchoolCalendarPage(
        api: api,
        features: const [
          {'key': 'school_events'}
        ],
      ),
    ));
    await tester.pumpAndSettle();
    // Widget state starts in the device month; navigate to the seeded month.
    for (var step = 0;
        step < 24 && find.text('October 2026').evaluate().isEmpty;
        step++) {
      final heading = find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .whereType<String>()
          .firstWhere((text) => RegExp(r'^[A-Z][a-z]+ 20\d\d$').hasMatch(text));
      final year = int.parse(heading.split(' ').last);
      final month = const [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December'
          ].indexOf(heading.split(' ').first) +
          1;
      final forward = year < 2026 || (year == 2026 && month < 10);
      await tester
          .tap(find.byTooltip(forward ? 'Next month' : 'Previous month'));
      await tester.pumpAndSettle();
    }
    expect(find.text('October 2026'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel(RegExp(r'10 Oct 2026, 1 events')));
    await tester.pumpAndSettle();
    expect(find.text('Sports day'), findsOneWidget);
    api.close();
  });
}
