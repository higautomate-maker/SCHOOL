part of '../hig_mobile_core.dart';

bool transportLocationIsFresh(JsonMap? live,
    {bool offline = false, DateTime? now}) {
  if (offline || live == null) return false;
  final timestamp = DateTime.tryParse(live['capturedAt']?.toString() ?? '');
  if (timestamp == null) return false;
  final age = (now ?? DateTime.now()).toUtc().difference(timestamp.toUtc());
  return !age.isNegative && age.inSeconds <= 120;
}

LatLng? _mapPoint(JsonMap? data) {
  final lat = data?['latitude'], lng = data?['longitude'];
  if (lat is! num ||
      lng is! num ||
      !lat.isFinite ||
      !lng.isFinite ||
      lat.abs() > 90 ||
      lng.abs() > 180) {
    return null;
  }
  return LatLng(lat.toDouble(), lng.toDouble());
}

class _HigVehicleMap extends StatefulWidget {
  const _HigVehicleMap({required this.live, required this.fresh});
  final JsonMap live;
  final bool fresh;
  @override
  State<_HigVehicleMap> createState() => _HigVehicleMapState();
}

class _HigVehicleMapState extends State<_HigVehicleMap> {
  bool tilesFailed = false;
  @override
  Widget build(BuildContext context) {
    final point = _mapPoint(widget.live);
    if (point == null) return const Text('Vehicle map position unavailable.');
    const configured = String.fromEnvironment('HIG_MAP_TILE_URL');
    const attribution = String.fromEnvironment('HIG_MAP_ATTRIBUTION');
    const attributionUrl = String.fromEnvironment('HIG_MAP_ATTRIBUTION_URL');
    // Public OSM tiles are for bounded debug testing only. Production requires
    // a school-approved provider and its attribution, not an unrestricted key.
    final url = configured.isNotEmpty
        ? configured
        : kReleaseMode
            ? ''
            : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (!url.startsWith('https://') ||
        (configured.isNotEmpty &&
            (attribution.isEmpty || !attributionUrl.startsWith('https://')))) {
      return const Text('Map service is not configured. Contact the school.');
    }
    final stop =
        _mapPoint((widget.live['targetStop'] as Map?)?.cast<String, dynamic>());
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
            height: 240,
            child: FlutterMap(
                key: ValueKey('${point.latitude}:${point.longitude}'),
                options: MapOptions(initialCenter: point, initialZoom: 14),
                children: [
                  TileLayer(
                      urlTemplate: url,
                      userAgentPackageName:
                          'com.higautomation.higschool.studentparent',
                      errorTileCallback: (_, __, ___) {
                        if (!tilesFailed && mounted) {
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            if (mounted) setState(() => tilesFailed = true);
                          });
                        }
                      }),
                  MarkerLayer(markers: [
                    Marker(
                        point: point,
                        width: 48,
                        height: 48,
                        child: Semantics(
                            label: widget.fresh
                                ? 'Vehicle position'
                                : 'Last known vehicle position',
                            child: CircleAvatar(
                                backgroundColor: widget.fresh
                                    ? const Color(0xff174f41)
                                    : Colors.grey,
                                child: const Icon(Icons.directions_bus,
                                    color: Colors.white)))),
                    if (stop != null)
                      Marker(
                          point: stop,
                          width: 44,
                          height: 44,
                          child: const Tooltip(
                              message: 'Your child’s assigned stop',
                              child: Icon(Icons.location_on,
                                  color: Color(0xffa85b14), size: 40))),
                  ]),
                ])),
      ),
      TextButton(
          onPressed: () => launchUrl(Uri.parse(configured.isEmpty
              ? 'https://www.openstreetmap.org/copyright'
              : attributionUrl)),
          child: Text(configured.isEmpty
              ? '© OpenStreetMap contributors'
              : attribution)),
      if (tilesFailed)
        const Text(
            'Map tiles could not load. Check your connection and refresh.'),
      if (!widget.fresh)
        const Text('Last known position only. Arrival estimate unavailable.',
            style: TextStyle(
                color: Color(0xff895209), fontWeight: FontWeight.w600)),
    ]);
  }
}

