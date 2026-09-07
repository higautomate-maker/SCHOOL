part of '../hig_mobile_core.dart';

// Emergent UX redesign: user-safe login/auth messaging shared by every
// Flutter app. Never surfaces raw server strings, status codes, timeouts or
// exception text, and never reveals whether an account exists.
class HigAuthMessages {
  static const invalidCredentials =
      'Incorrect email or password. Please check your details and try again.';
  static const network =
      'We couldn’t connect. Please check your internet connection and try again.';
  static const rateLimited =
      'Too many sign-in attempts. Please wait a moment, then try again.';
  static const unavailable =
      'Sign-in is temporarily unavailable. Please try again in a few minutes.';
  static const emailRequired = 'Please enter your email address.';
  static const emailInvalid = 'Please enter a valid email address.';
  static const passwordRequired = 'Please enter your password.';
  static const schoolIdRequired = 'Please enter your School ID.';
}

final RegExp _higEmailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Validates required login fields before any network request is made.
/// Returns a safe field-level message, or null when the field is acceptable.
String? higValidateEmail(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return HigAuthMessages.emailRequired;
  if (!_higEmailPattern.hasMatch(trimmed)) return HigAuthMessages.emailInvalid;
  return null;
}

String? higValidatePassword(String value) =>
    value.isEmpty ? HigAuthMessages.passwordRequired : null;

/// Converts any thrown login/auth error into a safe, user-facing message.
String higFriendlyAuthMessage(Object error) {
  if (error is MobileApiException) {
    final status = error.statusCode;
    if (status == 429) return HigAuthMessages.rateLimited;
    if (status >= 500) return HigAuthMessages.unavailable;
    // 401/400/403/404/422 and any other client error stay generic so we never
    // reveal account existence or internal validation detail.
    return HigAuthMessages.invalidCredentials;
  }
  if (error is SocketException ||
      error is TimeoutException ||
      error is http.ClientException) {
    return HigAuthMessages.network;
  }
  // Unknown/unexpected errors fall back to a safe generic message.
  return HigAuthMessages.unavailable;
}

class HigPalette {
  static const navy = Color(0xff17365d);
  static const blue = Color(0xff286ea8);
  static const cyan = Color(0xff25a7c7);
  static const teal = Color(0xff1f9d83);
  static const ink = Color(0xff182230);
  static const muted = Color(0xff65758b);
  static const canvas = Color(0xfff5f7fb);
  static const line = Color(0xffe4e9f1);
  static const warning = Color(0xffb65c12);
}

ThemeData higMobileTheme(Color seedColor) {
  final scheme = ColorScheme.fromSeed(
    seedColor: seedColor,
    brightness: Brightness.light,
  ).copyWith(
    primary: seedColor,
    secondary: HigPalette.teal,
    surface: Colors.white,
    onSurface: HigPalette.ink,
    outline: HigPalette.line,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: HigPalette.canvas,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      foregroundColor: HigPalette.ink,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: HigPalette.ink,
        fontSize: 20,
        fontWeight: FontWeight.w800,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: HigPalette.line),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 72,
      backgroundColor: Colors.white,
      indicatorColor: seedColor.withValues(alpha: .12),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected)
              ? seedColor
              : HigPalette.muted,
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w800
              : FontWeight.w600,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: HigPalette.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: HigPalette.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: seedColor, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
  );
}

class HigStartupView extends StatelessWidget {
  const HigStartupView({
    super.key,
    required this.title,
    required this.icon,
    this.message = 'Preparing your secure workspace',
  });

  final String title;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 82,
                  height: 82,
                  decoration: BoxDecoration(
                    color: primary.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(26),
                  ),
                  child: Icon(icon, size: 42, color: primary),
                ),
                const SizedBox(height: 22),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: HigPalette.muted),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: primary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class HigRecentFeatureStore {
  static String _key(String principalType) =>
      'hig.mobile.recent.${principalType.isEmpty ? 'unknown' : principalType}.v1';

  static Future<List<String>> read(String principalType) async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(_key(principalType)) ?? const [];
  }

  static Future<List<String>> record(
    String principalType,
    String featureKey,
  ) async {
    if (featureKey.isEmpty) return read(principalType);
    final preferences = await SharedPreferences.getInstance();
    final current = preferences.getStringList(_key(principalType)) ?? const [];
    final next = [featureKey, ...current.where((key) => key != featureKey)]
        .take(6)
        .toList();
    await preferences.setStringList(_key(principalType), next);
    return next;
  }
}

