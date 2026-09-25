import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';
import 'core/router.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends ConsumerWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
        title: 'Property ERP',
        debugShowCheckedModeBanner: false,
        theme: RamzTheme.light,
        darkTheme: RamzTheme.dark,
        themeMode: ThemeMode.dark,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        routerConfig: ref.watch(routerProvider),
      );
}
