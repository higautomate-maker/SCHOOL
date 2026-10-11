import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _PhoneAuditApi extends HigMobileApi {
  _PhoneAuditApi() : super(baseUrl: 'https://example.invalid', appId: 'test');

  @override
  Future<JsonMap> content({String? featureKey, String? moduleKey}) async => {
        'content': {'records': <JsonMap>[]},
      };

  @override
  Future<JsonMap> notifications({bool unreadOnly = false}) async => {
        'notifications': <JsonMap>[
          {
            'id': 'notice-1',
            'title': 'Attendance updated',
            'message': '4 Oct 2026 · Present',
            'read': true,
          },
          {
            'id': 'notice-2',
            'title': 'Attendance updated',
            'message': '4 Oct 2026 · Present',
            'read': true,
          },
        ],
      };
}

void main() {
  testWidgets(
    'child overview shows the linked child instead of an empty page',
    (tester) async {
      final api = _PhoneAuditApi();
      await tester.pumpWidget(
        MaterialApp(
          home: ModuleDetailPage(
            api: api,
            principalType: 'parent',
            item: const {'key': 'child_overview', 'label': 'Child Overview'},
            availableStudents: const [
              {
                'id': 'student-1',
                'fullName': 'Anaya Sharma',
                'className': 'Grade 8',
                'sectionName': 'A',
              },
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Anaya Sharma'), findsOneWidget);
      expect(find.text('Grade 8 A'), findsOneWidget);
      expect(find.textContaining('1 linked child'), findsOneWidget);
      expect(find.text('Nothing here yet'), findsNothing);
      api.close();
    },
  );

  testWidgets('notices collapses identical notification deliveries', (
    tester,
  ) async {
    final api = _PhoneAuditApi();
    await tester.pumpWidget(MaterialApp(home: HigNotificationsView(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Attendance updated'), findsOneWidget);
    expect(find.text('4 Oct 2026 · Present'), findsOneWidget);
    api.close();
  });

  testWidgets('dashboard failure explains recovery and retries on tap', (
    tester,
  ) async {
    final api = _PhoneAuditApi();
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: HomeView(
          config: const HigMobileAppConfig(
            title: 'HIGA Parent & Student',
            appId: 'parent-test',
            allowedPrincipalTypes: ['parent'],
            apiBaseUrl: 'https://example.invalid',
          ),
          api: api,
          home: null,
          loadError:
              'We couldn’t reach the school service. Please try again shortly.',
          onRefresh: () async => retries++,
          onLogout: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your school dashboard isn’t ready'), findsOneWidget);
    expect(
        find.textContaining('school service'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    expect(retries, 1);
    api.close();
  });

  testWidgets('dashboard retry shows progress and prevents repeat taps', (
    tester,
  ) async {
    final api = _PhoneAuditApi();
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: HomeView(
          config: const HigMobileAppConfig(
            title: 'HIGA Parent & Student',
            appId: 'parent-test',
            allowedPrincipalTypes: ['parent'],
            apiBaseUrl: 'https://example.invalid',
          ),
          api: api,
          home: null,
          isRefreshing: true,
          onRefresh: () async => retries++,
          onLogout: () async {},
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Connecting…'), findsOneWidget);
    await tester.tap(find.text('Connecting…'), warnIfMissed: false);
    expect(retries, 0);
    api.close();
  });
}
