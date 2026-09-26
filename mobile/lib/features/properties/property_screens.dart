import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import 'models.dart';
import 'repo.dart';

bool canWrite(WidgetRef ref) => (ref.read(authProvider).user?.roles ?? []).any((r) => r == 'admin' || r == 'employee');

class PropertiesListScreen extends ConsumerStatefulWidget {
  const PropertiesListScreen({super.key});
  @override
  ConsumerState<PropertiesListScreen> createState() => _ListState();
}

class _ListState extends ConsumerState<PropertiesListScreen> {
  String _q = '';
  String? _type;
  late Future<Map<String, dynamic>> _f = _load();
  Future<Map<String, dynamic>> _load() => ref.read(propertiesRepo).list(q: _q, type: _type);
  void _reload() => setState(() => _f = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('العقارات')),
        floatingActionButton: canWrite(ref)
            ? FloatingActionButton.extended(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, icon: const Icon(Icons.add), label: const Text('إضافة عقار'),
                onPressed: () async { await context.push('/properties/new'); _reload(); })
            : null,
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 8), child: TextField(
            decoration: const InputDecoration(hintText: 'ابحث بالاسم أو الكود أو الحي', prefixIcon: Icon(Icons.search)),
            onSubmitted: (v) { _q = v; _reload(); },
          )),
          SizedBox(height: 40, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            for (final e in [const MapEntry<String?, String>(null, 'الكل'), ...propertyTypes.entries.map((e) => MapEntry<String?, String>(e.key, e.value))])
              Padding(padding: const EdgeInsetsDirectional.only(end: 8), child: ChoiceChip(
                label: Text(e.value), selected: _type == e.key, selectedColor: Ramz.emerald, labelStyle: TextStyle(color: _type == e.key ? Colors.white : null),
                onSelected: (_) { _type = e.key; _reload(); },
              )),
          ])),
          Expanded(child: FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _reload);
            if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
            final items = s.data!['items'] as List;
            if (items.isEmpty) return const Center(child: Text('لا توجد عقارات', style: TextStyle(color: Ramz.text2)));
            return RefreshIndicator(onRefresh: () async => _reload(), child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), itemCount: items.length, separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) => _PropertyCard(items[i], onTap: () async { await context.push('/properties/${items[i]['id']}'); _reload(); }),
            ));
          })),
        ]),
      );
}

class _PropertyCard extends StatelessWidget {
  final Map<String, dynamic> p;
  final VoidCallback onTap;
  const _PropertyCard(this.p, {required this.onTap});
  @override
  Widget build(BuildContext context) {
    final st = p['stats'];
    final img = (p['images'] as List).isNotEmpty ? '$apiUrl'.replaceAll('/api', '') + p['images'][0]['url'] : null;
    return Card(clipBehavior: Clip.antiAlias, child: InkWell(onTap: onTap, child: Row(children: [
      Container(width: 92, height: 104, color: Ramz.border,
          child: img != null ? Image.network(img, fit: BoxFit.cover) : const Icon(Icons.apartment, color: Ramz.text2, size: 32)),
      Expanded(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16), overflow: TextOverflow.ellipsis)),
          Text(p['code'], style: Ramz.mono(12, FontWeight.w500).copyWith(color: Ramz.text2)),
        ]),
        const SizedBox(height: 2),
        Text('${propertyTypes[p['type']]} · ${p['city']}${p['district'] != null ? ' · ${p['district']}' : ''}', style: const TextStyle(color: Ramz.text2, fontSize: 13)),
        const SizedBox(height: 10),
        Row(children: [
          Text('${st['rented']}/${st['units']} مؤجرة', style: const TextStyle(fontSize: 12)),
          const Spacer(),
          Text('${st['occupancy']}%', style: Ramz.mono(13, FontWeight.w700).copyWith(color: Ramz.emerald)),
        ]),
        const SizedBox(height: 4),
        ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: (st['occupancy'] as num) / 100, minHeight: 5, color: Ramz.emerald, backgroundColor: Ramz.border)),
      ]))),
    ])));
  }
}

