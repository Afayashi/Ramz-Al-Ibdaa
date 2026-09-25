import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import 'models.dart';
import 'property_screens.dart';
import 'repo.dart';

class UnitsListScreen extends ConsumerStatefulWidget {
  const UnitsListScreen({super.key});
  @override
  ConsumerState<UnitsListScreen> createState() => _UnitsState();
}

class _UnitsState extends ConsumerState<UnitsListScreen> {
  String? _status;
  late Future<List<dynamic>> _f = _load();
  Future<List<dynamic>> _load() => ref.read(propertiesRepo).units(status: _status);
  void _reload() => setState(() => _f = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('الوحدات')),
        body: Column(children: [
          SizedBox(height: 44, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            for (final e in [const MapEntry<String?, String>(null, 'الكل'), ...unitStatus.entries.map((e) => MapEntry<String?, String>(e.key, e.value))])
              Padding(padding: const EdgeInsetsDirectional.only(end: 8), child: ChoiceChip(
                label: Text(e.value), selected: _status == e.key, selectedColor: Ramz.emerald, labelStyle: TextStyle(color: _status == e.key ? Colors.white : null),
                onSelected: (_) { _status = e.key; _reload(); },
              )),
          ])),
          Expanded(child: FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _reload);
            if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
            final items = s.data!;
            final counts = {for (final k in unitStatus.keys) k: items.where((u) => u['status'] == k).length};
            if (items.isEmpty) return const Center(child: Text('لا توجد وحدات', style: TextStyle(color: Ramz.text2)));
            return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.all(16), children: [
              if (_status == null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
                Stat('متاحة', '${counts['AVAILABLE']}', color: Ramz.emerald), Stat('مؤجرة', '${counts['RENTED']}'), Stat('صيانة', '${counts['MAINTENANCE']}', color: Ramz.red),
              ])),
              for (final u in items) UnitTile(u, showProperty: true, onTap: () async { await context.push('/units/${u['id']}'); _reload(); }),
            ]));
          })),
        ]),
      );
}

class UnitDetailScreen extends ConsumerWidget {
  final String id;
  const UnitDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(unitDetail(id));
    final write = canWrite(ref);
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الوحدة'), actions: [
        if (write) IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () async { await context.push('/units/$id/edit'); ref.invalidate(unitDetail(id)); }),
        if (write) IconButton(icon: const Icon(Icons.delete_outline, color: Ramz.red), onPressed: () => _archive(context, ref)),
      ]),
      body: a.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Ramz.emerald)),
        error: (e, _) => errorBox(errorText(e), () => ref.invalidate(unitDetail(id))),
        data: (u) {
          Widget kv(String k, String v, {bool mono = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Row(children: [
                Text(k, style: const TextStyle(color: Ramz.text2)), const Spacer(), Text(v, style: mono ? Ramz.mono(14) : const TextStyle(fontWeight: FontWeight.w600)),
              ]));
          final next = manualTransitions[u['status']] ?? [];
          return ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [Text(u['number'], style: Ramz.display(28)), const SizedBox(width: 10), StatusPill(u['status'])]),
            Text('${unitTypes[u['type']]} · ${u['property']['name']}', style: const TextStyle(color: Ramz.text2)),
            const SizedBox(height: 14),
            Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
              kv('الإيجار السنوي', '${money.format(num.parse('${u['annualRent']}'))} ﷼', mono: true),
              const Divider(height: 1), kv('المساحة', '${u['area']} م²', mono: true),
              const Divider(height: 1), kv('الغرف', '${u['rooms']}', mono: true),
              const Divider(height: 1), kv('دورات المياه', '${u['bathrooms']}', mono: true),
              if (u['floor'] != null) ...[const Divider(height: 1), kv('الدور', '${u['floor']}', mono: true)],
            ]))),
            if (write && next.isNotEmpty) ...[
              const Padding(padding: EdgeInsets.fromLTRB(4, 16, 4, 8), child: Text('تغيير الحالة', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              Wrap(spacing: 8, children: [for (final s in next) OutlinedButton(onPressed: () => _changeStatus(context, ref, s), child: Text(unitStatus[s]!))]),
              if (u['status'] == 'RENTED') const Padding(padding: EdgeInsets.only(top: 6), child: Text('حالة «مؤجرة» تُدار من العقد', style: TextStyle(color: Ramz.text2, fontSize: 12))),
            ],
            if ((u['statusLog'] as List).isNotEmpty) ...[
              const Padding(padding: EdgeInsets.fromLTRB(4, 16, 4, 8), child: Text('سجل الحالات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              for (final l in u['statusLog']) ListTile(dense: true, leading: const Icon(Icons.history, size: 18),
                  title: Text('${unitStatus[l['from']]} ← ${unitStatus[l['to']]}'), subtitle: Text(l['reason'] ?? ''),
                  trailing: Text(l['createdAt'].toString().substring(0, 10), style: Ramz.mono(12, FontWeight.w400))),
            ],
          ]);
        },
      ),
    );
  }

  Future<void> _changeStatus(BuildContext context, WidgetRef ref, String status) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: Text('تغيير الحالة إلى «${unitStatus[status]}»'),
      content: TextField(controller: reason, decoration: const InputDecoration(labelText: 'السبب (اختياري)')),
      actions: [TextButton(onPressed: () => c.pop(false), child: const Text('إلغاء')), FilledButton(onPressed: () => c.pop(true), child: const Text('تأكيد'))],
    ));
    if (ok != true) return;
    try {
      await ref.read(propertiesRepo).setStatus(id, status, reason.text);
      ref.invalidate(unitDetail(id));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  Future<void> _archive(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(propertiesRepo).archiveUnit(id);
      if (context.mounted) context.pop();
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));   // TC-UNIT-002
    }
  }
}

