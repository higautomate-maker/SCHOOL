part of '../hig_mobile_core.dart';

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
    'child_overview',
    'attendance',
    'homework',
    'transport_tracking',
    'fees_payments',
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
    'student_information',
    'academics',
    'lesson_planner',
    'examinations',
    'communication'
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
    final daily =
        _orderedMatches(modules, _dailyKeys[role] ?? const []).take(6).toList();
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
            if (students.isNotEmpty) ...[
              const SizedBox(height: 22),
              const _HigSectionTitle(
                  title: 'Linked students',
                  subtitle: 'Your authorized student profiles'),
              const SizedBox(height: 10),
              SizedBox(
                height: 86,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: students.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, index) => _HigStudentPill(
                    student: (students[index] as Map).cast<String, dynamic>(),
                  ),
                ),
              ),
            ],
            if (daily.isNotEmpty) ...[
              const SizedBox(height: 24),
              _HigSectionTitle(
                title: role == 'school' ? 'Today’s work' : 'Daily shortcuts',
                subtitle: 'Only actions currently allowed for you',
              ),
              const SizedBox(height: 12),
              _HigFeatureGrid(items: daily, onOpen: onOpen),
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
        ? 'Family'
        : widget.principalType == 'student'
            ? 'Learn'
            : 'Workspace';
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
      if (mounted)
        setState(() {
          data = next;
          error = null;
        });
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

class HigProfileView extends StatelessWidget {
  const HigProfileView({super.key, required this.home, required this.onLogout});
  final JsonMap home;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
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
                  _HigAvatar(
                      name: user['name']?.toString() ?? 'User', radius: 34),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user['name']?.toString() ?? 'User',
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 3),
                          Text(user['email']?.toString() ?? '',
                              style: const TextStyle(color: HigPalette.muted)),
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
                  icon: Icons.notifications_outlined,
                  title: 'Notifications',
                  subtitle: 'School and task alerts'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
                  icon: Icons.cloud_done_outlined,
                  title: 'Offline access',
                  subtitle: 'Secure cache and queued updates'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
                  icon: Icons.shield_outlined,
                  title: 'Privacy & security',
                  subtitle: 'Protected role-based access'),
              const Divider(height: 1, indent: 64),
              _HigSettingsTile(
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

class _HigTopBar extends StatelessWidget {
  const _HigTopBar(
      {required this.name, required this.subtitle, required this.onAlerts});
  final String name;
  final String subtitle;
  final VoidCallback onAlerts;
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
            tooltip: 'School notifications',
            icon: const Icon(Icons.notifications_none_rounded)),
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
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
            colors: [HigPalette.navy, HigPalette.blue],
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
                  fontSize: 24,
                  fontWeight: FontWeight.w900)),
          const SizedBox(height: 7),
          Text(summary,
              style: const TextStyle(color: Color(0xffd8e9f7), height: 1.4)),
          const SizedBox(height: 16),
          const _HigRoleBadge(label: 'Secure personalized access', dark: true),
        ])),
        const SizedBox(width: 12),
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(20)),
          child: Icon(
              role == 'parent'
                  ? Icons.family_restroom_rounded
                  : role == 'school'
                      ? Icons.school_rounded
                      : Icons.auto_stories_rounded,
              color: Colors.white,
              size: 34),
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
      width: 220,
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
  const _HigRoleBadge({required this.label, this.dark = false});
  final String label;
  final bool dark;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
            color: dark
                ? Colors.white.withValues(alpha: .14)
                : Theme.of(context).colorScheme.primary.withValues(alpha: .10),
            borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: TextStyle(
                color:
                    dark ? Colors.white : Theme.of(context).colorScheme.primary,
                fontSize: 11,
                fontWeight: FontWeight.w800)),
      );
}

class _HigSettingsTile extends StatelessWidget {
  const _HigSettingsTile(
      {required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => ListTile(
        minVerticalPadding: 12,
        leading: CircleAvatar(
            backgroundColor:
                Theme.of(context).colorScheme.primary.withValues(alpha: .10),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
      );
}
