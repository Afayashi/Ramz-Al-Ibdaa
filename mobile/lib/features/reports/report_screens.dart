import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../contracts/repo.dart';
import '../../core/documents.dart';

const _monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
String compact(num v) => v >= 1e6 ? '${(v / 1e6).toStringAsFixed(2)}م' : v >= 1e3 ? '${(v / 1e3).toStringAsFixed(0)}ألف' : v.toStringAsFixed(0);

Widget kpiCard(String label, String value, {Color color = Ramz.text, String? sub, VoidCallback? onTap}) => Expanded(child: Card(child: InkWell(
      borderRadius: BorderRadius.circular(18), onTap: onTap,
      child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
        const SizedBox(height: 6),
        FittedBox(fit: BoxFit.scaleDown, alignment: AlignmentDirectional.centerStart, child: Text(value, style: Ramz.mono(20, FontWeight.w700).copyWith(color: color))),
        if (sub != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub, style: const TextStyle(color: Ramz.text2, fontSize: 11))),
      ])),
    )));

// ───────── لوحة المؤشرات ─────────
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashState();
}

class _DashState extends ConsumerState<DashboardScreen> {
  late Future<Map<String, dynamic>> _f = _load();
  Future<Map<String, dynamic>> _load() async => (await ref.read(dioProvider).get('/reports/dashboard')).data;
  void _reload() => setState(() => _f = _load());

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).user?.fullName ?? '';
    return Scaffold(
      appBar: AppBar(centerTitle: false, title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('لوحة المؤشرات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        Text(name, style: const TextStyle(fontSize: 12, color: Ramz.text2)),
      ]), actions: [
        IconButton(icon: const Icon(Icons.checklist), tooltip: 'مهامي', onPressed: () => context.push('/tasks')),
        IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () => context.push('/notifications')),
      ]),
      body: FutureBuilder(future: _f, builder: (c, s) {
        if (s.hasError) return errorBox(errorText(s.error!), _reload);
        if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
        final d = s.data!;
        final u = d['units'], rev = d['revenue'], od = d['overdue'], ex = d['expiring'], mt = d['maintenance'];
        final months = (rev['months'] as List);
        final maxM = months.fold<num>(1, (a, m) => (m['amount'] as num) > a ? m['amount'] : a);
        final bs = (u['byStatus'] as Map);
        return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.all(16), children: [
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('TOTAL COLLECTED · آخر 12 شهراً', style: TextStyle(color: Ramz.text2, fontSize: 11, letterSpacing: 1.2)),
            const SizedBox(height: 4),
            Text(sar(rev['last12']), style: Ramz.mono(28, FontWeight.w700)),
            const SizedBox(height: 16),
            SizedBox(height: 120, child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final m in months) Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 2), child: Tooltip(
                message: '${_monthsAr[int.parse((m['month'] as String).substring(5)) - 1]}: ${sar(m['amount'])}',
                child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                  Container(height: 4 + 96 * ((m['amount'] as num) / maxM).toDouble(), decoration: BoxDecoration(
                    color: m == months.last ? Ramz.emerald : Ramz.emerald.withOpacity(.35), borderRadius: BorderRadius.circular(4))),
                  const SizedBox(height: 4),
                  Text(_monthsAr[int.parse((m['month'] as String).substring(5)) - 1].substring(0, 3), style: const TextStyle(fontSize: 9, color: Ramz.text2)),
                ]),
              ))),
            ])),
          ]))),
          const SizedBox(height: 8),
          Row(children: [
            kpiCard('محصّل هذا الشهر', compact(rev['thisMonth']), color: Ramz.emerald, sub: 'تحصيل ${rev['collectionRate']}٪', onTap: () => context.push('/payments')),
            const SizedBox(width: 8),
            kpiCard('المتأخرات', compact(od['amount']), color: Ramz.red, sub: '${od['count']} قسط', onTap: () => context.push('/payments')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            kpiCard('الإشغال', '${u['occupancy']}٪', sub: '${bs['RENTED'] ?? 0} من ${u['total']} وحدة', onTap: () => context.push('/units')),
            const SizedBox(width: 8),
            kpiCard('الصيانة المفتوحة', '${mt['open']}', color: (mt['overdue'] as num) > 0 ? Ramz.gold : Ramz.text, sub: '${mt['overdue']} متأخرة', onTap: () => context.go('/maintenance')),
          ]),
          const SizedBox(height: 12),
          Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('حالة الوحدات', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            ClipRRect(borderRadius: BorderRadius.circular(99), child: SizedBox(height: 10, child: Row(children: [
              for (final k in ['RENTED', 'AVAILABLE', 'RESERVED', 'MAINTENANCE']) if ((bs[k] ?? 0) > 0) Expanded(flex: bs[k], child: Container(color: statusColor[k])),
            ]))),
            const SizedBox(height: 10),
            Wrap(spacing: 14, runSpacing: 6, children: [for (final k in ['RENTED', 'AVAILABLE', 'RESERVED', 'MAINTENANCE'])
              Row(mainAxisSize: MainAxisSize.min, children: [Container(width: 8, height: 8, decoration: BoxDecoration(color: statusColor[k], shape: BoxShape.circle)), const SizedBox(width: 6),
                Text('${unitStatus[k]} ${bs[k] ?? 0}', style: const TextStyle(fontSize: 12))])]),
          ]))),
          const SizedBox(height: 12),
          Row(children: [
            const Text('عقود تنتهي قريباً', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)), const Spacer(),
            Text('30 يوماً: ${ex['d30']} · 90: ${ex['d90']}', style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2)),
          ]),
          const SizedBox(height: 8),
          if ((ex['list'] as List).isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('لا توجد عقود تنتهي خلال 90 يوماً', style: TextStyle(color: Ramz.text2))),
          for (final c in ex['list']) Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
            onTap: () => context.push('/contracts/${c['id']}'),
            title: Text(c['tenant'], style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${c['unit']} · ${c['code']}', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
            trailing: c['renewing'] == true ? pill(('قيد التجديد', Ramz.emerald)) : pill(('${c['days']} يوماً', (c['days'] as num) <= 30 ? Ramz.red : Ramz.gold)),
          )),
          const SizedBox(height: 12),
          const Text('أداء العقارات', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          for (final p in d['properties']) Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
            onTap: () => context.push('/properties/${p['id']}'),
            title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${p['rented']}/${p['units']} مؤجرة', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
            trailing: Text(sar(p['revenue12m']), style: Ramz.mono(14)),
          )),
        ]));
      }),
    );
  }
}