class UnitFormScreen extends ConsumerStatefulWidget {
  final String? propertyId, unitId;
  const UnitFormScreen({super.key, this.propertyId, this.unitId});
  @override
  ConsumerState<UnitFormScreen> createState() => _UnitFormState();
}

class _UnitFormState extends ConsumerState<UnitFormScreen> {
  final _form = GlobalKey<FormState>();
  final c = {for (final k in ['number', 'floor', 'area', 'rooms', 'bathrooms', 'annualRent', 'notes']) k: TextEditingController()};
  String _type = 'APARTMENT';
  String? _err;
  bool _busy = false, _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.unitId != null) {
      _loading = true;
      ref.read(propertiesRepo).unit(widget.unitId!).then((u) {
        for (final k in c.keys) c[k]!.text = u[k] == null ? '' : '${u[k]}';
        setState(() { _type = u['type']; _loading = false; });
      });
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _err = null; });
    final d = <String, dynamic>{
      'number': c['number']!.text.trim(), 'type': _type,
      'floor': int.tryParse(c['floor']!.text), 'area': double.parse(c['area']!.text),
      'rooms': int.parse(c['rooms']!.text), 'bathrooms': int.parse(c['bathrooms']!.text),
      'annualRent': double.parse(c['annualRent']!.text), 'notes': c['notes']!.text.trim().isEmpty ? null : c['notes']!.text.trim(),
    }..removeWhere((_, v) => v == null);
    try {
      final repo = ref.read(propertiesRepo);
      widget.unitId == null ? await repo.createUnit({...d, 'propertyId': widget.propertyId}) : await repo.updateUnit(widget.unitId!, d);
      if (mounted) context.pop();
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _f(String k, String label, {bool req = true, bool num = true, bool positive = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(controller: c[k], keyboardType: num ? const TextInputType.numberWithOptions(decimal: true) : null, decoration: InputDecoration(labelText: req ? '$label *' : label),
            validator: (x) {
              final s = (x ?? '').trim();
              if (req && s.isEmpty) return 'هذا الحقل مطلوب';
              if (num && s.isNotEmpty && double.tryParse(s) == null) return 'قيمة رقمية غير صحيحة';
              if (positive && (double.tryParse(s) ?? 0) <= 0) return 'يجب أن تكون أكبر من صفر';
              return null;
            }),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.unitId == null ? 'إضافة وحدة' : 'تعديل الوحدة')),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: Ramz.emerald))
            : Form(key: _form, child: ListView(padding: const EdgeInsets.all(16), children: [
                if (_err != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_err!, style: const TextStyle(color: Ramz.red, fontWeight: FontWeight.w600))),
                Row(children: [Expanded(child: _f('number', 'رقم الوحدة', num: false)), const SizedBox(width: 10), Expanded(child: _f('floor', 'الدور', req: false))]),
                Padding(padding: const EdgeInsets.only(bottom: 12), child: DropdownButtonFormField(value: _type, decoration: const InputDecoration(labelText: 'نوع الوحدة *'),
                    items: [for (final e in unitTypes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => _type = v!))),
                _f('area', 'المساحة م²', positive: true),
                Row(children: [Expanded(child: _f('rooms', 'الغرف')), const SizedBox(width: 10), Expanded(child: _f('bathrooms', 'دورات المياه'))]),
                _f('annualRent', 'الإيجار السنوي ﷼', positive: true),
                _f('notes', 'ملاحظات', req: false, num: false),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : _save, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('حفظ')),
              ])),
      );
}