class _HigFeatureVisual {
  const _HigFeatureVisual(this.icon, this.color, this.category);
  final IconData icon;
  final Color color;
  final String category;
}

_HigFeatureVisual _featureVisual(String key) {
  const values = <String, _HigFeatureVisual>{
    'child_overview': _HigFeatureVisual(
        Icons.family_restroom_rounded, Color(0xff7c4dff), 'My family'),
    'student_information':
        _HigFeatureVisual(Icons.groups_2_rounded, Color(0xff7c4dff), 'People'),
    'attendance': _HigFeatureVisual(
        Icons.fact_check_rounded, Color(0xff159570), 'Daily work'),
    'homework': _HigFeatureVisual(
        Icons.menu_book_rounded, Color(0xffe77817), 'Learning'),
    'diary': _HigFeatureVisual(
        Icons.menu_book_rounded, Color(0xffe77817), 'Learning'),
    'timetable': _HigFeatureVisual(
        Icons.calendar_month_rounded, Color(0xff286ea8), 'Learning'),
    'academics':
        _HigFeatureVisual(Icons.school_rounded, Color(0xff286ea8), 'Academics'),
    'lesson_planner': _HigFeatureVisual(
        Icons.auto_stories_rounded, Color(0xff3656a5), 'Academics'),
    'examinations': _HigFeatureVisual(
        Icons.assignment_rounded, Color(0xff7a55c7), 'Assessment'),
    'assessment': _HigFeatureVisual(
        Icons.grading_rounded, Color(0xff7a55c7), 'Assessment'),
    'results': _HigFeatureVisual(
        Icons.workspace_premium_rounded, Color(0xffb47b14), 'Assessment'),
    'fees_payments':
        _HigFeatureVisual(Icons.payments_rounded, Color(0xff17835f), 'Finance'),
    'fees_summary': _HigFeatureVisual(
        Icons.receipt_long_rounded, Color(0xff17835f), 'Finance'),
    'fees_finance': _HigFeatureVisual(
        Icons.account_balance_wallet_rounded, Color(0xff17835f), 'Finance'),
    'accounts': _HigFeatureVisual(
        Icons.account_balance_rounded, Color(0xff217f62), 'Finance'),
    'notices': _HigFeatureVisual(
        Icons.campaign_rounded, Color(0xffd15c55), 'Communication'),
    'communication': _HigFeatureVisual(
        Icons.forum_rounded, Color(0xffd15c55), 'Communication'),
    'ptm_meetings': _HigFeatureVisual(
        Icons.co_present_rounded, Color(0xff9a5a9d), 'Communication'),
    'leave_requests': _HigFeatureVisual(
        Icons.event_busy_rounded, Color(0xffbe6a17), 'Requests'),
    'contact_school': _HigFeatureVisual(
        Icons.support_agent_rounded, Color(0xff286ea8), 'Requests'),
    'transport_tracking': _HigFeatureVisual(
        Icons.location_on_rounded, Color(0xff1976d2), 'Transport'),
    'transport': _HigFeatureVisual(
        Icons.directions_bus_rounded, Color(0xff1976d2), 'Operations'),
    'assigned_vehicle': _HigFeatureVisual(
        Icons.directions_bus_rounded, Color(0xff1976d2), 'Trip'),
    'assigned_route':
        _HigFeatureVisual(Icons.route_rounded, Color(0xff1976d2), 'Trip'),
    'pickup_list':
        _HigFeatureVisual(Icons.groups_rounded, Color(0xff7c4dff), 'Trip'),
    'trip_control':
        _HigFeatureVisual(Icons.play_circle_rounded, Color(0xff159570), 'Trip'),
    'gps_tracking':
        _HigFeatureVisual(Icons.gps_fixed_rounded, Color(0xff1976d2), 'Trip'),
    'boarding':
        _HigFeatureVisual(Icons.how_to_reg_rounded, Color(0xff159570), 'Trip'),
    'emergency_alerts':
        _HigFeatureVisual(Icons.sos_rounded, Color(0xffc73e3e), 'Safety'),
    'library': _HigFeatureVisual(
        Icons.local_library_rounded, Color(0xff8b5a2b), 'Learning'),
    'school_events': _HigFeatureVisual(
        Icons.celebration_rounded, Color(0xffd05d83), 'Communication'),
    'study_material': _HigFeatureVisual(
        Icons.folder_copy_rounded, Color(0xff3656a5), 'Learning'),
    'study_center': _HigFeatureVisual(
        Icons.menu_book_rounded, Color(0xff3656a5), 'Academics'),
    'live_classes': _HigFeatureVisual(
        Icons.video_camera_front_rounded, Color(0xffd15c55), 'Learning'),
    'front_office': _HigFeatureVisual(
        Icons.meeting_room_rounded, Color(0xff607d8b), 'School management'),
    'lead_management': _HigFeatureVisual(
        Icons.person_search_rounded, Color(0xff607d8b), 'School management'),
    'human_resources':
        _HigFeatureVisual(Icons.badge_rounded, Color(0xff7c4dff), 'People'),
    'inventory': _HigFeatureVisual(
        Icons.inventory_2_rounded, Color(0xff795548), 'Operations'),
    'hostel': _HigFeatureVisual(
        Icons.apartment_rounded, Color(0xff607d8b), 'Operations'),
    'reports_analytics': _HigFeatureVisual(
        Icons.analytics_rounded, Color(0xff3656a5), 'Reporting'),
    'settings_billing': _HigFeatureVisual(
        Icons.settings_rounded, Color(0xff607d8b), 'Administration'),
    'access_control': _HigFeatureVisual(Icons.admin_panel_settings_rounded,
        Color(0xff7c4dff), 'Administration'),
    'help_center': _HigFeatureVisual(
        Icons.help_center_rounded, Color(0xff286ea8), 'Support'),
    'asset_management': _HigFeatureVisual(
        Icons.devices_other_rounded, Color(0xff795548), 'Operations'),
  };
  return values[key] ??
      const _HigFeatureVisual(Icons.grid_view_rounded, HigPalette.blue, 'More');
}

