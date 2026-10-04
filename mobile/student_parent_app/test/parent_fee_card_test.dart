import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

class _FeeApi extends HigMobileApi {
  _FeeApi({required this.offline, this.paid = 0, this.payments = const []})
      : super(baseUrl: 'https://example.invalid', appId: 'test');
  final bool offline;
  final int paid;
  final List<JsonMap> payments;
  @override
  Future<JsonMap> operations() async => {
        'offline': offline,
        'operations': {
          'invoices': [
            {
              'id': 'invoice-test',
              'studentName': 'Aarav',
              'feeType': 'Tuition',
              'amountPaise': 240000,
              'paidPaise': paid,
              'dueDate': '2026-09-15',
              'status': 'unpaid'
            }
          ],
          'payments': payments,
        }
      };
}

void main() {
  testWidgets('offline invoice disables checkout', (tester) async {
    final api = _FeeApi(offline: true);
    await tester.pumpWidget(MaterialApp(
        home: ModuleDetailPage(
            api: api,
            principalType: 'parent',
            item: {'key': 'fees_payments', 'label': 'Fees'})));
    await tester.pumpAndSettle();
    expect(find.text('Pay securely'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Pay securely'))
            .onPressed,
        isNull);
    api.close();
  });
  testWidgets('settled invoice cannot open another payment', (tester) async {
    final api = _FeeApi(offline: false, paid: 240000);
    await tester.pumpWidget(MaterialApp(
        home: ModuleDetailPage(
            api: api,
            principalType: 'parent',
            item: {'key': 'fees_payments', 'label': 'Fees'})));
    await tester.pumpAndSettle();
    expect(find.text('Pay securely'), findsNothing);
    expect(find.text('No balance due'), findsOneWidget);
    api.close();
  });
  testWidgets('only ledger-confirmed payments appear in history',
      (tester) async {
    final api = _FeeApi(offline: false, payments: const [
      {
        'studentName': 'Aarav',
        'amountPaise': 120000,
        'paidOn': '2026-10-04',
        'method': 'upi',
        'reference': 'bank-reference-1',
      }
    ]);
    await tester.pumpWidget(MaterialApp(
        home: ModuleDetailPage(
            api: api,
            principalType: 'parent',
            item: const {'key': 'fees_payments', 'label': 'Fees'})));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Payment history'));
    expect(find.text('Payments confirmed in the school ledger'), findsOneWidget);
    expect(find.text('₹1200.00'), findsOneWidget);
    await tester.tap(find.text('₹1200.00'));
    await tester.pumpAndSettle();
    expect(find.text('Reference: bank-reference-1'), findsOneWidget);
    api.close();
  });
}
