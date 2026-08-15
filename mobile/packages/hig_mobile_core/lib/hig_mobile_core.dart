library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

part 'src/hig_mobile_ui.dart';

const _uuid = Uuid();

typedef JsonMap = Map<String, dynamic>;

class MobileSession {
  const MobileSession({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.refreshExpiresAt,
    required this.tenantId,
    required this.principalType,
    required this.sessionId,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final DateTime refreshExpiresAt;
  final String tenantId;
  final String principalType;
  final String sessionId;

  factory MobileSession.fromJson(JsonMap json) => MobileSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        accessExpiresAt: DateTime.parse(json['accessExpiresAt'] as String),
        refreshExpiresAt: DateTime.parse(json['refreshExpiresAt'] as String),
        tenantId: json['tenantId'] as String,
        principalType: json['principalType'] as String,
        sessionId: json['sessionId'] as String,
      );

  JsonMap toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessExpiresAt': accessExpiresAt.toIso8601String(),
        'refreshExpiresAt': refreshExpiresAt.toIso8601String(),
        'tenantId': tenantId,
        'principalType': principalType,
        'sessionId': sessionId,
      };
}

class SecureSessionStore {
  static const _key = 'hig.mobile.session.v1';
  const SecureSessionStore();
  static const FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<MobileSession?> read() async {
    final value = await _storage.read(key: _key);
    if (value == null || value.isEmpty) return null;
    try {
      return MobileSession.fromJson(jsonDecode(value) as JsonMap);
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> write(MobileSession session) =>
      _storage.write(key: _key, value: jsonEncode(session.toJson()));

  Future<void> clear() => _storage.delete(key: _key);
}

class OfflineStore {
  static const _cacheKey = 'hig.mobile.cache.v1';
  static const _queueKey = 'hig.mobile.queue.v1';

  Future<JsonMap?> readJson(String key) async {
    final raw = (await SharedPreferences.getInstance()).getString(_cacheKey);
    if (raw == null) return null;
    try {
      final cache = (jsonDecode(raw) as Map).cast<String, dynamic>();
      final value = cache[key];
      return value is Map ? value.cast<String, dynamic>() : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> writeJson(String key, JsonMap value) async {
    final preferences = await SharedPreferences.getInstance();
    JsonMap cache = {};
    final raw = preferences.getString(_cacheKey);
    if (raw != null) {
      try {
        cache = (jsonDecode(raw) as Map).cast<String, dynamic>();
      } catch (_) {
        cache = {};
      }
    }
    cache[key] = value;
    await preferences.setString(_cacheKey, jsonEncode(cache));
  }

  Future<JsonMap?> readHome() => readJson('home');

  Future<void> writeHome(JsonMap value) => writeJson('home', value);

  Future<List<QueuedWrite>> readQueue() async {
    final raw = (await SharedPreferences.getInstance()).getString(_queueKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .map((entry) => QueuedWrite.fromJson(entry as JsonMap))
          .where(
            (entry) => DateTime.now().difference(entry.createdAt).inHours <= 72,
          )
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeQueue(List<QueuedWrite> queue) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _queueKey,
      jsonEncode(queue.map((entry) => entry.toJson()).toList()),
    );
  }

  Future<void> clear() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_cacheKey);
    await preferences.remove(_queueKey);
  }
}

class QueuedWrite {
  const QueuedWrite({
    required this.id,
    required this.method,
    required this.path,
    required this.body,
    required this.idempotencyKey,
    required this.createdAt,
  });

  final String id;
  final String method;
  final String path;
  final JsonMap body;
  final String idempotencyKey;
  final DateTime createdAt;

  factory QueuedWrite.fromJson(JsonMap json) => QueuedWrite(
        id: json['id'] as String,
        method: json['method'] as String,
        path: json['path'] as String,
        body: (json['body'] as Map).cast<String, dynamic>(),
        idempotencyKey: json['idempotencyKey'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  JsonMap toJson() => {
        'id': id,
        'method': method,
        'path': path,
        'body': body,
        'idempotencyKey': idempotencyKey,
        'createdAt': createdAt.toIso8601String(),
      };
}

class MobileApiException implements Exception {
  const MobileApiException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  @override
  String toString() => message;
}

class HigMobileApi {
  HigMobileApi({
    required this.baseUrl,
    required this.appId,
    SecureSessionStore? sessionStore,
    OfflineStore? offlineStore,
    http.Client? client,
  })  : sessionStore = sessionStore ?? const SecureSessionStore(),
        offlineStore = offlineStore ?? OfflineStore(),
        _client = client ?? http.Client();

  final String baseUrl;
  final String appId;
  final SecureSessionStore sessionStore;
  final OfflineStore offlineStore;
  final http.Client _client;
  MobileSession? session;

  String get _platform => Platform.isIOS ? 'ios' : 'android';

  void close() => _client.close();

  Future<MobileSession> login({
    required String tenantId,
    required String email,
    required String password,
    required String principalType,
  }) async {
    // Never allow cached data or queued writes from a previous identity to cross
    // a fresh sign-in boundary.
    await offlineStore.clear();
    final body = await _send(
      'POST',
      '/api/v1/mobile/auth/login',
      authenticated: false,
      body: {
        'tenantId': tenantId.trim(),
        'email': email.trim(),
        'password': password,
        'principalType': principalType,
        'deviceId': await _deviceId(),
        'devicePlatform': _platform,
        'appVersion': const String.fromEnvironment(
          'APP_VERSION',
          defaultValue: '1.0.0',
        ),
      },
    );
    final next = MobileSession.fromJson(
      (body['session'] as Map).cast<String, dynamic>(),
    );
    session = next;
    await sessionStore.write(next);
    return next;
  }

  Future<bool> restore() async {
    final stored = await sessionStore.read();
    if (stored == null || stored.refreshExpiresAt.isBefore(DateTime.now())) {
      await clearSession();
      return false;
    }
    session = stored;
    try {
      await _send('GET', '/api/v1/mobile/session');
      return true;
    } on MobileApiException catch (error) {
      if (error.statusCode != 401) rethrow;
      return refresh();
    }
  }

  Future<bool> refresh() async {
    final current = session;
    if (current == null) return false;
    try {
      final body = await _send(
        'POST',
        '/api/v1/mobile/auth/refresh',
        authenticated: false,
        body: {
          'refreshToken': current.refreshToken,
          'deviceId': await _deviceId(),
          'devicePlatform': _platform,
          'appVersion': const String.fromEnvironment(
            'APP_VERSION',
            defaultValue: '1.0.0',
          ),
        },
      );
      final next = MobileSession.fromJson(
        (body['session'] as Map).cast<String, dynamic>(),
      );
      session = next;
      await sessionStore.write(next);
      return true;
    } catch (_) {
      await clearSession();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _send('POST', '/api/v1/mobile/auth/logout', body: const {});
    } catch (_) {
      // Local sign-out is authoritative for the device even if the network is down.
    }
    await clearSession();
  }

  Future<void> clearSession() async {
    session = null;
    await sessionStore.clear();
    await offlineStore.clear();
  }

  Future<JsonMap> home({bool allowCache = true}) async {
    try {
      final response = await _send('GET', '/api/v1/mobile/home');
      await offlineStore.writeHome(response);
      return response;
    } catch (_) {
      if (!allowCache) rethrow;
      final cached = await offlineStore.readHome();
      if (cached != null) return {...cached, 'offline': true};
      rethrow;
    }
  }

  Future<JsonMap> operations() =>
      _cachedGet('/api/v1/mobile/operations', 'operations');

  Future<JsonMap> content({String? featureKey, String? moduleKey}) {
    final query = <String, String>{};
    if (featureKey != null) query['featureKey'] = featureKey;
    if (moduleKey != null) query['moduleKey'] = moduleKey;
    final path = Uri(
      path: '/api/v1/mobile/content',
      queryParameters: query,
    ).toString();
    return _cachedGet(path, 'content:${Uri.encodeComponent(path)}');
  }

  Future<JsonMap> notifications({bool unreadOnly = false}) => _cachedGet(
        '/api/v1/mobile/notifications?unreadOnly=$unreadOnly',
        'notifications:$unreadOnly',
      );

  Future<JsonMap> markNotificationRead(String id) =>
      write('/api/v1/mobile/notifications/$id/read', const {});

  Future<JsonMap> operation(JsonMap body, {bool queueWhenOffline = true}) =>
      write(
        '/api/v1/mobile/operations',
        body,
        queueWhenOffline: queueWhenOffline,
      );

  Future<JsonMap> contentAction(JsonMap body, {bool queueWhenOffline = true}) =>
      write('/api/v1/mobile/content', body, queueWhenOffline: queueWhenOffline);

  Future<JsonMap> transport() =>
      _cachedGet('/api/v1/mobile/transport', 'transport');

  Future<JsonMap> transportEvent(
    JsonMap body, {
    bool queueWhenOffline = true,
  }) =>
      write(
        '/api/v1/mobile/transport/events',
        body,
        queueWhenOffline: queueWhenOffline,
      );

  Future<JsonMap> _cachedGet(String path, String cacheKey) async {
    try {
      final response = await _send('GET', path);
      await offlineStore.writeJson(cacheKey, response);
      return response;
    } catch (_) {
      final cached = await offlineStore.readJson(cacheKey);
      if (cached != null) return {...cached, 'offline': true};
      rethrow;
    }
  }

  Future<JsonMap> write(
    String path,
    JsonMap body, {
    bool queueWhenOffline = true,
    String method = 'POST',
  }) async {
    final idempotencyKey = _uuid.v4();
    try {
      return await _send(
        method,
        path,
        body: body,
        extraHeaders: {'idempotency-key': idempotencyKey},
      );
    } on SocketException catch (_) {
      if (!queueWhenOffline) rethrow;
      await enqueue(method, path, body, idempotencyKey);
      return {'queued': true, 'idempotencyKey': idempotencyKey};
    } on http.ClientException catch (_) {
      if (!queueWhenOffline) rethrow;
      await enqueue(method, path, body, idempotencyKey);
      return {'queued': true, 'idempotencyKey': idempotencyKey};
    } on TimeoutException catch (_) {
      if (!queueWhenOffline) rethrow;
      await enqueue(method, path, body, idempotencyKey);
      return {'queued': true, 'idempotencyKey': idempotencyKey};
    }
  }

  Future<void> enqueue(
    String method,
    String path,
    JsonMap body,
    String idempotencyKey,
  ) async {
    final queue = await offlineStore.readQueue();
    queue.add(
      QueuedWrite(
        id: _uuid.v4(),
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        createdAt: DateTime.now().toUtc(),
      ),
    );
    final bounded =
        queue.length <= 100 ? queue : queue.sublist(queue.length - 100);
    await offlineStore.writeQueue(bounded);
  }

  Future<int> flushQueue() async {
    final queue = await offlineStore.readQueue();
    final remaining = <QueuedWrite>[];
    var completed = 0;
    for (final entry in queue) {
      try {
        await _send(
          entry.method,
          entry.path,
          body: entry.body,
          extraHeaders: {'idempotency-key': entry.idempotencyKey},
        );
        completed += 1;
      } on MobileApiException catch (error) {
        if (error.statusCode >= 500 || error.statusCode == 429) {
          remaining.add(entry);
        }
      } catch (_) {
        remaining.add(entry);
      }
    }
    await offlineStore.writeQueue(remaining);
    return completed;
  }

  Future<bool> registerPushToken(String token) async {
    await _send(
      'PUT',
      '/api/v1/mobile/devices',
      body: {
        'platform': _platform,
        // FirebaseMessaging returns an FCM registration token on both Android
        // and iOS. Native APNs tokens are not sent through this path.
        'provider': 'firebase',
        'token': token,
        'appId': appId,
        'appVersion': const String.fromEnvironment(
          'APP_VERSION',
          defaultValue: '1.0.0',
        ),
      },
    );
    return true;
  }

  Future<JsonMap> _send(
    String method,
    String path, {
    JsonMap? body,
    bool authenticated = true,
    Map<String, String> extraHeaders = const {},
    bool retryAfterRefresh = true,
  }) async {
    final uri = Uri.parse(baseUrl).resolve(path);
    final headers = <String, String>{
      'accept': 'application/json',
      'content-type': 'application/json',
      'user-agent': 'HigSchool/$appId',
      ...extraHeaders,
    };
    if (authenticated && session != null) {
      headers['authorization'] = 'Bearer ${session!.accessToken}';
    }
    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed =
        await _client.send(request).timeout(const Duration(seconds: 30));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode == 401 &&
        authenticated &&
        retryAfterRefresh &&
        await refresh()) {
      return _send(
        method,
        path,
        body: body,
        authenticated: true,
        extraHeaders: extraHeaders,
        retryAfterRefresh: false,
      );
    }
    JsonMap decoded = {};
    if (response.body.isNotEmpty) {
      final value = jsonDecode(response.body);
      if (value is Map) decoded = value.cast<String, dynamic>();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw MobileApiException(
        decoded['error']?.toString() ?? 'Request failed',
        response.statusCode,
      );
    }
    return decoded;
  }

  Future<String> _deviceId() async {
    final preferences = await SharedPreferences.getInstance();
    final existing = preferences.getString('hig.mobile.device-id.v1');
    if (existing != null) return existing;
    final next = _uuid.v4();
    await preferences.setString('hig.mobile.device-id.v1', next);
    return next;
  }
}

class OfflineSyncService {
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  void start(HigMobileApi api) {
    _subscription?.cancel();
    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      if (!results.contains(ConnectivityResult.none) && api.session != null) {
        unawaited(api.flushQueue());
      }
    });
  }

  Future<void> dispose() async {
    final subscription = _subscription;
    _subscription = null;
    if (subscription != null) await subscription.cancel();
  }
}

class PushRegistrationService {
  static final Map<String, StreamSubscription<String>> _refreshSubscriptions =
      {};

