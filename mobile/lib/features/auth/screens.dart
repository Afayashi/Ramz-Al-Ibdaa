import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pinput/pinput.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import 'auth_controller.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Ramz.emeraldDark, Ramz.bg])),
          child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 72, height: 72, decoration: BoxDecoration(color: Ramz.emerald, borderRadius: BorderRadius.circular(20)),
                child: const Icon(Icons.apartment_rounded, color: Colors.white, size: 38)),
            const SizedBox(height: 16),
            Text('Property ERP', style: Ramz.display(28).copyWith(color: Colors.white)),
            const SizedBox(height: 4),
            const Text('نظام إدارة العقارات والأملاك', style: TextStyle(color: Ramz.text2)),
            const SizedBox(height: 28),
            const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Ramz.emerald)),
          ])),
        ),
      );
}

class _AuthScaffold extends StatelessWidget {
  final String title, subtitle;
  final List<Widget> children;
  final bool back;
  const _AuthScaffold({required this.title, required this.subtitle, required this.children, this.back = false});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: back ? AppBar() : null,
        body: SafeArea(child: ListView(padding: const EdgeInsets.all(24), children: [
          if (!back) const SizedBox(height: 48),
          Text(title, style: Ramz.display(26)),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(color: Ramz.text2)),
          const SizedBox(height: 28),
          ...children,
        ])),
      );
}

Widget _error(String? e) => e == null
    ? const SizedBox.shrink()
    : Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Ramz.red.withOpacity(.14), borderRadius: BorderRadius.circular(12)),
        child: Text(e, style: const TextStyle(color: Ramz.red, fontWeight: FontWeight.w600)),
      );

Widget _busy(bool b, String label) => b ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(label);

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _id = TextEditingController(), _pw = TextEditingController();
  bool _busyState = false, _obscure = true;
  String? _err;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busyState = true; _err = null; });
    try {
      final t = await ref.read(authProvider.notifier).login(_id.text.trim(), _pw.text);
      if (mounted) context.push('/otp', extra: t);
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _busyState = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
        title: 'تسجيل الدخول',
        subtitle: 'أدخل بريدك الإلكتروني أو رقم جوالك وكلمة المرور',
        children: [
          Form(key: _form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _error(_err),
            TextFormField(controller: _id, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'البريد الإلكتروني أو الجوال', prefixIcon: Icon(Icons.person_outline)),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'هذا الحقل مطلوب' : null),
            const SizedBox(height: 14),
            TextFormField(controller: _pw, obscureText: _obscure,
                decoration: InputDecoration(labelText: 'كلمة المرور', prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscure = !_obscure))),
                validator: (v) => (v == null || v.isEmpty) ? 'هذا الحقل مطلوب' : null,
                onFieldSubmitted: (_) => _submit()),
            Align(alignment: AlignmentDirectional.centerEnd, child: TextButton(onPressed: () => context.push('/forgot'), child: const Text('نسيت كلمة المرور؟'))),
            const SizedBox(height: 8),
            FilledButton(onPressed: _busyState ? null : _submit, child: _busy(_busyState, 'تسجيل الدخول')),
            const SizedBox(height: 20),
            const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.verified_user_outlined, size: 16, color: Ramz.emerald), SizedBox(width: 6),
              Text('محمي بتحقق ثنائي وتشفير كامل', style: TextStyle(color: Ramz.text2, fontSize: 13)),
            ]),
          ])),
        ],
      );
}

class OtpScreen extends ConsumerStatefulWidget {
  final String otpToken;
  const OtpScreen({super.key, required this.otpToken});
  @override
  ConsumerState<OtpScreen> createState() => _OtpState();
}

class _OtpState extends ConsumerState<OtpScreen> {
  bool _b = false;
  String? _err;
  Future<void> _verify(String code) async {
    setState(() { _b = true; _err = null; });
    try {
      await ref.read(authProvider.notifier).verifyOtp(widget.otpToken, code);
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _b = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = PinTheme(width: 50, height: 56, textStyle: Ramz.mono(22, FontWeight.w700),
        decoration: BoxDecoration(color: Theme.of(context).cardTheme.color, borderRadius: BorderRadius.circular(12), border: Border.all(color: Ramz.border)));
    return _AuthScaffold(back: true, title: 'رمز التحقق', subtitle: 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى جوالك', children: [
      _error(_err),
      Directionality(textDirection: TextDirection.ltr, child: Pinput(length: 6, autofocus: true, defaultPinTheme: theme,
          focusedPinTheme: theme.copyDecorationWith(border: Border.all(color: Ramz.emerald, width: 2)), onCompleted: _verify)),
      const SizedBox(height: 24),
      if (_b) const Center(child: CircularProgressIndicator(color: Ramz.emerald)),
      const Text('صلاحية الرمز 5 دقائق', textAlign: TextAlign.center, style: TextStyle(color: Ramz.text2, fontSize: 13)),
    ]);
  }
}

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotState();
}

class _ForgotState extends ConsumerState<ForgotPasswordScreen> {
  final _id = TextEditingController(), _code = TextEditingController(), _pw = TextEditingController();
  String? _token, _err;
  bool _b = false, _done = false;

  Future<void> _run(Future<void> Function() f) async {
    setState(() { _b = true; _err = null; });
    try { await f(); } catch (e) { setState(() => _err = errorText(e)); } finally { if (mounted) setState(() => _b = false); }
  }

  @override
  Widget build(BuildContext context) {
    final a = ref.read(authProvider.notifier);
    if (_done) {
      return _AuthScaffold(back: true, title: 'تم تغيير كلمة المرور', subtitle: 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة', children: [
        FilledButton(onPressed: () => context.go('/login'), child: const Text('العودة لتسجيل الدخول')),
      ]);
    }
    return _AuthScaffold(back: true, title: 'استعادة كلمة المرور',
        subtitle: _token == null ? 'سنرسل رمز تحقق إلى جوالك المسجل' : 'أدخل الرمز وكلمة المرور الجديدة', children: [
      _error(_err),
      if (_token == null) ...[
        TextField(controller: _id, decoration: const InputDecoration(labelText: 'البريد الإلكتروني أو الجوال')),
        const SizedBox(height: 16),
        FilledButton(onPressed: _b ? null : () => _run(() async { final t = await a.forgot(_id.text.trim()); setState(() => _token = t); }), child: _busy(_b, 'إرسال الرمز')),
      ] else ...[
        TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: '')),
        const SizedBox(height: 14),
        TextField(controller: _pw, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور الجديدة', helperText: '8 أحرف على الأقل، حرف كبير وصغير ورقم')),
        const SizedBox(height: 16),
        FilledButton(onPressed: _b ? null : () => _run(() async { await a.reset(_token!, _code.text.trim(), _pw.text); setState(() => _done = true); }), child: _busy(_b, 'تعيين كلمة المرور')),
      ],
    ]);
  }
}
