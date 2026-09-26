import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../properties/models.dart';
import '../properties/property_screens.dart' show canWrite;
import 'repo.dart';

const categories = {'NATIONAL_ID': 'الهوية', 'DEED': 'صك', 'CONTRACT': 'عقد', 'RECEIPT': 'سند', 'REPORT': 'تقرير', 'OTHER': 'أخرى'};

class PartiesScreen extends ConsumerStatefulWidget {
  const PartiesScreen({super.key});
  @override
  ConsumerState<PartiesScreen> createState() => _PartiesState();
}

class _PartiesState extends ConsumerState<PartiesScreen> {
  PartyType _t = PartyType.tenant;
  String _q = '';
  late Future<List<dynamic>> _f = _load();
  Future<List<dynamic>> _load() => ref.read(partiesRepo).list(_t, _q);
  void _reload() => setState(() => _f = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('العملاء')),
        floatingActionButton: canWrite(ref)
            ? FloatingActionButton.extended(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, icon: const Icon(Icons.person_add_alt), label: Text('إضافة ${_t.label}'),
                onPressed: () async { await context.push('/${_t.path}/new'); _reload(); })
            : null,
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 8), child: SegmentedButton<PartyType>(
            segments: [for (final t in PartyType.values) ButtonSegment(value: t, label: Text(t.plural))],
            selected: {_t}, showSelectedIcon: false,
            style: ButtonStyle(backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Ramz.emerald : null)),
            onSelectionChanged: (s) { _t = s.first; _reload(); },
          )),
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: TextField(
            decoration: const InputDecoration(hintText: 'ابحث بالاسم أو الهوية أو الجوال', prefixIcon: Icon(Icons.search)),
            onSubmitted: (v) { _q = v; _reload(); },
          )),
          Expanded(child: FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _reload);
            if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
            final items = s.data!;
            if (items.isEmpty) return Center(child: Text('لا يوجد ${_t.plural}', style: const TextStyle(color: Ramz.text2)));
            return RefreshIndicator(onRefresh: () async => _reload(), child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 96), itemCount: items.length,
              itemBuilder: (_, i) {
                final p = items[i];
                final expiry = p['idExpiry'] != null ? DateTime.tryParse(p['idExpiry']) : null;
                return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                  onTap: () async { await context.push('/${_t.path}/${p['id']}'); _reload(); },
                  leading: CircleAvatar(backgroundColor: Ramz.emerald.withOpacity(.16), child: Text(p['fullName'].toString().characters.first, style: const TextStyle(color: Ramz.emerald, fontWeight: FontWeight.w700))),
                  title: Text(p['fullName'], style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${p['nationalId']} · ${p['phone']}', style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2)),
                  trailing: _t == PartyType.owner
                      ? Text('${p['_count']['properties']} عقار', style: const TextStyle(fontSize: 12, color: Ramz.text2))
                      : (expiry != null && expiry.isBefore(DateTime.now()) ? const Text('هوية منتهية', style: TextStyle(color: Ramz.red, fontSize: 12)) : null),
                ));
              },
            ));
          })),
        ]),
      );
}

class PartyDetailScreen extends ConsumerWidget {
  final PartyType kind;
  final String id;
  const PartyDetailScreen({super.key, required this.kind, required this.id});

