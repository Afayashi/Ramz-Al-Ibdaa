import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../properties/property_screens.dart' show canWrite;
import 'repo.dart';
import '../payments/payment_screens.dart';
import '../../core/documents.dart';

bool _hasRole(WidgetRef ref, String r) => (ref.read(authProvider).user?.roles ?? []).contains(r);

// ───────── القائمة ─────────
class ContractsListScreen extends ConsumerStatefulWidget {
  const ContractsListScreen({super.key});
  @override
  ConsumerState<ContractsListScreen> createState() => _ListState();
}

class _ListState extends ConsumerState<ContractsListScreen> {
  String? _status;
  late Future<List<dynamic>> _f = _load();
  Future<List<dynamic>> _load() => ref.read(contractsRepo).list(status: _status);
  void _reload() => setState(() => _f = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('العقود'), actions: [IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () => context.push('/notifications')), IconButton(tooltip: 'التحصيل', icon: const Icon(Icons.payments_outlined), onPressed: () => context.push('/payments'))]),
        floatingActionButton: canWrite(ref)
            ? FloatingActionButton.extended(backgroundColor: Ramz.emerald, foregroundColor: Colors.white, icon: const Icon(Icons.note_add_outlined), label: const Text('عقد جديد'),
                onPressed: () async { await context.push('/contracts/new'); _reload(); })
            : null,
        body: Column(children: [
          SizedBox(height: 48, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            for (final e in <String?, String>{null: 'الكل', for (final k in contractStatus.keys) k: contractStatus[k]!.$1}.entries)
              Padding(padding: const EdgeInsetsDirectional.only(end: 8), child: ChoiceChip(
                label: Text(e.value), selected: _status == e.key, selectedColor: Ramz.emerald.withOpacity(.2), showCheckmark: false,
                onSelected: (_) { _status = e.key; _reload(); })),
          ])),
          Expanded(child: FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _reload);
            if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
            if (s.data!.isEmpty) return const Center(child: Text('لا توجد عقود', style: TextStyle(color: Ramz.text2)));
            return RefreshIndicator(onRefresh: () async => _reload(), child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), itemCount: s.data!.length,
              itemBuilder: (_, i) {
                final x = s.data![i];
                final u = x['unit'];
                return Card(margin: const EdgeInsets.only(bottom: 8), child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () async { await context.push('/contracts/${x['id']}'); _reload(); },
                  child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(x['code'], style: Ramz.mono(13).copyWith(color: Ramz.text2)), const Spacer(),
                      pill(contractStatus[x['status']] ?? ('—', Ramz.text2)),
                    ]),
                    const SizedBox(height: 6),
                    Text('${u['property']['name']} · ${u['number']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    Text(x['tenant']['fullName'], style: const TextStyle(color: Ramz.text2)),
                    const SizedBox(height: 8),
                    Row(children: [
                      Text('${ymd(x['startDate'])} ← ${ymd(x['endDate'])}', style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2)), const Spacer(),
                      Text(sar(x['annualRent']), style: Ramz.mono(14)),
                    ]),
                  ])),
                ));
              },
            ));
          })),
        ]),
      );
}

// ───────── التفاصيل ─────────
class ContractDetailScreen extends ConsumerStatefulWidget {
  const ContractDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<ContractDetailScreen> createState() => _DetailState();
}

class _DetailState extends ConsumerState<ContractDetailScreen> {
  late Future<Map<String, dynamic>> _f = ref.read(contractsRepo).get(widget.id);
  bool _busy = false;
  void _reload() => setState(() => _f = ref.read(contractsRepo).get(widget.id));

