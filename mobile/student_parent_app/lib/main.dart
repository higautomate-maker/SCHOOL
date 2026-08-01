import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3002',
);
const demoEmail = String.fromEnvironment('HIG_DEMO_EMAIL');
const demoPassword = String.fromEnvironment('HIG_DEMO_PASSWORD');

const studentModules = [
  'Attendance', 'Homework', 'Courses', 'CCO Reports', 'Assessments',
  'Timetable', 'Extended Classes', 'Lesson Planner', 'Syllabus', 'Fees',
  'Library', 'PTM Meetings', 'Transport',
];

const parentModules = [
  'Child Overview', 'Attendance', 'Homework', 'Timetable', 'Results',
  'Fees & Payments', 'Notices', 'PTM Meetings', 'Leave Request',
  'Live Transport', 'Library', 'School Events', 'Contact School',
];

void main() => runApp(const HigStudentParentApp());

class HigStudentParentApp extends StatelessWidget {
  const HigStudentParentApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Hig School',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xffe94e0c)),
          useMaterial3: true,
        ),
        home: const LoginScreen(),
      );
}

class DemoApi {
  String token = '';

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$apiBase/api/v1/demo/login'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) throw Exception(body['error'] ?? 'Login failed');
    token = body['token'] as String;
    return (body['user'] as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> state() async {
    final response = await http.get(
      Uri.parse('$apiBase/api/v1/demo/state'),
      headers: {'authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) throw Exception('Synchronization failed');
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<void> parentRequest(String type, String title, String description) async {
    final response = await http.post(
      Uri.parse('$apiBase/api/v1/demo/action'),
      headers: {
        'authorization': 'Bearer $token',
        'content-type': 'application/json',
      },
      body: jsonEncode({
        'action': 'parent_request',
        'requestType': type,
        'title': title,
        'description': description,
      }),
    );
    if (response.statusCode != 200) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw Exception(body['error'] ?? 'Request failed');
    }
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final api = DemoApi();
  final email = TextEditingController(text: demoEmail);
  final password = TextEditingController(text: demoPassword);
  bool busy = false;
  String error = '';

  Future<void> submit() async {
    setState(() { busy = true; error = ''; });
    try {
      final user = await api.login(email.text.trim(), password.text);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            api: api,
            name: user['name'] as String,
            role: user['role'] as String,
          ),
        ),
      );
    } catch (exception) {
      setState(() => error = '$exception'.replaceFirst('Exception: ', ''));
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
              const SizedBox(height: 42),
              const CircleAvatar(
                radius: 34,
                backgroundColor: Color(0xffe94e0c),
                child: Text('H', style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(height: 20),
              const Text('Student & Parent App', textAlign: TextAlign.center, style: TextStyle(fontSize: 27, fontWeight: FontWeight.w800)),
              const Text('13 role-based connected modules', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 32),
              TextField(controller: email, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
              const SizedBox(height: 14),
              TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
              if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: const TextStyle(color: Colors.red))),
              const SizedBox(height: 18),
              FilledButton(onPressed: busy ? null : submit, child: Padding(padding: const EdgeInsets.all(14), child: Text(busy ? 'Signing in…' : 'Open app'))),
            ],
          ),
        ),
      );
}

class HomeScreen extends StatefulWidget {
  final DemoApi api;
  final String name;
  final String role;
  const HomeScreen({super.key, required this.api, required this.name, required this.role});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? data;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 5), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final next = await widget.api.state();
      if (mounted) setState(() => data = next);
    } catch (_) {}
  }

  Future<void> openModule(String module) async {
    final state = data!;
    final notifications = (state['notifications'] as List? ?? []).cast<Map<String, dynamic>>();
    final records = (state['records'] as List).cast<Map<String, dynamic>>();
    final isRequest = widget.role == 'parent' && (module == 'Leave Request' || module == 'Contact School');
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(module, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (module == 'Notices' || module == 'Attendance')
                ...notifications.take(5).map((item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(child: Icon(Icons.notifications_outlined)),
                      title: Text(item['title'] as String),
                      subtitle: Text(item['message'] as String),
                    ))
              else
                ...records.take(4).map((item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(child: Icon(Icons.school_outlined)),
                      title: Text(item['title'] as String),
                      subtitle: Text(item['description'] as String),
                    )),
              if (isRequest)
                FilledButton(
                  onPressed: () async {
                    await widget.api.parentRequest(
                      module,
                      module == 'Leave Request' ? 'Aarav Sharma leave request' : 'Parent callback request',
                      'Submitted from the connected Parent app.',
                    );
                    if (sheetContext.mounted) Navigator.pop(sheetContext);
                    await load();
                  },
                  child: Text(module == 'Leave Request' ? 'Send leave request' : 'Request a callback'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = data;
    if (state == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final modules = widget.role == 'parent' ? parentModules : studentModules;
    final notifications = (state['notifications'] as List? ?? []).cast<Map<String, dynamic>>();
    final attendance = (state['operations']['attendance'] as List).cast<Map<String, dynamic>>();
    final aaravAttendance = attendance.where((item) => item['studentId'] == 'student-aarav').toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(state['school']['name'] as String),
        actions: [
          Badge(
            label: Text('${notifications.length}'),
            child: IconButton(onPressed: load, icon: const Icon(Icons.notifications_outlined)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: const LinearGradient(colors: [Color(0xffbd3304), Color(0xffe94e0c)]),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.role == 'parent' ? 'PARENT · AARAV SHARMA' : 'GRADE 8 · SECTION A', style: const TextStyle(color: Color(0xffffcfba), fontSize: 11)),
                  const SizedBox(height: 7),
                  Text('Good morning, ${widget.name.split(' ').first}', style: const TextStyle(color: Colors.white, fontSize: 27, fontWeight: FontWeight.w800)),
                  Text('Live data version ${state['version']}', style: const TextStyle(color: Color(0xffffdfd2))),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.fact_check_outlined)),
                title: const Text('Today’s attendance'),
                subtitle: Text(aaravAttendance.isEmpty ? 'Not marked' : '${aaravAttendance.first['status']} · updated by teacher'),
              ),
            ),
            const SizedBox(height: 18),
            Text('Live notifications (${notifications.length})', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ...notifications.take(4).map((item) => Card(
                  child: ListTile(
                    leading: const CircleAvatar(backgroundColor: Color(0xffffeadf), child: Icon(Icons.notifications_active_outlined, color: Color(0xffe94e0c))),
                    title: Text(item['title'] as String),
                    subtitle: Text(item['message'] as String),
                  ),
                )),
            const SizedBox(height: 18),
            Text('${modules.length} role-based modules', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: modules.map((module) => Card(
                    child: InkWell(
                      onTap: () => openModule(module),
                      child: Padding(
                        padding: const EdgeInsets.all(7),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.apps_rounded, color: Color(0xffe94e0c)),
                            const SizedBox(height: 6),
                            Text(module, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ),
                  )).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
