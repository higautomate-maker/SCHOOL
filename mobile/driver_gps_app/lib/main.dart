import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3002',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DriverApp());
}

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Hig Driver',
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xff0f766e),
            brightness: Brightness.dark,
          ),
        ),
        home: const DriverRoot(),
      );
}

class DriverRoot extends StatefulWidget {
  const DriverRoot({super.key});

  @override
  State<DriverRoot> createState() => _DriverRootState();
}

class _DriverRootState extends State<DriverRoot> {
  late final HigMobileApi api;
  final OfflineSyncService offlineSync = OfflineSyncService();
  bool loading = true;
  JsonMap? transport;
  String? error;

  @override
  void initState() {
    super.initState();
    api = HigMobileApi(
      baseUrl: apiBaseUrl,
      appId: 'com.higautomation.higschool.driver',
    );
    offlineSync.start(api);
    restore();
  }

  @override
  void dispose() {
    unawaited(offlineSync.dispose());
    unawaited(PushRegistrationService.disposeFor(api));
    api.close();
    super.dispose();
  }

  Future<void> restore() async {
    try {
      if (await api.restore()) await load();
    } catch (exception) {
      error = exception.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> load() async {
    final response = await api.transport();
    if (mounted) {
      setState(() =>
          transport = (response['transport'] as Map).cast<String, dynamic>());
    }
    unawaited(PushRegistrationService().initializeAndRegister(api));
    unawaited(api.flushQueue());
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (api.session == null) {
      return DriverLogin(
        api: api,
        error: error,
        onAuthenticated: load,
      );
    }
    return DriverDashboard(
      api: api,
      transport: transport,
      onRefresh: load,
      onLogout: () async {
        await PushRegistrationService.disposeFor(api);
        await api.logout();
        if (mounted) setState(() => transport = null);
      },
    );
  }
}

class DriverLogin extends StatefulWidget {
  const DriverLogin({
    super.key,
    required this.api,
    required this.onAuthenticated,
    this.error,
  });
  final HigMobileApi api;
  final Future<void> Function() onAuthenticated;
  final String? error;

  @override
  State<DriverLogin> createState() => _DriverLoginState();
}

class _DriverLoginState extends State<DriverLogin> {
  final tenant = TextEditingController(
      text: const String.fromEnvironment('HIG_TENANT_ID'));
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? message;

  @override
  void dispose() {
    tenant.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await widget.api.login(
        tenantId: tenant.text,
        email: email.text,
        password: password.text,
        principalType: 'transporter',
      );
      await widget.onAuthenticated();
    } catch (exception) {
      if (mounted) setState(() => message = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(28),
            children: [
              const SizedBox(height: 32),
              const CircleAvatar(
                  radius: 38, child: Icon(Icons.directions_bus, size: 42)),
              const SizedBox(height: 20),
              const Text(
                'Hig Driver',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
              ),
              const Text(
                'Secure transporter sign-in · foreground tracking',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              TextField(
                controller: tenant,
                decoration: const InputDecoration(
                    labelText: 'School tenant ID',
                    border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                    labelText: 'Email', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'Password', border: OutlineInputBorder()),
              ),
              if ((message ?? widget.error) != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(message ?? widget.error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(busy ? 'Signing in…' : 'Open assigned trip'),
                ),
              ),
            ],
          ),
        ),
      );
}

class DriverDashboard extends StatefulWidget {
  const DriverDashboard({
    super.key,
    required this.api,
    required this.transport,
    required this.onRefresh,
    required this.onLogout,
  });
  final HigMobileApi api;
  final JsonMap? transport;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onLogout;

  @override
  State<DriverDashboard> createState() => _DriverDashboardState();
}

class _DriverDashboardState extends State<DriverDashboard> {
  StreamSubscription<Position>? positions;
  bool tracking = false;
  String status = 'Ready';
  Position? lastPosition;

  List<JsonMap> get assignments =>
      ((widget.transport?['assignments'] as List?) ?? const [])
          .map((entry) => (entry as Map).cast<String, dynamic>())
          .toList();

  String? assignmentId(String type) {
    for (final assignment in assignments) {
      if (assignment['resourceType'] == type) {
        return assignment['resourceId']?.toString();
      }
    }
    return null;
  }

  Future<void> event(
    String eventType, {
    Position? position,
    String? studentId,
  }) async {
    final result = await widget.api.transportEvent({
      'eventType': eventType,
      'tripId': assignmentId('trip'),
      'studentId': studentId,
      'latitude': position?.latitude,
      'longitude': position?.longitude,
      'accuracyMeters': position?.accuracy,
      'speedKph': position == null ? null : position.speed * 3.6,
      'headingDegrees': position?.heading,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      'metadata': {
        'background': false,
        'routeId': assignmentId('route'),
        'vehicleId': assignmentId('vehicle'),
      },
    });
    if (mounted && result['queued'] == true) {
      setState(() => status = 'Saved offline; will sync automatically');
    }
  }

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      setState(() => status = 'Enable location services');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() => status = 'Location permission is required');
      return false;
    }
    return true;
  }

  Future<void> start() async {
    if (!await ensurePermission()) return;
    await event('trip_started');
    positions = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
      ),
    ).listen((position) async {
      lastPosition = position;
      if (mounted) setState(() => status = 'Foreground tracking active');
      await event('location', position: position);
    });
    setState(() => tracking = true);
  }

  Future<void> pause() async {
    await positions?.cancel();
    positions = null;
    await event('trip_paused', position: lastPosition);
    setState(() {
      tracking = false;
      status = 'Trip paused';
    });
  }

  Future<void> complete() async {
    await positions?.cancel();
    positions = null;
    await event('trip_completed', position: lastPosition);
    setState(() {
      tracking = false;
      status = 'Trip completed';
    });
    await widget.onRefresh();
  }

  Future<void> sos() async {
    if (await ensurePermission()) {
      final position = await Geolocator.getCurrentPosition();
      await event('sos', position: position);
    } else {
      await event('sos');
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Emergency alert recorded for the school.')),
      );
    }
  }

  @override
  void dispose() {
    positions?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final events = ((widget.transport?['events'] as List?) ?? const []);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hig Driver'),
        actions: [
          IconButton(onPressed: widget.onRefresh, icon: const Icon(Icons.sync)),
          IconButton(
              onPressed: widget.onLogout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        child: ListView(
          padding: const EdgeInsets.all(18),
          children: [
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: const LinearGradient(
                    colors: [Color(0xff164e63), Color(0xff0f766e)]),
              ),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('ASSIGNED TRANSPORT',
                        style:
                            TextStyle(color: Color(0xff99f6e4), fontSize: 11)),
                    const SizedBox(height: 8),
                    Text('Route ${assignmentId('route') ?? 'not assigned'}',
                        style: const TextStyle(
                            fontSize: 22, fontWeight: FontWeight.w900)),
                    Text(
                        'Vehicle ${assignmentId('vehicle') ?? 'not assigned'}'),
                    const SizedBox(height: 16),
                    Text(status,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (lastPosition != null)
                      Text(
                          '${lastPosition!.latitude.toStringAsFixed(5)}, ${lastPosition!.longitude.toStringAsFixed(5)}'),
                  ]),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: tracking ? pause : start,
              icon: Icon(tracking ? Icons.pause : Icons.play_arrow),
              label: Padding(
                padding: const EdgeInsets.all(14),
                child:
                    Text(tracking ? 'Pause tracking' : 'Start foreground trip'),
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: complete,
              icon: const Icon(Icons.flag_outlined),
              label: const Padding(
                  padding: EdgeInsets.all(14), child: Text('Complete trip')),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: sos,
              icon: const Icon(Icons.sos),
              label: const Padding(
                  padding: EdgeInsets.all(14), child: Text('Emergency SOS')),
            ),
            const SizedBox(height: 22),
            const Text('Assigned students',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            if (assignments
                .where((entry) => entry['resourceType'] == 'student')
                .isEmpty)
              const ListTile(
                  title: Text('No student boarding assignments are active.')),
            ...assignments
                .where((entry) => entry['resourceType'] == 'student')
                .map((assignment) {
              final studentId = assignment['resourceId']?.toString() ?? '';
              return Card(
                child: ListTile(
                  leading:
                      const CircleAvatar(child: Icon(Icons.person_outline)),
                  title: Text(
                      'Student ${studentId.isEmpty ? 'assignment' : studentId}'),
                  subtitle:
                      const Text('Record boarding only for assigned students'),
                  trailing: Wrap(
                    spacing: 4,
                    children: [
                      IconButton(
                        tooltip: 'Boarded',
                        onPressed: studentId.isEmpty
                            ? null
                            : () => event('student_boarded',
                                position: lastPosition, studentId: studentId),
                        icon: const Icon(Icons.login),
                      ),
                      IconButton(
                        tooltip: 'Dropped',
                        onPressed: studentId.isEmpty
                            ? null
                            : () => event('student_dropped',
                                position: lastPosition, studentId: studentId),
                        icon: const Icon(Icons.logout),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 22),
            const Text('Recent trip events',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            if (events.isEmpty)
              const ListTile(title: Text('No trip events recorded yet.')),
            ...events.take(20).map((entry) {
              final item = (entry as Map).cast<String, dynamic>();
              return ListTile(
                leading: const Icon(Icons.route),
                title: Text(
                    item['eventType']?.toString().replaceAll('_', ' ') ??
                        'Trip event'),
                subtitle: Text(item['capturedAt']?.toString() ?? ''),
              );
            }),
            const SizedBox(height: 12),
            const Text(
              'Stage 9 uses foreground-only tracking. Background tracking, geofencing, live parent maps, and location-retention automation are implemented in Stage 10.',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
