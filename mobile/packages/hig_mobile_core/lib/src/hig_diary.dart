part of '../hig_mobile_core.dart';

class HigDiaryPage extends StatefulWidget {
  const HigDiaryPage({super.key, required this.api, required this.role});
  final HigMobileApi api;
  final String role;
  @override
  State<HigDiaryPage> createState() => _HigDiaryPageState();
}

class _HigDiaryPageState extends State<HigDiaryPage> {
  DateTime date = DateTime.now();
  List<JsonMap> records = [];
  bool loading = true, busy = false;
  bool offline = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
      records = [];
    });
    try {
      final value = await widget.api.diary(_mobileIsoDate(date));
      if (mounted) {
        setState(() {
          records = ((value['records'] as List?) ?? [])
              .map((r) => (r as Map).cast<String, dynamic>())
              .toList();
          loading = false;
          offline = value['offline'] == true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = widget.role == 'school'
              ? 'Homework could not be loaded. Please retry.'
              : 'Diary could not be loaded. Please retry.';
        });
      }
    }
  }

  Future<void> chooseDate() async {
    final chosen = await showDatePicker(
        context: context,
        initialDate: date,
        firstDate: DateTime(2020),
        lastDate: DateTime.now().add(const Duration(days: 365)));
    if (chosen != null && mounted) {
      setState(() => date = chosen);
      await load();
    }
  }

  Future<void> complete(JsonMap record, bool value) async {
    setState(() => busy = true);
    try {
      await widget.api.diaryUpdate({
        'action': 'complete',
        'diaryId': record['id'],
        'studentId': record['studentId'],
        'completed': value
      });
      await load();
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Could not update completion. Please retry.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> create() async {
    setState(() => busy = true);
    try {
      final response = await widget.api.teachingContexts();
      final contexts = ((response['contexts'] as List?) ?? [])
          .map((r) => (r as Map).cast<String, dynamic>())
          .where((r) => r['kind'] == 'subject_teacher')
          .toList();
      if (!mounted) return;
      if (contexts.isEmpty) {
        setState(() => error =
            'Ask your school administrator to assign your subjects before adding homework.');
        return;
      }
      final title = TextEditingController(),
          description = TextEditingController();
      String selected = contexts.first['id'].toString();
      DateTime due = date;
      final form = GlobalKey<FormState>();
      final diaryId = _uuid.v4();
      bool publishing = false;
      String? formError;
      final input = await showDialog<JsonMap>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => StatefulBuilder(
              builder: (dialogContext, update) => PopScope(
                  canPop: !publishing,
                  child: AlertDialog(
                    title: const Text('Add homework'),
                    content: SizedBox(
                        width: 420,
                        child: SingleChildScrollView(
                            child: Form(
                                key: form,
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      DropdownButtonFormField<String>(
                                          initialValue: selected,
                                          isExpanded: true,
                                          decoration: const InputDecoration(
                                              labelText: 'Class and subject'),
                                          items: contexts
                                              .map((c) => DropdownMenuItem(
                                                  value: c['id'].toString(),
                                                  child: Text(
                                                      '${c['className']} ${c['sectionName']} · ${c['subjectName']}',
                                                      overflow: TextOverflow
                                                          .ellipsis)))
                                              .toList(),
                                          onChanged: publishing
                                              ? null
                                              : (v) {
                                                  if (v != null) selected = v;
                                                }),
                                      TextFormField(
                                          controller: title,
                                          enabled: !publishing,
                                          maxLength: 140,
                                          decoration: const InputDecoration(
                                              labelText: 'Homework title'),
                                          validator: (v) =>
                                              (v?.trim().length ?? 0) < 2
                                                  ? 'Enter a title'
                                                  : null),
                                      TextFormField(
                                          controller: description,
                                          enabled: !publishing,
                                          maxLength: 4000,
                                          maxLines: 4,
                                          decoration: const InputDecoration(
                                              labelText: 'Instructions'),
                                          validator: (v) =>
                                              (v?.trim().length ?? 0) < 2
                                                  ? 'Enter instructions'
                                                  : null),
                                      ListTile(
                                          title: const Text('Due date'),
                                          subtitle: Text(_formatMobileDate(
                                              _mobileIsoDate(due))),
                                          trailing:
                                              const Icon(Icons.calendar_month),
                                          onTap: publishing
                                              ? null
                                              : () async {
                                                  final next =
                                                      await showDatePicker(
                                                          context:
                                                              dialogContext,
                                                          initialDate: due,
                                                          firstDate: date,
                                                          lastDate: date.add(
                                                              const Duration(
                                                                  days: 365)));
                                                  if (next != null) {
                                                    update(() => due = next);
                                                  }
                                                }),
                                      if (formError != null)
                                        Text(formError!,
                                            style: TextStyle(
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .error)),
                                    ])))),
                    actions: [
                      TextButton(
                          onPressed: publishing
                              ? null
                              : () => Navigator.pop(dialogContext),
                          child: const Text('Cancel')),
                      FilledButton(
                          onPressed: publishing
                              ? null
                              : () async {
                                  if (form.currentState!.validate()) {
                                    update(() {
                                      publishing = true;
                                      formError = null;
                                    });
                                    try {
                                      await widget.api.diaryUpdate({
                                        'action': 'create',
                                        'id': diaryId,
                                        'assignmentId': selected,
                                        'title': title.text.trim(),
                                        'description': description.text.trim(),
                                        'date': _mobileIsoDate(date),
                                        'dueDate': _mobileIsoDate(due)
                                      });
                                      if (dialogContext.mounted) {
                                        Navigator.pop(
                                            dialogContext, {'saved': true});
                                      }
                                    } catch (_) {
                                      if (dialogContext.mounted) {
                                        update(() {
                                          publishing = false;
                                          formError =
                                              'Could not confirm publication. Your text is retained. Retry without changing it.';
                                        });
                                      }
                                    }
                                  }
                                },
                          child: Text(publishing ? 'Publishing…' : 'Publish'))
                    ],
                  ))));
      // Dialog transition must complete before disposing its controllers.
      await Future<void>.delayed(const Duration(milliseconds: 300));
      title.dispose();
      description.dispose();
      if (input != null) {
        await load();
      }
    } catch (_) {
      if (mounted) {
        setState(
            () => error = 'Homework could not be published. Please retry.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title: Text(widget.role == 'school' ? 'Homework' : 'School diary')),
        body: Column(children: [
          Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                IconButton(
                    tooltip: 'Previous day',
                    onPressed: loading || busy
                        ? null
                        : () {
                            setState(() =>
                                date = date.subtract(const Duration(days: 1)));
                            load();
                          },
                    icon: const Icon(Icons.chevron_left)),
                Expanded(
                    child: TextButton.icon(
                        onPressed: loading || busy ? null : chooseDate,
                        icon: const Icon(Icons.calendar_month),
                        label: Text(_formatMobileDate(_mobileIsoDate(date))))),
                IconButton(
                    tooltip: 'Next day',
                    onPressed: loading || busy
                        ? null
                        : () {
                            setState(
                                () => date = date.add(const Duration(days: 1)));
                            load();
                          },
                    icon: const Icon(Icons.chevron_right)),
              ])),
          Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: load,
                      child: ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                          children: [
                            if (error != null)
                              Card(
                                  child: ListTile(
                                      title: Text(error!),
                                      trailing: IconButton(
                                          onPressed: load,
                                          icon: const Icon(Icons.refresh)))),
                            if (offline)
                              const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: Text(
                                      'Saved diary. Reconnect to update completion.')),
                            if (records.isEmpty && error == null)
                              Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Text(widget.role == 'school'
                                      ? 'No homework published for this date.'
                                      : 'No homework assigned for this date. Choose another day to view its diary.')),
                            for (final record in records)
                              Card(
                                  child: Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                                '${record['subjectName']} · ${record['className']} ${record['sectionName']}',
                                                style: TextStyle(
                                                    color: Theme.of(context)
                                                        .colorScheme
                                                        .primary,
                                                    fontWeight:
                                                        FontWeight.w700)),
                                            const SizedBox(height: 8),
                                            Text(record['title'].toString(),
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleLarge),
                                            const SizedBox(height: 8),
                                            Text(record['description']
                                                .toString()),
                                            const SizedBox(height: 12),
                                            Text(
                                                'Due ${_formatMobileDate(record['dueDate'].toString())}'),
                                            if (record['studentName'] != null)
                                              Text(
                                                  'For ${record['studentName']}'),
                                            if (widget.role == 'parent')
                                              CheckboxListTile(
                                                  contentPadding:
                                                      EdgeInsets.zero,
                                                  title: const Text(
                                                      'Completed at home'),
                                                  value: record['completed'] ==
                                                      true,
                                                  onChanged: busy || offline
                                                      ? null
                                                      : (v) => complete(
                                                          record, v == true)),
                                          ]))),
                          ]))),
        ]),
        floatingActionButton: widget.role == 'school'
            ? FloatingActionButton.extended(
                onPressed: busy ? null : create,
                icon: const Icon(Icons.add),
                label: const Text('Add homework'))
            : null,
      );
}
