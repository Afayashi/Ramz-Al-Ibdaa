import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../contracts/repo.dart';
import '../../core/documents.dart';

/// Bottom sheet — records a (partial) payment against one installment. Returns the receipt on success.
Future<Map<String, dynamic>?> showRecordPayment(BuildContext context, WidgetRef ref, Map inst) => showModalBottomSheet<Map<String, dynamic>>(
      context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _PaySheet(inst: inst),
    );

class _PaySheet extends ConsumerStatefulWidget {
  const _PaySheet({required this.inst});
  final Map inst;
  @override
  ConsumerState<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends ConsumerState<_PaySheet> {
  late final num remaining = num.parse('${widget.inst['total']}') - num.parse('${widget.inst['paidAmount']}');
  late final _amount = TextEditingController(text: remaining.toStringAsFixed(2));
  final _ref = TextEditingController();
  String _method = 'MADA';
  DateTime _date = DateTime.now();
  bool _busy = false;
  String? _err;
  bool get _needsRef => ['BANK_TRANSFER', 'CHEQUE', 'SADAD'].contains(_method);

  Future<void> _save() async {
    final a = num.tryParse(_amount.text) ?? 0;
    if (a <= 0 || a > remaining + .001) return setState(() => _err = 'المبلغ بين 0 و ${sar(remaining)}');
    if (_needsRef && _ref.text.trim().isEmpty) return setState(() => _err = 'رقم المرجع مطلوب');
    setState(() { _busy = true; _err = null; });
    try {
      final r = await ref.read(contractsRepo).pay({'installmentId': widget.inst['id'], 'amount': a, 'method': _method,
        if (_ref.text.trim().isNotEmpty) 'reference': _ref.text.trim(), 'paidAt': _date.toUtc().toIso8601String()});
      if (mounted) Navigator.pop(context, r);
    } catch (e) { setState(() { _err = errorText(e); _busy = false; }); }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Ramz.border, borderRadius: BorderRadius.circular(99)))),
          const SizedBox(height: 16),
          Text('تسجيل دفعة · القسط ${widget.inst['seq']}', style: Ramz.display(20)),
          Text('المتبقي ${sar(remaining)} · استحقاق ${ymd(widget.inst['dueDate'])}', style: const TextStyle(color: Ramz.text2)),
          const SizedBox(height: 16),
          Wrap(spacing: 8, runSpacing: 8, children: [for (final e in paymentMethods.entries)
            ChoiceChip(label: Text(e.value), selected: _method == e.key, showCheckmark: false, selectedColor: Ramz.emerald.withOpacity(.2), onSelected: (_) => setState(() => _method = e.key))]),
          const SizedBox(height: 14),
          TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), style: Ramz.mono(16), decoration: const InputDecoration(labelText: 'المبلغ', suffixText: '﷼')),
          if (_needsRef) ...[const SizedBox(height: 12), TextField(controller: _ref, decoration: InputDecoration(labelText: _method == 'CHEQUE' ? 'رقم الشيك' : 'رقم المرجع'))],
          const SizedBox(height: 12),
          OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: AlignmentDirectional.centerStart),
            icon: const Icon(Icons.event), label: Text('تاريخ الدفع  ${ymd(_date.toIso8601String())}', style: Ramz.mono(14, FontWeight.w500)),
            onPressed: () async { final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2024), lastDate: DateTime.now()); if (d != null) setState(() => _date = d); }),
          if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, style: const TextStyle(color: Ramz.red))),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('تسجيل وإصدار سند')),
        ]),
      );
}

void showReceipt(BuildContext context, Map p) => showDialog(context: context, builder: (c) => AlertDialog(
      icon: const Icon(Icons.check_circle, color: Ramz.emerald, size: 40),
      title: const Text('سند قبض'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(p['receiptNo'], style: Ramz.mono(15)),
        const SizedBox(height: 8),
        Text(sar(p['amount']), style: Ramz.mono(26, FontWeight.w700).copyWith(color: Ramz.emerald)),
        const SizedBox(height: 8),
        Text('${paymentMethods[p['method']]} · ${ymd(p['paidAt'])}', style: const TextStyle(color: Ramz.text2)),
        if (p['contract'] != null) Text('${p['contract']['tenant']['fullName']} · ${p['contract']['code']}', style: const TextStyle(color: Ramz.text2, fontSize: 13)),
      ]),
      actions: [
        OutlinedButton.icon(icon: const Icon(Icons.print_outlined), label: const Text('طباعة السند'), onPressed: () => openDocument(context, 'receipt', p['id'])),
        FilledButton(onPressed: () => Navigator.pop(c), child: const Text('تم')),
      ],
    ));