const _dailyKeys = <String, List<String>>{
  'parent': [
    'homework',
    'fees_payments',
    'transport_tracking',
    'attendance',
    'child_overview',
    'timetable'
  ],
  'student': [
    'timetable',
    'homework',
    'attendance',
    'examinations',
    'results',
    'study_material'
  ],
  'school': [
    'attendance',
    'diary',
    'academics',
    'communication',
    'student_information',
    'lesson_planner',
    'examinations',
    'study_center'
  ],
  'transporter': [
    'trip_control',
    'assigned_route',
    'pickup_list',
    'boarding',
    'gps_tracking',
    'emergency_alerts'
  ],
};

String _rolePriorityHint(String role) {
  switch (role) {
    case 'parent':
      return 'Your child’s day at a glance';
    case 'student':
      return 'What you need for today';
    case 'school':
      return 'Only actions currently allowed for you';
    case 'transporter':
      return 'Your trip and safety controls';
    default:
      return 'Only actions currently allowed for you';
  }
}

class HigRoleDashboardPage extends StatelessWidget {
  const HigRoleDashboardPage({
    super.key,
    required this.home,
    required this.modules,
    required this.recentKeys,
    required this.onRefresh,
    required this.onOpen,
    required this.onAlerts,
  });

  final JsonMap home;
  final List<JsonMap> modules;
  final List<String> recentKeys;
  final Future<void> Function() onRefresh;
  final Future<void> Function(JsonMap item) onOpen;
  final VoidCallback onAlerts;

