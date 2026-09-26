import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';

class PropertiesRepo {
  PropertiesRepo(this.dio);
  final Dio dio;
  Future<Map<String, dynamic>> list({String? q, String? type, int page = 1}) async =>
      (await dio.get('/properties', queryParameters: {if (q != null && q.isNotEmpty) 'q': q, if (type != null) 'type': type, 'page': page})).data;
  Future<Map<String, dynamic>> get(String id) async => (await dio.get('/properties/$id')).data;
  Future<Map<String, dynamic>> create(Map<String, dynamic> d) async => (await dio.post('/properties', data: d)).data;
  Future<Map<String, dynamic>> update(String id, Map<String, dynamic> d) async => (await dio.patch('/properties/$id', data: d)).data;
  Future<void> archive(String id) => dio.delete('/properties/$id');
  Future<void> uploadImages(String id, List<String> paths) async {
    final form = FormData.fromMap({'images': [for (final p in paths) await MultipartFile.fromFile(p)]});
    await dio.post('/properties/$id/images', data: form);
  }
  Future<List<dynamic>> owners([String? q]) async => (await dio.get('/owners', queryParameters: {if (q != null) 'q': q})).data;

  Future<List<dynamic>> units({String? propertyId, String? status}) async =>
      (await dio.get('/units', queryParameters: {if (propertyId != null) 'propertyId': propertyId, if (status != null) 'status': status})).data;
  Future<Map<String, dynamic>> unit(String id) async => (await dio.get('/units/$id')).data;
  Future<void> createUnit(Map<String, dynamic> d) => dio.post('/units', data: d);
  Future<void> updateUnit(String id, Map<String, dynamic> d) => dio.patch('/units/$id', data: d);
  Future<void> setStatus(String id, String status, String? reason) => dio.patch('/units/$id/status', data: {'status': status, if (reason != null && reason.isNotEmpty) 'reason': reason});
  Future<void> archiveUnit(String id) => dio.delete('/units/$id');
}

final propertiesRepo = Provider((ref) => PropertiesRepo(ref.read(dioProvider)));
final propertyDetail = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) => ref.read(propertiesRepo).get(id));
final unitDetail = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) => ref.read(propertiesRepo).unit(id));
