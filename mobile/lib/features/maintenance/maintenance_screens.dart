import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../contracts/repo.dart';
import '../../core/documents.dart';

class MaintRepo {
  MaintRepo(this.dio);
  final Dio dio;
  Future<List<dynamic>> list({String? status, bool open = false}) async => (await dio.get('/maintenance', queryParameters: {if (status != null) 'status': status, if (open) 'open': 'true'})).data;
  Future<Map<String, dynamic>> get(String id) async => (await dio.get('/maintenance/$id')).data;
  Future<Map<String, dynamic>> stats() async => (await dio.get('/maintenance/stats')).data;
  Future<List<dynamic>> technicians() async => (await dio.get('/maintenance/technicians')).data;
  Future<Map<String, dynamic>> create(Map<String, dynamic> d) async => (await dio.post('/maintenance', data: d)).data;
  Future<void> act(String id, String a, [Map<String, dynamic>? d]) => dio.post('/maintenance/$id/$a', data: d ?? {});
  Future<void> upload(String id, List<PlatformFile> files, String stage) async => dio.post('/maintenance/$id/photos', queryParameters: {'stage': stage},
      data: FormData.fromMap({'files': [for (final f in files) await MultipartFile.fromFile(f.path!, filename: f.name)]}));
  Future<void> removePhoto(String id, String pid) => dio.delete('/maintenance/$id/photos/$pid');
}
final maintRepo = Provider((ref) => MaintRepo(ref.read(dioProvider)));
String fileUrl(String path) => apiUrl.replaceFirst(RegExp(r'/api/?$'), '') + path;
Future<List<PlatformFile>> pickImages() async => (await FilePicker.platform.pickFiles(type: FileType.image, allowMultiple: true))?.files.where((f) => f.path != null).toList() ?? [];

const maintStatus = {
  'NEW': ('جديد', Color(0xFF2BA6B8)), 'ASSIGNED': ('مُسند', Ramz.gold), 'IN_PROGRESS': ('جاري التنفيذ', Ramz.gold), 'WAITING_PARTS': ('بانتظار قطع', Ramz.red),
  'COMPLETED': ('مكتمل · بانتظار التأكيد', Ramz.emerald), 'CLOSED': ('مغلق', Ramz.text2), 'CANCELLED': ('ملغي', Ramz.text2),
};
const maintCategories = {'PLUMBING': ('سباكة', Icons.water_drop_outlined), 'ELECTRICAL': ('كهرباء', Icons.bolt_outlined), 'AC': ('تكييف', Icons.ac_unit), 'CARPENTRY': ('نجارة', Icons.carpenter_outlined),
  'PAINTING': ('دهانات', Icons.format_paint_outlined), 'APPLIANCE': ('أجهزة', Icons.kitchen_outlined), 'CLEANING': ('نظافة', Icons.cleaning_services_outlined), 'OTHER': ('أخرى', Icons.handyman_outlined)};
const priorities = {'LOW': ('منخفضة', Ramz.text2), 'MEDIUM': ('متوسطة', Color(0xFF2BA6B8)), 'HIGH': ('عالية', Ramz.gold), 'URGENT': ('طارئة', Ramz.red)};

List<String> _roles(WidgetRef ref) => ref.read(authProvider).user?.roles ?? [];
bool isStaffUser(WidgetRef ref) => _roles(ref).any((r) => r == 'admin' || r == 'employee');
bool isTechUser(WidgetRef ref) => _roles(ref).contains('technician') && !isStaffUser(ref);
bool isTenantUser(WidgetRef ref) => _roles(ref).contains('tenant') && !isStaffUser(ref);

// ───────── القائمة ─────────
class MaintenanceListScreen extends ConsumerStatefulWidget {
  const MaintenanceListScreen({super.key});
  @override
  ConsumerState<MaintenanceListScreen> createState() => _MListState();
}

class _MListState extends ConsumerState<MaintenanceListScreen> {
  bool _open = true;
  late Future<(Map<String, dynamic>, List<dynamic>)> _f = _load();
  Future<(Map<String, dynamic>, List<dynamic>)> _load() async {
    final r = ref.read(maintRepo);
    final res = await Future.wait([r.stats(), r.list(open: _open)]);
    return (res[0] as Map<String, dynamic>, res[1] as List<dynamic>);
  }
  void _reload() => setState(() => _f = _load());

  Widget _kpi(String l, String v, Color c) => Expanded(child: Card(child: Padding(padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10), child: Column(children: [
        Text(v, style: Ramz.mono(20, FontWeight.w700).copyWith(color: c)), const SizedBox(height: 2), Text(l, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
      ]))));