  @override
  Widget build(BuildContext context) {
    final role = home['principalType']?.toString() ?? '';
    final user = (home['user'] as Map?)?.cast<String, dynamic>() ?? {};
    final students = (home['students'] as List?) ?? const [];
    final notifications =
        ((home['notifications'] as Map?)?['notifications'] as List?) ??
            const [];
    final unread = (home['unreadNotices'] as num?)?.toInt() ??
        ((home['notifications'] as Map?)?['unreadCount'] as num?)?.toInt() ??
        0;
    final today = (home['today'] as Map?)?.cast<String, dynamic>();
    final birthdays = (home['birthdays'] as List?) ?? const [];
    final daily =
        _orderedMatches(modules, _dailyKeys[role] ?? const []).take(4).toList();
    final recent = _recentMatches(modules, recentKeys).take(4).toList();
    final roleLabel = role == 'school'
        ? 'Teacher & staff workspace'
        : '${_title(role)} workspace';
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
          children: [
            _HigTopBar(
              name: user['name']?.toString() ?? 'Hig School user',
              subtitle: roleLabel,
              onAlerts: onAlerts,
              unreadCount: unread,
            ),
            if (home['offline'] == true) ...[
              const SizedBox(height: 14),
              const _HigOfflineBanner(),
            ],
            const SizedBox(height: 18),
            _HigWelcomeCard(
              role: role,
              name: user['name']?.toString() ?? 'there',
              studentCount: students.length,
              alertCount: notifications.length,
              moduleCount: modules.length,
            ),
            if (today != null && role != 'school' && role != 'parent') ...[
              const SizedBox(height: 22),
              _HigTodaySummary(summary: today),
            ],
            if (birthdays.isNotEmpty) ...[
              const SizedBox(height: 22),
              _HigBirthdaysCard(birthdays: birthdays),
            ],
            if (daily.isNotEmpty) ...[
              const SizedBox(height: 24),
              _HigSectionTitle(
                title: role == 'school' ? 'Today’s work' : 'Daily priorities',
                subtitle: _rolePriorityHint(role),
              ),
              const SizedBox(height: 12),
              _HigFeatureGrid(items: daily, onOpen: onOpen),
            ] else ...[
              const SizedBox(height: 24),
              _HigSectionTitle(
                title: role == 'school' ? 'Today’s work' : 'Daily priorities',
                subtitle: _rolePriorityHint(role),
              ),
              const SizedBox(height: 12),
              const _HigEmptyCard(
                icon: Icons.lock_outline_rounded,
                title: 'No actions available yet',
                message: 'Your school hasn’t enabled any features for you yet. '
                    'Please check back later or contact your school office.',
              ),
            ],
            if (students.isNotEmpty && role != 'school') ...[
              const SizedBox(height: 22),
              const _HigSectionTitle(
                  title: 'Linked students',
                  subtitle: 'Your authorized student profiles'),
              const SizedBox(height: 10),
              for (var index = 0; index < students.length; index++) ...[
                _HigStudentPill(
                  student: (students[index] as Map).cast<String, dynamic>(),
                ),
                if (index < students.length - 1) const SizedBox(height: 10),
              ],
            ],
            if (recent.isNotEmpty) ...[
              const SizedBox(height: 24),
              const _HigSectionTitle(
                  title: 'Recently used',
                  subtitle: 'Continue where you left off'),
              const SizedBox(height: 10),
              SizedBox(
                height: 106,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: recent.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, index) => _HigRecentCard(
                    item: recent[index],
                    onTap: () => onOpen(recent[index]),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            _HigSectionTitle(
              title: 'School updates',
              subtitle: notifications.isEmpty
                  ? 'You are all caught up'
                  : '${notifications.length} recent ${notifications.length == 1 ? 'update' : 'updates'}',
            ),
            const SizedBox(height: 10),
            if (notifications.isEmpty)
              const _HigEmptyCard(
                icon: Icons.notifications_none_rounded,
                title: 'No new school updates',
                message: 'Announcements and task alerts will appear here.',
              )
            else
              ...notifications.take(3).map((entry) {
                final item = (entry as Map).cast<String, dynamic>();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _HigUpdateCard(item: item),
                );
              }),
          ],
        ),
      ),
    );
  }

  static List<JsonMap> _orderedMatches(
      List<JsonMap> modules, List<String> keys) {
    final byKey = {for (final item in modules) item['key']?.toString(): item};
    final result = <JsonMap>[];
    for (final key in keys) {
      final item = byKey[key];
      if (item != null) result.add(item);
    }
    for (final item in modules) {
      if (!result.contains(item)) result.add(item);
    }
    return result;
  }

  static List<JsonMap> _recentMatches(
      List<JsonMap> modules, List<String> keys) {
    final byKey = {for (final item in modules) item['key']?.toString(): item};
    return keys.map((key) => byKey[key]).whereType<JsonMap>().toList();
  }
}

class HigRoleWorkspacePage extends StatefulWidget {
  const HigRoleWorkspacePage({
    super.key,
    required this.principalType,
    required this.modules,
    required this.onOpen,
  });
  final String principalType;
  final List<JsonMap> modules;
  final Future<void> Function(JsonMap item) onOpen;

  @override
  State<HigRoleWorkspacePage> createState() => _HigRoleWorkspacePageState();
}

class _HigRoleWorkspacePageState extends State<HigRoleWorkspacePage> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.modules.where((item) {
      final value = '${item['label'] ?? ''} ${item['key'] ?? ''}'.toLowerCase();
      return value.contains(query.trim().toLowerCase());
    }).toList();
    final groups = <String, List<JsonMap>>{};
    for (final item in filtered) {
      final category = _featureVisual(item['key']?.toString() ?? '').category;
      groups.putIfAbsent(category, () => []).add(item);
    }
    final title = widget.principalType == 'parent'
        ? 'More family tools'
        : widget.principalType == 'student'
            ? 'More learning tools'
            : 'More school tools';
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
        children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(
            '${widget.modules.length} authorized ${widget.modules.length == 1 ? 'feature' : 'features'}',
            style: const TextStyle(color: HigPalette.muted),
          ),
          const SizedBox(height: 16),
          TextField(
            onChanged: (value) => setState(() => query = value),
            decoration: const InputDecoration(
              hintText: 'Search your workspace',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 20),
          if (groups.isEmpty)
            const _HigEmptyCard(
              icon: Icons.search_off_rounded,
              title: 'No matching feature',
              message: 'Try a different word or clear the search.',
            )
          else
            for (final group in groups.entries) ...[
              _HigSectionTitle(title: group.key),
              const SizedBox(height: 10),
              _HigFeatureGrid(items: group.value, onOpen: widget.onOpen),
              const SizedBox(height: 24),
            ],
        ],
      ),
    );
  }
}