  Future<bool> initializeAndRegister(HigMobileApi api) async {
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return false;
      }
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) return false;
      await api.registerPushToken(token);

      final previous = _refreshSubscriptions.remove(api.appId);
      if (previous != null) await previous.cancel();
      _refreshSubscriptions[api.appId] = messaging.onTokenRefresh.listen((
        nextToken,
      ) async {
        if (api.session == null) return;
        try {
          await api.registerPushToken(nextToken);
        } catch (_) {
          // A later app resume or token refresh will retry registration.
        }
      }, onError: (_) {});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> disposeFor(HigMobileApi api) async {
    final subscription = _refreshSubscriptions.remove(api.appId);
    if (subscription != null) await subscription.cancel();
  }
}

class HigMobileAppConfig {
  const HigMobileAppConfig({
    required this.title,
    required this.appId,
    required this.allowedPrincipalTypes,
    required this.apiBaseUrl,
    this.seedColor = const Color(0xff286ea8),
  });

  final String title;
  final String appId;
  final List<String> allowedPrincipalTypes;
  final String apiBaseUrl;
  final Color seedColor;
}

class HigMobileApp extends StatelessWidget {
  const HigMobileApp({super.key, required this.config});
  final HigMobileAppConfig config;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: config.title,
        theme: higMobileTheme(config.seedColor),
        home: HigMobileRoot(config: config),
      );
}

