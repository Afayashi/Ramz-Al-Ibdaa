import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';

const roleNames = {'admin': 'مدير النظام', 'employee': 'موظف إدارة الأملاك', 'accountant': 'المحاسب', 'owner': 'المالك', 'tenant': 'المستأجر', 'technician': 'الفني'};

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authProvider).user;
    if (u == null) return const SizedBox.shrink();
    Widget row(IconData i, String k, String v, {bool mono = false}) => ListTile(
          leading: Icon(i, color: Ramz.text2),
          title: Text(k, style: const TextStyle(color: Ramz.text2, fontSize: 13)),
          subtitle: Text(v, style: mono ? Ramz.mono(15) : const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Padding(padding: const EdgeInsets.all(20), child: Row(children: [
          CircleAvatar(radius: 28, backgroundColor: Ramz.emerald.withOpacity(.18),
              child: Text(u.fullName.characters.first, style: Ramz.display(22).copyWith(color: Ramz.emerald))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(u.fullName, style: Ramz.display(20)),
            const SizedBox(height: 6),
            Wrap(spacing: 6, children: u.roles.map((r) => Chip(label: Text(roleNames[r] ?? r), visualDensity: VisualDensity.compact,
                backgroundColor: Ramz.emerald.withOpacity(.14), side: BorderSide.none, labelStyle: const TextStyle(color: Ramz.emerald, fontSize: 12))).toList()),
          ])),
        ]))),
        const SizedBox(height: 12),
        Card(child: Column(children: [
          row(Icons.mail_outline, 'البريد الإلكتروني', u.email),
          const Divider(height: 1),
          row(Icons.phone_iphone, 'رقم الجوال', u.phone, mono: true),
        ])),
        const SizedBox(height: 12),
        Card(child: Column(children: [
          ListTile(leading: const Icon(Icons.lock_reset), title: const Text('تغيير كلمة المرور'), trailing: const Icon(Icons.chevron_left), onTap: () => context.push('/change-password')),
          const Divider(height: 1),
          ListTile(leading: const Icon(Icons.logout, color: Ramz.red), title: const Text('تسجيل الخروج', style: TextStyle(color: Ramz.red)),
              onTap: () => ref.read(authProvider.notifier).logout()),
        ])),
      ]),
    );
  }
}

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangeState();
}

class _ChangeState extends ConsumerState<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _cur = TextEditingController(), _new = TextEditingController(), _conf = TextEditingController();
  bool _b = false;
  String? _err;
  static final _strong = RegExp(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$');

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _b = true; _err = null; });
    try {
      await ref.read(authProvider.notifier).changePassword(_cur.text, _new.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تغيير كلمة المرور')));
      context.pop();
    } catch (e) {
      setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _b = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تغيير كلمة المرور')),
        body: Form(key: _form, child: ListView(padding: const EdgeInsets.all(20), children: [
          if (_err != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_err!, style: const TextStyle(color: Ramz.red, fontWeight: FontWeight.w600))),
          TextFormField(controller: _cur, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور الحالية'), validator: (v) => (v ?? '').isEmpty ? 'مطلوب' : null),
          const SizedBox(height: 14),
          TextFormField(controller: _new, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور الجديدة', helperText: '8 أحرف على الأقل، حرف كبير وصغير ورقم'),
              validator: (v) => _strong.hasMatch(v ?? '') ? null : 'كلمة المرور ضعيفة'),
          const SizedBox(height: 14),
          TextFormField(controller: _conf, obscureText: true, decoration: const InputDecoration(labelText: 'تأكيد كلمة المرور'), validator: (v) => v == _new.text ? null : 'غير متطابقة'),
          const SizedBox(height: 20),
          FilledButton(onPressed: _b ? null : _submit, child: _b ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('حفظ')),
        ])),
      );
}