class PropertyDetailScreen extends ConsumerWidget {
  final String id;
  const PropertyDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(propertyDetail(id));
    final write = canWrite(ref);
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل العقار'), actions: [
        if (write) IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () async { await context.push('/properties/$id/edit'); ref.invalidate(propertyDetail(id)); }),
        if (write) IconButton(icon: const Icon(Icons.delete_outline, color: Ramz.red), onPressed: () => _archive(context, ref)),
      ]),
      floatingActionButton: write ? FloatingActionButton.extended(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, icon: const Icon(Icons.add), label: const Text('إضافة وحدة'),
          onPressed: () async { await context.push('/properties/$id/units/new'); ref.invalidate(propertyDetail(id)); }) : null,
      body: a.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Ramz.emerald)),
        error: (e, _) => errorBox(errorText(e), () => ref.invalidate(propertyDetail(id))),
        data: (p) {
          final st = p['stats'], units = p['units'] as List, imgs = p['images'] as List;
          final base = apiUrl.replaceAll('/api', '');
          return ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 96), children: [
            SizedBox(height: 170, child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final im in imgs) Padding(padding: const EdgeInsetsDirectional.only(end: 8), child: ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.network(base + im['url'], width: 260, fit: BoxFit.cover))),
              if (write) InkWell(borderRadius: BorderRadius.circular(18), onTap: () => _pickImages(context, ref), child: Container(width: 120, decoration: BoxDecoration(border: Border.all(color: Ramz.border), borderRadius: BorderRadius.circular(18)),
                  child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.add_photo_alternate_outlined, color: Ramz.emerald), SizedBox(height: 6), Text('إضافة صور', style: TextStyle(fontSize: 13))]))),
              if (!write && imgs.isEmpty) Container(width: 260, decoration: BoxDecoration(color: Ramz.border, borderRadius: BorderRadius.circular(18)), child: const Icon(Icons.apartment, size: 40, color: Ramz.text2)),
            ])),
            const SizedBox(height: 14),
            Row(children: [Expanded(child: Text(p['name'], style: Ramz.display(24))), Text(p['code'], style: Ramz.mono(13).copyWith(color: Ramz.text2))]),
            Text('${propertyTypes[p['type']]} · ${p['city']}${p['district'] != null ? ' · ${p['district']}' : ''}', style: const TextStyle(color: Ramz.text2)),
            const SizedBox(height: 12),
            Row(children: [Stat('الوحدات', '${st['units']}'), Stat('مؤجرة', '${st['rented']}'), Stat('الإشغال', '${st['occupancy']}%', color: Ramz.emerald)]),
            const SizedBox(height: 4),
            Card(child: Column(children: [
              ListTile(leading: const Icon(Icons.person_outline), title: const Text('المالك', style: TextStyle(color: Ramz.text2, fontSize: 13)), subtitle: Text(p['owner']['fullName'], style: const TextStyle(fontWeight: FontWeight.w600))),
              if (p['deedNumber'] != null) ListTile(leading: const Icon(Icons.description_outlined), title: const Text('رقم الصك', style: TextStyle(color: Ramz.text2, fontSize: 13)), subtitle: Text(p['deedNumber'], style: Ramz.mono(14))),
              if (p['latitude'] != null) ListTile(leading: const Icon(Icons.location_on_outlined), title: const Text('الموقع', style: TextStyle(color: Ramz.text2, fontSize: 13)), subtitle: Text('${p['latitude']}, ${p['longitude']}', style: Ramz.mono(13))),
              if ((p['amenities'] as List).isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 12), child: Wrap(spacing: 6, runSpacing: 6, children: [for (final m in p['amenities']) Chip(label: Text(m), visualDensity: VisualDensity.compact)])),
            ])),
            const SizedBox(height: 8),
            const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('الوحدات', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
            if (units.isEmpty) const Text('لا توجد وحدات بعد', style: TextStyle(color: Ramz.text2)),
            for (final u in units) UnitTile(u, onTap: () async { await context.push('/units/${u['id']}'); ref.invalidate(propertyDetail(id)); }),
          ]);
        },
      ),
    );
  }

  Future<void> _pickImages(BuildContext context, WidgetRef ref) async {
    final files = await ImagePicker().pickMultiImage(imageQuality: 85, maxWidth: 2000);
    if (files.isEmpty) return;
    try {
      await ref.read(propertiesRepo).uploadImages(id, files.map((f) => f.path).toList());
      ref.invalidate(propertyDetail(id));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  Future<void> _archive(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('حذف العقار'), content: const Text('سيتم أرشفة العقار وجميع وحداته. لا يمكن حذف عقار به وحدات مؤجرة.'),
      actions: [TextButton(onPressed: () => c.pop(false), child: const Text('إلغاء')), TextButton(onPressed: () => c.pop(true), child: const Text('حذف', style: TextStyle(color: Ramz.red)))],
    ));
    if (ok != true) return;
    try {
      await ref.read(propertiesRepo).archive(id);
      if (context.mounted) context.pop();
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }
}

class UnitTile extends StatelessWidget {
  final Map<String, dynamic> u;
  final VoidCallback onTap;
  final bool showProperty;
  const UnitTile(this.u, {super.key, required this.onTap, this.showProperty = false});
  @override
  Widget build(BuildContext context) => Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
        onTap: onTap,
        leading: Container(width: 40, height: 40, decoration: BoxDecoration(color: Ramz.border, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.door_front_door_outlined, color: Ramz.text2)),
        title: Row(children: [Text(u['number'], style: Ramz.mono(15, FontWeight.w700)), const SizedBox(width: 8), Text(unitTypes[u['type']] ?? '', style: const TextStyle(fontSize: 14))]),
        subtitle: Text('${showProperty ? '${u['property']['name']} · ' : ''}${u['rooms']} غرف · ${u['area']} م² · ${money.format(num.parse('${u['annualRent']}'))} ﷼', style: const TextStyle(color: Ramz.text2, fontSize: 12.5)),
        trailing: StatusPill(u['status']),
      ));
}

