part of '../hig_mobile_core.dart';

const _attendanceStatuses = ['present', 'absent', 'late', 'excused'];

String _mobileIsoDate(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

String _formatMobileDate(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}

class HigAttendancePage extends StatefulWidget {
  const HigAttendancePage({
    super.key,
    required this.api,
    required this.students,
  });

  final HigMobileApi api;
  final List<JsonMap> students;

  @override
  State<HigAttendancePage> createState() => _HigAttendancePageState();
}

class _HigAttendancePageState extends State<HigAttendancePage> {
  DateTime selectedDate = DateTime.now();
  String? selectedClass;
  List<JsonMap> existing = const [];
  final Map<String, String> statuses = {};
  final Set<String> completedWrites = {};
  bool loading = true;
  bool saving = false;
  String? error;

  List<String> get classes {
    final values = widget.students
        .map(_studentClass)
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return values;
  }

  List<JsonMap> get roster {
    final selected = selectedClass;
    final values = widget.students
        .where(
            (student) => selected == null || _studentClass(student) == selected)
        .toList();
    values.sort((left, right) {
      final leftRoll = int.tryParse(left['rollNumber']?.toString() ?? '');
      final rightRoll = int.tryParse(right['rollNumber']?.toString() ?? '');
      if (leftRoll != null && rightRoll != null && leftRoll != rightRoll) {
        return leftRoll.compareTo(rightRoll);
      }
      return (left['fullName']?.toString() ?? '')
          .compareTo(right['fullName']?.toString() ?? '');
    });
    return values;
  }

  @override
  void initState() {
    super.initState();
    final options = classes;
    selectedClass = options.isEmpty ? null : options.first;
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await widget.api.operations();
      final operations =
          (response['operations'] as Map?)?.cast<String, dynamic>();
      final attendance = ((operations?['attendance'] as List?) ?? const [])
          .map((item) => (item as Map).cast<String, dynamic>())
          .toList();
      if (!mounted) return;
      setState(() {
        existing = attendance;
        loading = false;
        error = null;
        _restoreStatuses();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error =
            'Attendance could not be loaded. Pull to refresh and try again.';
      });
    }
  }

  void _restoreStatuses() {
    statuses.clear();
    final date = _mobileIsoDate(selectedDate);
    for (final record in existing) {
      if (record['attendanceDate']?.toString() == date) {
        statuses[record['studentId'].toString()] =
            record['status']?.toString() ?? 'present';
      }
    }
  }

  Future<void> _chooseDate() async {
    final now = DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year, now.month, now.day),
      helpText: 'Attendance date',
    );
    if (chosen == null) return;
    setState(() {
      selectedDate = chosen;
      _restoreStatuses();
    });
  }

  void _markAllPresent() {
    setState(() {
      for (final student in roster) {
        final studentId = student['id'].toString();
        statuses[studentId] = 'present';
        completedWrites.remove(_writeKey(studentId));
      }
    });
  }

  String _writeKey(String studentId) =>
      '${_mobileIsoDate(selectedDate)}:$studentId';

  Future<void> _save() async {
    final students = roster;
    if (students.isEmpty ||
        students.any(
          (student) => statuses[student['id']?.toString()] == null,
        )) {
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });

    final pending = students
        .where(
          (student) =>
              !completedWrites.contains(_writeKey(student['id'].toString())),
        )
        .toList();
    var failed = 0;
    var queued = 0;
    for (var offset = 0; offset < pending.length; offset += 4) {
      final end = (offset + 4).clamp(0, pending.length);
      final results = await Future.wait(
        pending.sublist(offset, end).map((student) async {
          final studentId = student['id'].toString();
          try {
            final result = await widget.api.operation({
              'action': 'mark_attendance',
              'studentId': studentId,
              'attendanceDate': _mobileIsoDate(selectedDate),
              'status': statuses[studentId],
              'note': 'Marked from Hig Staff & Admin mobile app',
            });
            return (studentId, result['queued'] == true ? 'queued' : 'saved');
          } catch (_) {
            return (studentId, 'failed');
          }
        }),
      );
      for (final result in results) {
        if (result.$2 == 'failed') {
          failed += 1;
        } else {
          completedWrites.add(_writeKey(result.$1));
          if (result.$2 == 'queued') queued += 1;
        }
      }
    }

    if (!mounted) return;
    setState(() => saving = false);
    if (failed > 0) {
      setState(() {
        error =
            '$failed attendance ${failed == 1 ? 'entry' : 'entries'} could not be saved. Please check your connection and try again.';
      });
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          queued > 0
              ? 'Attendance saved offline and queued for sync.'
              : 'Attendance saved for ${students.length} students.',
        ),
      ),
    );
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final students = roster;
    final marked = students
        .where((student) => statuses[student['id']?.toString()] != null)
        .length;
    final allMarked = students.isNotEmpty && marked == students.length;
    return Scaffold(
      appBar: AppBar(title: const Text('Take attendance')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                children: [
                  Text(
                    'Choose the class and date, mark everyone present, then change only the exceptions.',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: HigPalette.muted,
                        ),
                  ),
                  const SizedBox(height: 16),
                  if (classes.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: selectedClass,
                      decoration: const InputDecoration(
                        labelText: 'Class and section',
                        prefixIcon: Icon(Icons.groups_rounded),
                      ),
                      items: classes
                          .map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text(value),
                            ),
                          )
                          .toList(),
                      onChanged: saving
                          ? null
                          : (value) => setState(() => selectedClass = value),
                    ),
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.calendar_month_rounded),
                      title: const Text('Attendance date'),
                      subtitle: Text(
                        _formatMobileDate(_mobileIsoDate(selectedDate)),
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: saving ? null : _chooseDate,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '$marked of ${students.length} marked',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed:
                            saving || students.isEmpty ? null : _markAllPresent,
                        icon: const Icon(Icons.done_all_rounded),
                        label: const Text('All present'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: students.isEmpty ? 0 : marked / students.length,
                    minHeight: 7,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    _HigEmptyCard(
                      icon: Icons.error_outline_rounded,
                      title: 'Action needed',
                      message: error!,
                    ),
                  ],
                  const SizedBox(height: 16),
                  for (var index = 0; index < students.length; index++) ...[
                    _AttendanceStudentRow(
                      student: students[index],
                      index: index,
                      status: statuses[students[index]['id']?.toString()],
                      enabled: !saving,
                      onChanged: (status) => setState(() {
                        final studentId = students[index]['id'].toString();
                        statuses[studentId] = status;
                        completedWrites.remove(_writeKey(studentId));
                      }),
                    ),
                    const SizedBox(height: 8),
                  ],
                ],
              ),
            ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton.icon(
          onPressed: saving || !allMarked ? null : _save,
          icon: saving
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.cloud_done_rounded),
          label: Text(
            saving
                ? 'Saving attendance…'
                : allMarked
                    ? 'Save ${students.length} students'
                    : 'Mark every student to save',
          ),
        ),
      ),
    );
  }
}

