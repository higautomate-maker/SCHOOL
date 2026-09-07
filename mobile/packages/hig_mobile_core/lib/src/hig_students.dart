part of '../hig_mobile_core.dart';

/// Displays only the roster returned by the authenticated mobile Home API.
class HigStudentDirectoryPage extends StatefulWidget {
  const HigStudentDirectoryPage({super.key, required this.api});
  final HigMobileApi api;
  @override
  State<HigStudentDirectoryPage> createState() =>
      _HigStudentDirectoryPageState();
}

class _HigStudentDirectoryPageState extends State<HigStudentDirectoryPage> {
  List<JsonMap> students = [];
  String query = '';
  String? selectedClass;
  String? error;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
      students = [];
    });
    try {
      final response = await widget.api.home(allowCache: false);
      final home = (response['home'] as Map?) ?? {};
      final modules = ((home['access'] as Map?)?['modules'] as List?) ?? [];
      final allowed = home['principalType'] == 'school' &&
          modules.any(
              (item) => item is Map && item['key'] == 'student_information');
      if (!mounted) return;
      setState(() {
        students = allowed
            ? ((home['students'] as List?) ?? [])
                .map((item) => (item as Map).cast<String, dynamic>())
                .toList()
            : [];
        if (!allowed) {
          error =
              'Student access is not available for this account. Contact your school office.';
        }
        if (!students.any((student) => _studentClass(student) == selectedClass)) {
          selectedClass = null;
        }
        loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error =
              'Student list could not be loaded. Check your connection and retry.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes = students.map(_studentClass).toSet().toList()..sort();
    final visible = students
        .where((student) =>
            (selectedClass == null ||
                _studentClass(student) == selectedClass) &&
            ['fullName', 'admissionNumber', 'rollNumber'].any((field) =>
                (student[field]?.toString() ?? '')
                    .toLowerCase()
                    .contains(query.toLowerCase())))
        .toList()
      ..sort((a, b) => (a['fullName']?.toString() ?? '')
          .compareTo(b['fullName']?.toString() ?? ''));
    return Scaffold(
      appBar: AppBar(title: const Text('Students'), actions: [
        IconButton(
            tooltip: 'Refresh students',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh))
      ]),
      body: SafeArea(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : error != null
                  ? Center(
                      child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(error!),
                                TextButton(
                                    onPressed: _load,
                                    child: const Text('Retry'))
                              ])))
                  : ListView(padding: const EdgeInsets.all(16), children: [
                      TextField(
                          decoration: const InputDecoration(
                              labelText:
                                  'Search name, admission or roll number',
                              prefixIcon: Icon(Icons.search)),
                          onChanged: (value) => setState(() => query = value)),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                          key: ValueKey(selectedClass),
                          initialValue: selectedClass ?? '',
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Class'),
                          items: [
                            const DropdownMenuItem(
                                value: '', child: Text('All assigned classes')),
                            ...classes.map((value) => DropdownMenuItem(
                                value: value, child: Text(value)))
                          ],
                          onChanged: (value) => setState(() =>
                              selectedClass = value == '' ? null : value)),
                      const SizedBox(height: 16),
                      Text('${visible.length} students',
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      if (visible.isEmpty)
                        const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Text(
                                'No students match this selection. Check the class or search, or contact the school office about enrolments.')),
                      ...visible.map((student) => Card(
                          child: ListTile(
                              title: Text(
                                  student['fullName']?.toString() ?? 'Student'),
                              subtitle: Text(
                                  '${_studentClass(student)} · Roll ${student['rollNumber'] ?? '—'}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => showModalBottomSheet<void>(
                                  context: context,
                                  builder: (context) => SafeArea(
                                      child: Padding(
                                          padding: const EdgeInsets.all(24),
                                          child: Column(
                                              mainAxisSize: MainAxisSize.min,
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                    student['fullName']
                                                            ?.toString() ??
                                                        'Student',
                                                    style: Theme.of(context)
                                                        .textTheme
                                                        .titleLarge),
                                                const SizedBox(height: 12),
                                                Text(
                                                    'Class: ${_studentClass(student)}'),
                                                Text(
                                                    'Roll number: ${student['rollNumber'] ?? '—'}'),
                                                Text(
                                                    'Admission number: ${student['admissionNumber'] ?? '—'}'),
                                                TextButton(
                                                    onPressed: () =>
                                                        Navigator.pop(context),
                                                    child: const Text('Close')),
                                              ]))))))),
                    ])),
    );
  }
}
