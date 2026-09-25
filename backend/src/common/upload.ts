import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' } as Record<string, string>;

// SEC-007: whitelist by extension + mimetype, random filename, size cap
export const imageUpload = (sub: string) => ({
  storage: diskStorage({
    destination: (_r, _f, cb) => { const d = join(process.env.UPLOAD_DIR || 'uploads', sub); mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_r, f, cb) => cb(null, randomUUID() + extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024, files: 10 },
  fileFilter: (_r: any, f: Express.Multer.File, cb: any) => {
    const ext = extname(f.originalname).toLowerCase();
    ALLOWED[ext] && ALLOWED[ext] === f.mimetype ? cb(null, true) : cb(new BadRequestException('نوع الملف غير مسموح'), false);
  },
});

const DOCS = { ...ALLOWED, '.pdf': 'application/pdf' } as Record<string, string>;
// TC-TEN-003 / TC-DOC-001 / SEC-007
export const docUpload = (sub: string) => ({
  storage: diskStorage({
    destination: (_r, _f, cb) => { const d = join(process.env.UPLOAD_DIR || 'uploads', sub); mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_r, f, cb) => cb(null, randomUUID() + extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024, files: 1 },
  fileFilter: (_r: any, f: Express.Multer.File, cb: any) => {
    const ext = extname(f.originalname).toLowerCase();
    DOCS[ext] && DOCS[ext] === f.mimetype ? cb(null, true) : cb(new BadRequestException('نوع الملف غير مسموح (PDF أو صورة فقط)'), false);
  },
});