String _feeMoney(num paise) => '₹${(paise / 100).toStringAsFixed(2)}';

class _HigInvoiceCard extends StatefulWidget {
  const _HigInvoiceCard(
      {required this.api,
      required this.invoice,
      required this.offline,
      required this.onRefresh});
  final HigMobileApi api;
  final JsonMap invoice;
  final bool offline;
  final Future<void> Function() onRefresh;
  @override
  State<_HigInvoiceCard> createState() => _HigInvoiceCardState();
}

class _HigInvoiceCardState extends State<_HigInvoiceCard> {
  Future<void> open() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) =>
            _HigCheckoutPage(api: widget.api, invoice: widget.invoice)));
    await widget.onRefresh();
  }

  @override
  Widget build(BuildContext context) {
    final invoice = widget.invoice;
    final due = ((invoice['amountPaise'] as num?) ?? 0) -
        ((invoice['paidPaise'] as num?) ?? 0);
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    const CircleAvatar(
                        child: Icon(Icons.account_balance_wallet_outlined)),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Text(
                            invoice['feeType']?.toString() ?? 'School fees',
                            style: const TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w700)))
                  ]),
                  const SizedBox(height: 12),
                  Text(invoice['studentName']?.toString() ?? 'Linked student'),
                  Text('Due ${invoice['dueDate'] ?? '—'}'),
                  const SizedBox(height: 8),
                  Text(_feeMoney(due > 0 ? due : 0),
                      style: const TextStyle(
                          fontSize: 26, fontWeight: FontWeight.w800)),
                  Text(due > 0 ? 'Remaining balance' : 'No balance due'),
                  if (due > 0)
                    FilledButton.icon(
                        onPressed: widget.offline ? null : open,
                        icon: const Icon(Icons.lock_outline),
                        label: const Text('Pay securely')),
                  if (widget.offline)
                    const Text(
                        'Saved balance. Reconnect and refresh before paying.'),
                ])));
  }
}

class _HigCheckoutPage extends StatefulWidget {
  const _HigCheckoutPage({required this.api, required this.invoice});
  final HigMobileApi api;
  final JsonMap invoice;
  @override
  State<_HigCheckoutPage> createState() => _HigCheckoutPageState();
}

