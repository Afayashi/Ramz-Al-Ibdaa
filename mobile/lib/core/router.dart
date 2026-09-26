import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/screens.dart';
import '../features/profile/profile_screens.dart';
import '../features/properties/property_screens.dart';
import '../features/properties/unit_screens.dart';
import 'shell.dart';
import '../features/parties/party_screens.dart';
import '../features/contracts/contract_screens.dart';
import '../features/payments/payment_screens.dart';
import '../features/handovers/handover_screen.dart';
import '../features/maintenance/maintenance_screens.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/reports/report_screens.dart';
import '../features/tasks/task_screens.dart';
import '../features/more/more_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ValueNotifier(0);
  ref.listen(authProvider, (_, __) => notifier.value++);
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    redirect: (_, s) {
      final a = ref.read(authProvider);
      final loc = s.matchedLocation;
      if (!a.ready) return '/splash';
      final open = ['/login', '/otp', '/forgot'].contains(loc);
      if (a.user == null) return open ? null : '/login';
      if (open || loc == '/splash') return homeFor(a.user!.roles);
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/otp', builder: (_, s) => OtpScreen(otpToken: s.extra as String)),
      GoRoute(path: '/forgot', builder: (_, __) => const ForgotPasswordScreen()),
      ShellRoute(builder: (_, __, child) => AppShell(child: child), routes: [
        GoRoute(path: '/properties', builder: (_, __) => const PropertiesListScreen()),
        GoRoute(path: '/units', builder: (_, __) => const UnitsListScreen()),
        GoRoute(path: '/contracts', builder: (_, __) => const ContractsListScreen()),
        GoRoute(path: '/parties', builder: (_, __) => const PartiesScreen()),
        GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
        GoRoute(path: '/more', builder: (_, __) => const MoreScreen()),
        GoRoute(path: '/maintenance', builder: (_, __) => const MaintenanceListScreen()),
        GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
        GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      ]),
      GoRoute(path: '/properties/new', builder: (_, __) => const PropertyFormScreen()),
      GoRoute(path: '/properties/:id', builder: (_, s) => PropertyDetailScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/properties/:id/edit', builder: (_, s) => PropertyFormScreen(id: s.pathParameters['id'])),
      GoRoute(path: '/properties/:id/units/new', builder: (_, s) => UnitFormScreen(propertyId: s.pathParameters['id']!)),
      GoRoute(path: '/owners/new', builder: (_, __) => const PartyFormScreen(kind: PartyType.owner)),
      GoRoute(path: '/owners/:id', builder: (_, s) => PartyDetailScreen(kind: PartyType.owner, id: s.pathParameters['id']!)),
      GoRoute(path: '/owners/:id/edit', builder: (_, s) => PartyFormScreen(kind: PartyType.owner, id: s.pathParameters['id'])),
      GoRoute(path: '/tenants/new', builder: (_, __) => const PartyFormScreen(kind: PartyType.tenant)),
      GoRoute(path: '/tenants/:id', builder: (_, s) => PartyDetailScreen(kind: PartyType.tenant, id: s.pathParameters['id']!)),
      GoRoute(path: '/tenants/:id/edit', builder: (_, s) => PartyFormScreen(kind: PartyType.tenant, id: s.pathParameters['id'])),
      GoRoute(path: '/units/:id', builder: (_, s) => UnitDetailScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/units/:id/edit', builder: (_, s) => UnitFormScreen(unitId: s.pathParameters['id'])),
      GoRoute(path: '/contracts/new', builder: (_, s) => ContractWizardScreen(unitId: s.uri.queryParameters['unit'])),
      GoRoute(path: '/contracts/:id', builder: (_, s) => ContractDetailScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/contracts/:id/handover/:type', builder: (_, s) => HandoverScreen(contractId: s.pathParameters['id']!, type: s.pathParameters['type']!)),
      GoRoute(path: '/maintenance/new', builder: (_, __) => const MaintenanceFormScreen()),
      GoRoute(path: '/maintenance/:id', builder: (_, s) => MaintenanceDetailScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/tasks', builder: (_, __) => const TasksScreen()),
      GoRoute(path: '/owner-statement', builder: (_, s) => OwnerStatementScreen(ownerId: s.uri.queryParameters['owner'])),
      GoRoute(path: '/payments', builder: (_, __) => const PaymentsScreen()),
      GoRoute(path: '/change-password', builder: (_, __) => const ChangePasswordScreen()),
    ],
  );
});