  @override
  Widget build(BuildContext context) {
    final tech = isTechUser(ref);
    return Scaffold(
      appBar: AppBar(title: Text(tech ? 'أوامر العمل' : 'الصيانة'), actions: [IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () => context.push('/notifications'))]),
      floatingActionButton: tech ? null : FloatingActionButton.extended(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, icon: const Icon(Icons.add), label: const Text('بلاغ جديد'),
          onPressed: () async { await context.push('/maintenance/new'); _reload(); }),
      body: FutureBuilder(future: _f, builder: (c, s) {
        if (s.hasError) return errorBox(errorText(s.error!), _reload);
        if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
        final (st, list) = s.data!;
        final by = (st['byStatus'] as Map).cast<String, dynamic>();
        int n(List<String> k) => k.fold(0, (a, x) => a + ((by[x] ?? 0) as num).toInt());
        return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
          Row(children: [
            _kpi(tech ? 'بانتظار البدء' : 'جديدة', '${n(tech ? ['ASSIGNED'] : ['NEW'])}', const Color(0xFF2BA6B8)), const SizedBox(width: 8),
            _kpi('قيد التنفيذ', '${n(['IN_PROGRESS', 'WAITING_PARTS'])}', Ramz.gold), const SizedBox(width: 8),
            _kpi('متأخرة', '${st['overdue']}', Ramz.red), const SizedBox(width: 8),
            _kpi('التقييم', st['avgRating'] == null ? '—' : '${st['avgRating']}', Ramz.emerald),
          ]),
          const SizedBox(height: 12),
          SegmentedButton<bool>(showSelectedIcon: false, selected: {_open}, onSelectionChanged: (v) { _open = v.first; _reload(); },
              segments: const [ButtonSegment(value: true, label: Text('المفتوحة')), ButtonSegment(value: false, label: Text('الكل'))]),
          const SizedBox(height: 12),
          if (list.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('لا توجد طلبات', textAlign: TextAlign.center, style: TextStyle(color: Ramz.text2))),
          for (final m in list) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
            onTap: () async { await context.push('/maintenance/${m['id']}'); _reload(); },
            leading: CircleAvatar(backgroundColor: priorities[m['priority']]!.$2.withOpacity(.16), child: Icon(maintCategories[m['category']]!.$2, color: priorities[m['priority']]!.$2, size: 20)),
            title: Text(m['title'], style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${m['unit']['property']['name']} · ${m['unit']['number']} · ${m['code']}${m['overdue'] == true ? ' · متأخر' : ''}',
                style: TextStyle(color: m['overdue'] == true ? Ramz.red : Ramz.text2, fontSize: 12)),
            trailing: pill(maintStatus[m['status']]!),
          )),
        ]));
      }),
    );
  }
}

// ───────── بلاغ جديد ─────────
class MaintenanceFormScreen extends ConsumerStatefulWidget {
  const MaintenanceFormScreen({super.key});
  @override
  ConsumerState<MaintenanceFormScreen> createState() => _MFormState();
}

class _MFormState extends ConsumerState<MaintenanceFormScreen> {
  String _cat = 'PLUMBING', _prio = 'MEDIUM';
  String? _unitId;
  final _title = TextEditingController(), _desc = TextEditingController();
  bool _busy = false;
  List<PlatformFile> _photos = [];
  late final bool _staff = isStaffUser(ref);
  late final Future<List<dynamic>> _units = _staff ? ref.read(contractsRepo).units() : Future.value([]);