class _AttendanceStudentRow extends StatelessWidget {
  const _AttendanceStudentRow({
    required this.student,
    required this.index,
    required this.status,
    required this.enabled,
    required this.onChanged,
  });

  final JsonMap student;
  final int index;
  final String? status;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final roll = student['rollNumber']?.toString();
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        minVerticalPadding: 12,
        leading: CircleAvatar(
          child: Text(roll?.isNotEmpty == true ? roll! : '${index + 1}'),
        ),
        title: Text(
          student['fullName']?.toString() ?? 'Student',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          student['admissionNumber']?.toString() ?? 'Student',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: PopupMenuButton<String>(
          enabled: enabled,
          tooltip: 'Set attendance status',
          onSelected: onChanged,
          itemBuilder: (_) => _attendanceStatuses
              .map(
                (value) => PopupMenuItem(
                  value: value,
                  child: Row(
                    children: [
                      Icon(
                        _attendanceIcon(value),
                        color: _attendanceColor(value),
                      ),
                      const SizedBox(width: 10),
                      Text(_title(value)),
                    ],
                  ),
                ),
              )
              .toList(),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: status == null
                  ? const Color(0xfff1f5f9)
                  : _attendanceColor(status!).withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  status == null
                      ? Icons.radio_button_unchecked_rounded
                      : _attendanceIcon(status!),
                  color: status == null
                      ? HigPalette.muted
                      : _attendanceColor(status!),
                  size: 18,
                ),
                const SizedBox(width: 6),
                Text(
                  status == null ? 'Mark' : _title(status!),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _studentClass(JsonMap student) => [
      student['className']?.toString() ?? '',
      student['sectionName']?.toString() ?? '',
    ].where((value) => value.isNotEmpty).join(' · ');

Color _attendanceColor(String status) {
  switch (status) {
    case 'present':
      return const Color(0xff16865c);
    case 'absent':
      return const Color(0xffc0392b);
    case 'late':
      return const Color(0xffd97706);
    default:
      return const Color(0xff52657a);
  }
}

IconData _attendanceIcon(String status) {
  switch (status) {
    case 'present':
      return Icons.check_circle_rounded;
    case 'absent':
      return Icons.cancel_rounded;
    case 'late':
      return Icons.schedule_rounded;
    default:
      return Icons.event_available_rounded;
  }
}
