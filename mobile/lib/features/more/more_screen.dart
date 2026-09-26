import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roles = ref.watch(authProvider).user?.roles ?? [];
    final staff = roles.any((r) => ['admin', 'employee', 'accountant'].contains(r));
    final items = <(IconData, String, String, String)>[
      (Icons.door_front_door_outlined, 'الوحدات', 'حالة الوحدات والسجل', '/units'),
      if (staff) (Icons.groups_outlined, 'العملاء', 'الملاك والمستأجرون', '/parties'),
      (Icons.checklist, 'المهام', 'مهامي ومتابعة الفريق', '/tasks'),
      if (staff) (Icons.payments_outlined, 'التحصيل', 'السندات والمتأخرات', '/payments'),
      (Icons.account_balance_outlined, 'كشف حساب المالك', 'التحصيلات والمصروفات والصافي', '/owner-statement'),
      (Icons.notifications_outlined, 'الإشعارات', 'التنبيهات والتحديثات', '/notifications'),
      (Icons.person_outline, 'حسابي', 'الملف الشخصي والأمان', '/profile'),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('المزيد')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        for (final it in items) Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
          onTap: () => it.$4 == '/units' || it.$4 == '/parties' || it.$4 == '/profile' ? context.go(it.$4) : context.push(it.$4),
          leading: CircleAvatar(backgroundColor: Ramz.emerald.withOpacity(.14), child: Icon(it.$1, color: Ramz.emerald, size: 20)),
          title: Text(it.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(it.$3, style: const TextStyle(color: Ramz.text2, fontSize: 12)),
          trailing: const Icon(Icons.chevron_left, color: Ramz.text2),
        )),
      ]),
    );
  }
}