  Future<void> _submit() async {
    if (_staff && _unitId == null) return _snack('اختر الوحدة');
    if (_title.text.trim().isEmpty || _desc.text.trim().isEmpty) return _snack('أكمل العنوان والوصف');
    setState(() => _busy = true);
    try {
      final r = await ref.read(maintRepo).create({if (_unitId != null) 'unitId': _unitId, 'category': _cat, if (_staff) 'priority': _prio, 'title': _title.text.trim(), 'description': _desc.text.trim()});
      if (_photos.isNotEmpty) await ref.read(maintRepo).upload(r['id'], _photos, 'BEFORE');
      if (mounted) context.pushReplacement('/maintenance/${r['id']}');
    } catch (e) { _snack(errorText(e)); setState(() => _busy = false); }
  }
  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('بلاغ صيانة')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          if (_staff) FutureBuilder(future: _units, builder: (c, s) => DropdownButtonFormField<String>(
            value: _unitId, isExpanded: true, decoration: const InputDecoration(labelText: 'الوحدة'),
            items: [for (final u in (s.data ?? [])) DropdownMenuItem(value: u['id'] as String, child: Text('${u['property']?['name'] ?? ''} · ${u['number']}'))],
            onChanged: (v) => setState(() => _unitId = v))),
          if (_staff) const SizedBox(height: 16),
          const Text('نوع العطل', style: TextStyle(color: Ramz.text2)),
          const SizedBox(height: 8),
          GridView.count(crossAxisCount: 4, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: .95, children: [
            for (final e in maintCategories.entries) InkWell(borderRadius: BorderRadius.circular(14), onTap: () => setState(() => _cat = e.key), child: Container(
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: _cat == e.key ? Ramz.emerald : Ramz.border, width: _cat == e.key ? 1.5 : 1),
                  color: _cat == e.key ? Ramz.emerald.withOpacity(.12) : null),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(e.value.$2, color: _cat == e.key ? Ramz.emerald : Ramz.text2), const SizedBox(height: 4), Text(e.value.$1, style: const TextStyle(fontSize: 12))]))),
          ]),
          if (_staff) ...[
            const SizedBox(height: 16),
            const Text('الأولوية', style: TextStyle(color: Ramz.text2)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [for (final p in priorities.entries) ChoiceChip(label: Text(p.value.$1), selected: _prio == p.key, showCheckmark: false, selectedColor: p.value.$2.withOpacity(.2), onSelected: (_) => setState(() => _prio = p.key))]),
          ],
          const SizedBox(height: 16),
          TextField(controller: _title, maxLength: 120, decoration: const InputDecoration(labelText: 'عنوان المشكلة')),
          const SizedBox(height: 8),
          TextField(controller: _desc, maxLines: 4, decoration: const InputDecoration(labelText: 'الوصف', alignLabelWithHint: true)),
          const SizedBox(height: 12),
          OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), icon: const Icon(Icons.add_a_photo_outlined),
            label: Text(_photos.isEmpty ? 'إرفاق صور العطل (اختياري)' : '${_photos.length} صور مرفقة'),
            onPressed: () async { final p = await pickImages(); if (p.isNotEmpty) setState(() => _photos = [..._photos, ...p].take(10).toList()); }),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _submit, child: const Text('إرسال البلاغ')),
        ]),
      );
}

// ───────── التفاصيل / أمر العمل ─────────
class MaintenanceDetailScreen extends ConsumerStatefulWidget {
  const MaintenanceDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<MaintenanceDetailScreen> createState() => _MDetailState();
}