// ───────── كشف حساب المالك ─────────
class OwnerStatementScreen extends ConsumerStatefulWidget {
  const OwnerStatementScreen({super.key, this.ownerId});
  final String? ownerId;
  @override
  ConsumerState<OwnerStatementScreen> createState() => _StmtState();
}

class _StmtState extends ConsumerState<OwnerStatementScreen> {
  late DateTime _from = DateTime(DateTime.now().year, DateTime.now().month, 1), _to = DateTime.now();
  String? _ownerId;
  List<dynamic> _owners = [];
  Future<Map<String, dynamic>>? _f;
  late final bool _staff = (ref.read(authProvider).user?.roles ?? []).any((r) => ['admin', 'employee', 'accountant'].contains(r));

  @override
  void initState() {
    super.initState();
    _ownerId = widget.ownerId;
    if (_staff) ref.read(dioProvider).get('/owners').then((r) => setState(() { _owners = r.data; _ownerId ??= _owners.isNotEmpty ? _owners.first['id'] : null; _run(); }));
    else _run();
  }

  void _run() {
    if (_staff && _ownerId == null) return;
    setState(() => _f = ref.read(dioProvider).get('/reports/owner-statement', queryParameters: {
      if (_ownerId != null) 'ownerId': _ownerId, 'from': ymd(_from.toIso8601String()), 'to': ymd(_to.toIso8601String())}).then((r) => r.data as Map<String, dynamic>));
  }

