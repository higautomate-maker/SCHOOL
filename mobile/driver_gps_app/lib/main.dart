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
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.light,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xff1565c0),
            brightness: Brightness.light,
          ),
          scaffoldBackgroundColor: const Color(0xfff4f6fb),
          cardTheme: const CardThemeData(
            elevation: 0,
            margin: EdgeInsets.zero,
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
      setState(() {
        transport = (response['transport'] as Map).cast<String, dynamic>();
        error = null;
      });
    }
    unawaited(PushRegistrationService().initializeAndRegister(api));
    unawaited(api.flushQueue());
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
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
    text: const String.fromEnvironment('HIG_TENANT_ID'),
  );
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
        tenantId: tenant.text.trim(),
        email: email.text.trim(),
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
              const SizedBox(height: 36),
              const CircleAvatar(
                radius: 44,
                backgroundColor: Color(0xffe3f2fd),
                child: Icon(
                  Icons.directions_bus_rounded,
                  size: 50,
                  color: Color(0xff1565c0),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Hig Driver',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
              ),
              const Text(
                'School transport operations',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 30),
              TextField(
                controller: tenant,
                decoration: const InputDecoration(
                  labelText: 'School tenant ID',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
              ),
              if ((message ?? widget.error) != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    message ?? widget.error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Padding(
                  padding: const EdgeInsets.all(15),
                  child: Text(busy ? 'Signing in…' : 'Sign in'),
                ),
              ),
            ],
          ),
        ),
      );
}

// Stage 10 Module 1 keeps GPS tracking foreground-only.
// Battery-safe background tracking, geofencing, and parent live maps
// will be enabled in the later Stage 10 transport modules.

