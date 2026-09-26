import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../contracts/repo.dart';
import '../maintenance/maintenance_screens.dart' show priorities;

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});
  @override
  ConsumerState<TasksScreen> createState() => _TasksState();
}

class _TasksState extends ConsumerState<TasksScreen> {
  String _scope = 'mine';
  bool _done = false;
  late Future<List<dynamic>> _f = _load();
  bool get _admin => ref.read(authProvider).user?.roles.contains('admin') == true;
  Future<List<dynamic>> _load() async => (await ref.read(dioProvider).get('/tasks', queryParameters: {'scope': _scope, if (_done) 'status': 'DONE'})).data;
  void _reload() => setState(() => _f = _load());
  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _set(Map t, String status) async {
    try { await ref.read(dioProvider).patch('/tasks/${t['id']}', data: {'status': status}); _reload(); } catch (e) { _snack(errorText(e)); }
  }

  Future<void> _create() async {
    final users = (await ref.read(dioProvider).get('/tasks/assignees')).data as List;
    if (!mounted) return;
    final title = TextEditingController(), desc = TextEditingController();
    String? who = ref.read(authProvider).user?.id;
    String prio = 'MEDIUM';
    DateTime? due;
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (c) => StatefulBuilder(builder: (c, set) => Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(c).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('مهمة جديدة', style: Ramz.display(20)), const SizedBox(height: 12),
        TextField(controller: title, decoration: const InputDecoration(labelText: 'العنوان')), const SizedBox(height: 10),
        TextField(controller: desc, maxLines: 2, decoration: const InputDecoration(labelText: 'التفاصيل (اختياري)')), const SizedBox(height: 10),
        DropdownButtonFormField<String>(value: who, decoration: const InputDecoration(labelText: 'المكلَّف'),
            items: [for (final u in users) DropdownMenuItem(value: u['id'] as String, child: Text(u['fullName']))], onChanged: (v) => set(() => who = v)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, children: [for (final p in priorities.entries) ChoiceChip(label: Text(p.value.$1), selected: prio == p.key, showCheckmark: false, selectedColor: p.value.$2.withOpacity(.2), onSelected: (_) => set(() => prio = p.key))]),
        const SizedBox(height: 10),
        OutlinedButton.icon(icon: const Icon(Icons.event), label: Text(due == null ? 'تاريخ الاستحقاق (اختياري)' : ymd(due!.toIso8601String())),
            onPressed: () async { final d = await showDatePicker(context: c, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now()); if (d != null) set(() => due = d); }),
        const SizedBox(height: 14),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('إضافة')),
      ]))));
    if (ok != true) return;
    if (title.text.trim().isEmpty || who == null) return _snack('العنوان والمكلَّف مطلوبان');
    try {
      await ref.read(dioProvider).post('/tasks', data: {'title': title.text.trim(), if (desc.text.trim().isNotEmpty) 'description': desc.text.trim(), 'assigneeId': who, 'priority': prio,
        if (due != null) 'dueAt': DateTime(due!.year, due!.month, due!.day, 17).toUtc().toIso8601String()});
      _reload();
    } catch (e) { _snack(errorText(e)); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('المهام')),
        floatingActionButton: FloatingActionButton(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, onPressed: _create, child: const Icon(Icons.add_task)),
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 8), child: SegmentedButton<String>(showSelectedIcon: false, selected: {_scope}, onSelectionChanged: (v) { _scope = v.first; _reload(); },
            segments: [const ButtonSegment(value: 'mine', label: Text('مهامي')), const ButtonSegment(value: 'created', label: Text('أنشأتُها')), if (_admin) const ButtonSegment(value: 'all', label: Text('الكل'))])),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: SwitchListTile(value: _done, onChanged: (v) { _done = v; _reload(); }, activeColor: Ramz.emerald, dense: true, title: const Text('عرض المنجزة'))),
          Expanded(child: FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _reload);
            if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
            if (s.data!.isEmpty) return Center(child: Text(_done ? 'لا توجد مهام منجزة' : 'لا توجد مهام مفتوحة', style: const TextStyle(color: Ramz.text2)));
            return RefreshIndicator(onRefresh: () async => _reload(), child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 0, 16, 96), itemCount: s.data!.length, itemBuilder: (_, i) {
              final t = s.data![i];
              final done = t['status'] == 'DONE';
              return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                onTap: t['entityType'] == 'CONTRACT' ? () => context.push('/contracts/${t['entityId']}') : t['entityType'] == 'MAINTENANCE' ? () => context.push('/maintenance/${t['entityId']}') : null,
                leading: Checkbox(value: done, activeColor: Ramz.emerald, onChanged: (v) => _set(t, v == true ? 'DONE' : 'TODO')),
                title: Text(t['title'], style: TextStyle(fontWeight: FontWeight.w600, decoration: done ? TextDecoration.lineThrough : null)),
                subtitle: Text([if (t['description'] != null) t['description'], if (_scope != 'mine') t['assignee']['fullName'], if (t['dueAt'] != null) 'حتى ${ymd(t['dueAt'])}'].join(' · '),
                    style: TextStyle(color: t['overdue'] == true ? Ramz.red : Ramz.text2, fontSize: 12)),
                trailing: done ? null : t['status'] == 'TODO'
                    ? IconButton(tooltip: 'بدء', icon: const Icon(Icons.play_circle_outline), onPressed: () => _set(t, 'IN_PROGRESS'))
                    : pill(('جارية', priorities[t['priority']]!.$2)),
              ));
            }));
          })),
        ]),
      );
}
