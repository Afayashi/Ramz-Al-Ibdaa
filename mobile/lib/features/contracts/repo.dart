import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class ContractsRepo {
  ContractsRepo(this.dio);
  final Dio dio;
  Future<List<dynamic>> list({String? status}) async => (await dio.get('/contracts', queryParameters: {if (status != null) 'status': status})).data;
  Future<Map<String, dynamic>> get(String id) async => (await dio.get('/contracts/$id')).data;
  Future<Map<String, dynamic>> preview(Map<String, dynamic> d) async => (await dio.post('/contracts/preview', data: d)).data;
  Future<Map<String, dynamic>> create(Map<String, dynamic> d) async => (await dio.post('/contracts', data: d)).data;
  Future<void> action(String id, String a, [Map<String, dynamic>? body]) => dio.post('/contracts/$id/$a', data: body ?? {});
  Future<Map<String, dynamic>> pay(Map<String, dynamic> d) async => (await dio.post('/payments', data: d)).data;
  Future<List<dynamic>> payments({String? from, String? to}) async => (await dio.get('/payments', queryParameters: {if (from != null) 'from': from, if (to != null) 'to': to})).data;
  Future<Map<String, dynamic>> summary() async => (await dio.get('/payments/summary')).data;
  Future<void> voidPayment(String id, String reason) => dio.post('/payments/$id/void', data: {'reason': reason});
  Future<Map<String, dynamic>> handovers(String contractId) async => (await dio.get('/handovers/contract/$contractId')).data;
  Future<Map<String, dynamic>> saveHandover(Map<String, dynamic> d) async => (await dio.post('/handovers', data: d)).data;
  Future<void> signHandover(String id) => dio.post('/handovers/$id/sign');
  Future<List<dynamic>> units() async => (await dio.get('/units')).data;
  Future<List<dynamic>> tenants() async => (await dio.get('/tenants')).data;
}

final contractsRepo = Provider((ref) => ContractsRepo(ref.read(dioProvider)));

const contractStatus = {
  'DRAFT': ('مسودة', Ramz.text2), 'PENDING_APPROVAL': ('بانتظار الاعتماد', Ramz.gold), 'ACTIVE': ('ساري', Ramz.emerald),
  'EXPIRED': ('منتهي', Ramz.text2), 'TERMINATED': ('منهى', Ramz.red), 'CANCELLED': ('ملغي', Ramz.red),
};
const installmentStatus = {'PENDING': ('قادم', Ramz.text2), 'PAID': ('مدفوع', Ramz.emerald), 'OVERDUE': ('متأخر', Ramz.red), 'CANCELLED': ('ملغي', Ramz.text2)};
const frequencies = {'MONTHLY': 'شهري', 'QUARTERLY': 'ربع سنوي', 'SEMI_ANNUAL': 'نصف سنوي', 'ANNUAL': 'سنوي'};

final _nf = NumberFormat('#,##0.##', 'en');
String sar(dynamic v) => '${_nf.format(num.tryParse('$v') ?? 0)} ﷼';
String ymd(dynamic v) => v == null ? '—' : v.toString().substring(0, 10);

Widget pill((String, Color) s) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: s.$2.withOpacity(.14), borderRadius: BorderRadius.circular(99)),
      child: Text(s.$1, style: TextStyle(color: s.$2, fontSize: 12, fontWeight: FontWeight.w600)),
    );
const paymentMethods = {'MADA': 'مدى', 'BANK_TRANSFER': 'تحويل بنكي', 'SADAD': 'سداد', 'CASH': 'نقداً', 'CHEQUE': 'شيك'};
const conditions = {'GOOD': ('سليم', Ramz.emerald), 'FAIR': ('مقبول', Ramz.gold), 'DAMAGED': ('تالف', Ramz.red)};
