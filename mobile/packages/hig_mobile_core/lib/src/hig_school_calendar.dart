part of '../hig_mobile_core.dart';

class HigSchoolCalendarPage extends StatefulWidget {
  const HigSchoolCalendarPage(
      {super.key, required this.api, required this.features});
  final HigMobileApi api;
  final List<JsonMap> features;

  @override
  State<HigSchoolCalendarPage> createState() => _HigSchoolCalendarPageState();
}

class _HigSchoolCalendarPageState extends State<HigSchoolCalendarPage> {
  DateTime month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime selected = DateTime.now();
  List<JsonMap> events = const [];
  bool loading = true;
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
    });
    final allowed =
        widget.features.map((item) => item['key']?.toString()).toSet();
    final keys = ['school_events', 'examinations', 'ptm_meetings']
        .where(allowed.contains);
    final next = <JsonMap>[];
    var saved = false;
    try {
      for (final key in keys) {
        final response = await widget.api.content(featureKey: key);
        saved = saved || response['offline'] == true;
        final records =
            ((response['content'] as Map?)?['records'] as List?) ?? const [];
        for (final raw in records) {
          final record = (raw as Map).cast<String, dynamic>();
          final workflow = record['workflow']?.toString().toLowerCase() ?? '';
          if (key == 'school_events' &&
              !RegExp(r'event|calendar|holiday|celebration').hasMatch(workflow))
            continue;
          if (DateTime.tryParse(record['recordDate']?.toString() ?? '') ==
                  null ||
              record['status'] == 'cancelled') continue;
          if (!next.any((entry) => entry['id'] == record['id'])) {
            next.add({...record, 'source': key});
          }
        }
      }
      next.sort((a, b) =>
          a['recordDate'].toString().compareTo(b['recordDate'].toString()));
      if (mounted)
        setState(() {
          events = next;
          offline = saved;
          loading = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          loading = false;
          error = 'School calendar could not be loaded. Please retry.';
        });
    }
  }

  List<JsonMap> eventsOn(DateTime day) {
    final date = _mobileIsoDate(day);
    return events.where((event) {
      final first = event['recordDate']?.toString() ?? '';
      final last = event['dueDate']?.toString() ?? '';
      return first == date ||
          (last.isNotEmpty &&
              first.compareTo(date) <= 0 &&
              last.compareTo(date) >= 0);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final firstWeekday = DateTime(month.year, month.month, 1).weekday % 7;
    final days = DateTime(month.year, month.month + 1, 0).day;
    final selectedEvents = eventsOn(selected);
    return Scaffold(
      appBar: AppBar(title: const Text('School calendar')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            if (offline)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text('Saved calendar · Connect and refresh for updates'),
              ),
            Row(children: [
              IconButton(
                tooltip: 'Previous month',
                onPressed: () => setState(() {
                  month = DateTime(month.year, month.month - 1);
                  selected = month;
                }),
                icon: const Icon(Icons.chevron_left),
              ),
              Expanded(
                  child: Text(
                _calendarMonthName(month.month) + ' ' + month.year.toString(),
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              )),
              IconButton(
                tooltip: 'Next month',
                onPressed: () => setState(() {
                  month = DateTime(month.year, month.month + 1);
                  selected = month;
                }),
                icon: const Icon(Icons.chevron_right),
              ),
            ]),
            Row(children: [
              for (final label in [
                'Sun',
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat'
              ])
                Expanded(
                    child: Center(
                        child: Text(label,
                            style: const TextStyle(color: HigPalette.muted)))),
            ]),
            const SizedBox(height: 8),
            for (var week = 0; week < ((firstWeekday + days + 6) ~/ 7); week++)
              Row(children: [
                for (var column = 0; column < 7; column++)
                  Expanded(child: Builder(builder: (context) {
                    final number = week * 7 + column - firstWeekday + 1;
                    if (number < 1 || number > days)
                      return const SizedBox(height: 56);
                    final day = DateTime(month.year, month.month, number);
                    final active =
                        _mobileIsoDate(day) == _mobileIsoDate(selected);
                    final count = eventsOn(day).length;
                    return Semantics(
                      label: _formatMobileDate(_mobileIsoDate(day)) +
                          ', ' +
                          count.toString() +
                          ' events',
                      button: true,
                      child: InkWell(
                        onTap: () => setState(() => selected = day),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          height: 56,
                          margin: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: active
                                ? Theme.of(context).colorScheme.primary
                                : null,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(number.toString(),
                                    style: TextStyle(
                                      color: active
                                          ? Colors.white
                                          : HigPalette.ink,
                                      fontWeight: active
                                          ? FontWeight.w800
                                          : FontWeight.normal,
                                    )),
                                if (count > 0)
                                  Container(
                                    width: 5,
                                    height: 5,
                                    decoration: BoxDecoration(
                                      color: active
                                          ? Colors.white
                                          : HigPalette.blue,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                              ]),
                        ),
                      ),
                    );
                  })),
              ]),
            const SizedBox(height: 18),
            Text(_formatMobileDate(_mobileIsoDate(selected)),
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else if (error != null) ...[
              Text(error!),
              TextButton(onPressed: load, child: const Text('Retry')),
            ] else if (selectedEvents.isEmpty)
              const Card(
                  child: Padding(
                padding: EdgeInsets.all(18),
                child: Text('No school events on this date.'),
              ))
            else
              for (final event in selectedEvents)
                Card(
                    child: ListTile(
                  leading: const Icon(Icons.event_available_outlined),
                  title: Text(event['title']?.toString() ?? 'School event'),
                  subtitle: Text(event['description']?.toString() ?? ''),
                )),
          ],
        ),
      ),
    );
  }
}

String _calendarMonthName(int month) => const [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ][month - 1];