class HigMobileRoot extends StatefulWidget {
  const HigMobileRoot({super.key, required this.config});
  final HigMobileAppConfig config;

  @override
  State<HigMobileRoot> createState() => _HigMobileRootState();
}

class _HigMobileRootState extends State<HigMobileRoot> {
  late final HigMobileApi api;
  final OfflineSyncService offlineSync = OfflineSyncService();
  JsonMap? home;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    api = HigMobileApi(
      baseUrl: widget.config.apiBaseUrl,
      appId: widget.config.appId,
    );
    offlineSync.start(api);
    _restore();
  }

  @override
  void dispose() {
    unawaited(offlineSync.dispose());
    unawaited(PushRegistrationService.disposeFor(api));
    api.close();
    super.dispose();
  }

  Future<void> _restore() async {
    try {
      final restored = await api.restore();
      if (restored) await _load();
    } catch (exception) {
      error = higFriendlyAuthMessage(exception);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _load() async {
    final next = await api.home();
    if (mounted) setState(() => home = next);
    unawaited(PushRegistrationService().initializeAndRegister(api));
    unawaited(api.flushQueue());
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (api.session == null) {
      return LoginView(
        config: widget.config,
        api: api,
        error: error,
        onAuthenticated: _load,
      );
    }
    return HomeView(
      config: widget.config,
      api: api,
      home: home,
      onRefresh: _load,
      onLogout: () async {
        await PushRegistrationService.disposeFor(api);
        await api.logout();
        if (mounted) setState(() => home = null);
      },
    );
  }
}

class LoginView extends StatefulWidget {
  const LoginView({
    super.key,
    required this.config,
    required this.api,
    required this.onAuthenticated,
    this.error,
  });
  final HigMobileAppConfig config;
  final HigMobileApi api;
  final Future<void> Function() onAuthenticated;
  final String? error;

  @override
  State<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<LoginView> {
  final tenant = TextEditingController(
    text: const String.fromEnvironment('HIG_TENANT_ID'),
  );
  final email = TextEditingController();
  final password = TextEditingController();
  late String principalType;
  bool busy = false;
  bool obscurePassword = true;
  String? message;
  String? emailError;
  String? passwordError;
  String? tenantError;

  bool get _tenantPreconfigured =>
      const String.fromEnvironment('HIG_TENANT_ID').trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    principalType = widget.config.allowedPrincipalTypes.first;
  }

  @override
  void dispose() {
    tenant.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    // Validate required fields locally before sending any request.
    final tenantIssue = _tenantPreconfigured
        ? null
        : (tenant.text.trim().isEmpty ? HigAuthMessages.schoolIdRequired : null);
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
        tenantId: tenant.text,
        email: email.text,
        password: password.text,
        principalType: principalType,
      );
      await widget.onAuthenticated();
    } catch (exception) {
      if (mounted) {
        setState(() => message = higFriendlyAuthMessage(exception));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xffedf5fb), HigPalette.canvas],
              begin: Alignment.topCenter,
              end: Alignment.center,
            ),
          ),
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 62,
                    height: 62,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [HigPalette.navy, HigPalette.blue],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.school_rounded,
                      color: Colors.white,
                      size: 32,
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                const Text(
                  'Welcome back',
                  style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 7),
                Text(
                  'Sign in to ${widget.config.title} and continue your school day.',
                  style: const TextStyle(
                    color: HigPalette.muted,
                    fontSize: 15,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 26),
                if (widget.config.allowedPrincipalTypes.length > 1) ...[
                  const Text(
                    'I am signing in as',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 9),
                  SegmentedButton<String>(
                    segments: widget.config.allowedPrincipalTypes
                        .map(
                          (entry) => ButtonSegment(
                            value: entry,
                            icon: Icon(
                              entry == 'parent'
                                  ? Icons.family_restroom_rounded
                                  : Icons.school_rounded,
                            ),
                            label: Text(_title(entry)),
                          ),
                        )
                        .toList(),
                    selected: {principalType},
                    onSelectionChanged: busy
                        ? null
                        : (value) =>
                            setState(() => principalType = value.first),
                    showSelectedIcon: false,
                  ),
                  const SizedBox(height: 18),
                ],
                if (!_tenantPreconfigured) ...[
                  TextField(
                    controller: tenant,
                    autocorrect: false,
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
                  autofillHints: const [AutofillHints.username, AutofillHints.email],
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
                          'Contact your school administrator to reset your password or confirm your School ID.',
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
                  Container(
                    margin: const EdgeInsets.only(top: 4),
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
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(busy ? 'Signing in…' : 'Sign in securely'),
                  ),
                ),
                const SizedBox(height: 20),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.shield_outlined,
                        size: 17, color: HigPalette.muted),
                    SizedBox(width: 6),
                    Text(
                      'Protected role-based school access',
                      style: TextStyle(color: HigPalette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}

class HomeView extends StatefulWidget {
  const HomeView({
    super.key,
    required this.config,
    required this.api,
    required this.home,
    required this.onRefresh,
    required this.onLogout,
  });
  final HigMobileAppConfig config;
  final HigMobileApi api;
  final JsonMap? home;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onLogout;

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  int index = 0;
  List<String> recentKeys = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_loadRecent());
  }

  String get principalType {
    final wrapper = widget.home?['home'];
    if (wrapper is! Map) return '';
    return wrapper['principalType']?.toString() ?? '';
  }

  Future<void> _loadRecent() async {
    final keys = await HigRecentFeatureStore.read(principalType);
    if (mounted) setState(() => recentKeys = keys);
  }

  Future<void> _openModule(JsonMap item) async {
    final key = item['key']?.toString() ?? '';
    final next = await HigRecentFeatureStore.record(principalType, key);
    if (mounted) setState(() => recentKeys = next);
    if (!mounted) return;
    final wrapper = widget.home?['home'];
    final roleHome =
        wrapper is Map ? wrapper.cast<String, dynamic>() : <String, dynamic>{};
    final availableStudents = ((roleHome['students'] as List?) ?? const [])
        .map((entry) => (entry as Map).cast<String, dynamic>())
        .where((student) => (student['id']?.toString() ?? '').isNotEmpty)
        .toList();
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => principalType == 'parent' && key == 'transport_tracking'
            ? ParentTransportTrackingPage(api: widget.api)
            : ModuleDetailPage(
                api: widget.api,
                principalType: principalType,
                item: item,
                availableStudents: availableStudents,
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wrapper = widget.home?['home'];
    if (wrapper is! Map) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.config.title)),
        body: Center(
          child: FilledButton(
            onPressed: widget.onRefresh,
            child: const Text('Load dashboard'),
          ),
        ),
      );
    }
    final home = wrapper.cast<String, dynamic>();
    final access = (home['access'] as Map?)?.cast<String, dynamic>() ?? {};
    final principalType = home['principalType']?.toString() ?? '';
    final entries = principalType == 'school'
        ? ((access['modules'] as List?) ?? const [])
        : ((access['features'] as List?) ?? const []);
    final modules =
        entries.map((entry) => (entry as Map).cast<String, dynamic>()).toList();
    final pages = [
      HigRoleDashboardPage(
        home: home,
        modules: modules,
        recentKeys: recentKeys,
        onRefresh: widget.onRefresh,
        onOpen: _openModule,
        onAlerts: () => setState(() => index = 2),
      ),
      HigRoleWorkspacePage(
        principalType: principalType,
        modules: modules,
        onOpen: _openModule,
      ),
      HigNotificationsView(api: widget.api),
      HigProfileView(home: home, onLogout: widget.onLogout),
    ];
    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.apps_outlined),
            selectedIcon: Icon(Icons.apps),
            label: 'Workspace',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_outlined),
            selectedIcon: Icon(Icons.notifications),
            label: 'Alerts',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class DashboardPage extends StatelessWidget {
  const DashboardPage({
    super.key,
    required this.home,
    required this.api,
    required this.onRefresh,
  });
  final JsonMap home;
  final HigMobileApi api;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final user = (home['user'] as Map?)?.cast<String, dynamic>() ?? {};
    final students = (home['students'] as List?) ?? const [];
    final assignments = (home['assignments'] as List?) ?? const [];
    final notifications =
        ((home['notifications'] as Map?)?['notifications'] as List?) ??
            const [];
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                colors: [Color(0xffbd3304), Color(0xffe94e0c)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WELCOME · ${_title(home['principalType']?.toString() ?? '')}',
                  style: const TextStyle(
                    color: Color(0xffffcfba),
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  user['name']?.toString() ?? 'Hig School user',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 25,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  home['offline'] == true
                      ? 'Showing securely cached data'
                      : 'Connected to school API',
                  style: const TextStyle(color: Color(0xffffdfd2)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _Metric(label: 'Students', value: '${students.length}'),
              _Metric(label: 'Assignments', value: '${assignments.length}'),
              _Metric(label: 'Alerts', value: '${notifications.length}'),
            ],
          ),
          if (students.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'Linked students',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            ...students.take(10).map((item) {
              final student = (item as Map).cast<String, dynamic>();
              return ListTile(
                leading: const CircleAvatar(child: Icon(Icons.school_outlined)),
                title: Text(student['fullName']?.toString() ?? 'Student'),
                subtitle: Text(
                  '${student['className'] ?? ''} ${student['sectionName'] ?? ''}'
                      .trim(),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Column(
            children: [
              Text(
                value,
                style:
                    const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              Text(label),
            ],
          ),
        ),
      );
}

class ModulesPage extends StatelessWidget {
  const ModulesPage({
    super.key,
    required this.api,
    required this.principalType,
    required this.modules,
  });
  final HigMobileApi api;
  final String principalType;
  final List<JsonMap> modules;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: modules.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final item = modules[index];
          return Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.apps)),
              title: Text(item['label']?.toString() ?? item['key'].toString()),
              subtitle: principalType == 'school'
                  ? Text(
                      item['canManage'] == true
                          ? 'View and manage'
                          : 'View only',
                    )
                  : const Text('Role and school policy enabled'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => principalType == 'parent' &&
                          item['key']?.toString() == 'transport_tracking'
                      ? ParentTransportTrackingPage(api: api)
                      : ModuleDetailPage(
                          api: api,
                          principalType: principalType,
                          item: item,
                        ),
                ),
              ),
            ),
          );
        },
      );
}

