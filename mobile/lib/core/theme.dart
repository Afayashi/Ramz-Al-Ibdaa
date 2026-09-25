import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class Ramz {
  static const emerald = Color(0xFF12B886);
  static const emeraldDark = Color(0xFF0C8A64);
  static const gold = Color(0xFFD9A93E);
  static const red = Color(0xFFE5484D);
  static const bg = Color(0xFF0B1210);
  static const card = Color(0xFF121C19);
  static const border = Color(0xFF1F2C28);
  static const text = Color(0xFFE8EFEC);
  static const text2 = Color(0xFF8FA39B);
  static TextStyle mono([double size = 15, FontWeight w = FontWeight.w600]) =>
      GoogleFonts.ibmPlexMono(fontSize: size, fontWeight: w, fontFeatures: const [FontFeature.tabularFigures()]);
  static TextStyle display([double size = 28]) =>
      GoogleFonts.tajawal(fontSize: size, fontWeight: FontWeight.w800, letterSpacing: -0.02 * size);
}

class RamzTheme {
  static ThemeData _base(Brightness b) {
    final dark = b == Brightness.dark;
    final bg = dark ? Ramz.bg : const Color(0xFFF6F8F7);
    final card = dark ? Ramz.card : Colors.white;
    final border = dark ? Ramz.border : const Color(0xFFDDE5E1);
    final text = dark ? Ramz.text : const Color(0xFF1B2622);
    final t = GoogleFonts.ibmPlexSansArabicTextTheme().apply(bodyColor: text, displayColor: text);
    OutlineInputBorder ob(Color c) => OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c));
    return ThemeData(
      brightness: b,
      useMaterial3: true,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme.fromSeed(seedColor: Ramz.emerald, brightness: b, primary: Ramz.emerald, error: Ramz.red, surface: card),
      textTheme: t.copyWith(bodyMedium: t.bodyMedium?.copyWith(fontSize: 15)),
      cardTheme: CardTheme(color: card, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: border))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: ob(border), enabledBorder: ob(border), focusedBorder: ob(Ramz.emerald), errorBorder: ob(Ramz.red),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
        backgroundColor: Ramz.emerald, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.ibmPlexSansArabic(fontSize: 15, fontWeight: FontWeight.w600),
      )),
      appBarTheme: AppBarTheme(backgroundColor: bg, foregroundColor: text, elevation: 0, centerTitle: true),
    );
  }
  static final light = _base(Brightness.light);
  static final dark = _base(Brightness.dark);
}