  void _snack(BuildContext c, Object e) => ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(errorText(e))));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (kind, id);
    final a = ref.watch(partyDetail(key));
    final write = canWrite(ref);
    final repo = ref.read(partiesRepo);
    refresh() => ref.invalidate(partyDetail(key));
    return Scaffold(
      appBar: AppBar(title: Text('ملف ال${kind.label}'), actions: [
        if (write) IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () async { await context.push('/${kind.path}/$id/edit'); refresh(); }),
        if (write) IconButton(icon: const Icon(Icons.delete_outline, color: Ramz.red), onPressed: () async {
          try { await repo.archive(kind, id); if (context.mounted) context.pop(); } catch (e) { if (context.mounted) _snack(context, e); }
        }),
      ]),
      body: a.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Ramz.emerald)),
        error: (e, _) => errorBox(errorText(e), refresh),
        data: (p) {
          Widget kv(String k, String? v, {bool mono = false, Color? color}) => v == null || v.isEmpty ? const SizedBox.shrink() : Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [Text(k, style: const TextStyle(color: Ramz.text2)), const SizedBox(width: 12),
                  Expanded(child: Text(v, textAlign: TextAlign.end, style: (mono ? Ramz.mono(14) : const TextStyle(fontWeight: FontWeight.w600)).copyWith(color: color)))]),
              );
          final atts = p['attachments'] as List;
          final base = apiUrl.replaceAll('/api', '');
          return ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [
              CircleAvatar(radius: 28, backgroundColor: Ramz.emerald.withOpacity(.16), child: Text(p['fullName'].toString().characters.first, style: Ramz.display(22).copyWith(color: Ramz.emerald))),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['fullName'], style: Ramz.display(20)),
                Text(p['kind'] == 'COMPANY' ? 'منشأة' : 'فرد', style: const TextStyle(color: Ramz.text2)),
              ])),
            ]),
            if (kind == PartyType.tenant && p['hasIdDocument'] == false) Container(
              margin: const EdgeInsets.only(top: 12), padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Ramz.gold.withOpacity(.14), borderRadius: BorderRadius.circular(12)),
              child: const Text('لم تُرفع صورة الهوية بعد — مطلوبة قبل إنشاء العقد', style: TextStyle(color: Ramz.gold, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 12),
            Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
              kv(p['kind'] == 'COMPANY' ? 'السجل التجاري' : 'رقم الهوية', p['nationalId'], mono: true),
              if (kind == PartyType.tenant) kv('انتهاء الهوية', p['idExpiry']?.toString().substring(0, 10), mono: true, color: p['idExpired'] == true ? Ramz.red : null),
              kv('الجوال', p['phone'], mono: true),
              kv('البريد', p['email']),
              kv('الجنسية', p['nationality']),
              kv('جهة العمل', p['employer']),
              kv('المدينة', p['city']),
              kv('العنوان', p['address']),
              if (kind == PartyType.owner) kv('عمولة الإدارة', '${p['commissionPct']}%', mono: true),
              if (kind == PartyType.tenant) kv('جهة اتصال للطوارئ', p['emergencyName'] == null ? null : '${p['emergencyName']} · ${p['emergencyPhone'] ?? ''}'),
            ]))),
            if (kind == PartyType.owner) ...[
              _section('الحسابات البنكية', write ? TextButton.icon(onPressed: () => _addBank(context, ref), icon: const Icon(Icons.add), label: const Text('إضافة')) : null),
              if ((p['bankAccounts'] as List).isEmpty) const Text('لا توجد حسابات بنكية', style: TextStyle(color: Ramz.text2)),
              for (final b in p['bankAccounts']) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                leading: const Icon(Icons.account_balance_outlined),
                title: Row(children: [Text(b['bankName'], style: const TextStyle(fontWeight: FontWeight.w600)), if (b['isPrimary'] == true) ...[const SizedBox(width: 8), const StatusPill('AVAILABLE_PRIMARY')]]),
                subtitle: Directionality(textDirection: TextDirection.ltr, child: Text(b['iban'], textAlign: TextAlign.right, style: Ramz.mono(12.5, FontWeight.w500))),
                trailing: write ? PopupMenuButton<String>(onSelected: (v) async {
                  try { v == 'primary' ? await repo.setPrimary(id, b['id']) : await repo.removeBank(id, b['id']); refresh(); } catch (e) { if (context.mounted) _snack(context, e); }
                }, itemBuilder: (_) => [if (b['isPrimary'] != true) const PopupMenuItem(value: 'primary', child: Text('تعيين كرئيسي')), const PopupMenuItem(value: 'delete', child: Text('حذف'))]) : null,
              )),
              _section('العقارات', null),
              if ((p['properties'] as List).isEmpty) const Text('لا توجد عقارات', style: TextStyle(color: Ramz.text2)),
              for (final pr in p['properties']) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
                onTap: () => context.push('/properties/${pr['id']}'),
                leading: const Icon(Icons.apartment_outlined), title: Text(pr['name']),
                subtitle: Text('${pr['code']} · ${pr['city']} · ${pr['_count']['units']} وحدة', style: const TextStyle(color: Ramz.text2, fontSize: 12.5)),
                trailing: const Icon(Icons.chevron_left),
              )),
            ],
            _section('المرفقات', write ? TextButton.icon(onPressed: () => _upload(context, ref), icon: const Icon(Icons.upload_file), label: const Text('رفع')) : null),
            if (atts.isEmpty) const Text('لا توجد مرفقات', style: TextStyle(color: Ramz.text2)),
            for (final f in atts) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              onTap: () => launchUrl(Uri.parse(base + f['url']), mode: LaunchMode.externalApplication),
              leading: Icon(f['mimeType'] == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: Ramz.emerald),
              title: Text(f['fileName'], overflow: TextOverflow.ellipsis),
              subtitle: Text('${categories[f['category']]} · ${(f['size'] / 1024).round()} KB', style: const TextStyle(color: Ramz.text2, fontSize: 12.5)),
              trailing: write ? IconButton(icon: const Icon(Icons.archive_outlined), tooltip: 'أرشفة', onPressed: () async {
                try { await repo.removeAttachment(f['id']); refresh(); } catch (e) { if (context.mounted) _snack(context, e); }
              }) : null,
            )),
          ]);
        },
      ),
    );
  }

  Widget _section(String t, Widget? action) => Padding(padding: const EdgeInsets.fromLTRB(4, 18, 4, 6), child: Row(children: [
        Text(t, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)), const Spacer(), if (action != null) action,
      ]));

  Future<void> _upload(BuildContext context, WidgetRef ref) async {
    String cat = kind == PartyType.tenant ? 'NATIONAL_ID' : 'DEED';
    final picked = await showModalBottomSheet<String>(context: context, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Padding(padding: EdgeInsets.all(16), child: Text('نوع المستند', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
      for (final e in categories.entries) ListTile(title: Text(e.value), onTap: () => Navigator.pop(c, e.key)),
    ])));
    if (picked == null) return;
    cat = picked;
    final r = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp']);
    final file = r?.files.single;
    if (file?.path == null) return;
    try {
      await ref.read(partiesRepo).upload(kind.entity, id, cat, file!.path!, file.name);
      ref.invalidate(partyDetail((kind, id)));
    } catch (e) {
      if (context.mounted) _snack(context, e);
    }
  }

  Future<void> _addBank(BuildContext context, WidgetRef ref) async {
    final form = GlobalKey<FormState>();
    final bank = TextEditingController(), holder = TextEditingController(), iban = TextEditingController(text: 'SA');
    bool primary = false;
    String? err;
    await showModalBottomSheet(context: context, isScrollControlled: true, builder: (c) => StatefulBuilder(builder: (c, set) => Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(c).viewInsets.bottom + 16),
      child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('إضافة حساب بنكي', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        if (err != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(err!, style: const TextStyle(color: Ramz.red))),
        TextFormField(controller: bank, decoration: const InputDecoration(labelText: 'اسم البنك *'), validator: (v) => (v ?? '').trim().isEmpty ? 'مطلوب' : null),
        const SizedBox(height: 10),
        TextFormField(controller: holder, decoration: const InputDecoration(labelText: 'اسم صاحب الحساب *'), validator: (v) => (v ?? '').trim().isEmpty ? 'مطلوب' : null),
        const SizedBox(height: 10),
        Directionality(textDirection: TextDirection.ltr, child: TextFormField(controller: iban, style: Ramz.mono(15), decoration: const InputDecoration(labelText: 'IBAN *', hintText: 'SA00 0000 0000 0000 0000 0000'),
            validator: (v) => isSaIban(v ?? '') ? null : 'رقم الآيبان غير صحيح')),
        CheckboxListTile(contentPadding: EdgeInsets.zero, value: primary, onChanged: (v) => set(() => primary = v!), title: const Text('حساب رئيسي لتحويل المستحقات')),
        FilledButton(onPressed: () async {
          if (!form.currentState!.validate()) return;
          try {
            await ref.read(partiesRepo).addBank(id, {'bankName': bank.text.trim(), 'holderName': holder.text.trim(), 'iban': iban.text, 'isPrimary': primary});
            if (c.mounted) Navigator.pop(c);
          } catch (e) { set(() => err = errorText(e)); }
        }, child: const Text('حفظ')),
      ])),
    )));
    ref.invalidate(partyDetail((kind, id)));
  }
}