class HigNotificationsView extends StatefulWidget {
  const HigNotificationsView({super.key, required this.api});
  final HigMobileApi api;

  @override
  State<HigNotificationsView> createState() => _HigNotificationsViewState();
}

class _HigNotificationsViewState extends State<HigNotificationsView> {
  JsonMap? data;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final next = await widget.api.notifications();
      if (mounted) {
        setState(() {
          data = next;
          error = null;
        });
      }
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final entries = (data?['notifications'] as List?) ?? const [];
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
          children: [
            const Text('Alerts',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            const Text('School announcements and task updates',
                style: TextStyle(color: HigPalette.muted)),
            const SizedBox(height: 18),
            if (error != null)
              _HigEmptyCard(
                  icon: Icons.cloud_off_rounded,
                  title: 'Alerts unavailable',
                  message: error!)
            else if (data == null)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(40),
                      child: CircularProgressIndicator()))
            else if (entries.isEmpty)
              const _HigEmptyCard(
                  icon: Icons.notifications_none_rounded,
                  title: 'You’re all caught up',
                  message: 'New school alerts will appear here.')
            else
              for (final entry in entries) ...[
                _HigNotificationCard(
                  item: (entry as Map).cast<String, dynamic>(),
                  onTap: () async {
                    if (entry['read'] == true) return;
                    await widget.api
                        .markNotificationRead(entry['id'].toString());
                    await load();
                  },
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }
}

class HigProfileView extends StatefulWidget {
  const HigProfileView(
      {super.key,
      required this.home,
      required this.onLogout,
      required this.api});
  final JsonMap home;
  final Future<void> Function() onLogout;
  final HigMobileApi api;
  @override
  State<HigProfileView> createState() => _HigProfileViewState();
}

class _HigProfileViewState extends State<HigProfileView> {
  String? photo;
  bool photoBusy = false;
  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    try {
      final value = await widget.api.profilePhoto();
      if (mounted) setState(() => photo = value['photo'] as String?);
    } catch (_) {/* Keep the initials placeholder available. */}
  }