class _MDetailState extends ConsumerState<MaintenanceDetailScreen> {
  late Future<Map<String, dynamic>> _f = ref.read(maintRepo).get(widget.id);
  bool _busy = false;
  void _reload() => setState(() => _f = ref.read(maintRepo).get(widget.id));
  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _do(String a, [Map<String, dynamic>? d]) async {
    setState(() => _busy = true);
    try { await ref.read(maintRepo).act(widget.id, a, d); _reload(); } catch (e) { _snack(errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }

  Future<String?> _ask(String title, String hint) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: Text(title),
      content: TextField(controller: ctl, maxLines: 3, decoration: InputDecoration(hintText: hint)),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('تأكيد'))]));
    return ok == true && ctl.text.trim().isNotEmpty ? ctl.text.trim() : null;
  }

  Future<void> _assign(Map m) async {
    final techs = await ref.read(maintRepo).technicians();
    if (!mounted) return;
    String? tid = m['technicianId'];
    DateTime? when;
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (c) => StatefulBuilder(builder: (c, set) => Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('إسناد لفني', style: Ramz.display(20)), const SizedBox(height: 12),
      for (final t in techs) RadioListTile<String>(value: t['id'], groupValue: tid, onChanged: (v) => set(() => tid = v), activeColor: Ramz.emerald,
          title: Text(t['fullName']), subtitle: Text('${t['_count']['workOrders']} أوامر مفتوحة', style: const TextStyle(color: Ramz.text2, fontSize: 12))),
      OutlinedButton.icon(icon: const Icon(Icons.event), label: Text(when == null ? 'موعد الزيارة (اختياري)' : ymd(when!.toIso8601String())),
          onPressed: () async { final d = await showDatePicker(context: c, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 60)), initialDate: DateTime.now()); if (d != null) set(() => when = d); }),
      const SizedBox(height: 12),
      FilledButton(onPressed: tid == null ? null : () => Navigator.pop(c, true), child: const Text('إسناد')),
    ]))));
    if (ok == true && tid != null) await _do('assign', {'technicianId': tid, if (when != null) 'scheduledAt': when!.toUtc().toIso8601String()});
  }

  Future<void> _complete() async {
    final rep = TextEditingController(), cost = TextEditingController();
    String charge = 'OWNER';
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (c) => StatefulBuilder(builder: (c, set) => Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(c).viewInsets.bottom), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('إنهاء أمر العمل', style: Ramz.display(20)), const SizedBox(height: 12),
      TextField(controller: rep, maxLines: 3, decoration: const InputDecoration(labelText: 'تقرير العمل المنجز')), const SizedBox(height: 12),
      TextField(controller: cost, keyboardType: TextInputType.number, style: Ramz.mono(15), decoration: const InputDecoration(labelText: 'التكلفة', suffixText: '﷼')), const SizedBox(height: 12),
      SegmentedButton<String>(showSelectedIcon: false, selected: {charge}, onSelectionChanged: (v) => set(() => charge = v.first),
          segments: const [ButtonSegment(value: 'OWNER', label: Text('على المالك')), ButtonSegment(value: 'TENANT', label: Text('على المستأجر')), ButtonSegment(value: 'NONE', label: Text('بدون'))]),
      const SizedBox(height: 16),
      FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('تم الإنجاز')),
    ]))));
    if (ok != true) return;
    if (rep.text.trim().isEmpty) return _snack('تقرير العمل مطلوب');
    await _do('complete', {'workReport': rep.text.trim(), 'cost': num.tryParse(cost.text) ?? 0, 'chargeTo': charge});
  }

  Future<void> _close() async {
    int rating = 5;
    final comment = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => StatefulBuilder(builder: (c, set) => AlertDialog(
      title: const Text('تأكيد الإنجاز وتقييم الخدمة'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (var i = 1; i <= 5; i++) IconButton(onPressed: () => set(() => rating = i), icon: Icon(i <= rating ? Icons.star : Icons.star_border, color: Ramz.gold, size: 32))]),
        TextField(controller: comment, decoration: const InputDecoration(hintText: 'تعليق (اختياري)')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('إغلاق الطلب'))],
    )));
    if (ok == true) await _do('close', {'rating': rating, if (comment.text.trim().isNotEmpty) 'ratingComment': comment.text.trim()});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('طلب الصيانة'), actions: [PrintButton(type: 'maintRequest', id: widget.id)]),
        body: FutureBuilder(future: _f, builder: (c, s) {
          if (s.hasError) return errorBox(errorText(s.error!), _reload);
          if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
          final m = s.data!;
          final st = m['status'] as String;
          final staff = isStaffUser(ref), tech = isTechUser(ref), tenant = isTenantUser(ref);
          final mine = tech && m['technicianId'] == ref.read(authProvider).user?.id;
          final actions = <Widget>[
            if (staff && (st == 'NEW' || st == 'ASSIGNED')) FilledButton.icon(onPressed: _busy ? null : () => _assign(m), icon: const Icon(Icons.engineering_outlined), label: Text(st == 'NEW' ? 'إسناد لفني' : 'تغيير الفني')),
            if ((mine || ref.read(authProvider).user?.roles.contains('admin') == true) && (st == 'ASSIGNED' || st == 'WAITING_PARTS')) FilledButton.icon(onPressed: _busy ? null : () => _do('start'), icon: const Icon(Icons.play_arrow), label: Text(st == 'ASSIGNED' ? 'بدء العمل' : 'استئناف')),
            if (mine && st == 'IN_PROGRESS') OutlinedButton.icon(onPressed: _busy ? null : () async { final p = await _ask('طلب قطع غيار', 'القطع المطلوبة'); if (p != null) _do('parts', {'partsNote': p}); }, icon: const Icon(Icons.inventory_2_outlined), label: const Text('بانتظار قطع')),
            if (mine && st == 'IN_PROGRESS') FilledButton.icon(onPressed: _busy ? null : _complete, icon: const Icon(Icons.task_alt), label: const Text('إنهاء العمل')),
            if ((tenant || staff) && st == 'COMPLETED') FilledButton.icon(onPressed: _busy ? null : _close, icon: const Icon(Icons.verified_outlined), label: const Text('تأكيد وتقييم')),
            if ((tenant || staff) && st == 'COMPLETED') OutlinedButton(onPressed: _busy ? null : () async { final r = await _ask('إعادة فتح الطلب', 'ما المشكلة المتبقية؟'); if (r != null) _do('reopen', {'reason': r}); }, child: const Text('لم تُحل')),
            if ((tenant || staff) && (st == 'NEW' || st == 'ASSIGNED')) TextButton(style: TextButton.styleFrom(foregroundColor: Ramz.red), onPressed: _busy ? null : () async { final r = await _ask('إلغاء الطلب', 'السبب'); if (r != null) _do('cancel', {'reason': r}); }, child: const Text('إلغاء الطلب')),
          ];
          return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.all(16), children: [
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Text(m['code'], style: Ramz.mono(13).copyWith(color: Ramz.text2)), const Spacer(), pill(maintStatus[st]!)]),
              const SizedBox(height: 8),
              Text(m['title'], style: Ramz.display(20)),
              const SizedBox(height: 6),
              Text(m['description'], style: const TextStyle(color: Ramz.text2)),
              const SizedBox(height: 12),
              Wrap(spacing: 6, runSpacing: 6, children: [pill((maintCategories[m['category']]!.$1, Ramz.text2)), pill(('أولوية ${priorities[m['priority']]!.$1}', priorities[m['priority']]!.$2)), if (m['overdue'] == true) pill(('تجاوز المهلة', Ramz.red))]),
              const Divider(height: 28),
              _kv('الموقع', '${m['unit']['property']['name']} · ${m['unit']['number']}'),
              if (m['tenant'] != null) _kv('المستأجر', '${m['tenant']['fullName']} · ${m['tenant']['phone']}'),
              _kv('الفني', m['technician']?['fullName'] ?? 'لم يُسند'),
              if (m['scheduledAt'] != null) _kv('موعد الزيارة', ymd(m['scheduledAt'])),
              _kv('المهلة', ymd(m['dueAt'])),
              if (m['partsNote'] != null && st == 'WAITING_PARTS') _kv('القطع', m['partsNote']),
              if (m['workReport'] != null) _kv('التقرير', m['workReport']),
              if (num.parse('${m['cost']}') > 0) _kv('التكلفة', sar(m['cost'])),
              if (m['rating'] != null) _kv('التقييم', '${'★' * (m['rating'] as int)}${m['ratingComment'] != null ? ' · ${m['ratingComment']}' : ''}'),
            ]))),
            if (actions.isNotEmpty) ...[const SizedBox(height: 12), Wrap(spacing: 8, runSpacing: 8, children: actions)],
            const SizedBox(height: 20),
            Row(children: [
              Text('الصور (${(m['photos'] as List).length})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)), const Spacer(),
              if (st != 'CLOSED' && st != 'CANCELLED' && (mine || staff || (tenant && (st == 'NEW' || st == 'ASSIGNED'))))
                TextButton.icon(icon: const Icon(Icons.add_a_photo_outlined), label: Text(tech ? 'بعد الإصلاح' : 'إضافة'), onPressed: _busy ? null : () async {
                  final p = await pickImages(); if (p.isEmpty) return;
                  setState(() => _busy = true);
                  try { await ref.read(maintRepo).upload(widget.id, p, tech ? 'AFTER' : 'BEFORE'); _reload(); } catch (e) { _snack(errorText(e)); }
                  if (mounted) setState(() => _busy = false);
                }),
            ]),
            if ((m['photos'] as List).isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('لا توجد صور', style: TextStyle(color: Ramz.text2))),
            if ((m['photos'] as List).isNotEmpty) SizedBox(height: 110, child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final ph in m['photos']) Padding(padding: const EdgeInsetsDirectional.only(end: 8), child: GestureDetector(
                onTap: () => showDialog(context: context, builder: (_) => Dialog(child: InteractiveViewer(child: Image.network(fileUrl(ph['url']))))),
                onLongPress: ph['uploadedBy'] == ref.read(authProvider).user?.id || staff ? () async { try { await ref.read(maintRepo).removePhoto(widget.id, ph['id']); _reload(); } catch (e) { _snack(errorText(e)); } } : null,
                child: Stack(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(fileUrl(ph['url']), width: 110, height: 110, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(width: 110, height: 110, color: Ramz.border, child: const Icon(Icons.broken_image_outlined, color: Ramz.text2)))),
                  PositionedDirectional(start: 6, top: 6, child: pill(ph['stage'] == 'AFTER' ? ('بعد', Ramz.emerald) : ('قبل', Ramz.gold))),
                ]),
              )),
            ])),
            const SizedBox(height: 20),
            const Text('السجل', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            for (final l in m['log']) Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(margin: const EdgeInsets.only(top: 5), width: 8, height: 8, decoration: BoxDecoration(color: maintStatus[l['to']]!.$2, shape: BoxShape.circle)),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(maintStatus[l['to']]!.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (l['note'] != null) Text(l['note'], style: const TextStyle(color: Ramz.text2, fontSize: 13)),
              ])),
              Text(ymd(l['createdAt']), style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2)),
            ])),
          ]));
        }),
      );

  Widget _kv(String k, String v) => Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 96, child: Text(k, style: const TextStyle(color: Ramz.text2))), Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
      ]));
}