class _HigCheckoutPageState extends State<_HigCheckoutPage> {
  final storage = const FlutterSecureStorage();
  final razorpay = Razorpay();
  JsonMap pending = {};
  bool busy = true;
  String message = 'Preparing secure payment…';
  late final String storageKey;
  @override
  void initState() {
    super.initState();
    storageKey =
        'hig.checkout.${widget.api.session?.tenantId}.${widget.api.session?.sessionId}.${widget.invoice['id']}';
    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, success);
    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, failure);
    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, wallet);
    restore();
  }

  @override
  void dispose() {
    razorpay.clear();
    super.dispose();
  }

  void update(String value) {
    if (mounted) {
      setState(() {
        message = value;
        busy = false;
      });
    }
  }

  Future<void> persist() =>
      storage.write(key: storageKey, value: jsonEncode(pending));
  Future<void> restore() async {
    try {
      final raw = await storage.read(key: storageKey);
      pending = raw == null
          ? {'retryKey': _uuid.v4()}
          : (jsonDecode(raw) as Map).cast<String, dynamic>();
      await persist();
      update(pending['awaiting'] == true
          ? 'Payment awaiting confirmation. Do not pay again.'
          : 'Review the amount before continuing.');
    } catch (_) {
      update(
          'Cannot safely restore payment state. Contact the school before retrying.');
    }
  }

  Future<void> pay() async {
    if (busy || pending['awaiting'] == true || pending['retryKey'] == null) {
      return;
    }
    setState(() => busy = true);
    try {
      final response = await widget.api.createPaymentOrder(
          widget.invoice['id'].toString(), pending['retryKey'].toString());
      final checkout = (response['checkout'] as Map).cast<String, dynamic>();
      if (!checkout['keyId'].toString().startsWith('rzp_test_') &&
          !const bool.fromEnvironment('HIG_ENABLE_LIVE_PAYMENTS')) {
        update(
            'Live payments are not enabled in this build. Ask the school for sandbox access.');
        return;
      }
      pending['checkout'] = checkout;
      await persist();
      if (!mounted) return;
      final accepted = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                  title: const Text('Confirm payment'),
                  content: Text(
                      'Fees: ${_feeMoney(checkout['invoiceAmountPaise'] as num)}\n'
                      'Charges: ${_feeMoney(checkout['surchargePaise'] as num)}\n'
                      'Total: ${_feeMoney(checkout['amountPaise'] as num)}'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Not now')),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Continue'))
                  ]));
      if (accepted != true) {
        update('Payment not started.');
        return;
      }
      // Persist before opening: interrupted callbacks must not permit another charge.
      pending['awaiting'] = true;
      await persist();
      razorpay.open({
        'key': checkout['keyId'],
        'order_id': checkout['orderId'],
        'amount': checkout['amountPaise'],
        'currency': checkout['currency'],
        'name': 'School fee payment',
        'description': widget.invoice['feeType'] ?? 'School fees'
      });
    } catch (_) {
      update(
          'Unable to start payment. Refresh the status before trying again.');
    }
  }

  Future<void> success(PaymentSuccessResponse response) async {
    pending['proof'] = {
      'paymentOrderId': (pending['checkout'] as Map)['paymentOrderId'],
      'razorpayOrderId': response.orderId,
      'razorpayPaymentId': response.paymentId,
      'razorpaySignature': response.signature
    };
    try {
      await persist();
      await widget.api
          .verifyPayment((pending['proof'] as Map).cast<String, dynamic>());
      update(
          'Payment received by checkout. Awaiting school confirmation—do not pay again.');
    } catch (_) {
      update(
          'Confirmation is pending. Check payment status; do not pay again.');
    }
  }

  void failure(PaymentFailureResponse response) {
    // A callback error is not authoritative proof that no money moved.
    update(
        'Checkout did not confirm payment. Check status or contact the school before another attempt.');
  }

  void wallet(ExternalWalletResponse response) =>
      update('Complete payment with your wallet, then check status.');
  Future<void> refresh() async {
    setState(() => busy = true);
    try {
      if (pending['proof'] is Map) {
        await widget.api
            .verifyPayment((pending['proof'] as Map).cast<String, dynamic>());
      }
      final result = await widget.api._send('GET', '/api/v1/mobile/operations');
      final rows = ((result['operations'] as Map?)?['invoices'] as List?) ?? [];
      final matching = rows.where((r) => r['id'] == widget.invoice['id']);
      if (matching.isNotEmpty &&
          (matching.first['paidPaise'] as num) >=
              (matching.first['amountPaise'] as num)) {
        await storage.delete(key: storageKey);
        pending['settled'] = true;
        update('School balance updated. No payment is due.');
      } else {
        final order = pending['checkout'] as Map?;
        if (order != null) {
          final status = await widget.api._send('GET',
              '/api/v1/mobile/payments/status?orderId=${Uri.encodeComponent(order['paymentOrderId'].toString())}');
          if ((status['payment'] as Map?)?['retryAllowed'] == true) {
            pending['awaiting'] = false;
            pending.remove('proof');
            await persist();
            update(
                'No pending charge was found. You can retry the same payment order.');
            return;
          }
        }
        update(
            'No confirmed settlement yet. Do not pay again; contact the school if this continues.');
      }
    } catch (_) {
      update('Status could not be checked. Your pending payment is retained.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Secure fee payment')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        const Icon(Icons.verified_user_outlined,
            size: 54, color: Color(0xff174f41)),
        const SizedBox(height: 20),
        Text(widget.invoice['studentName']?.toString() ?? 'School fees',
            style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 18),
        Text(message, style: const TextStyle(fontSize: 16, height: 1.5)),
        const SizedBox(height: 20),
        if (busy) const LinearProgressIndicator(),
        if (pending['settled'] != true && pending['awaiting'] != true)
          FilledButton(
              onPressed: busy || pending['retryKey'] == null ? null : pay,
              child: const Text('Review & pay')),
        OutlinedButton(
            onPressed: busy ? null : refresh,
            child: const Text('Check payment status')),
        const Text(
            'Payment details are handled by Razorpay. A checkout response is not a school receipt.'),
      ]));
}