  Future<void> _editPhoto({bool remove = false}) async {
    setState(() => photoBusy = true);
    try {
      String? next;
      if (!remove) {
        final image = await ImagePicker().pickImage(
            source: ImageSource.gallery,
            maxWidth: 512,
            maxHeight: 512,
            imageQuality: 75);
        if (image == null) return;
        final bytes = await image.readAsBytes();
        if (bytes.length > 290000) {
          throw const FormatException('Choose a smaller photo');
        }
        final png = bytes.length > 8 && bytes[0] == 137 && bytes[1] == 80;
        next =
            'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
      }
      await widget.api.changeProfilePhoto(next);
      if (mounted) setState(() => photo = next);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Photo could not be saved. Choose a small JPG or PNG and try again.')));
      }
    } finally {
      if (mounted) setState(() => photoBusy = false);
    }
  }

  void _info(String title, String text) => showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
              title: Text(title),
              content: Text(text),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c),
                    child: const Text('Close'))
              ]));

  @override
  Widget build(BuildContext context) {
    final home = widget.home;
    final onLogout = widget.onLogout;
    final user = (home['user'] as Map?)?.cast<String, dynamic>() ?? {};
    final role = home['principalType']?.toString() ?? '';
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
        children: [
          const Text('Profile',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Column(children: [
                    if (photo == null)
                      _HigAvatar(
                          name: user['name']?.toString() ?? 'User', radius: 34)
                    else
                      CircleAvatar(
                          radius: 34,
                          backgroundImage: MemoryImage(
                              base64Decode(photo!.split(',').last))),
                    TextButton(
                        onPressed: photoBusy ? null : () => _editPhoto(),
                        child: Text(photoBusy ? 'Saving…' : 'Change photo')),
                    if (photo != null)
                      TextButton(
                          onPressed:
                              photoBusy ? null : () => _editPhoto(remove: true),
                          child: const Text('Remove')),
                  ]),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user['name']?.toString() ?? 'User',
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 3),
                          Tooltip(
                            message: user['email']?.toString() ?? '',
                            child: Text(
                              user['email']?.toString() ?? '',
                              softWrap: true,
                              style: const TextStyle(color: HigPalette.muted),
                            ),
                          ),
                          const SizedBox(height: 8),
                          _HigRoleBadge(
                              label: role == 'school'
                                  ? 'Teacher / staff'
                                  : _title(role)),
                        ]),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Card(
            child: Column(children: [
              _HigSettingsTile(
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => Scaffold(
                              appBar:
                                  AppBar(title: const Text('Notifications')),
                              body: HigNotificationsView(api: widget.api)))),
                  icon: Icons.notifications_outlined,
                  title: 'Notifications',
                  subtitle: 'School and task alerts'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
                  onTap: () async {
                    final queue = await widget.api.offlineStore.readQueue();
                    if (mounted) {
                      _info('Offline access',
                          '${queue.length} updates waiting to sync. Connect to the internet and refresh the home screen. Payments and profile changes require a connection.');
                    }
                  },
                  icon: Icons.cloud_done_outlined,
                  title: 'Offline access',
                  subtitle: 'Secure cache and queued updates'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
                  onTap: () => _info('Privacy & security',
                      'Your school controls your access. Parent accounts show linked children only. Sign out before sharing this device. Contact the school office to correct your account details.'),
                  icon: Icons.shield_outlined,
                  title: 'Privacy & security',
                  subtitle: 'Protected role-based access'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
                  onTap: () => _info('Help',
                      'Contact your school office for class assignments, account access, fees or transport support. Include the screen name and time of the issue. Never share your password.'),
                  icon: Icons.help_outline_rounded,
                  title: 'Help',
                  subtitle: 'Contact your school administrator'),
            ]),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout_rounded),
            label: const Padding(
                padding: EdgeInsets.all(14), child: Text('Sign out securely')),
          ),
        ],
      ),
    );
  }
}

class _HigBirthdaysCard extends StatelessWidget {
  const _HigBirthdaysCard({required this.birthdays});
  final List<dynamic> birthdays;

  String _label(Map<String, dynamic> b) {
    final name = b['name']?.toString() ?? 'A classmate';
    if (b['isToday'] == true) return '$name — today 🎉';
    final days = (b['inDays'] as num?)?.toInt() ?? 0;
    final weekday = b['weekday']?.toString() ?? '';
    return days == 1 ? '$name — tomorrow ($weekday)' : '$name — $weekday';
  }

  @override
  Widget build(BuildContext context) {
    final entries =
        birthdays.map((e) => (e as Map).cast<String, dynamic>()).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _HigSectionTitle(
        title: 'Birthdays this week',
        subtitle: 'A friendly reminder to celebrate',
      ),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: HigPalette.line),
        ),
        child: Column(
          children: [
            for (final entry in entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  const Icon(Icons.cake_outlined,
                      size: 20, color: HigPalette.muted),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text(_label(entry),
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700))),
                ]),
              ),
          ],
        ),
      ),
    ]);
  }
}

class _HigTodaySummary extends StatelessWidget {
  const _HigTodaySummary({required this.summary});
  final Map<String, dynamic> summary;

  @override
  Widget build(BuildContext context) {
    final items = (summary['items'] as List?) ?? const [];
    final title = _HigSectionTitle(
      title: 'Today',
      subtitle: items.isEmpty
          ? 'You are all caught up'
          : 'Your priorities at a glance',
    );
    if (items.isEmpty) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        title,
        const SizedBox(height: 10),
        const _HigEmptyCard(
          icon: Icons.check_circle_outline_rounded,
          title: 'Nothing needs attention',
          message: 'New tasks and alerts for today will appear here.',
        ),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      title,
      const SizedBox(height: 12),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final entry in items)
            _HigTodayTile(item: (entry as Map).cast<String, dynamic>()),
        ],
      ),
    ]);
  }
}