// ───────── شاشة التحصيل ─────────
class PaymentsScreen extends ConsumerStatefulWidget {
  const PaymentsScreen({super.key});
  @override
  ConsumerState<PaymentsScreen> createState() => _PaymentsState();
}

class _PaymentsState extends ConsumerState<PaymentsScreen> {
  late Future<(Map<String, dynamic>, List<dynamic>)> _f = _load();
  Future<(Map<String, dynamic>, List<dynamic>)> _load() async {
    final r = ref.read(contractsRepo);
    final res = await Future.wait([r.summary(), r.payments()]);
    return (res[0] as Map<String, dynamic>, res[1] as List<dynamic>);
  }
  void _reload() => setState(() => _f = _load());
  bool get _canVoid => (ref.read(authProvider).user?.roles ?? []).contains('admin');

  Future<void> _void(Map p) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: Text('إلغاء السند ${p['receiptNo']}'),
      content: TextField(controller: ctl, decoration: const InputDecoration(hintText: 'سبب الإلغاء')),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('تراجع')),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: Ramz.red), onPressed: () => Navigator.pop(c, true), child: const Text('إلغاء السند'))],
    ));
    if (ok != true || ctl.text.trim().isEmpty) return;
    try { await ref.read(contractsRepo).voidPayment(p['id'], ctl.text.trim()); _reload(); }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e)))); }
  }

  Widget _kpi(String label, String value, Color c, [String? sub]) => Expanded(child: Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
        const SizedBox(height: 6),
        FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: Ramz.mono(18, FontWeight.w700).copyWith(color: c))),
        if (sub != null) Text(sub, style: const TextStyle(color: Ramz.text2, fontSize: 11)),
      ]))));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('التحصيل')),
        body: FutureBuilder(future: _f, builder: (c, s) {
          if (s.hasError) return errorBox(errorText(s.error!), _reload);
          if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
          final (sum, list) = s.data!;
          final upcoming = sum['upcoming'] as List;
          return RefreshIndicator(onRefresh: () async => _reload(), child: ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [
              _kpi('محصّل هذا الشهر', sar(sum['collectedThisMonth']), Ramz.emerald, '${sum['receiptsThisMonth']} سند'),
              const SizedBox(width: 8),
              _kpi('نسبة التحصيل', '${sum['collectionRate']}٪', Ramz.text, 'من ${sar(sum['dueThisMonth'])}'),
            ]),
            const SizedBox(height: 8),
            Row(children: [_kpi('متأخرات', sar(sum['overdueAmount']), Ramz.red, '${sum['overdueCount']} قسط')]),
            const SizedBox(height: 16),
            const Text('الأقساط القادمة والمتأخرة', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            if (upcoming.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('لا توجد أقساط مستحقة', style: TextStyle(color: Ramz.text2))),
            for (final i in upcoming) Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
              onTap: () async { await context.push('/contracts/${i['contract']['id']}'); _reload(); },
              title: Text(i['contract']['tenant']['fullName'], style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${i['contract']['unit']['property']['name']} · ${i['contract']['unit']['number']} · ${ymd(i['dueDate'])}', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(sar(num.parse('${i['total']}') - num.parse('${i['paidAmount']}')), style: Ramz.mono(14)),
                const SizedBox(height: 2), pill(installmentStatus[i['status']]!),
              ]),
            )),
            const SizedBox(height: 16),
            const Text('آخر السندات', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            if (list.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('لا توجد سندات', style: TextStyle(color: Ramz.text2))),
            for (final p in list) Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
              onTap: () => showReceipt(context, p),
              onLongPress: _canVoid && p['voidedAt'] == null ? () => _void(p) : null,
              leading: Icon(p['voidedAt'] != null ? Icons.block : Icons.receipt_long, color: p['voidedAt'] != null ? Ramz.red : Ramz.emerald),
              title: Text('${p['receiptNo']} · ${paymentMethods[p['method']]}', style: Ramz.mono(13, FontWeight.w500)),
              subtitle: Text('${p['contract']['tenant']['fullName']} · ${ymd(p['paidAt'])}${p['voidedAt'] != null ? ' · ملغي' : ''}', style: const TextStyle(color: Ramz.text2, fontSize: 12)),
              trailing: Text(sar(p['amount']), style: Ramz.mono(14).copyWith(decoration: p['voidedAt'] != null ? TextDecoration.lineThrough : null)),
            )),
            if (_canVoid && list.isNotEmpty) const Padding(padding: EdgeInsets.only(top: 4), child: Text('اضغط مطولاً على سند لإلغائه', style: TextStyle(color: Ramz.text2, fontSize: 12), textAlign: TextAlign.center)),
          ]));
        }),
      );
}