class PropertyFormScreen extends ConsumerStatefulWidget {
  final String? id;
  const PropertyFormScreen({super.key, this.id});
  @override
  ConsumerState<PropertyFormScreen> createState() => _FormState();
}

class _FormState extends ConsumerState<PropertyFormScreen> {
  final _form = GlobalKey<FormState>();
  final c = {for (final k in ['code', 'name', 'city', 'district', 'address', 'deedNumber', 'latitude', 'longitude', 'amenities', 'description']) k: TextEditingController()};
  String _type = 'APARTMENT_BUILDING';
  String? _ownerId, _err;
  List<dynamic> _owners = [];
  bool _busy = false, _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final repo = ref.read(propertiesRepo);
    try {
      _owners = await repo.owners();
      if (widget.id != null) {
        final p = await repo.get(widget.id!);
        for (final k in c.keys) {
          final v = p[k];
          c[k]!.text = v == null ? '' : (v is List ? v.join('، ') : '$v');
        }
        _type = p['type'];
        _ownerId = p['ownerId'];
      }
    } catch (e) {
      _err = errorText(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _err = null; });
    String? t(String k) => c[k]!.text.trim().isEmpty ? null : c[k]!.text.trim();
    final d = <String, dynamic>{
      if (widget.id == null) 'code': c['code']!.text.trim().toUpperCase(),
      'name': t('name'), 'type': _type, 'ownerId': _ownerId, 'city': t('city'),
      'district': t('district'), 'address': t('address'), 'deedNumber': t('deedNumber'), 'description': t('description'),
      'latitude': double.tryParse(c['latitude']!.text), 'longitude': double.tryParse(c['longitude']!.text),
      'amenities': c['amenities']!.text.split(RegExp('[،,]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
    }..removeWhere((_, v) => v == null);
    try {
      final repo = ref.read(propertiesRepo);
      widget.id == null ? await repo.create(d) : await repo.update(widget.id!, d);
      if (mounted) context.pop();
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _f(String k, String label, {bool req = false, TextInputType? kb, String? Function(String?)? v, bool enabled = true, int lines = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(controller: c[k], enabled: enabled, keyboardType: kb, maxLines: lines, decoration: InputDecoration(labelText: req ? '$label *' : label),
            validator: v ?? (req ? (x) => (x ?? '').trim().isEmpty ? 'هذا الحقل مطلوب' : null : null)),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.id == null ? 'إضافة عقار' : 'تعديل العقار')),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: Ramz.emerald))
            : Form(key: _form, child: ListView(padding: const EdgeInsets.all(16), children: [
                if (_err != null) Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Ramz.red.withOpacity(.14), borderRadius: BorderRadius.circular(12)),
                    child: Text(_err!, style: const TextStyle(color: Ramz.red, fontWeight: FontWeight.w600))),
                _f('code', 'كود العقار (مثال RYD-001)', req: true, enabled: widget.id == null,
                    v: (x) => RegExp(r'^[A-Za-z]{2,5}-\d{3,6}$').hasMatch((x ?? '').trim()) ? null : 'صيغة الكود غير صحيحة'),
                _f('name', 'اسم العقار', req: true),
                Padding(padding: const EdgeInsets.only(bottom: 12), child: DropdownButtonFormField(value: _type, decoration: const InputDecoration(labelText: 'نوع العقار *'),
                    items: [for (final e in propertyTypes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => _type = v!))),
                Padding(padding: const EdgeInsets.only(bottom: 12), child: DropdownButtonFormField<String>(value: _ownerId, decoration: const InputDecoration(labelText: 'المالك *'),
                    items: [for (final o in _owners) DropdownMenuItem(value: o['id'] as String, child: Text('${o['fullName']} · ${o['nationalId']}'))],
                    validator: (v) => v == null ? 'يجب تحديد المالك' : null, onChanged: (v) => setState(() => _ownerId = v))),
                Row(children: [Expanded(child: _f('city', 'المدينة', req: true)), const SizedBox(width: 10), Expanded(child: _f('district', 'الحي'))]),
                _f('address', 'العنوان الوطني'),
                Row(children: [
                  Expanded(child: _f('latitude', 'خط العرض', kb: const TextInputType.numberWithOptions(decimal: true, signed: true))),
                  const SizedBox(width: 10),
                  Expanded(child: _f('longitude', 'خط الطول', kb: const TextInputType.numberWithOptions(decimal: true, signed: true))),
                ]),
                _f('deedNumber', 'رقم الصك'),
                _f('amenities', 'المرافق (افصل بفاصلة)'),
                _f('description', 'وصف', lines: 3),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : _save, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('حفظ')),
              ])),
      );
}