class _HigTodayTile extends StatelessWidget {
  const _HigTodayTile({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final count = (item['count'] as num?)?.toInt() ?? 0;
    final label = item['label']?.toString() ?? '';
    final hint = item['hint']?.toString() ?? '';
    final accent = Theme.of(context).colorScheme.primary;
    final width = (MediaQuery.of(context).size.width - 18 * 2 - 10) / 2;
    return Container(
      width: width < 150 ? width : 168,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: HigPalette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$count',
              style: TextStyle(
                  fontSize: 26, fontWeight: FontWeight.w900, color: accent)),
          const SizedBox(height: 4),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 3),
          Text(hint,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: HigPalette.muted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _HigTopBar extends StatelessWidget {
  const _HigTopBar(
      {required this.name,
      required this.subtitle,
      required this.onAlerts,
      this.unreadCount = 0});
  final String name;
  final String subtitle;
  final VoidCallback onAlerts;
  final int unreadCount;
  @override
  Widget build(BuildContext context) => Row(children: [
        _HigAvatar(name: name),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_greeting(),
              style: const TextStyle(
                  color: HigPalette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
          Text(name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          Text(subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: HigPalette.muted, fontSize: 12)),
        ])),
        IconButton.filledTonal(
            onPressed: onAlerts,
            tooltip: unreadCount > 0
                ? '$unreadCount unread notification${unreadCount == 1 ? '' : 's'}'
                : 'School notifications',
            icon: Badge(
              isLabelVisible: unreadCount > 0,
              label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
              child: const Icon(Icons.notifications_none_rounded),
            )),
      ]);

  static String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _HigAvatar extends StatelessWidget {
  const _HigAvatar({required this.name, this.radius = 25});
  final String name;
  final double radius;
  @override
  Widget build(BuildContext context) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    final initials = parts.isEmpty
        ? 'H'
        : parts.length == 1
            ? parts.first[0]
            : '${parts.first[0]}${parts.last[0]}';
    return CircleAvatar(
      radius: radius,
      backgroundColor:
          Theme.of(context).colorScheme.primary.withValues(alpha: .12),
      child: Text(initials.toUpperCase(),
          style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w900,
              fontSize: radius * .62)),
    );
  }
}

class _HigWelcomeCard extends StatelessWidget {
  const _HigWelcomeCard(
      {required this.role,
      required this.name,
      required this.studentCount,
      required this.alertCount,
      required this.moduleCount});
  final String role;
  final String name;
  final int studentCount;
  final int alertCount;
  final int moduleCount;
  @override
  Widget build(BuildContext context) {
    final firstName = name.trim().split(' ').first;
    final summary = role == 'parent'
        ? '$studentCount linked ${studentCount == 1 ? 'child' : 'children'} · $alertCount recent alerts'
        : role == 'school'
            ? '$moduleCount authorized work areas · $alertCount recent alerts'
            : '$moduleCount available features · $alertCount recent alerts';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
            colors: [Color(0xff153d35), Color(0xff276454)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        boxShadow: [
          BoxShadow(
              color: HigPalette.navy.withValues(alpha: .18),
              blurRadius: 24,
              offset: const Offset(0, 10))
        ],
      ),
      child: Row(children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Welcome, $firstName',
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900)),
          const SizedBox(height: 7),
          Text(summary,
              style: const TextStyle(color: Color(0xffd8e9f7), height: 1.4)),
        ])),
        const SizedBox(width: 12),
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(20)),
          clipBehavior: Clip.antiAlias,
          child: Image.asset('assets/school-campus.png',
              package: 'hig_mobile_core',
              fit: BoxFit.cover,
              alignment: Alignment.bottomRight,
              excludeFromSemantics: true),
        ),
      ]),
    );
  }
}

class _HigSectionTitle extends StatelessWidget {
  const _HigSectionTitle({required this.title, this.subtitle});
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(subtitle!,
              style: const TextStyle(color: HigPalette.muted, fontSize: 12))
        ],
      ]);
}

class _HigFeatureGrid extends StatelessWidget {
  const _HigFeatureGrid({required this.items, required this.onOpen});
  final List<JsonMap> items;
  final Future<void> Function(JsonMap item) onOpen;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) => GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: constraints.maxWidth < 340 ? 2 : 3,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: .93,
          ),
          itemBuilder: (_, index) => _HigFeatureTile(
            item: items[index],
            onTap: () => onOpen(items[index]),
          ),
        ),
      );
}

