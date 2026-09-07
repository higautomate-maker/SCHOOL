import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

void main() {
  final now = DateTime.utc(2026, 9, 6, 12);
  test('only recent online locations allow ETA', () {
    expect(
        transportLocationIsFresh({'capturedAt': '2026-09-06T11:58:00Z'},
            now: now),
        isTrue);
    expect(
        transportLocationIsFresh({'capturedAt': '2026-09-06T11:57:59Z'},
            now: now),
        isFalse);
    expect(
        transportLocationIsFresh({'capturedAt': '2026-09-06T12:00:01Z'},
            now: now),
        isFalse);
    expect(transportLocationIsFresh({'capturedAt': 'bad'}, now: now), isFalse);
    expect(transportLocationIsFresh(null, now: now), isFalse);
    expect(
        transportLocationIsFresh({'capturedAt': '2026-09-06T12:00:00Z'},
            now: now, offline: true),
        isFalse);
  });
}
