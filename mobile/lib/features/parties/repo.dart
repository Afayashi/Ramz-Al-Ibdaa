import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';

enum PartyType { owner, tenant }
extension PartyTypeX on PartyType {
  String get path => this == PartyType.owner ? 'owners' : 'tenants';
  String get entity => this == PartyType.owner ? 'OWNER' : 'TENANT';
  String get label => this == PartyType.owner ? 'مالك' : 'مستأجر';
  String get plural => this == PartyType.owner ? 'الملاك' : 'المستأجرون';
}

class PartiesRepo {
  PartiesRepo(this.dio);
  final Dio dio;
  Future<List<dynamic>> list(PartyType t, [String? q]) async => (await dio.get('/${t.path}', queryParameters: {if (q != null && q.isNotEmpty) 'q': q})).data;
  Future<Map<String, dynamic>> get(PartyType t, String id) async => (await dio.get('/${t.path}/$id')).data;
  Future<void> create(PartyType t, Map<String, dynamic> d) => dio.post('/${t.path}', data: d);
  Future<void> update(PartyType t, String id, Map<String, dynamic> d) => dio.patch('/${t.path}/$id', data: d);
  Future<void> archive(PartyType t, String id) => dio.delete('/${t.path}/$id');
  Future<void> addBank(String ownerId, Map<String, dynamic> d) => dio.post('/owners/$ownerId/bank-accounts', data: d);
  Future<void> setPrimary(String ownerId, String acc) => dio.patch('/owners/$ownerId/bank-accounts/$acc/primary');
  Future<void> removeBank(String ownerId, String acc) => dio.delete('/owners/$ownerId/bank-accounts/$acc');
  Future<void> upload(String entity, String id, String category, String path, String name) async => dio.post('/attachments',
      data: FormData.fromMap({'entityType': entity, 'entityId': id, 'category': category, 'file': await MultipartFile.fromFile(path, filename: name)}));
  Future<void> removeAttachment(String id) => dio.delete('/attachments/$id');
}

final partiesRepo = Provider((ref) => PartiesRepo(ref.read(dioProvider)));
final partyDetail = FutureProvider.autoDispose.family<Map<String, dynamic>, (PartyType, String)>((ref, k) => ref.read(partiesRepo).get(k.$1, k.$2));

// Client-side mirrors of backend validators
bool isSaudiId(String v) {
  if (!RegExp(r'^[12]\d{9}$').hasMatch(v)) return false;
  var sum = 0;
  for (var i = 0; i < 10; i++) {
    var d = int.parse(v[i]);
    if (i.isEven) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 == 0;
}
bool isSaIban(String raw) {
  final v = raw.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  if (!RegExp(r'^SA\d{22}$').hasMatch(v)) return false;
  final r = (v.substring(4) + v.substring(0, 4)).replaceAllMapped(RegExp('[A-Z]'), (m) => '${m[0]!.codeUnitAt(0) - 55}');
  var m = 0;
  for (final ch in r.split('')) m = (m * 10 + int.parse(ch)) % 97;
  return m == 1;
}
