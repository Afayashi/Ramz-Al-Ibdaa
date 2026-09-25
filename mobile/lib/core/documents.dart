import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'theme.dart';

/// Opens a printable, branded document (logo · signature · stamp) in the browser via a 10-minute signed link.
/// type: receipt | paymentDemand | renewalNotice | handoverIn | handoverOut | maintRequest | ownerStatement
Future<void> openDocument(BuildContext context, String type, String id, {String? from, String? to}) async {
  final dio = ProviderScope.containerOf(context, listen: false).read(dioProvider);
  final messenger = ScaffoldMessenger.of(context);
  try {
    final r = await dio.post('/documents/link', data: {'type': type, 'id': id, if (from != null) 'from': from, if (to != null) 'to': to});
    final host = apiUrl.replaceFirst(RegExp(r'/api/?$'), '');
    final ok = await launchUrl(Uri.parse(host + (r.data['url'] as String)), mode: LaunchMode.externalApplication);
    if (!ok) messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح المتصفح')));
  } catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
  }
}

class PrintButton extends StatelessWidget {
  const PrintButton({super.key, required this.type, required this.id, this.from, this.to, this.tooltip = 'طباعة النموذج'});
  final String type, id, tooltip;
  final String? from, to;
  @override
  Widget build(BuildContext context) => IconButton(tooltip: tooltip, icon: const Icon(Icons.print_outlined), onPressed: () => openDocument(context, type, id, from: from, to: to));
}

class DocumentsMenu extends StatelessWidget {
  const DocumentsMenu({super.key, required this.contractId, required this.status});
  final String contractId, status;
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
        tooltip: 'النماذج',
        icon: const Icon(Icons.print_outlined),
        onSelected: (t) => openDocument(context, t, contractId),
        itemBuilder: (_) => [
          if (status == 'ACTIVE') const PopupMenuItem(value: 'paymentDemand', child: ListTile(leading: Icon(Icons.warning_amber_rounded, color: Ramz.red), title: Text('إشعار مطالبة بالسداد'))),
          if (status == 'ACTIVE') const PopupMenuItem(value: 'renewalNotice', child: ListTile(leading: Icon(Icons.autorenew), title: Text('إشعار تجديد العقد'))),
          if (status != 'DRAFT' && status != 'CANCELLED') const PopupMenuItem(value: 'handoverIn', child: ListTile(leading: Icon(Icons.key_outlined), title: Text('محضر استلام'))),
          if (status != 'DRAFT' && status != 'CANCELLED') const PopupMenuItem(value: 'handoverOut', child: ListTile(leading: Icon(Icons.logout), title: Text('محضر تسليم وإخلاء'))),
        ],
      );
}