  Future<void> _act(String a, {bool needsReason = false, String? confirm}) async {
    String? reason;
    if (needsReason || confirm != null) {
      final ctl = TextEditingController();
      final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
        title: Text(confirm ?? 'تأكيد'),
        content: needsReason ? TextField(controller: ctl, decoration: const InputDecoration(hintText: 'السبب'), maxLines: 2) : null,
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('تأكيد'))],
      ));
      if (ok != true) return;
      reason = ctl.text.trim();
      if (needsReason && reason.isEmpty) return _snack('السبب مطلوب');
    }
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepo).action(widget.id, a, reason == null || reason.isEmpty ? null : {'reason': reason});
      _snack('تم');
      _reload();
    } catch (e) { _snack(errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _renew(Map c) async {
    final end = await showDatePicker(context: context, firstDate: DateTime.parse(c['endDate']).add(const Duration(days: 30)),
        lastDate: DateTime(2040), initialDate: DateTime.parse(c['endDate']).add(const Duration(days: 365)), helpText: 'تاريخ نهاية العقد الجديد');
    if (end == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepo).action(widget.id, 'renew', {'endDate': ymd(end.toIso8601String())});
      _snack('أُنشئت مسودة التجديد');
    } catch (e) { _snack(errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تفاصيل العقد'), actions: [FutureBuilder(future: _f, builder: (c, s) => s.hasData ? DocumentsMenu(contractId: widget.id, status: s.data!['status']) : const SizedBox())]),
        body: FutureBuilder(future: _f, builder: (c, s) {
          if (s.hasError) return errorBox(errorText(s.error!), _reload);
          if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
          final x = s.data!;
          final st = x['status'] as String;
          final inst = (x['installments'] as List);
          final paid = inst.fold<num>(0, (a, i) => a + num.parse('${i['paidAmount']}'));
          final total = inst.where((i) => i['status'] != 'CANCELLED').fold<num>(0, (a, i) => a + num.parse('${i['total']}'));
          final overdue = inst.where((i) => i['status'] == 'OVERDUE').length;
          final write = canWrite(ref), approver = _hasRole(ref, 'admin'), canPay = _hasRole(ref, 'admin') || _hasRole(ref, 'accountant');
          final actions = <Widget>[
            if (st == 'DRAFT' && write) FilledButton(onPressed: _busy ? null : () => _act('submit'), child: const Text('إرسال للاعتماد')),
            if (st == 'PENDING_APPROVAL' && approver) FilledButton(onPressed: _busy ? null : () => _act('approve', confirm: 'اعتماد العقد وتأجير الوحدة؟'), child: const Text('اعتماد')),
            if (st == 'PENDING_APPROVAL' && approver) OutlinedButton(onPressed: _busy ? null : () => _act('reject', needsReason: true, confirm: 'إرجاع للمسودة'), child: const Text('إرجاع')),
            if ((st == 'ACTIVE' || st == 'EXPIRED') && write) FilledButton(onPressed: _busy ? null : () => _renew(x), child: const Text('تجديد')),
            if (st == 'ACTIVE' && approver) OutlinedButton(style: OutlinedButton.styleFrom(foregroundColor: Ramz.red), onPressed: _busy ? null : () => _act('terminate', needsReason: true, confirm: 'إنهاء العقد مبكراً'), child: const Text('إنهاء')),
            if (st == 'ACTIVE') OutlinedButton.icon(onPressed: () => context.push('/contracts/${widget.id}/handover/MOVE_IN'), icon: const Icon(Icons.key_outlined), label: const Text('محضر الاستلام')),
            if (st == 'ACTIVE' || st == 'EXPIRED' || st == 'TERMINATED') OutlinedButton.icon(onPressed: () => context.push('/contracts/${widget.id}/handover/MOVE_OUT'), icon: const Icon(Icons.logout), label: const Text('محضر التسليم')),
            if ((st == 'DRAFT' || st == 'PENDING_APPROVAL') && write) TextButton(style: TextButton.styleFrom(foregroundColor: Ramz.red), onPressed: _busy ? null : () => _act('cancel', confirm: 'إلغاء العقد؟'), child: const Text('إلغاء العقد')),
          ];
          return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.all(16), children: [
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Text(x['code'], style: Ramz.mono(14)), const Spacer(), pill(contractStatus[st]!)]),
              const SizedBox(height: 10),
              Text('${x['unit']['property']['name']} · وحدة ${x['unit']['number']}', style: Ramz.display(20)),
              const SizedBox(height: 4),
              Text(x['tenant']['fullName'], style: const TextStyle(color: Ramz.text2)),
              const Divider(height: 28),
              _kv('المدة', '${ymd(x['startDate'])} ← ${ymd(x['endDate'])}'),
              _kv('الإيجار السنوي', sar(x['annualRent'])),
              _kv('الدفع', frequencies[x['frequency']] ?? ''),
              _kv('التأمين', sar(x['deposit'])),
              if (num.parse('${x['vatPct']}') > 0) _kv('الضريبة', '${x['vatPct']}٪'),
              if (x['ejarNumber'] != null) _kv('رقم إيجار', x['ejarNumber']),
              if (x['terminationReason'] != null) _kv('سبب الإنهاء', x['terminationReason']),
            ]))),
            const SizedBox(height: 12),
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [const Text('التحصيل', style: TextStyle(fontWeight: FontWeight.w700)), const Spacer(),
                if (overdue > 0) pill(('$overdue متأخر', Ramz.red))]),
              const SizedBox(height: 10),
              ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: total == 0 ? 0 : (paid / total).toDouble(), minHeight: 8, color: Ramz.emerald, backgroundColor: Ramz.border)),
              const SizedBox(height: 8),
              Row(children: [Text(sar(paid), style: Ramz.mono(14)), const Spacer(), Text('من ${sar(total)}', style: Ramz.mono(13, FontWeight.w400).copyWith(color: Ramz.text2))]),
            ]))),
            if (actions.isNotEmpty) ...[const SizedBox(height: 12), Wrap(spacing: 8, runSpacing: 8, children: actions)],
            const SizedBox(height: 20),
            Text('جدول الأقساط (${inst.length})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            ...inst.map((i) => Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
              onTap: canPay && st != 'DRAFT' && st != 'PENDING_APPROVAL' && st != 'CANCELLED' && (i['status'] == 'PENDING' || i['status'] == 'OVERDUE')
                  ? () async { final r = await showRecordPayment(context, ref, i); if (r != null && mounted) { showReceipt(context, r); _reload(); } }
                  : null,
              leading: CircleAvatar(radius: 16, backgroundColor: Ramz.emerald.withOpacity(.14), child: Text('${i['seq']}', style: Ramz.mono(12).copyWith(color: Ramz.emerald))),
              title: Text(sar(i['total']), style: Ramz.mono(15)),
              subtitle: Text('استحقاق ${ymd(i['dueDate'])}${num.parse('${i['vat']}') > 0 ? ' · شامل ضريبة ${sar(i['vat'])}' : ''}${num.parse('${i['paidAmount']}') > 0 && i['status'] != 'PAID' ? ' · مدفوع ${sar(i['paidAmount'])}' : ''}', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
              trailing: pill(installmentStatus[i['status']]!),
            ))),
          ]));
        }),
      );

  Widget _kv(String k, String v) => Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Row(children: [
        Text(k, style: const TextStyle(color: Ramz.text2)), const Spacer(), Flexible(child: Text(v, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
      ]));
}