class _HigFeatureTile extends StatelessWidget {
  const _HigFeatureTile({required this.item, required this.onTap});
  final JsonMap item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final key = item['key']?.toString() ?? '';
    final visual = _featureVisual(key);
    final label = item['label']?.toString() ?? _title(key);
    return Semantics(
      button: true,
      label: 'Open $label',
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: HigPalette.line)),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                      color: visual.color.withValues(alpha: .11),
                      borderRadius: BorderRadius.circular(15)),
                  child: Icon(visual.icon, color: visual.color, size: 25)),
              const SizedBox(height: 9),
              Text(label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w800, height: 1.18)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _HigStudentPill extends StatelessWidget {
  const _HigStudentPill({required this.student});
  final JsonMap student;
  @override
  Widget build(BuildContext context) {
    final name = student['fullName']?.toString() ?? 'Student';
    final classLabel =
        '${student['className'] ?? ''} ${student['sectionName'] ?? ''}'.trim();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: HigPalette.line)),
      child: Row(children: [
        _HigAvatar(name: name, radius: 24),
        const SizedBox(width: 11),
        Expanded(
            child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              if (classLabel.isNotEmpty)
                Text(classLabel,
                    style:
                        const TextStyle(color: HigPalette.muted, fontSize: 12)),
            ])),
        const Icon(Icons.verified_user_outlined, color: HigPalette.teal),
      ]),
    );
  }
}

class _HigRecentCard extends StatelessWidget {
  const _HigRecentCard({required this.item, required this.onTap});
  final JsonMap item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final key = item['key']?.toString() ?? '';
    final visual = _featureVisual(key);
    return SizedBox(
      width: 145,
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
              padding: const EdgeInsets.all(13),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(visual.icon, color: visual.color),
                    const Spacer(),
                    Text(item['label']?.toString() ?? _title(key),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 13)),
                  ])),
        ),
      ),
    );
  }
}

class _HigUpdateCard extends StatelessWidget {
  const _HigUpdateCard({required this.item});
  final JsonMap item;
  @override
  Widget build(BuildContext context) => Card(
          child: ListTile(
        minVerticalPadding: 14,
        leading: CircleAvatar(
            backgroundColor: const Color(0xffffeceb),
            child: Icon(
                item['read'] == true
                    ? Icons.notifications_none_rounded
                    : Icons.notifications_active_rounded,
                color: const Color(0xffc34c47))),
        title: Text(item['title']?.toString() ?? 'School update',
            style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(item['message']?.toString() ?? '',
            maxLines: 2, overflow: TextOverflow.ellipsis),
      ));
}

class _HigNotificationCard extends StatelessWidget {
  const _HigNotificationCard({required this.item, required this.onTap});
  final JsonMap item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
          child: ListTile(
        onTap: onTap,
        minVerticalPadding: 15,
        leading: CircleAvatar(
            backgroundColor: item['read'] == true
                ? HigPalette.canvas
                : const Color(0xffffeceb),
            child: Icon(
                item['read'] == true
                    ? Icons.notifications_none_rounded
                    : Icons.notifications_active_rounded,
                color: item['read'] == true
                    ? HigPalette.muted
                    : const Color(0xffc34c47))),
        title: Text(item['title']?.toString() ?? 'School notification',
            style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(item['message']?.toString() ?? '')),
        trailing: item['read'] == true
            ? null
            : const Icon(Icons.circle, size: 9, color: Color(0xffc34c47)),
      ));
}

class _HigOfflineBanner extends StatelessWidget {
  const _HigOfflineBanner();
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
            color: const Color(0xfffff4e5),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xffffd6a3))),
        child: const Row(children: [
          Icon(Icons.cloud_off_rounded, color: HigPalette.warning, size: 20),
          SizedBox(width: 10),
          Expanded(
              child: Text('Offline · showing securely cached school data',
                  style: TextStyle(
                      color: Color(0xff7a450d), fontWeight: FontWeight.w700)))
        ]),
      );
}

class _HigEmptyCard extends StatelessWidget {
  const _HigEmptyCard(
      {required this.icon, required this.title, required this.message});
  final IconData icon;
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Card(
          child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                  color: HigPalette.canvas,
                  borderRadius: BorderRadius.circular(18)),
              child: Icon(icon, color: HigPalette.muted)),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 4),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: HigPalette.muted)),
        ]),
      ));
}

class _HigRoleBadge extends StatelessWidget {
  const _HigRoleBadge({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: .10),
            borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontSize: 11,
                fontWeight: FontWeight.w800)),
      );
}

class _HigSettingsTile extends StatelessWidget {
  const _HigSettingsTile(
      {required this.icon,
      required this.title,
      required this.subtitle,
      this.onTap});
  final VoidCallback? onTap;
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => ListTile(
        onTap: onTap,
        trailing: onTap == null ? null : const Icon(Icons.chevron_right),
        minVerticalPadding: 12,
        leading: CircleAvatar(
            backgroundColor:
                Theme.of(context).colorScheme.primary.withValues(alpha: .10),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
      );
}