  Future<void> _pickRange() async {
    final r = await showDateRangePicker(context: context, firstDate: DateTime(2024), lastDate: DateTime.now(), initialDateRange: DateTimeRange(start: _from, end: _to));
    if (r != null) { _from = r.start; _to = r.end; _run(); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('كشف حساب المالك'), actions: [PrintButton(type: 'ownerStatement', id: _ownerId ?? ref.read(authProvider).user!.id, from: ymd(_from.toIso8601String()), to: ymd(_to.toIso8601String()))]),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          if (_staff) DropdownButtonFormField<String>(value: _ownerId, isExpanded: true, decoration: const InputDecoration(labelText: 'المالك'),
              items: [for (final o in _owners) DropdownMenuItem(value: o['id'] as String, child: Text(o['fullName']))], onChanged: (v) { _ownerId = v; _run(); }),
          if (_staff) const SizedBox(height: 10),
          OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _pickRange, icon: const Icon(Icons.date_range),
              label: Text('${ymd(_from.toIso8601String())} ← ${ymd(_to.toIso8601String())}', style: Ramz.mono(14, FontWeight.w500))),
          const SizedBox(height: 16),
          if (_f != null) FutureBuilder(future: _f, builder: (c, s) {
            if (s.hasError) return errorBox(errorText(s.error!), _run);
            if (!s.hasData) return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator(color: Ramz.emerald)));
            final d = s.data!, t = d['totals'], o = d['owner'];
            Widget row(String k, String v, {Color? c, bool big = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [
                  Text(k, style: TextStyle(color: big ? Ramz.text : Ramz.text2, fontWeight: big ? FontWeight.w700 : FontWeight.w400)), const Spacer(),
                  Text(v, style: Ramz.mono(big ? 18 : 14, big ? FontWeight.w700 : FontWeight.w600).copyWith(color: c))]));
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(o['fullName'], style: Ramz.display(20)),
                if (o['iban'] != null) Text(o['iban'], style: Ramz.mono(12, FontWeight.w400).copyWith(color: Ramz.text2)),
                const Divider(height: 24),
                row('التحصيلات (بدون الضريبة)', sar(t['collected'])),
                row('مصروفات الصيانة', '- ${sar(t['maintenance'])}', c: Ramz.red),
                row('عمولة الإدارة ${o['commissionPct']}٪', '- ${sar(t['commission'])}', c: Ramz.red),
                const Divider(),
                row('صافي المستحق للمالك', sar(t['net']), c: Ramz.emerald, big: true),
              ]))),
              const SizedBox(height: 12),
              const Text('حسب العقار', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 6),
              for (final p in d['properties']) Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
                title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('تحصيل ${sar(p['collected'])} · صيانة ${sar(p['maintenance'])} · عمولة ${sar(p['commission'])}', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
                trailing: Text(sar(p['net']), style: Ramz.mono(14)),
              )),
              const SizedBox(height: 12),
              Text('السندات (${(d['receipts'] as List).length})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              for (final r in d['receipts']) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [
                Expanded(child: Text('${ymd(r['date'])} · ${r['tenant']} · ${r['unit']}', style: const TextStyle(fontSize: 13))),
                Text(sar(r['amount']), style: Ramz.mono(13)),
              ])),
              if ((d['expenses'] as List).isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('المصروفات', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                for (final e in d['expenses']) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [
                  Expanded(child: Text('${ymd(e['date'])} · ${e['title']} · ${e['unit']}', style: const TextStyle(fontSize: 13))),
                  Text('- ${sar(e['cost'])}', style: Ramz.mono(13).copyWith(color: Ramz.red)),
                ])),
              ],
            ]);
          }),
        ]),
      );
}