// ───────── معالج إنشاء العقد ─────────
class ContractWizardScreen extends ConsumerStatefulWidget {
  const ContractWizardScreen({super.key, this.unitId});
  final String? unitId;
  @override
  ConsumerState<ContractWizardScreen> createState() => _WizardState();
}

class _WizardState extends ConsumerState<ContractWizardScreen> {
  int _step = 0;
  Map? _unit, _tenant;
  DateTime _start = DateTime(DateTime.now().year, DateTime.now().month + 1, 1);
  int _months = 12;
  String _freq = 'QUARTERLY';
  final _rent = TextEditingController(), _deposit = TextEditingController(), _ejar = TextEditingController();
  Map<String, dynamic>? _preview;
  bool _busy = false;
  String _q = '';
  late final Future<List<dynamic>> _units = ref.read(contractsRepo).units();
  late final Future<List<dynamic>> _tenants = ref.read(contractsRepo).tenants();

  DateTime get _end => DateTime(_start.year, _start.month + _months, _start.day).subtract(const Duration(days: 1));
  static const _titles = ['الوحدة', 'المستأجر', 'الشروط المالية', 'المراجعة'];

  Map<String, dynamic> get _body => {
        'unitId': _unit!['id'], 'tenantId': _tenant!['id'],
        'startDate': ymd(_start.toIso8601String()), 'endDate': ymd(_end.toIso8601String()),
        'annualRent': num.tryParse(_rent.text) ?? 0, 'frequency': _freq,
        if (_deposit.text.isNotEmpty) 'deposit': num.tryParse(_deposit.text) ?? 0,
        if (_ejar.text.trim().isNotEmpty) 'ejarNumber': _ejar.text.trim(),
      };