class ParentTransportTrackingPage extends StatefulWidget {
  const ParentTransportTrackingPage({super.key, required this.api});

  final HigMobileApi api;

  @override
  State<ParentTransportTrackingPage> createState() =>
      _ParentTransportTrackingPageState();
}

class _ParentTransportTrackingPageState
    extends State<ParentTransportTrackingPage> {
  JsonMap? data;
  String? error;
  bool loading = true;
  Timer? refreshTimer;

  @override
  void initState() {
    super.initState();
    load();
    refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => load(silent: true),
    );
  }

  @override
  void dispose() {
    refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> load({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }

    try {
      final next = await widget.api.transport();
      if (mounted) {
        setState(() {
          data = next;
          error = null;
          loading = false;
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          error = exception.toString();
          loading = false;
        });
      }
    }
  }

  String freshnessLabel(JsonMap live) {
    final capturedAt = DateTime.tryParse(live['capturedAt']?.toString() ?? '');
    if (capturedAt == null) return 'Location unavailable';

    final age = DateTime.now().toUtc().difference(capturedAt.toUtc());
    if (age.inSeconds <= 120) return 'Live now';
    if (age.inMinutes <= 15) {
      return 'Delayed · ${age.inMinutes} min old';
    }
    return 'Offline · last update ${age.inMinutes} min ago';
  }

  String distanceLabel(Object? value) {
    final meters = value is num ? value.toDouble() : null;
    if (meters == null) return 'Distance unavailable';
    if (meters < 1000) return '${meters.round()} m from stop';
    return '${(meters / 1000).toStringAsFixed(1)} km from stop';
  }

  Widget childCard(BuildContext context, JsonMap child) {
    final student = (child['student'] as Map?)?.cast<String, dynamic>() ?? {};
    final route = (child['route'] as Map?)?.cast<String, dynamic>();
    final vehicle = (child['vehicle'] as Map?)?.cast<String, dynamic>();
    final trip = (child['trip'] as Map?)?.cast<String, dynamic>();
    final live = (child['live'] as Map?)?.cast<String, dynamic>();
    final journey = (child['journey'] as Map?)?.cast<String, dynamic>();
    final targetStop = (live?['targetStop'] as Map?)?.cast<String, dynamic>();

    final eta = live?['etaMinutes'];
    final etaText = eta is num
        ? eta.toInt() == 0
            ? 'At stop'
            : '${eta.toInt()} min ETA'
        : 'ETA unavailable';

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.directions_bus)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        student['fullName']?.toString() ?? 'Linked student',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(student['admissionNumber']?.toString() ?? ''),
                    ],
                  ),
                ),
                if (trip != null)
                  Chip(label: Text(_title(trip['status']?.toString() ?? ''))),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              route == null
                  ? 'No active transport assignment'
                  : '${route['name'] ?? 'Route'} · ${route['code'] ?? ''}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              vehicle == null
                  ? 'Vehicle not assigned'
                  : 'Vehicle ${vehicle['number']} · '
                      '${_title(vehicle['type']?.toString() ?? '')}',
            ),
            if (journey != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.how_to_reg_outlined, size: 18),
                  const SizedBox(width: 7),
                  Text(
                    'Student journey · '
                    '${_title(journey['status']?.toString() ?? 'waiting')}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
            const Divider(height: 28),
            if (live == null) ...[
              const Row(
                children: [
                  Icon(Icons.location_off_outlined),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Live location is available only while '
                      'the assigned trip is active.',
                    ),
                  ),
                ],
              ),
            ] else ...[
              Row(
                children: [
                  const Icon(Icons.my_location),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      freshnessLabel(live),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    etaText,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                targetStop == null
                    ? 'Assigned stop unavailable'
                    : '${_title(live['targetStopType']?.toString() ?? '')} '
                        'stop · ${targetStop['name']}',
              ),
              const SizedBox(height: 4),
              Text(distanceLabel(live['distanceToStopMeters'])),
              const SizedBox(height: 10),
              Text(
                'Live position: '
                '${(live['latitude'] as num?)?.toStringAsFixed(5) ?? '-'}, '
                '${(live['longitude'] as num?)?.toStringAsFixed(5) ?? '-'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(
                'ETA is an estimate based on the latest GPS '
                'position and current/fallback vehicle speed.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final transport = (data?['transport'] as Map?)?.cast<String, dynamic>();
    final tracking =
        (transport?['parentTracking'] as Map?)?.cast<String, dynamic>();
    final children = (tracking?['children'] as List?) ?? const [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live transport'),
        actions: [
          IconButton(
            onPressed: () => load(),
            icon: const Icon(Icons.sync),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: loading && data == null
          ? const Center(child: CircularProgressIndicator())
          : error != null && data == null
              ? Center(child: Text(error!))
              : RefreshIndicator(
                  onRefresh: load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Icon(Icons.privacy_tip_outlined),
                              SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'For privacy, this screen shows '
                                  'only vehicles assigned to your '
                                  'linked child and only the latest '
                                  'active-trip location.',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (children.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(28),
                          child: Center(
                            child: Text(
                              'No active transport assignment is '
                              'available for your linked student.',
                            ),
                          ),
                        )
                      else
                        ...children.map(
                          (entry) => childCard(
                            context,
                            (entry as Map).cast<String, dynamic>(),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

class ModuleDetailPage extends StatefulWidget {
  const ModuleDetailPage({
    super.key,
    required this.api,
    required this.principalType,
    required this.item,
    this.availableStudents = const [],
  });
  final HigMobileApi api;
  final String principalType;
  final JsonMap item;
  final List<JsonMap> availableStudents;

  @override
  State<ModuleDetailPage> createState() => _ModuleDetailPageState();
}

class _ModuleDetailPageState extends State<ModuleDetailPage> {
  JsonMap? data;
  String? error;
  bool busy = false;

  String get key => widget.item['key'].toString();
  bool get isOperations => const {
        'attendance',
        'fees_payments',
        'fees_summary',
        'fees_finance',
      }.contains(key);

  String get manageLabel {
    if (key == 'attendance') return 'Mark attendance';
    if (key == 'fees_finance') return 'Create invoice';
    if (widget.principalType == 'parent') return 'Send request';
    return 'Add update';
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final next = isOperations
          ? await widget.api.operations()
          : await widget.api.content(
              featureKey: widget.principalType == 'school' ? null : key,
              moduleKey: widget.principalType == 'school' ? key : null,
            );
      if (mounted) setState(() => data = next);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    }
  }

  Future<void> parentRequest() async {
    final title = TextEditingController();
    final description = TextEditingController();
    final studentId = TextEditingController();
    String? selectedStudentId = widget.availableStudents.length == 1
        ? widget.availableStudents.first['id']?.toString()
        : null;
    final requestType = key == 'leave_requests'
        ? 'leave_request'
        : key == 'ptm_meetings'
            ? 'ptm_request'
            : 'contact_school';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Send school request'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.availableStudents.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: selectedStudentId,
                  decoration: const InputDecoration(
                    labelText: 'Student',
                    prefixIcon: Icon(Icons.school_outlined),
                  ),
                  items: widget.availableStudents
                      .map(
                        (student) => DropdownMenuItem(
                          value: student['id']?.toString(),
                          child: Text(
                            student['fullName']?.toString() ?? 'Student',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => selectedStudentId = value,
                )
              else
                TextField(
                  controller: studentId,
                  decoration: const InputDecoration(
                    labelText: 'Linked student ID',
                  ),
                ),
              const SizedBox(height: 10),
              TextField(
                controller: title,
                decoration: const InputDecoration(labelText: 'Title'),
              ),
              TextField(
                controller: description,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Details'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final result = await widget.api.contentAction({
                'action': 'parent_request',
                'requestType': requestType,
                'studentId': selectedStudentId ?? studentId.text.trim(),
                'title': title.text.trim(),
                'description': description.text.trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      result['queued'] == true
                          ? 'Request queued for sync'
                          : 'Request sent',
                    ),
                  ),
                );
              }
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }

  Future<void> manageAction() async {
    if (key == 'attendance') {
      await attendanceAction();
    } else if (key == 'fees_finance') {
      await invoiceAction();
    } else {
      await contentCreateAction();
    }
  }

  Future<void> attendanceAction() async {
    final studentId = TextEditingController();
    String? selectedStudentId;
    final date = TextEditingController(
      text: DateTime.now().toIso8601String().substring(0, 10),
    );
    var status = 'present';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Mark attendance'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.availableStudents.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: selectedStudentId,
                    decoration: const InputDecoration(
                      labelText: 'Student',
                      prefixIcon: Icon(Icons.school_outlined),
                    ),
                    items: widget.availableStudents
                        .map(
                          (student) => DropdownMenuItem(
                            value: student['id']?.toString(),
                            child: Text(
                              student['fullName']?.toString() ?? 'Student',
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setDialogState(() => selectedStudentId = value),
                  )
                else
                  TextField(
                    controller: studentId,
                    decoration: const InputDecoration(labelText: 'Student ID'),
                  ),
                const SizedBox(height: 10),
                TextField(
                  controller: date,
                  decoration: const InputDecoration(
                    labelText: 'Date (YYYY-MM-DD)',
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: const ['present', 'late', 'absent', 'excused']
                      .map(
                        (entry) => DropdownMenuItem(
                          value: entry,
                          child: Text(_title(entry)),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setDialogState(() => status = value!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final result = await widget.api.operation({
                  'action': 'mark_attendance',
                  'studentId': selectedStudentId ?? studentId.text.trim(),
                  'attendanceDate': date.text.trim(),
                  'status': status,
                  'note': 'Marked from Hig Staff & Admin mobile app',
                });
                if (dialogContext.mounted) Navigator.pop(dialogContext);
                await load();
                if (!context.mounted) return;
                if (result['queued'] == true) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Attendance queued for sync')),
                  );
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> invoiceAction() async {
    final studentId = TextEditingController();
    String? selectedStudentId;
    final feeType = TextEditingController(text: 'Tuition Fee');
    final amount = TextEditingController();
    final dueDate = TextEditingController(
      text: DateTime.now()
          .add(const Duration(days: 14))
          .toIso8601String()
          .substring(0, 10),
    );
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Create fee invoice'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.availableStudents.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: selectedStudentId,
                  decoration: const InputDecoration(
                    labelText: 'Student',
                    prefixIcon: Icon(Icons.school_outlined),
                  ),
                  items: widget.availableStudents
                      .map(
                        (student) => DropdownMenuItem(
                          value: student['id']?.toString(),
                          child: Text(
                            student['fullName']?.toString() ?? 'Student',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => selectedStudentId = value,
                )
              else
                TextField(
                  controller: studentId,
                  decoration: const InputDecoration(labelText: 'Student ID'),
                ),
              const SizedBox(height: 10),
              TextField(
                controller: feeType,
                decoration: const InputDecoration(labelText: 'Fee type'),
              ),
              TextField(
                controller: amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Amount in INR'),
              ),
              TextField(
                controller: dueDate,
                decoration: const InputDecoration(
                  labelText: 'Due date (YYYY-MM-DD)',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final rupees = double.tryParse(amount.text.trim());
              if (rupees == null || rupees <= 0) return;
              final result = await widget.api.operation({
                'action': 'create_invoice',
                'studentId': selectedStudentId ?? studentId.text.trim(),
                'feeType': feeType.text.trim(),
                'amountPaise': (rupees * 100).round(),
                'dueDate': dueDate.text.trim(),
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              await load();
              if (mounted && result['queued'] == true) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invoice queued for sync')),
                );
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  Future<void> contentCreateAction() async {
    final title = TextEditingController();
    final description = TextEditingController();
    var assignee = 'Schoolwide';
    final classOptions = widget.availableStudents
        .map((student) =>
            '${student['className'] ?? ''} ${student['sectionName'] ?? ''}'
                .trim())
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final dueDate = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Create ${widget.item['label'] ?? 'record'}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: title,
                decoration: const InputDecoration(labelText: 'Title'),
              ),
              TextField(
                controller: description,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              DropdownButtonFormField<String>(
                initialValue: assignee,
                decoration: const InputDecoration(
                  labelText: 'Audience',
                  prefixIcon: Icon(Icons.groups_outlined),
                ),
                items: ['Schoolwide', ...classOptions]
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(value),
                      ),
                    )
                    .toList(),
                onChanged: (value) => assignee = value ?? 'Schoolwide',
              ),
              TextField(
                controller: dueDate,
                decoration: const InputDecoration(
                  labelText: 'Due date (optional)',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final result = await widget.api.contentAction({
                'action': 'create_record',
                'moduleKey': key,
                'workflow': widget.item['label']?.toString() ?? key,
                'title': title.text.trim(),
                'description': description.text.trim(),
                'recordDate': DateTime.now().toIso8601String().substring(0, 10),
                'dueDate': dueDate.text.trim(),
                'amountPaise': null,
                'assignee': assignee,
                'priority': 'normal',
              });
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              await load();
              if (mounted && result['queued'] == true) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Record queued for sync')),
                );
              }
            },
            child: const Text('Publish'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.item['label']?.toString() ?? key;
    final operations = (data?['operations'] as Map?)?.cast<String, dynamic>();
    final records = isOperations
        ? ((key == 'fees_finance' ||
                key == 'fees_payments' ||
                key == 'fees_summary')
            ? ((operations?['invoices'] as List?) ?? const [])
            : ((operations?['attendance'] as List?) ?? const []))
        : (((data?['content'] as Map?)?['records'] as List?) ?? const []);
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.sync))],
      ),
      floatingActionButton: widget.principalType == 'parent' &&
              const {
                'leave_requests',
                'contact_school',
                'ptm_meetings',
              }.contains(key)
          ? FloatingActionButton.extended(
              onPressed: parentRequest,
              icon: const Icon(Icons.send),
              label: Text(manageLabel),
            )
          : widget.principalType == 'school' && widget.item['canManage'] == true
              ? FloatingActionButton.extended(
                  onPressed: busy ? null : manageAction,
                  icon: const Icon(Icons.add),
                  label: Text(manageLabel),
                )
              : null,
      body: error != null
          ? Center(child: Text(error!))
          : data == null
              ? const Center(child: CircularProgressIndicator())
              : Builder(
                  builder: (context) {
                    final visual = _featureVisual(key);
                    return ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: visual.color,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: .16),
                                  borderRadius: BorderRadius.circular(17),
                                ),
                                child: Icon(
                                  visual.icon,
                                  color: Colors.white,
                                  size: 29,
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '$title overview',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 18,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${records.length} authorized ${records.length == 1 ? 'record' : 'records'} · ${widget.item['canManage'] == true ? 'Manage access' : 'View access'}',
                                      style: const TextStyle(
                                        color: Colors.white70,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),
                        if (records.isEmpty)
                          _HigEmptyCard(
                            icon: visual.icon,
                            title: 'Nothing here yet',
                            message:
                                'Authorized $title updates will appear here when the school publishes them.',
                          )
                        else
                          for (final entry in records) ...[
                            Builder(
                              builder: (context) {
                                final record =
                                    (entry as Map).cast<String, dynamic>();
                                final status =
                                    record['status']?.toString() ?? '';
                                return Card(
                                  child: ListTile(
                                    minVerticalPadding: 14,
                                    leading: CircleAvatar(
                                      backgroundColor:
                                          visual.color.withValues(alpha: .10),
                                      child: Icon(
                                        visual.icon,
                                        color: visual.color,
                                      ),
                                    ),
                                    title: Text(
                                      record['title']?.toString() ??
                                          record['studentName']?.toString() ??
                                          'Record',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    subtitle: Text(
                                      record['description']?.toString() ??
                                          status,
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    trailing: status.isEmpty
                                        ? const Icon(Icons.chevron_right)
                                        : _HigRoleBadge(
                                            label: _title(status),
                                          ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(height: 10),
                          ],
                      ],
                    );
                  },
                ),
    );
  }
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key, required this.api});
  final HigMobileApi api;
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  JsonMap? data;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final next = await widget.api.notifications();
    if (mounted) setState(() => data = next);
  }

  @override
  Widget build(BuildContext context) {
    final entries = (data?['notifications'] as List?) ?? const [];
    if (data == null) return const Center(child: CircularProgressIndicator());
    if (entries.isEmpty) {
      return const Center(child: Text('No notifications yet.'));
    }
    return RefreshIndicator(
      onRefresh: load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: entries.length,
        itemBuilder: (context, index) {
          final item = (entries[index] as Map).cast<String, dynamic>();
          return Card(
            child: ListTile(
              leading: Icon(
                item['read'] == true
                    ? Icons.notifications_none
                    : Icons.notifications_active,
              ),
              title: Text(item['title']?.toString() ?? 'School notification'),
              subtitle: Text(item['message']?.toString() ?? ''),
              onTap: item['read'] == true
                  ? null
                  : () async {
                      await widget.api.markNotificationRead(
                        item['id'].toString(),
                      );
                      await load();
                    },
            ),
          );
        },
      ),
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.home, required this.onLogout});
  final JsonMap home;
  final Future<void> Function() onLogout;
  @override
  Widget build(BuildContext context) {
    final user = (home['user'] as Map?)?.cast<String, dynamic>() ?? {};
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const CircleAvatar(radius: 42, child: Icon(Icons.person, size: 44)),
        const SizedBox(height: 12),
        Text(
          user['name']?.toString() ?? 'User',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        Text(user['email']?.toString() ?? '', textAlign: TextAlign.center),
        const SizedBox(height: 24),
        ListTile(
          title: const Text('Tenant'),
          subtitle: Text(home['tenantId']?.toString() ?? ''),
        ),
        ListTile(
          title: const Text('Identity'),
          subtitle: Text(_title(home['principalType']?.toString() ?? '')),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: onLogout,
          icon: const Icon(Icons.logout),
          label: const Padding(
            padding: EdgeInsets.all(14),
            child: Text('Sign out'),
          ),
        ),
      ],
    );
  }
}

String _title(String value) => value
    .replaceAll('_', ' ')
    .split(' ')
    .where((entry) => entry.isNotEmpty)
    .map((entry) => '${entry[0].toUpperCase()}${entry.substring(1)}')
    .join(' ');