enum DriverTripState { ready, active, paused, completed }

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
  DriverTripState tripState = DriverTripState.ready;
  String syncMessage = 'Ready to start';
  Position? lastPosition;
  int selectedTab = 0;
  final Map<String, String> studentStatuses = {};

  JsonMap? get assignment {
    final value = widget.transport?['assignment'];
    return value is Map ? value.cast<String, dynamic>() : null;
  }

  JsonMap? mapValue(JsonMap? source, String key) {
    final value = source?[key];
    return value is Map ? value.cast<String, dynamic>() : null;
  }

  List<JsonMap> listValue(JsonMap? source, String key) {
    final value = source?[key];
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }

  JsonMap? get route => mapValue(assignment, 'route');
  JsonMap? get vehicle => mapValue(assignment, 'vehicle');
  JsonMap? get driver => mapValue(assignment, 'driver');
  JsonMap? get trip => mapValue(assignment, 'trip');

  List<JsonMap> get stops => listValue(assignment, 'stops');

  List<JsonMap> get students {
    final assigned = listValue(assignment, 'students');
    if (assigned.isNotEmpty) return assigned;
    return listValue(widget.transport, 'students');
  }

  List<JsonMap> get legacyAssignments =>
      listValue(widget.transport, 'assignments');

  String? legacyAssignmentId(String type) {
    for (final item in legacyAssignments) {
      if (item['resourceType'] == type) {
        return item['resourceId']?.toString();
      }
    }
    return null;
  }

  String? get tripId => trip?['id']?.toString() ?? legacyAssignmentId('trip');

  String? get routeId =>
      route?['id']?.toString() ?? legacyAssignmentId('route');

  String? get vehicleId =>
      vehicle?['id']?.toString() ?? legacyAssignmentId('vehicle');

  bool get tracking => tripState == DriverTripState.active;

  @override
  void initState() {
    super.initState();
    tripState = stateFromSnapshot();
  }

  @override
  void didUpdateWidget(covariant DriverDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.transport != widget.transport &&
        tripState != DriverTripState.active) {
      tripState = stateFromSnapshot();
    }
  }

  DriverTripState stateFromSnapshot() {
    final tripStatus = trip?['status']?.toString();
    if (tripStatus == 'active') return DriverTripState.active;
    if (tripStatus == 'paused') return DriverTripState.paused;
    if (tripStatus == 'completed') return DriverTripState.completed;

    final events = listValue(widget.transport, 'events');
    if (events.isEmpty) return DriverTripState.ready;
    final latest = events.first['eventType']?.toString();
    if (latest == 'trip_completed') return DriverTripState.completed;
    if (latest == 'trip_paused') return DriverTripState.paused;
    if (latest == 'trip_started' || latest == 'location') {
      return DriverTripState.paused;
    }
    return DriverTripState.ready;
  }

  Future<void> event(
    String eventType, {
    Position? position,
    String? studentId,
  }) async {
    final result = await widget.api.transportEvent({
      'eventType': eventType,
      'tripId': tripId,
      'studentId': studentId,
      'latitude': position?.latitude,
      'longitude': position?.longitude,
      'accuracyMeters': position?.accuracy,
      'speedKph': position == null ? null : position.speed * 3.6,
      'headingDegrees': position?.heading,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      'metadata': {
        'background': false,
        'routeId': routeId,
        'vehicleId': vehicleId,
      },
    });
    if (mounted && result['queued'] == true) {
      setState(() => syncMessage = 'Saved offline · pending sync');
    }
  }

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      setState(() => syncMessage = 'Please enable location services');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() => syncMessage = 'Location permission is required');
      return false;
    }
    return true;
  }

  Future<void> start() async {
    if (assignment == null) {
      setState(() => syncMessage = 'School transport assignment is pending');
      return;
    }
    if (!await ensurePermission()) return;

    await event(
      tripState == DriverTripState.paused ? 'trip_started' : 'trip_started',
    );

    await positions?.cancel();
    positions = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
      ),
    ).listen((position) async {
      lastPosition = position;
      if (mounted) {
        setState(() => syncMessage = 'GPS active · location updated');
      }
      await event('location', position: position);
    });

    setState(() {
      tripState = DriverTripState.active;
      syncMessage = 'GPS active · foreground tracking';
    });
  }

  Future<void> pause() async {
    await positions?.cancel();
    positions = null;
    await event('trip_paused', position: lastPosition);
    setState(() {
      tripState = DriverTripState.paused;
      syncMessage = 'Trip paused';
    });
  }

  Future<void> complete() async {
    if (tripState == DriverTripState.ready ||
        tripState == DriverTripState.completed) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Complete this trip?'),
        content: const Text(
          'Tracking will stop and the trip will be marked completed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await positions?.cancel();
    positions = null;
    await event('trip_completed', position: lastPosition);
    setState(() {
      tripState = DriverTripState.completed;
      syncMessage = 'Trip completed';
    });
    await widget.onRefresh();
  }

  Future<void> sos() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.sos, color: Colors.red, size: 42),
        title: const Text('Send emergency alert?'),
        content: const Text(
          'The school will receive an SOS event with your latest location.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send SOS'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    Position? position;
    if (await ensurePermission()) {
      position = await Geolocator.getCurrentPosition();
    }
    await event('sos', position: position);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Emergency alert sent to the school'),
        ),
      );
    }
  }

  Future<void> recordStudent(
    String eventType,
    JsonMap student,
  ) async {
    final id = student['id']?.toString();
    if (id == null || id.isEmpty) return;
    await event(eventType, position: lastPosition, studentId: id);
    if (mounted) {
      setState(() {
        studentStatuses[id] =
            eventType == 'student_boarded' ? 'Boarded' : 'Dropped';
      });
    }
  }

  String get stateTitle {
    switch (tripState) {
      case DriverTripState.active:
        return 'TRIP ACTIVE';
      case DriverTripState.paused:
        return 'TRIP PAUSED';
      case DriverTripState.completed:
        return 'TRIP COMPLETED';
      case DriverTripState.ready:
        return assignment == null ? 'ASSIGNMENT PENDING' : 'READY TO START';
    }
  }

  String get stateSubtitle {
    if (assignment == null) {
      return 'The school has not assigned a vehicle and route yet';
    }
    switch (tripState) {
      case DriverTripState.active:
        return syncMessage;
      case DriverTripState.paused:
        return 'Tap resume to continue GPS tracking';
      case DriverTripState.completed:
        return 'The current trip has been closed';
      case DriverTripState.ready:
        return 'Tap start when you are ready to begin';
    }
  }

  Color get stateColor {
    switch (tripState) {
      case DriverTripState.active:
        return const Color(0xff2e7d32);
      case DriverTripState.paused:
        return const Color(0xffef6c00);
      case DriverTripState.completed:
        return const Color(0xff546e7a);
      case DriverTripState.ready:
        return const Color(0xff1565c0);
    }
  }

  @override
  void dispose() {
    positions?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final driverName = driver?['name']?.toString() ?? 'Driver';

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Hig Driver',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [
          IconButton(
            tooltip: 'Refresh assignment',
            onPressed: widget.onRefresh,
            icon: const Icon(Icons.sync_rounded),
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'logout') widget.onLogout();
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'logout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
          children: [
            Text(
              'Hello, $driverName',
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              route?['name']?.toString() ?? 'School transport',
              style: const TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 18),
            _StatusCard(
              title: stateTitle,
              subtitle: stateSubtitle,
              color: stateColor,
              routeName: route?['name']?.toString(),
              vehicleNumber: vehicle?['registrationNumber']?.toString(),
              studentCount: students.length,
            ),
            const SizedBox(height: 16),
            if (assignment != null)
              _AssignmentCard(
                route: route!,
                vehicle: vehicle!,
                trip: trip,
              ),
            if (assignment == null) const _PendingAssignmentCard(),
            const SizedBox(height: 16),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(
                  value: 0,
                  icon: Icon(Icons.home_outlined),
                  label: Text('Home'),
                ),
                ButtonSegment(
                  value: 1,
                  icon: Icon(Icons.pin_drop_outlined),
                  label: Text('Stops'),
                ),
                ButtonSegment(
                  value: 2,
                  icon: Icon(Icons.people_outline),
                  label: Text('Students'),
                ),
              ],
              selected: {selectedTab},
              onSelectionChanged: (value) {
                setState(() => selectedTab = value.first);
              },
            ),
            const SizedBox(height: 16),
            if (selectedTab == 0) _homeContent(),
            if (selectedTab == 1) _stopsContent(),
            if (selectedTab == 2) _studentsContent(),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: tracking
                      ? const Color(0xffef6c00)
                      : const Color(0xff1565c0),
                  minimumSize: const Size.fromHeight(54),
                ),
                onPressed: tripState == DriverTripState.completed
                    ? null
                    : tracking
                        ? pause
                        : start,
                icon: Icon(
                  tracking
                      ? Icons.pause_rounded
                      : tripState == DriverTripState.paused
                          ? Icons.play_arrow_rounded
                          : Icons.directions_bus_rounded,
                ),
                label: Text(
                  tracking
                      ? 'PAUSE'
                      : tripState == DriverTripState.paused
                          ? 'RESUME TRIP'
                          : 'START TRIP',
                ),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xffd32f2f),
                foregroundColor: Colors.white,
                minimumSize: const Size(54, 54),
              ),
              tooltip: 'Emergency SOS',
              onPressed: sos,
              icon: const Icon(Icons.sos),
            ),
          ],
        ),
      ),
    );
  }

  Widget _homeContent() {
    final nextStop = stops.isEmpty ? null : stops.first;
    return Column(
      children: [
        _InfoTile(
          icon: Icons.pin_drop_outlined,
          title: 'Next stop',
          value: nextStop?['name']?.toString() ?? 'No stops configured',
          trailing: nextStop?['pickupTime']?.toString(),
        ),
        const SizedBox(height: 10),
        _InfoTile(
          icon: Icons.people_outline,
          title: 'Assigned students',
          value: '${students.length} students',
          trailing: 'View list',
          onTap: () => setState(() => selectedTab = 2),
        ),
        const SizedBox(height: 10),
        _InfoTile(
          icon: tracking ? Icons.gps_fixed : Icons.gps_not_fixed,
          title: 'GPS status',
          value: tracking ? 'Tracking active' : 'Tracking inactive',
          trailing: lastPosition == null
              ? null
              : '${lastPosition!.accuracy.toStringAsFixed(0)} m',
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: tripState == DriverTripState.active ||
                  tripState == DriverTripState.paused
              ? complete
              : null,
          icon: const Icon(Icons.flag_outlined),
          label: const Padding(
            padding: EdgeInsets.all(13),
            child: Text('Complete trip'),
          ),
        ),
      ],
    );
  }

  Widget _stopsContent() {
    if (stops.isEmpty) {
      return const _EmptyCard(
        icon: Icons.route_outlined,
        text: 'No route stops have been configured',
      );
    }
    return Column(
      children: [
        for (final stop in stops)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: const Color(0xffe3f2fd),
                  child: Text(
                    stop['sequence']?.toString() ?? '',
                    style: const TextStyle(
                      color: Color(0xff1565c0),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                title: Text(
                  stop['name']?.toString() ?? 'Route stop',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${stop['studentCount'] ?? 0} students',
                ),
                trailing: Text(
                  stop['pickupTime']?.toString() ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _studentsContent() {
    if (students.isEmpty) {
      return const _EmptyCard(
        icon: Icons.people_outline,
        text: 'No students are assigned to this route',
      );
    }
    return Column(
      children: [
        for (final student in students)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _StudentCard(
              student: student,
              status: studentStatuses[student['id']?.toString()],
              onBoarded: () => recordStudent(
                'student_boarded',
                student,
              ),
              onDropped: () => recordStudent(
                'student_dropped',
                student,
              ),
            ),
          ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.title,
    required this.subtitle,
    required this.color,
    required this.routeName,
    required this.vehicleNumber,
    required this.studentCount,
  });

  final String title;
  final String subtitle;
  final Color color;
  final String? routeName;
  final String? vehicleNumber;
  final int studentCount;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.24),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          children: [
            const Icon(
              Icons.directions_bus_rounded,
              size: 48,
              color: Colors.white,
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: .4,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            if (routeName != null || vehicleNumber != null) ...[
              const SizedBox(height: 18),
              const Divider(color: Colors.white24),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _StatusStat(
                      label: 'ROUTE',
                      value: routeName ?? 'Pending',
                    ),
                  ),
                  Expanded(
                    child: _StatusStat(
                      label: 'VEHICLE',
                      value: vehicleNumber ?? 'Pending',
                    ),
                  ),
                  Expanded(
                    child: _StatusStat(
                      label: 'STUDENTS',
                      value: studentCount.toString(),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      );
}

class _StatusStat extends StatelessWidget {
  const _StatusStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      );
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({
    required this.route,
    required this.vehicle,
    required this.trip,
  });

  final JsonMap route;
  final JsonMap vehicle;
  final JsonMap? trip;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Column(
            children: [
              _AssignmentRow(
                icon: Icons.route_outlined,
                label: 'Route',
                value: route['name']?.toString() ?? 'Not assigned',
              ),
              const Divider(height: 24),
              _AssignmentRow(
                icon: Icons.directions_bus_outlined,
                label: 'Vehicle',
                value: vehicle['registrationNumber']?.toString() ??
                    vehicle['number']?.toString() ??
                    'Not assigned',
              ),
              const Divider(height: 24),
              _AssignmentRow(
                icon: Icons.schedule_outlined,
                label: 'Trip',
                value:
                    trip?['scheduledStartAt']?.toString() ?? 'Schedule pending',
              ),
            ],
          ),
        ),
      );
}

class _PendingAssignmentCard extends StatelessWidget {
  const _PendingAssignmentCard();

  @override
  Widget build(BuildContext context) => const Card(
        child: Padding(
          padding: EdgeInsets.all(18),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: Color(0xfffff3e0),
                child: Icon(Icons.assignment_late_outlined),
              ),
              SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Assignment pending',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Ask the transport administrator to assign your route and vehicle.',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _AssignmentRow extends StatelessWidget {
  const _AssignmentRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, color: const Color(0xff1565c0)),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 12,
                  ),
                ),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ],
      );
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.title,
    required this.value,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final String? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          onTap: onTap,
          leading: CircleAvatar(
            backgroundColor: const Color(0xffe3f2fd),
            child: Icon(icon, color: const Color(0xff1565c0)),
          ),
          title: Text(
            title,
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
          subtitle: Text(
            value,
            style: const TextStyle(
              color: Colors.black87,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
          trailing: trailing == null
              ? null
              : Text(
                  trailing!,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
        ),
      );
}

class _StudentCard extends StatelessWidget {
  const _StudentCard({
    required this.student,
    required this.status,
    required this.onBoarded,
    required this.onDropped,
  });

  final JsonMap student;
  final String? status;
  final VoidCallback onBoarded;
  final VoidCallback onDropped;

  @override
  Widget build(BuildContext context) {
    final className = student['className']?.toString() ?? '';
    final section = student['sectionName']?.toString() ?? '';
    final classLabel =
        [className, section].where((value) => value.isNotEmpty).join(' · ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 25,
              backgroundColor: const Color(0xffe8eaf6),
              child: Text(
                _initials(student['fullName']?.toString() ?? 'Student'),
                style: const TextStyle(
                  color: Color(0xff3949ab),
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    student['fullName']?.toString() ?? 'Student',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (classLabel.isNotEmpty)
                    Text(
                      classLabel,
                      style: const TextStyle(color: Colors.black54),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    'Pickup: ${student['pickupStopName'] ?? 'Not set'}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (status != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        status!,
                        style: const TextStyle(
                          color: Color(0xff2e7d32),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Student action',
              onSelected: (value) {
                if (value == 'boarded') onBoarded();
                if (value == 'dropped') onDropped();
              },
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'boarded',
                  child: ListTile(
                    leading: Icon(Icons.login),
                    title: Text('Mark boarded'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                PopupMenuItem(
                  value: 'dropped',
                  child: ListTile(
                    leading: Icon(Icons.logout),
                    title: Text('Mark dropped'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'S';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            children: [
              Icon(icon, size: 42, color: Colors.black38),
              const SizedBox(height: 10),
              Text(
                text,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54),
              ),
            ],
          ),
        ),
      );
}
