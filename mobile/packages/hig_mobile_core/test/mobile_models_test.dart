import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

void main() {
  test('mobile session round-trips without losing expiry values', () {
    final session = MobileSession(
      accessToken: 'a' * 43,
      refreshToken: 'r' * 43,
      accessExpiresAt: DateTime.utc(2026, 8, 2, 12),
      refreshExpiresAt: DateTime.utc(2026, 9, 1, 12),
      tenantId: '00000000-0000-4000-8000-000000000001',
      principalType: 'student',
      sessionId: '00000000-0000-4000-8000-000000000002',
    );
    final restored = MobileSession.fromJson(session.toJson());
    expect(restored.accessToken, session.accessToken);
    expect(restored.refreshToken, session.refreshToken);
    expect(restored.accessExpiresAt, session.accessExpiresAt);
    expect(restored.refreshExpiresAt, session.refreshExpiresAt);
  });

  test('queued writes preserve the idempotency key', () {
    final queued = QueuedWrite(
      id: 'queue-1',
      method: 'POST',
      path: '/api/v1/mobile/operations',
      body: const {'action': 'mark_attendance'},
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
      createdAt: DateTime.utc(2026, 8, 2, 12),
    );
    final restored = QueuedWrite.fromJson(queued.toJson());
    expect(restored.idempotencyKey, queued.idempotencyKey);
    expect(restored.path, queued.path);
  });

  test('sign-in failures use safe, actionable user-facing messages', () {
    expect(
      higFriendlyAuthMessage(
        const MobileApiException('server detail', 401),
      ),
      HigAuthMessages.invalidCredentials,
    );
    expect(
      higFriendlyAuthMessage(
        const MobileApiException('server detail', 429),
      ),
      HigAuthMessages.rateLimited,
    );
    expect(
      higFriendlyAuthMessage(
        const MobileApiException('server detail', 503),
      ),
      HigAuthMessages.unavailable,
    );
    expect(
      higFriendlyAuthMessage(Exception('internal detail')),
      HigAuthMessages.unavailable,
    );
  });
}
