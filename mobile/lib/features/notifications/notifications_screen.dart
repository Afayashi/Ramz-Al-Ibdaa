import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../properties/models.dart';

final unreadCount = FutureProvider.autoDispose<int>((ref) async => ((await ref.read(dioProvider).get('/notifications/unread-count')).data['count'] as num).toInt());

const _icons = {'CONTRACT': Icons.description_outlined, 'PAYMENT': Icons.payments_outlined, 'MAINTENANCE': Icons.build_outlined, 'HANDOVER': Icons.key_outlined, 'SYSTEM': Icons.info_outline};

String ago(String iso) {
  final d = DateTime.now().difference(DateTime.parse(iso).toLocal());
  if (d.inMinutes < 1) return 'الآن';
  if (d.inMinutes < 60) return 'منذ ${d.inMinutes} د';
  if (d.inHours < 24) return 'منذ ${d.inHours} س';
  if (d.inDays < 30) return 'منذ ${d.inDays} يوم';
  return iso.substring(0, 10);
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NState();
}

class _NState extends ConsumerState<NotificationsScreen> {
  late Future<List<dynamic>> _f = _load();
  Future<List<dynamic>> _load() async => (await ref.read(dioProvider).get('/notifications')).data;
  void _reload() { setState(() => _f = _load()); ref.invalidate(unreadCount); }

  Future<void> _open(Map n) async {
    if (n['readAt'] == null) await ref.read(dioProvider).post('/notifications/${n['id']}/read');
    final route = switch (n['entityType']) { 'CONTRACT' => '/contracts/${n['entityId']}', 'MAINTENANCE' => '/maintenance/${n['entityId']}', _ => null };
    if (route != null && mounted) await context.push(route);
    _reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('الإشعارات'), actions: [
          TextButton(onPressed: () async { await ref.read(dioProvider).post('/notifications/read-all'); _reload(); }, child: const Text('قراءة الكل')),
        ]),
        body: FutureBuilder(future: _f, builder: (c, s) {
          if (s.hasError) return errorBox(errorText(s.error!), _reload);
          if (!s.hasData) return const Center(child: CircularProgressIndicator(color: Ramz.emerald));
          if (s.data!.isEmpty) return const Center(child: Text('لا توجد إشعارات', style: TextStyle(color: Ramz.text2)));
          return RefreshIndicator(onRefresh: () async => _reload(), child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8), itemCount: s.data!.length, separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
            itemBuilder: (_, i) {
              final n = s.data![i];
              final unread = n['readAt'] == null;
              return ListTile(
                onTap: () => _open(n),
                leading: CircleAvatar(backgroundColor: Ramz.emerald.withOpacity(unread ? .18 : .06), child: Icon(_icons[n['type']] ?? Icons.info_outline, color: unread ? Ramz.emerald : Ramz.text2, size: 20)),
                title: Text(n['title'], style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w500)),
                subtitle: Text(n['body'], style: const TextStyle(color: Ramz.text2, fontSize: 13)),
                trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(ago(n['createdAt']), style: const TextStyle(color: Ramz.text2, fontSize: 11)),
                  if (unread) Container(margin: const EdgeInsets.only(top: 6), width: 8, height: 8, decoration: const BoxDecoration(color: Ramz.emerald, shape: BoxShape.circle)),
                ]),
              );
            },
          ));
        }),
      );
}
