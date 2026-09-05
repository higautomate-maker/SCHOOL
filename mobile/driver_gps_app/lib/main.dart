import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://staging-school.higaai.com',
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
        title: 'Hig School Transport',
        theme: higMobileTheme(const Color(0xff1565c0)),
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
      error = higFriendlyAuthMessage(exception);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> load() async {
    final response = await api.transport();
    if (mounted) {
      setState(() {
        final source = response['transport'];
        transport = source is Map ? source.cast<String, dynamic>() : null;
        error = null;
      });
    }
    unawaited(PushRegistrationService().initializeAndRegister(api));
    unawaited(api.flushQueue());
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const HigStartupView(
        title: 'Hig School Transport',
        icon: Icons.directions_bus_rounded,
        message: 'Preparing your route and trip controls',
      );
    }
    if (api.session == null) {
      return DriverLogin(api: api, error: error, onAuthenticated: load);
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
  bool obscurePassword = true;
  String? message;
  String? emailError;
  String? passwordError;
  String? tenantError;

  bool get _tenantPreconfigured =>
      const String.fromEnvironment('HIG_TENANT_ID').trim().isNotEmpty;

  @override
  void dispose() {
    tenant.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final tenantIssue = _tenantPreconfigured
        ? null
        : (tenant.text.trim().isEmpty
            ? HigAuthMessages.schoolIdRequired
            : null);
    final emailIssue = higValidateEmail(email.text);
    final passwordIssue = higValidatePassword(password.text);
    setState(() {
      tenantError = tenantIssue;
      emailError = emailIssue;
      passwordError = passwordIssue;
      message = null;
    });
    if (tenantIssue != null || emailIssue != null || passwordIssue != null) {
      return;
    }

    setState(() => busy = true);
    try {
      await widget.api.login(
        tenantId: tenant.text.trim(),
        email: email.text.trim(),
        password: password.text,
        principalType: 'transporter',
      );
      await widget.onAuthenticated();
    } catch (exception) {
      if (mounted) setState(() => message = higFriendlyAuthMessage(exception));
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
                'Hig School Transport',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
              ),
              const Text(
                'Your route, students and trip controls in one place',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 30),
              if (!_tenantPreconfigured) ...[
                TextField(
                  controller: tenant,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: 'School ID',
                    hintText: 'Provided by your school',
                    prefixIcon: const Icon(Icons.apartment_rounded),
                    errorText: tenantError,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                autofillHints: const [
                  AutofillHints.username,
                  AutofillHints.email
                ],
                decoration: InputDecoration(
                  labelText: 'Email address',
                  prefixIcon: const Icon(Icons.mail_outline_rounded),
                  errorText: emailError,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: obscurePassword,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onSubmitted: busy ? null : (_) => submit(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  errorText: passwordError,
                  suffixIcon: IconButton(
                    tooltip:
                        obscurePassword ? 'Show password' : 'Hide password',
                    onPressed: () => setState(
                      () => obscurePassword = !obscurePassword,
                    ),
                    icon: Icon(
                      obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (dialogContext) => AlertDialog(
                      title: const Text('Can’t sign in?'),
                      content: const Text(
                        'Contact your school transport administrator to reset '
                        'your password or confirm your School ID.',
                      ),
                      actions: [
                        FilledButton(
                          onPressed: () => Navigator.pop(dialogContext),
                          child: const Text('Got it'),
                        ),
                      ],
                    ),
                  ),
                  child: const Text('Need help signing in?'),
                ),
              ),
              if ((message ?? widget.error) != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Container(
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .errorContainer
                          .withValues(alpha: .55),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          color: Theme.of(context).colorScheme.error,
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(message ?? widget.error!)),
                      ],
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
              const SizedBox(height: 18),
              const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.shield_outlined, size: 17, color: Colors.black54),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Only assigned routes and students are shown',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.black54, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

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

class _DriverDashboardState extends State<DriverDashboard>
    with WidgetsBindingObserver {
  static const offlineLocationSampleInterval = Duration(minutes: 3);

  StreamSubscription<Position>? positions;
  DriverTripState tripState = DriverTripState.ready;
  String syncMessage = 'Ready to start';
  Position? lastPosition;
  Position? pendingPosition;
  int selectedTab = 0;
  bool startingTracking = false;
  bool sendingLocation = false;
  bool offlineLocationMode = false;
  DateTime? lastOfflineLocationAttempt;
  Position? pendingGeofencePosition;
  bool processingGeofences = false;
  bool sendingSos = false;
  String? geofenceStateTripId;
  final Set<String> insideStopGeofences = {};
  final Set<String> emittedGeofenceEvents = {};
  AppLifecycleState lifecycleState = AppLifecycleState.resumed;
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
      if (item['resourceType'] == type) return item['resourceId']?.toString();
    }
    return null;
  }

  String? get tripId => trip?['id']?.toString() ?? legacyAssignmentId('trip');
  String? get routeId =>
      route?['id']?.toString() ?? legacyAssignmentId('route');
  String? get vehicleId =>
      vehicle?['id']?.toString() ?? legacyAssignmentId('vehicle');

  bool get tracking => tripState == DriverTripState.active;
  bool get appVisible => lifecycleState == AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    lifecycleState =
        WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed;
    tripState = stateFromSnapshot();
    restoreGeofenceStateFromSnapshot();
    restoreStudentStatusesFromSnapshot();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(restoreActiveTracking());
    });
  }

  @override
  void didUpdateWidget(covariant DriverDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.transport == widget.transport) return;
    final snapshotState = stateFromSnapshot();
    restoreGeofenceStateFromSnapshot();
    restoreStudentStatusesFromSnapshot();
    if (positions == null) tripState = snapshotState;
    if (snapshotState == DriverTripState.active && positions == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(restoreActiveTracking());
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    lifecycleState = state;
    if (state == AppLifecycleState.resumed) {
      if (mounted) setState(() {});
      unawaited(restoreActiveTracking());
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

  void updateMessage(String message) {
    syncMessage = message;
    if (mounted && appVisible) setState(() {});
  }

  Future<JsonMap> event(
    String eventType, {
    Position? position,
    String? studentId,
    String? stopId,
    JsonMap metadata = const {},
  }) async {
    final result = await widget.api.transportEvent({
      'eventType': eventType,
      'tripId': tripId,
      'studentId': studentId,
      'stopId': stopId,
      'latitude': position?.latitude,
      'longitude': position?.longitude,
      'accuracyMeters': position?.accuracy,
      'speedKph': position == null ? null : position.speed * 3.6,
      'headingDegrees': position?.heading,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      'metadata': {
        'background': !appVisible,
        'routeId': routeId,
        'vehicleId': vehicleId,
        ...metadata,
      },
    });
    if (result['queued'] == true) updateMessage('Saved offline · pending sync');
    return result;
  }

  Future<bool> ensurePermission() async {
    if (!appVisible) {
      updateMessage('Open Hig Driver to start GPS tracking');
      return false;
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      updateMessage('Please enable location services');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      updateMessage('Location permission is required');
      return false;
    }
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        permission == LocationPermission.whileInUse) {
      permission = await Geolocator.requestPermission();
    }
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        permission != LocationPermission.always) {
      updateMessage(
        'Set iPhone Location access to Always for active-trip tracking',
      );
      return false;
    }
    return true;
  }

  LocationSettings trackingSettings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
        intervalDuration: const Duration(seconds: 15),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Hig Driver · Trip tracking active',
          notificationText:
              'Location is being shared with your school for the active trip.',
          notificationChannelName: 'Active school trip location',
          enableWifiLock: false,
          enableWakeLock: false,
          setOngoing: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: 25,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25,
    );
  }

  Future<void> restoreActiveTracking() async {
    if (!mounted || !appVisible || positions != null || startingTracking) {
      return;
    }
    if (tripState != DriverTripState.active) return;
    if (!await ensurePermission()) return;
    await startTracking(emitTripStarted: false, restored: true);
  }

  Future<void> start() async {
    if (assignment == null) {
      updateMessage('School transport assignment is pending');
      return;
    }
    if (!appVisible) {
      updateMessage('Open Hig Driver to start or resume the trip');
      return;
    }
    if (!await ensurePermission()) return;
    await startTracking(
      emitTripStarted: true,
      restored: false,
      resumed: tripState == DriverTripState.paused,
    );
  }

  Future<void> startTracking({
    required bool emitTripStarted,
    required bool restored,
    bool resumed = false,
  }) async {
    if (startingTracking || positions != null) return;
    startingTracking = true;
    try {
      if (emitTripStarted) {
        await event(
          'trip_started',
          metadata: {'tripAction': resumed ? 'resume' : 'start'},
        );
      }
      positions = Geolocator.getPositionStream(
        locationSettings: trackingSettings(),
      ).listen(onPosition, onError: onPositionError, cancelOnError: false);
      tripState = DriverTripState.active;
      updateMessage(
        restored
            ? 'GPS restored · active-trip tracking'
            : 'GPS active · background-safe tracking',
      );
    } catch (_) {
      positions = null;
      updateMessage('GPS temporarily unavailable');
    } finally {
      startingTracking = false;
    }
  }

  void onPosition(Position position) {
    lastPosition = position;
    pendingPosition = position;
    pendingGeofencePosition = position;
    if (appVisible) updateMessage('GPS active · location updated');
    if (!sendingLocation) unawaited(drainPendingLocation());
    if (!processingGeofences) unawaited(drainPendingGeofences());
  }

  void restoreGeofenceStateFromSnapshot() {
    final currentTripId = tripId;
    if (geofenceStateTripId != currentTripId) {
      geofenceStateTripId = currentTripId;
      insideStopGeofences.clear();
      emittedGeofenceEvents.clear();
    }
    if (currentTripId == null) return;

    final latestByStop = <String, String>{};
    for (final item in listValue(widget.transport, 'events')) {
      if (item['tripId']?.toString() != currentTripId) continue;
      final eventType = item['eventType']?.toString();
      if (eventType != 'stop_arrived' &&
          eventType != 'stop_departed' &&
          eventType != 'stop_approaching') {
        continue;
      }
      final stopId = item['stopId']?.toString();
      if (stopId == null || stopId.isEmpty) continue;
      emittedGeofenceEvents.add('$eventType:$currentTripId:$stopId');
      if (eventType == 'stop_approaching') continue;
      latestByStop.putIfAbsent(stopId, () => eventType!);
    }

    for (final entry in latestByStop.entries) {
      if (entry.value == 'stop_arrived') {
        insideStopGeofences.add(entry.key);
      } else {
        insideStopGeofences.remove(entry.key);
      }
    }
  }

  double? stopNumber(JsonMap stop, String key) {
    final value = stop[key];
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }

  double geofenceHysteresis(double radiusMeters) =>
      (radiusMeters * 0.25).clamp(25.0, 100.0).toDouble();

  double stopApproachThresholdMeters(double radiusMeters) {
    final leadMeters = (radiusMeters * 1.5).clamp(300.0, 1500.0).toDouble();
    return radiusMeters + leadMeters;
  }

  String geofenceEventKey(String eventType, String stopId) =>
      '$eventType:${tripId ?? ''}:$stopId';

  Future<void> drainPendingGeofences() async {
    if (processingGeofences) return;
    processingGeofences = true;
    try {
      while (pendingGeofencePosition != null && tracking) {
        final position = pendingGeofencePosition!;
        pendingGeofencePosition = null;
        await processGeofences(position);
      }
    } finally {
      processingGeofences = false;
    }
  }

  Future<void> processGeofences(Position position) async {
    final currentTripId = tripId;
    if (!tracking || currentTripId == null) return;

    for (final stop in stops) {
      if (!tracking) return;
      final stopId = stop['id']?.toString();
      final latitude = stopNumber(stop, 'latitude');
      final longitude = stopNumber(stop, 'longitude');
      final radius = stopNumber(stop, 'geofenceRadiusMeters');
      if (stopId == null ||
          stopId.isEmpty ||
          latitude == null ||
          longitude == null ||
          radius == null ||
          radius < 25) {
        continue;
      }

      final distanceMeters = Geolocator.distanceBetween(
        position.latitude,
        position.longitude,
        latitude,
        longitude,
      );
      final approachingKey = geofenceEventKey('stop_approaching', stopId);
      final arrivedKey = geofenceEventKey('stop_arrived', stopId);
      final departedKey = geofenceEventKey('stop_departed', stopId);
      final approachThreshold = stopApproachThresholdMeters(radius);

      if (distanceMeters > radius &&
          distanceMeters <= approachThreshold &&
          !insideStopGeofences.contains(stopId) &&
          !emittedGeofenceEvents.contains(approachingKey)) {
        try {
          await event(
            'stop_approaching',
            position: position,
            stopId: stopId,
            metadata: {
              'automatic': true,
              'distanceMeters': distanceMeters,
              'geofenceRadiusMeters': radius,
              'approachThresholdMeters': approachThreshold,
            },
          );
          emittedGeofenceEvents.add(approachingKey);
          if (appVisible) {
            updateMessage(
              'Approaching · ${stop['name']?.toString() ?? 'route stop'}',
            );
          }
        } catch (_) {
          updateMessage('Stop approach sync temporarily unavailable');
        }
      }

      if (distanceMeters <= radius &&
          !insideStopGeofences.contains(stopId) &&
          !emittedGeofenceEvents.contains(arrivedKey)) {
        try {
          await event(
            'stop_arrived',
            position: position,
            stopId: stopId,
            metadata: {
              'automatic': true,
              'distanceMeters': distanceMeters,
              'geofenceRadiusMeters': radius,
            },
          );
          emittedGeofenceEvents.add(arrivedKey);
          insideStopGeofences.add(stopId);
          if (appVisible) {
            updateMessage(
              'Arrived · ${stop['name']?.toString() ?? 'route stop'}',
            );
          }
        } catch (_) {
          updateMessage('Stop arrival sync temporarily unavailable');
        }
        continue;
      }

      final departureThreshold = radius + geofenceHysteresis(radius);
      if (insideStopGeofences.contains(stopId) &&
          distanceMeters > departureThreshold &&
          !emittedGeofenceEvents.contains(departedKey)) {
        try {
          await event(
            'stop_departed',
            position: position,
            stopId: stopId,
            metadata: {
              'automatic': true,
              'distanceMeters': distanceMeters,
              'geofenceRadiusMeters': radius,
              'departureThresholdMeters': departureThreshold,
            },
          );
          emittedGeofenceEvents.add(departedKey);
          insideStopGeofences.remove(stopId);
          if (appVisible) {
            updateMessage(
              'Departed · ${stop['name']?.toString() ?? 'route stop'}',
            );
          }
        } catch (_) {
          updateMessage('Stop departure sync temporarily unavailable');
        }
      }
    }
  }

  void onPositionError(Object error) {
    updateMessage('GPS temporarily unavailable');
  }

  Future<void> drainPendingLocation() async {
    if (sendingLocation) return;
    sendingLocation = true;
    try {
      while (pendingPosition != null && tracking) {
        final next = pendingPosition!;
        pendingPosition = null;
        await sendLocation(next);
      }
    } finally {
      sendingLocation = false;
    }
  }

  Future<void> sendLocation(Position position) async {
    final now = DateTime.now().toUtc();
    if (offlineLocationMode &&
        lastOfflineLocationAttempt != null &&
        now.difference(lastOfflineLocationAttempt!) <
            offlineLocationSampleInterval) {
      return;
    }

    try {
      final result = await event('location', position: position);
      if (result['queued'] == true) {
        offlineLocationMode = true;
        lastOfflineLocationAttempt = now;
      } else {
        final wasOffline = offlineLocationMode;
        offlineLocationMode = false;
        lastOfflineLocationAttempt = null;
        if (wasOffline) unawaited(widget.api.flushQueue());
      }
    } catch (_) {
      updateMessage('GPS sync temporarily unavailable');
    }
  }

  Future<void> stopTracking() async {
    final subscription = positions;
    positions = null;
    pendingPosition = null;
    pendingGeofencePosition = null;
    if (subscription != null) await subscription.cancel();
  }

  Future<void> pause() async {
    await stopTracking();
    await event('trip_paused', position: lastPosition);
    tripState = DriverTripState.paused;
    updateMessage('Trip paused · GPS stopped');
    unawaited(widget.api.flushQueue());
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

    await stopTracking();
    await event('trip_completed', position: lastPosition);
    tripState = DriverTripState.completed;
    updateMessage('Trip completed · GPS stopped');
    await widget.api.flushQueue();
    await widget.onRefresh();
  }

  Future<void> logout() async {
    await stopTracking();
    try {
      await widget.api.flushQueue();
    } catch (_) {
      // Logout remains authoritative and clears identity-scoped offline data.
    }
    await widget.onLogout();
  }

  Future<void> sos() async {
    if (sendingSos) return;
    if (tripId == null ||
        (tripState != DriverTripState.active &&
            tripState != DriverTripState.paused)) {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Start the assigned trip before sending SOS'),
          ),
        );
      }
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.sos, color: Colors.red, size: 42),
        title: const Text('Send emergency alert?'),
        content: const Text(
          'The school will receive an emergency SOS with your trip, vehicle '
          'and latest available location.',
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

    sendingSos = true;
    if (mounted && appVisible) setState(() {});

    try {
      Position? position = lastPosition;
      if (position == null) {
        try {
          if (await ensurePermission()) {
            position = await Geolocator.getCurrentPosition();
          }
        } catch (_) {
          // Emergency transmission must continue even if GPS is unavailable.
        }
      }

      final result = await event(
        'sos',
        position: position,
        metadata: const {'emergency': true, 'source': 'driver_sos_button'},
      );
      final replayed = result['replayed'] == true;

      if (mounted && appVisible) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              replayed
                  ? 'Emergency SOS already sent recently'
                  : 'Emergency SOS sent to the school',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Emergency SOS could not sync. Check connectivity and retry.',
            ),
          ),
        );
      }
    } finally {
      sendingSos = false;
      if (mounted && appVisible) setState(() {});
    }
  }

  void restoreStudentStatusesFromSnapshot() {
    studentStatuses.clear();

    final currentTripId = tripId;
    if (currentTripId == null) return;

    for (final item in listValue(widget.transport, 'events')) {
      if (item['tripId']?.toString() != currentTripId) continue;

      final eventType = item['eventType']?.toString();

      if (eventType != 'student_boarded' && eventType != 'student_dropped') {
        continue;
      }

      final studentId = item['studentId']?.toString();

      if (studentId == null || studentId.isEmpty) continue;

      // Events are newest-first. The latest student transition wins.
      if (studentStatuses.containsKey(studentId)) continue;

      studentStatuses[studentId] =
          eventType == 'student_dropped' ? 'Dropped' : 'Boarded';
    }
  }

  Future<void> recordStudent(String eventType, JsonMap student) async {
    final id = student['id']?.toString();

    if (id == null || id.isEmpty) return;

    if (!tracking || tripId == null) {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Start the active trip before marking students'),
          ),
        );
      }
      return;
    }

    final current = studentStatuses[id] ?? 'Waiting';

    if (eventType == 'student_boarded' && current != 'Waiting') {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Student is already $current')));
      }
      return;
    }

    if (eventType == 'student_dropped' && current != 'Boarded') {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Mark the student boarded before drop')),
        );
      }
      return;
    }

    try {
      await event(eventType, position: lastPosition, studentId: id);

      if (mounted && appVisible) {
        setState(() {
          studentStatuses[id] =
              eventType == 'student_boarded' ? 'Boarded' : 'Dropped';
        });
      }
    } catch (exception) {
      if (mounted && appVisible) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(exception.toString())));
      }
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
    WidgetsBinding.instance.removeObserver(this);
    unawaited(stopTracking());
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
              if (value == 'logout') unawaited(logout());
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 142),
          children: [
            Text(
              'Hello, $driverName',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
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
              _AssignmentCard(route: route!, vehicle: vehicle!, trip: trip),
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
              onSelectionChanged: (value) =>
                  setState(() => selectedTab = value.first),
            ),
            const SizedBox(height: 16),
            if (selectedTab == 0) homeContent(),
            if (selectedTab == 1) stopsContent(),
            if (selectedTab == 2) studentsContent(),
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
              onPressed: !sendingSos &&
                      tripId != null &&
                      (tripState == DriverTripState.active ||
                          tripState == DriverTripState.paused)
                  ? sos
                  : null,
              icon: sendingSos
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sos),
            ),
          ],
        ),
      ),
    );
  }

  Widget homeContent() {
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
          value:
              '${students.length} ${students.length == 1 ? 'student' : 'students'}',
          trailing: 'View list',
          onTap: () => setState(() => selectedTab = 2),
        ),
        const SizedBox(height: 10),
        _InfoTile(
          icon: tracking ? Icons.gps_fixed : Icons.gps_not_fixed,
          title: 'GPS status',
          value: tracking
              ? appVisible
                  ? 'Tracking active'
                  : 'Tracking active in background'
              : 'Tracking inactive',
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

  Widget stopsContent() {
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
                  '${stop['studentCount'] ?? 0} '
                  '${(stop['studentCount'] as num?)?.toInt() == 1 ? 'student' : 'students'}',
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

  Widget studentsContent() {
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
              canBoard: tracking &&
                  studentStatuses[student['id']?.toString()] == null,
              canDrop: tracking &&
                  studentStatuses[student['id']?.toString()] == 'Boarded',
              onBoarded: () => recordStudent('student_boarded', student),
              onDropped: () => recordStudent('student_dropped', student),
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
            const Icon(Icons.directions_bus_rounded,
                size: 48, color: Colors.white),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w900,
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
                  style: const TextStyle(color: Colors.black54, fontSize: 12),
                ),
                Text(value,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
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
    required this.canBoard,
    required this.canDrop,
    required this.onBoarded,
    required this.onDropped,
  });
  final JsonMap student;
  final String? status;
  final bool canBoard;
  final bool canDrop;
  final VoidCallback onBoarded;
  final VoidCallback onDropped;

  @override
  Widget build(BuildContext context) {
    final className = student['className']?.toString() ?? '';
    final section = student['sectionName']?.toString() ?? '';
    final classLabel = [
      className,
      section,
    ].where((value) => value.isNotEmpty).join(' · ');
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 25,
              backgroundColor: const Color(0xffe8eaf6),
              child: Text(
                initials(student['fullName']?.toString() ?? 'Student'),
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
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'boarded',
                  enabled: canBoard,
                  child: const Text('Mark boarded'),
                ),
                PopupMenuItem(
                  value: 'dropped',
                  enabled: canDrop,
                  child: const Text('Mark dropped'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String initials(String name) {
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