class PartyFormScreen extends ConsumerStatefulWidget {
  final PartyType kind;
  final String? id;
  const PartyFormScreen({super.key, required this.kind, this.id});
  @override
  ConsumerState<PartyFormScreen> createState() => _PartyFormState();
}

class _PartyFormState extends ConsumerState<PartyFormScreen> {
  final _form = GlobalKey<FormState>();
  final c = {for (final k in ['fullName', 'nationalId', 'phone', 'email', 'city', 'address', 'commissionPct', 'idExpiry', 'nationality', 'employer', 'emergencyName', 'emergencyPhone']) k: TextEditingController()};
  String _k = 'INDIVIDUAL';
  String? _err;
  bool _busy = false, _loading = false;
  bool get owner => widget.kind == PartyType.owner;
  bool get editing => widget.id != null;

  @override
  void initState() {
    super.initState();
    if (editing) {
      _loading = true;
      ref.read(partiesRepo).get(widget.kind, widget.id!).then((p) {
        for (final k in c.keys) c[k]!.text = p[k] == null ? '' : (k == 'idExpiry' ? p[k].toString().substring(0, 10) : '${p[k]}');
        setState(() { _k = p['kind']; _loading = false; });
      });
    } else if (owner) {
      c['commissionPct']!.text = '5';
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _err = null; });
    String? t(String k) => c[k]!.text.trim().isEmpty ? null : c[k]!.text.trim();
    final d = <String, dynamic>{
      if (!editing) 'kind': _k, if (!editing) 'nationalId': t('nationalId'),
      'fullName': t('fullName'), 'phone': t('phone'), 'email': t('email'),
      if (owner) ...{'city': t('city'), 'address': t('address'), 'commissionPct': double.tryParse(c['commissionPct']!.text)},
      if (!owner) ...{'idExpiry': t('idExpiry'), 'nationality': t('nationality'), 'employer': t('employer'), 'emergencyName': t('emergencyName'), 'emergencyPhone': t('emergencyPhone')},
    }..removeWhere((_, v) => v == null);
    try {
      final r = ref.read(partiesRepo);
      editing ? await r.update(widget.kind, widget.id!, d) : await r.create(widget.kind, d);
      if (mounted) context.pop();
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _f(String k, String label, {bool req = false, TextInputType? kb, String? Function(String?)? v, bool enabled = true, bool mono = false, Widget? suffix}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(controller: c[k], enabled: enabled, keyboardType: kb, style: mono ? Ramz.mono(15, FontWeight.w500) : null,
            decoration: InputDecoration(labelText: req ? '$label *' : label, suffixIcon: suffix),
            validator: v ?? (req ? (x) => (x ?? '').trim().isEmpty ? 'هذا الحقل مطلوب' : null : null)),
      );
  String? _mobile(String? v, {bool req = true}) => (v ?? '').isEmpty && !req ? null : (RegExp(r'^05\d{8}$').hasMatch(v ?? '') ? null : 'رقم الجوال يجب أن يكون 05XXXXXXXX');

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('${editing ? 'تعديل' : 'إضافة'} ${widget.kind.label}')),
        body: _loading ? const Center(child: CircularProgressIndicator(color: Ramz.emerald)) : Form(key: _form, child: ListView(padding: const EdgeInsets.all(16), children: [
          if (_err != null) Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Ramz.red.withOpacity(.14), borderRadius: BorderRadius.circular(12)),
              child: Text(_err!, style: const TextStyle(color: Ramz.red, fontWeight: FontWeight.w600))),
          if (!editing) Padding(padding: const EdgeInsets.only(bottom: 12), child: SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'INDIVIDUAL', label: Text('فرد')), ButtonSegment(value: 'COMPANY', label: Text('منشأة'))],
            selected: {_k}, showSelectedIcon: false, onSelectionChanged: (s) => setState(() => _k = s.first),
          )),
          _f('fullName', _k == 'COMPANY' ? 'اسم المنشأة' : 'الاسم الكامل', req: true),
          _f('nationalId', _k == 'COMPANY' ? 'السجل التجاري' : 'رقم الهوية / الإقامة', req: true, enabled: !editing, kb: TextInputType.number, mono: true,
              v: (x) => _k == 'COMPANY' ? (RegExp(r'^[1-7]\d{9}$').hasMatch(x ?? '') ? null : 'السجل التجاري 10 أرقام') : (isSaudiId(x ?? '') ? null : 'رقم الهوية غير صحيح')),
          if (!owner) _f('idExpiry', 'تاريخ انتهاء الهوية', mono: true, suffix: IconButton(icon: const Icon(Icons.calendar_month_outlined), onPressed: () async {
            final d = await showDatePicker(context: context, firstDate: DateTime(2000), lastDate: DateTime(2045), initialDate: DateTime.now().add(const Duration(days: 365)));
            if (d != null) c['idExpiry']!.text = d.toIso8601String().substring(0, 10);
          })),
          _f('phone', 'الجوال', req: true, kb: TextInputType.phone, mono: true, v: _mobile),
          _f('email', 'البريد الإلكتروني', kb: TextInputType.emailAddress),
          if (owner) ...[
            Row(children: [Expanded(child: _f('city', 'المدينة')), const SizedBox(width: 10), Expanded(child: _f('commissionPct', 'عمولة الإدارة %', kb: TextInputType.number, mono: true))]),
            _f('address', 'العنوان الوطني'),
          ] else ...[
            Row(children: [Expanded(child: _f('nationality', 'الجنسية')), const SizedBox(width: 10), Expanded(child: _f('employer', 'جهة العمل'))]),
            _f('emergencyName', 'اسم جهة اتصال للطوارئ'),
            _f('emergencyPhone', 'جوال الطوارئ', kb: TextInputType.phone, mono: true, v: (x) => _mobile(x, req: false)),
          ],
          const SizedBox(height: 8),
          FilledButton(onPressed: _busy ? null : _save, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('حفظ')),
          if (!editing && !owner) const Padding(padding: EdgeInsets.only(top: 10), child: Text('بعد الحفظ ارفع صورة الهوية من ملف المستأجر', textAlign: TextAlign.center, style: TextStyle(color: Ramz.text2, fontSize: 13))),
        ])),
      );
}
