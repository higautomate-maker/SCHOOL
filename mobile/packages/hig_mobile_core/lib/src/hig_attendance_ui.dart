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
  bool lessonMode = false;
  String? selectedSubject;
  int selectedPeriod = 1;
  List<JsonMap> lessonRecords = const [];
  List<JsonMap> teachingContexts = const [];
  List<JsonMap> existing = const [];
  final Map<String, String> statuses = {};
  final Set<String> completedWrites = {};
  bool loading = true;
  bool registerReady = false;
  bool saving = false;
  bool dirty = false;
  String? error;

  List<JsonMap> get dailyContexts => teachingContexts
      .where((context) =>
          context['kind']?.toString() ==
          (lessonMode ? 'subject_teacher' : 'class_teacher'))
      .toList();

  List<JsonMap> get subjects => dailyContexts
      .where((item) => _teachingContextLabel(item) == selectedClass)
      .toList();

  void _selectAvailable() {
    final available = classes;
    if (!available.contains(selectedClass)) {
      selectedClass = available.isEmpty ? null : available.first;
    }
    if (!subjects.any((item) => item['subjectId'] == selectedSubject)) {
      selectedSubject =
          subjects.isEmpty ? null : subjects.first['subjectId']?.toString();
    }
  }

  Future<void> _changeRegister(bool value) async {
    if (value == lessonMode || !await _confirmDiscardChanges() || !mounted) {
      return;
    }
    setState(() {
      lessonMode = value;
      registerReady = !value;
      _selectAvailable();
      _restoreStatuses();
    });
    if (value) await _loadLessons();
  }

  Future<void> _loadLessons() async {
    setState(() {
      loading = true;
      registerReady = false;
    });
    try {
      final response =
          await widget.api.lessonAttendance(_mobileIsoDate(selectedDate));
      if (!mounted) return;
      setState(() {
        lessonRecords = ((response['attendance'] as List?) ?? [])
            .map((item) => (item as Map).cast<String, dynamic>())
            .toList();
        loading = false;
        registerReady = true;
        error = null;
        _restoreStatuses();
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = 'Lesson register could not be loaded. Pull to refresh.';
        });
      }
    }
  }

  List<String> get classes {
    final values = dailyContexts
        .map(_teachingContextLabel)
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return values;
  }

  List<JsonMap> get roster {
    final selected = selectedClass;
    if (selected == null || selectedTeachingContext == null) return [];
    final values = widget.students
        .where((student) => _studentClass(student) == selected)
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

  JsonMap? get selectedTeachingContext {
    final selected = selectedClass;
    if (selected == null) return null;
    for (final context in dailyContexts) {
      if (_teachingContextLabel(context) == selected &&
          (!lessonMode || context['subjectId'] == selectedSubject)) {
        return context;
      }
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      registerReady = false;
    });
    try {
      final responses = await Future.wait([
        widget.api.operations(),
        widget.api.teachingContexts(),
      ]);
      final response = responses[0];
      final contextResponse = responses[1];
      final operations =
          (response['operations'] as Map?)?.cast<String, dynamic>();
      final attendance = ((operations?['attendance'] as List?) ?? const [])
          .map((item) => (item as Map).cast<String, dynamic>())
          .toList();
      final contexts = ((contextResponse['contexts'] as List?) ?? const [])
          .map((item) => (item as Map).cast<String, dynamic>())
          .toList();
      if (!mounted) return;
      setState(() {
        existing = attendance;
        teachingContexts = contexts;
        _selectAvailable();
        loading = false;
        registerReady = !lessonMode;
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
    completedWrites.clear();
    final date = _mobileIsoDate(selectedDate);
    for (final record in lessonMode ? lessonRecords : existing) {
      if (record['attendanceDate']?.toString() == date &&
          (!lessonMode ||
              (record['subjectId'] == selectedSubject &&
                  record['lessonId'] == 'period-$selectedPeriod' &&
                  record['classId'] == selectedTeachingContext?['classId'] &&
                  record['sectionId'] ==
                      selectedTeachingContext?['sectionId']))) {
        statuses[record['studentId'].toString()] =
            record['status']?.toString() ?? 'present';
      }
    }
    dirty = false;
  }

  Future<bool> _confirmDiscardChanges() async {
    if (!dirty) return true;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded),
        title: const Text('Discard attendance changes?'),
        content: const Text(
          'The attendance you marked has not been saved. You will lose these changes if you leave.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return discard == true;
  }

  Future<void> _refresh() async {
    if (!await _confirmDiscardChanges()) return;
    await _load();
    if (lessonMode && mounted) await _loadLessons();
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
    if (chosen == null ||
        _mobileIsoDate(chosen) == _mobileIsoDate(selectedDate)) {
      return;
    }
    if (!await _confirmDiscardChanges()) return;
    if (!mounted) return;
    setState(() {
      selectedDate = chosen;
      _restoreStatuses();
    });
    if (lessonMode) await _loadLessons();
  }

  void _markAllPresent() {
    setState(() {
      for (final student in roster) {
        final studentId = student['id'].toString();
        statuses[studentId] = 'present';
        completedWrites.remove(_writeKey(studentId));
      }
      dirty = true;
    });
  }

  Future<void> _changeClass(String? value) async {
    if (value == null || value == selectedClass) return;
    if (!await _confirmDiscardChanges()) return;
    if (!mounted) return;
    setState(() {
      selectedClass = value;
      _selectAvailable();
      _restoreStatuses();
    });
  }

  String _writeKey(String studentId) =>
      '${_mobileIsoDate(selectedDate)}:$studentId';

  Future<void> _save() async {
    final students = roster;
    final teachingContext = selectedTeachingContext;
    if (!registerReady ||
        saving ||
        students.isEmpty ||
        teachingContext == null ||
        students.any(
          (student) => statuses[student['id']?.toString()] == null,
        )) {
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });

    if (lessonMode) {
      try {
        final result = await widget.api.saveLessonAttendance({
          'academicSessionId': teachingContext['academicSessionId'],
          'classId': teachingContext['classId'],
          'sectionId': teachingContext['sectionId'],
          'subjectId': teachingContext['subjectId'],
          'lessonId': 'period-$selectedPeriod',
          'attendanceDate': _mobileIsoDate(selectedDate),
          'entries': students
              .map((student) => {
                    'studentId': student['id'],
                    'status': statuses[student['id'].toString()],
                    'note': '',
                  })
              .toList(),
        });
        if (!mounted) return;
        setState(() {
          saving = false;
          dirty = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
          result['queued'] == true
              ? 'Lesson attendance queued for sync.'
              : 'Lesson attendance saved.',
        )));
        Navigator.pop(context, true);
      } catch (_) {
        if (mounted) {
          setState(() {
            saving = false;
            error =
                'Lesson attendance could not be saved. Your marks are retained; try again.';
          });
        }
      }
      return;
    }

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
              'academicSessionId': teachingContext['academicSessionId'],
              'classId': teachingContext['classId'],
              'sectionId': teachingContext['sectionId'],
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
    dirty = false;
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final students = roster;
    final marked = students
        .where((student) => statuses[student['id']?.toString()] != null)
        .length;
    final allMarked = students.isNotEmpty && marked == students.length;
    return PopScope(
      canPop: !dirty && !saving,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop || saving || !dirty) return;
        if (await _confirmDiscardChanges() && context.mounted) {
          dirty = false;
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Take attendance')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                  children: [
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(
                            value: false,
                            label: Text('Daily'),
                            icon: Icon(Icons.calendar_today)),
                        ButtonSegment(
                            value: true,
                            label: Text('Subject lesson'),
                            icon: Icon(Icons.menu_book)),
                      ],
                      selected: {lessonMode},
                      onSelectionChanged: saving
                          ? null
                          : (value) => _changeRegister(value.first),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Choose the class and date, mark everyone present, then change only the exceptions.',
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: HigPalette.muted,
                          ),
                    ),
                    const SizedBox(height: 16),
                    if (classes.isNotEmpty)
                      DropdownButtonFormField<String>(
                        key: ValueKey('class-$lessonMode-$selectedClass'),
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
                        onChanged: saving ? null : _changeClass,
                      ),
                    if (lessonMode && subjects.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        key:
                            ValueKey('subject-$selectedClass-$selectedSubject'),
                        initialValue: selectedSubject,
                        decoration: const InputDecoration(labelText: 'Subject'),
                        items: subjects
                            .map((item) => DropdownMenuItem(
                                  value: item['subjectId'].toString(),
                                  child: Text(item['subjectName']?.toString() ??
                                      'Subject'),
                                ))
                            .toList(),
                        onChanged: saving
                            ? null
                            : (value) async {
                                if (!await _confirmDiscardChanges() ||
                                    !mounted) {
                                  return;
                                }
                                setState(() {
                                  selectedSubject = value;
                                  _restoreStatuses();
                                });
                              },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        key: ValueKey('period-$selectedPeriod'),
                        initialValue: selectedPeriod,
                        decoration: const InputDecoration(labelText: 'Period'),
                        items: List.generate(
                            12,
                            (index) => DropdownMenuItem(
                                value: index + 1,
                                child: Text('Period ${index + 1}'))),
                        onChanged: saving
                            ? null
                            : (value) async {
                                if (value == null ||
                                    !await _confirmDiscardChanges() ||
                                    !mounted) {
                                  return;
                                }
                                setState(() {
                                  selectedPeriod = value;
                                  _restoreStatuses();
                                });
                              },
                      ),
                    ],
                    if (classes.isEmpty)
                      Card(
                        color: HigPalette.warning.withValues(alpha: .1),
                        child: ListTile(
                          leading: const Icon(Icons.assignment_late_outlined),
                          title: Text(lessonMode
                              ? 'No subject-teacher assignment'
                              : 'No class-teacher assignment'),
                          subtitle: Text(
                            'Ask the school administrator to assign your class before taking daily attendance.',
                          ),
                        ),
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
                          onPressed: saving || students.isEmpty
                              ? null
                              : _markAllPresent,
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
                          dirty = true;
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
            onPressed: loading || saving || !allMarked || !registerReady
                ? null
                : _save,
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

String _teachingContextLabel(JsonMap context) => [
      context['className']?.toString() ?? '',
      context['sectionName']?.toString() ?? '',
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
