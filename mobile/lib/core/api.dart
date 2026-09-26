import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api');
final storageProvider = Provider((_) => const FlutterSecureStorage());

class ApiError implements Exception {
  final String message;
  ApiError(this.message);
  @override
  String toString() => message;
}

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(storageProvider);
  final dio = Dio(BaseOptions(baseUrl: apiUrl, connectTimeout: const Duration(seconds: 10)));
  dio.interceptors.add(QueuedInterceptorsWrapper(
    onRequest: (o, h) async {
      final t = await storage.read(key: 'access');
      if (t != null) o.headers['Authorization'] = 'Bearer $t';
      h.next(o);
    },
    onError: (e, h) async {
      // Auto refresh on 401 once
      if (e.response?.statusCode == 401 && e.requestOptions.extra['retried'] != true && !e.requestOptions.path.startsWith('/auth/')) {
        final rt = await storage.read(key: 'refresh');
        if (rt != null) {
          try {
            final r = await Dio(BaseOptions(baseUrl: apiUrl)).post('/auth/refresh', data: {'refreshToken': rt});
            await storage.write(key: 'access', value: r.data['accessToken']);
            await storage.write(key: 'refresh', value: r.data['refreshToken']);
            final req = e.requestOptions..extra['retried'] = true;
            req.headers['Authorization'] = 'Bearer ${r.data['accessToken']}';
            return h.resolve(await dio.fetch(req));
          } catch (_) {
            await storage.deleteAll();
          }
        }
      }
      final msg = e.response?.data is Map ? (e.response!.data['message']?.toString() ?? 'حدث خطأ') : 'تعذر الاتصال بالخادم';
      h.reject(DioException(requestOptions: e.requestOptions, response: e.response, error: ApiError(msg)));
    },
  ));
  return dio;
});

String errorText(Object e) => e is DioException && e.error is ApiError ? (e.error as ApiError).message : e.toString();
