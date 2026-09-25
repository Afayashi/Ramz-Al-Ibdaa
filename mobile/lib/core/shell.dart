import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/auth_controller.dart';
import '../features/notifications/notifications_screen.dart';
import 'theme.dart';

typedef _Tab = (String path, IconData icon, IconData selected, String label);

List<_Tab> tabsFor(List<String> roles) {
  const props = ('/properties', Icons.apartment_outlined, Icons.apartment, 'العقارات');
  const contracts = ('/contracts', Icons.description_outlined, Icons.description, 'العقود');
  const maint = ('/maintenance', Icons.build_outlined, Icons.build, 'الصيانة');
  const notif = ('/notifications', Icons.notifications_outlined, Icons.notifications, 'الإشعارات');
  const profile = ('/profile', Icons.person_outline, Icons.person, 'حسابي');
  final staff = roles.any((r) => r == 'admin' || r == 'employee' || r == 'accountant');
  const dash = ('/dashboard', Icons.space_dashboard_outlined, Icons.space_dashboard, 'الرئيسية');
  const more = ('/more', Icons.grid_view_outlined, Icons.grid_view, 'المزيد');
  if (staff) return [dash, props, contracts, maint, more];
  if (roles.contains('technician')) return [('/maintenance', Icons.assignment_outlined, Icons.assignment, 'أوامر العمل'), notif, profile];
  if (roles.contains('tenant')) return [('/contracts', Icons.description_outlined, Icons.description, 'عقدي'), maint, notif, profile];
  return [dash, props, contracts, maint, more]; // owner
}

String homeFor(List<String> roles) => tabsFor(roles).first.$1;

class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({super.key, required this.child});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabs = tabsFor(ref.watch(authProvider).user?.roles ?? []);
    final loc = GoRouterState.of(context).matchedLocation;
    final hit = tabs.indexWhere((t) => loc.startsWith(t.$1));
    final i = hit >= 0 ? hit : tabs.length - 1; // /units, /parties, /profile live under «المزيد»
    final unread = ref.watch(unreadCount).valueOrNull ?? 0;
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: i,
        labelBehavior: tabs.length > 5 ? NavigationDestinationLabelBehavior.onlyShowSelected : NavigationDestinationLabelBehavior.alwaysShow,
        indicatorColor: Ramz.emerald.withOpacity(.18),
        onDestinationSelected: (n) { context.go(tabs[n].$1); ref.invalidate(unreadCount); },
        destinations: [
          for (final t in tabs) NavigationDestination(
            icon: t.$1 == '/notifications' && unread > 0 ? Badge(label: Text('$unread'), child: Icon(t.$2)) : Icon(t.$2),
            selectedIcon: Icon(t.$3, color: Ramz.emerald), label: t.$4),
        ],
      ),
    );
  }
}
