import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../properties/models.dart';
import '../contracts/repo.dart';
import '../../core/documents.dart';

/// Move-in / move-out inspection report for one contract.
class HandoverScreen extends ConsumerStatefulWidget {
  const HandoverScreen({super.key, required this.contractId, required this.type});
  final String contractId, type; // MOVE_IN | MOVE_OUT
  @override
  ConsumerState<HandoverScreen> createState() => _HandoverState();
}

class _HandoverState extends ConsumerState<HandoverScreen> {
  bool _loading = true, _busy = false;
  String? _err;
  Map<String, dynamic>? _h, _contract;
  List<Map<String, dynamic>> _items = [], _deds = [];
  final _elec = TextEditingController(), _water = TextEditingController(), _keys = TextEditingController(text: '2'), _notes = TextEditingController();
  bool get _out => widget.type == 'MOVE_OUT';
  bool get _signed => _h?['status'] == 'SIGNED';
  bool get _staff => (ref.read(authProvider).user?.roles ?? []).any((r) => r == 'admin' || r == 'employee');
  num get _deposit => num.tryParse('${_contract?['deposit']}') ?? 0;
  num get _dedTotal => _deds.fold<num>(0, (a, d) => a + (num.tryParse('${d['amount']}') ?? 0));

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _err = null; });
    try {
      final r = ref.read(contractsRepo);
      final res = await Future.wait([r.handovers(widget.contractId), r.get(widget.contractId)]);
      final data = res[0], list = (data['handovers'] as List).cast<Map<String, dynamic>>();
      _contract = res[1];
      _h = list.where((h) => h['type'] == widget.type).firstOrNull;
      final moveIn = list.where((h) => h['type'] == 'MOVE_IN').firstOrNull;
      final src = _h ?? (_out ? moveIn : null);   // move-out starts from move-in conditions for comparison
      _items = src != null
          ? (src['items'] as List).map((e) => Map<String, dynamic>.from(e)).toList()
          : (data['areas'] as List).map((a) => <String, dynamic>{'area': a, 'condition': 'GOOD', 'note': ''}).toList();
      if (_h != null) {
        _elec.text = '${_h!['electricity'] ?? ''}'; _water.text = '${_h!['water'] ?? ''}'; _keys.text = '${_h!['keysCount']}'; _notes.text = _h!['notes'] ?? '';
        _deds = (_h!['deductions'] as List).map((e) => Map<String, dynamic>.from(e)).toList();
      }
    } catch (e) { _err = errorText(e); }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      _h = await ref.read(contractsRepo).saveHandover({
        'contractId': widget.contractId, 'type': widget.type,
        'items': _items.map((i) => {'area': i['area'], 'condition': i['condition'], if ('${i['note']}'.isNotEmpty) 'note': i['note']}).toList(),
        if (_elec.text.isNotEmpty) 'electricity': num.tryParse(_elec.text), if (_water.text.isNotEmpty) 'water': num.tryParse(_water.text),
        'keysCount': int.tryParse(_keys.text) ?? 0, if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        if (_out) 'deductions': _deds.where((d) => '${d['label']}'.trim().isNotEmpty).map((d) => {'label': d['label'], 'amount': num.tryParse('${d['amount']}') ?? 0}).toList(),
      });
      _snack('تم حفظ المحضر');
    } catch (e) { _snack(errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _sign() async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('توقيع المحضر'),
      content: Text(_out ? 'بعد التوقيع يُعتمد مبلغ الاسترداد ولا يمكن التعديل.' : 'يقرّ المستأجر باستلام الوحدة بالحالة الموضحة.'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('توقيع'))],
    ));
    if (ok != true) return;
    setState(() => _busy = true);
    try { await ref.read(contractsRepo).signHandover(_h!['id']); await _load(); _snack('تم التوقيع'); } catch (e) { _snack(errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final editable = !_signed && _staff;
    return Scaffold(
      appBar: AppBar(title: Text(_out ? 'محضر التسليم' : 'محضر الاستلام'), actions: [if (_h != null) PrintButton(type: _out ? 'handoverOut' : 'handoverIn', id: widget.contractId)]),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Ramz.emerald))
          : _err != null ? errorBox(_err!, _load)
          : ListView(padding: const EdgeInsets.all(16), children: [
              Card(child: ListTile(
                title: Text('${_contract!['unit']['property']['name']} · ${_contract!['unit']['number']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${_contract!['tenant']['fullName']} · ${_contract!['code']}', style: const TextStyle(color: Ramz.text2)),
                trailing: pill(_signed ? ('موقّع', Ramz.emerald) : _h != null ? ('مسودة', Ramz.gold) : ('جديد', Ramz.text2)),
              )),
              const SizedBox(height: 16),
              const Text('بنود الفحص', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 8),
              for (final it in _items) Card(margin: const EdgeInsets.only(bottom: 8), child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(it['area'], style: const TextStyle(fontWeight: FontWeight.w600))),
                  for (final c in conditions.entries) Padding(padding: const EdgeInsetsDirectional.only(start: 6), child: ChoiceChip(
                    label: Text(c.value.$1, style: const TextStyle(fontSize: 12)), visualDensity: VisualDensity.compact, showCheckmark: false,
                    selected: it['condition'] == c.key, selectedColor: c.value.$2.withOpacity(.22),
                    onSelected: editable ? (_) => setState(() => it['condition'] = c.key) : null)),
                ]),
                if (it['condition'] != 'GOOD' || '${it['note'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: TextFormField(
                  initialValue: it['note'] ?? '', enabled: editable, decoration: const InputDecoration(hintText: 'ملاحظة', isDense: true),
                  onChanged: (v) => it['note'] = v)),
              ]))),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextField(controller: _elec, enabled: editable, keyboardType: TextInputType.number, style: Ramz.mono(14), decoration: const InputDecoration(labelText: 'عداد الكهرباء'))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: _water, enabled: editable, keyboardType: TextInputType.number, style: Ramz.mono(14), decoration: const InputDecoration(labelText: 'عداد المياه'))),
                const SizedBox(width: 8),
                SizedBox(width: 90, child: TextField(controller: _keys, enabled: editable, keyboardType: TextInputType.number, style: Ramz.mono(14), decoration: const InputDecoration(labelText: 'المفاتيح'))),
              ]),
              const SizedBox(height: 12),
              TextField(controller: _notes, enabled: editable, maxLines: 2, decoration: const InputDecoration(labelText: 'ملاحظات عامة')),
              if (_out) ...[
                const SizedBox(height: 20),
                Row(children: [
                  const Text('الخصومات من التأمين', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)), const Spacer(),
                  if (editable) TextButton.icon(onPressed: () => setState(() => _deds.add({'label': '', 'amount': ''})), icon: const Icon(Icons.add), label: const Text('بند')),
                ]),
                for (final d in _deds) Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
                  Expanded(flex: 2, child: TextFormField(initialValue: d['label'], enabled: editable, decoration: const InputDecoration(hintText: 'البند', isDense: true), onChanged: (v) => d['label'] = v)),
                  const SizedBox(width: 8),
                  Expanded(child: TextFormField(initialValue: '${d['amount']}', enabled: editable, keyboardType: TextInputType.number, style: Ramz.mono(14),
                    decoration: const InputDecoration(hintText: 'المبلغ', isDense: true), onChanged: (v) => setState(() => d['amount'] = v))),
                  if (editable) IconButton(icon: const Icon(Icons.close, color: Ramz.red), onPressed: () => setState(() => _deds.remove(d))),
                ])),
                Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [
                  _row('مبلغ التأمين', sar(_deposit)),
                  _row('الخصومات', '- ${sar(_dedTotal)}', color: Ramz.red),
                  const Divider(),
                  _row('المسترد للمستأجر', sar(_deposit - _dedTotal), color: _dedTotal > _deposit ? Ramz.red : Ramz.emerald, big: true),
                ]))),
              ],
              const SizedBox(height: 20),
              if (editable) FilledButton(onPressed: _busy ? null : _save, child: const Text('حفظ المحضر')),
              if (!_signed && _h != null) ...[const SizedBox(height: 8),
                OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _busy ? null : _sign, icon: const Icon(Icons.draw_outlined), label: const Text('توقيع المحضر'))],
              if (_signed) Padding(padding: const EdgeInsets.only(top: 4), child: Text('وُقّع في ${ymd(_h!['signedAt'])}', textAlign: TextAlign.center, style: const TextStyle(color: Ramz.text2))),
            ]),
    );
  }

  Widget _row(String k, String v, {Color? color, bool big = false}) => Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [
        Text(k, style: const TextStyle(color: Ramz.text2)), const Spacer(), Text(v, style: Ramz.mono(big ? 17 : 14, big ? FontWeight.w700 : FontWeight.w600).copyWith(color: color)),
      ]));
}
