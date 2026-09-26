import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';

final money = NumberFormat('#,##0', 'en');

const propertyTypes = {'VILLA': 'فيلا', 'APARTMENT_BUILDING': 'عمارة', 'TOWER': 'برج', 'OFFICE_BUILDING': 'مبنى مكاتب', 'COMMERCIAL': 'تجاري', 'WAREHOUSE': 'مستودع', 'COMPOUND': 'مجمع سكني', 'LAND': 'أرض'};
const unitTypes = {'APARTMENT': 'شقة', 'VILLA': 'فيلا', 'OFFICE': 'مكتب', 'SHOP': 'محل', 'WAREHOUSE': 'مستودع', 'STUDIO': 'استوديو'};
const unitStatus = {'AVAILABLE': 'متاحة', 'RENTED': 'مؤجرة', 'RESERVED': 'محجوزة', 'MAINTENANCE': 'تحت الصيانة', 'AVAILABLE_PRIMARY': 'رئيسي'};
const statusColor = {'AVAILABLE': Ramz.emerald, 'AVAILABLE_PRIMARY': Ramz.emerald, 'RENTED': Color(0xFF2BA6B8), 'RESERVED': Ramz.gold, 'MAINTENANCE': Ramz.red};
// Mirrors backend MANUAL transitions
const manualTransitions = {'AVAILABLE': ['RESERVED', 'MAINTENANCE'], 'RESERVED': ['AVAILABLE', 'MAINTENANCE'], 'MAINTENANCE': ['AVAILABLE'], 'RENTED': ['MAINTENANCE']};

class StatusPill extends StatelessWidget {
  final String status;
  const StatusPill(this.status, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = statusColor[status] ?? Ramz.text2;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: c.withOpacity(.16), borderRadius: BorderRadius.circular(99)),
      child: Text(unitStatus[status] ?? status, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class Stat extends StatelessWidget {
  final String label, value;
  final Color? color;
  const Stat(this.label, this.value, {super.key, this.color});
  @override
  Widget build(BuildContext context) => Expanded(child: Card(child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: Ramz.mono(18, FontWeight.w700).copyWith(color: color)),
        ]),
      )));
}

Widget errorBox(Object e, VoidCallback retry) => Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off, color: Ramz.text2, size: 36),
      const SizedBox(height: 8),
      Text(e.toString(), textAlign: TextAlign.center),
      TextButton(onPressed: retry, child: const Text('إعادة المحاولة')),
    ])));