  Future<void> _next() async {
    if (_step == 2) {
      if ((num.tryParse(_rent.text) ?? 0) <= 0) return _snack('أدخل قيمة الإيجار');
      setState(() => _busy = true);
      try {
        _preview = await ref.read(contractsRepo).preview({..._body}..removeWhere((k, _) => ['unitId', 'tenantId', 'deposit', 'ejarNumber'].contains(k)));
        setState(() => _step = 3);
      } catch (e) { _snack(errorText(e)); }
      setState(() => _busy = false);
      return;
    }
    if (_step == 3) {
      setState(() => _busy = true);
      try {
        final c = await ref.read(contractsRepo).create(_body);
        if (mounted) context.pushReplacement('/contracts/${c['id']}');
      } catch (e) { _snack(errorText(e)); }
      if (mounted) setState(() => _busy = false);
      return;
    }
    setState(() => _step++);
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  bool get _canNext => switch (_step) { 0 => _unit != null, 1 => _tenant != null, _ => !_busy };

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('عقد جديد')),
        body: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 12), child: Row(children: [
            for (var i = 0; i < 4; i++) ...[
              Expanded(child: Column(children: [
                Container(height: 4, decoration: BoxDecoration(color: i <= _step ? Ramz.emerald : Ramz.border, borderRadius: BorderRadius.circular(99))),
                const SizedBox(height: 6),
                Text(_titles[i], style: TextStyle(fontSize: 12, color: i <= _step ? Ramz.text : Ramz.text2, fontWeight: i == _step ? FontWeight.w700 : FontWeight.w400)),
              ])),
              if (i < 3) const SizedBox(width: 6),
            ],
          ])),
          Expanded(child: [_unitStep, _tenantStep, _termsStep, _reviewStep][_step]()),
          SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [
            if (_step > 0) Expanded(child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _busy ? null : () => setState(() => _step--), child: const Text('السابق'))),
            if (_step > 0) const SizedBox(width: 8),
            Expanded(flex: 2, child: FilledButton(onPressed: _canNext ? _next : null,
                child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(_step == 3 ? 'حفظ كمسودة' : 'التالي'))),
          ]))),
        ]),
      );

  Widget _search(String hint) => Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: TextField(decoration: InputDecoration(hintText: hint, prefixIcon: const Icon(Icons.search)), onChanged: (v) => setState(() => _q = v.trim())));

  Widget _pickList(Future<List<dynamic>> f, bool Function(Map) filter, Widget Function(Map, bool) tile) => FutureBuilder(future: f, builder: (c, s) {
        if (s.hasError) return errorBox(errorText(s.error!), () => setState(() {}));
        if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
        final items = s.data!.cast<Map>().where(filter).toList();
        if (items.isEmpty) return const Center(child: Text('لا توجد نتائج', style: TextStyle(color: Ramz.text2)));
        return ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [for (final x in items) tile(x, false)]);
      });

  Widget _unitStep() => Column(children: [
        _search('ابحث برقم الوحدة أو العقار'),
        Expanded(child: _pickList(_units, (u) {
          if (!['AVAILABLE', 'RESERVED'].contains(u['status'])) return false;
          if (widget.unitId != null && _unit == null && u['id'] == widget.unitId) WidgetsBinding.instance.addPostFrameCallback((_) => _selectUnit(u));
          final name = '${u['number']} ${u['property']?['name'] ?? ''}';
          return _q.isEmpty || name.contains(_q);
        }, (u, _) => _choice(_unit?['id'] == u['id'], '${u['property']?['name'] ?? ''} · ${u['number']}',
            '${unitTypes[u['type']] ?? u['type']} · ${u['area']} م² · ${sar(u['annualRent'])}', () => _selectUnit(u)))),
      ]);

  void _selectUnit(Map u) => setState(() { _unit = u; _rent.text = num.parse('${u['annualRent']}').toStringAsFixed(0); _q = ''; });

  Widget _tenantStep() => Column(children: [
        _search('ابحث بالاسم أو الهوية'),
        Expanded(child: _pickList(_tenants, (t) => _q.isEmpty || '${t['fullName']} ${t['nationalId']}'.contains(_q),
            (t, _) {
              final exp = t['idExpiry'] != null ? DateTime.tryParse(t['idExpiry']) : null;
              final expired = exp != null && exp.isBefore(_start);
              return _choice(_tenant?['id'] == t['id'], t['fullName'], '${t['nationalId']} · ${t['phone']}${expired ? ' · الهوية منتهية' : ''}',
                  expired ? null : () => setState(() => _tenant = t));
            })),
      ]);

  Widget _choice(bool sel, String title, String sub, VoidCallback? onTap) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: sel ? Ramz.emerald : Ramz.border, width: sel ? 1.5 : 1)),
        child: ListTile(onTap: onTap, enabled: onTap != null, title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(sub, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
            trailing: Icon(sel ? Icons.check_circle : Icons.radio_button_unchecked, color: sel ? Ramz.emerald : Ramz.text2)),
      );

  Widget _termsStep() => ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [
        const Text('تاريخ البداية', style: TextStyle(color: Ramz.text2)),
        const SizedBox(height: 6),
        OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: AlignmentDirectional.centerStart),
          icon: const Icon(Icons.event), label: Text(ymd(_start.toIso8601String()), style: Ramz.mono(15)),
          onPressed: () async { final d = await showDatePicker(context: context, initialDate: _start, firstDate: DateTime(2024), lastDate: DateTime(2035)); if (d != null) setState(() => _start = d); }),
        const SizedBox(height: 16),
        const Text('المدة', style: TextStyle(color: Ramz.text2)),
        const SizedBox(height: 6),
        SegmentedButton<int>(showSelectedIcon: false, selected: {_months}, onSelectionChanged: (s) => setState(() => _months = s.first),
            segments: const [ButtonSegment(value: 6, label: Text('6 أشهر')), ButtonSegment(value: 12, label: Text('سنة')), ButtonSegment(value: 24, label: Text('سنتان')), ButtonSegment(value: 36, label: Text('3 سنوات'))]),
        Padding(padding: const EdgeInsets.only(top: 6), child: Text('ينتهي في ${ymd(_end.toIso8601String())}', style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2))),
        const SizedBox(height: 16),
        const Text('دورية الدفع', style: TextStyle(color: Ramz.text2)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, children: [for (final e in frequencies.entries) ChoiceChip(label: Text(e.value), selected: _freq == e.key, showCheckmark: false, selectedColor: Ramz.emerald.withOpacity(.2), onSelected: (_) => setState(() => _freq = e.key))]),
        const SizedBox(height: 16),
        TextField(controller: _rent, keyboardType: TextInputType.number, style: Ramz.mono(15), decoration: const InputDecoration(labelText: 'الإيجار السنوي', suffixText: '﷼')),
        const SizedBox(height: 12),
        TextField(controller: _deposit, keyboardType: TextInputType.number, style: Ramz.mono(15), decoration: const InputDecoration(labelText: 'مبلغ التأمين (اختياري)', suffixText: '﷼')),
        const SizedBox(height: 12),
        TextField(controller: _ejar, decoration: const InputDecoration(labelText: 'رقم عقد إيجار (اختياري)')),
        const SizedBox(height: 16),
      ]);

  Widget _reviewStep() {
    final p = _preview!;
    return ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${_unit!['property']?['name'] ?? ''} · ${_unit!['number']}', style: Ramz.display(18)),
        Text(_tenant!['fullName'], style: const TextStyle(color: Ramz.text2)),
        const Divider(height: 24),
        _row('المدة', '${p['months']} شهراً · ${frequencies[_freq]}'),
        _row('إجمالي الإيجار', sar(p['totalRent'])),
        if ((p['totalVat'] as num) > 0) _row('الضريبة', sar(p['totalVat'])),
        _row('الإجمالي', sar(p['grandTotal']), bold: true),
      ]))),
      const SizedBox(height: 12),
      Text('الأقساط (${p['count']})', style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      for (final i in p['installments']) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [
        Text('${i['seq']}.', style: Ramz.mono(13).copyWith(color: Ramz.text2)), const SizedBox(width: 8),
        Text(ymd(i['dueDate']), style: Ramz.mono(13, FontWeight.w400)), const Spacer(), Text(sar(i['total']), style: Ramz.mono(14)),
      ])),
      const SizedBox(height: 8),
      const Text('يُحفظ العقد كمسودة، ثم يُرسل للاعتماد لتأجير الوحدة.', style: TextStyle(color: Ramz.text2, fontSize: 13)),
    ]);
  }

  Widget _row(String k, String v, {bool bold = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [
        Text(k, style: const TextStyle(color: Ramz.text2)), const Spacer(), Text(v, style: Ramz.mono(bold ? 16 : 14, bold ? FontWeight.w700 : FontWeight.w600)),
      ]));
}
