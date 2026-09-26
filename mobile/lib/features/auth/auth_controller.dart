import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';

class AuthUser {
  final String id, fullName, email, phone;
  final List<String> roles;
  AuthUser.fromJson(Map<String, dynamic> j)
      : id = j['id'], fullName = j['fullName'], email = j['email'], phone = j['phone'],
        roles = ((j['roles'] as List?) ?? []).map((r) => r is String ? r : r['role']['code'] as String).toList();
}

class AuthState {
  final bool ready;
  final AuthUser? user;
  const AuthState({this.ready = false, this.user});
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this.ref) : super(const AuthState()) { _restore(); }
  final Ref ref;
  get _dio => ref.read(dioProvider);
  get _storage => ref.read(storageProvider);

  Future<void> _restore() async {
    try {
      if (await _storage.read(key: 'access') != null) {
        final r = await _dio.get('/users/me');
        state = AuthState(ready: true, user: AuthUser.fromJson(r.data));
        return;
      }
    } catch (_) {}
    state = const AuthState(ready: true);
  }

  Future<String> login(String identifier, String password) async =>
      (await _dio.post('/auth/login', data: {'identifier': identifier, 'password': password})).data['otpToken'];

  Future<void> verifyOtp(String otpToken, String code) async {
    final r = await _dio.post('/auth/verify-otp', data: {'otpToken': otpToken, 'code': code});
    await _storage.write(key: 'access', value: r.data['accessToken']);
    await _storage.write(key: 'refresh', value: r.data['refreshToken']);
    state = AuthState(ready: true, user: AuthUser.fromJson(r.data['user']));
  }

  Future<String> forgot(String identifier) async =>
      (await _dio.post('/auth/forgot-password', data: {'identifier': identifier})).data['otpToken'];

  Future<void> reset(String otpToken, String code, String pw) =>
      _dio.post('/auth/reset-password', data: {'otpToken': otpToken, 'code': code, 'newPassword': pw});

  Future<void> changePassword(String current, String next) =>
      _dio.post('/auth/change-password', data: {'currentPassword': current, 'newPassword': next});

  Future<void> logout() async {
    try { await _dio.post('/auth/logout'); } catch (_) {}
    await _storage.deleteAll();
    state = const AuthState(ready: true);
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));
