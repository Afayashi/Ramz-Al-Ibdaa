import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt, createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

type Ctx = { ip?: string; userAgent?: string };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOCK_MIN = Number(process.env.LOCK_MINUTES || 15);

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  private findByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({ where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }] } });
  }

  // TC-AUTH-001 / 002 / 003
  async login(identifier: string, password: string, ctx: Ctx) {
    const user = await this.findByIdentifier(identifier);
    if (!user) { await this.audit.log('LOGIN_FAILED', null, ctx, { identifier }); throw new UnauthorizedException('بيانات الدخول غير صحيحة'); }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('الحساب موقوف');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException('الحساب مقفل مؤقتاً، حاول لاحقاً');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const attempts = user.failedAttempts + 1;
      const lock = attempts >= MAX;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + LOCK_MIN * 60_000) : null } });
      await this.audit.log(lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', user.id, ctx, { attempts });
      throw lock ? new ForbiddenException('تم قفل الحساب بعد 5 محاولات فاشلة') : new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
    return { otpToken: await this.issueOtp(user.id, 'login', user.phone) };
  }

  private async issueOtp(userId: string, purpose: string, phone: string) {
    const code = String(randomInt(100000, 1000000));
    const otp = await this.prisma.otpCode.create({ data: { userId, purpose, codeHash: sha(code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
    console.log(`[OTP] ${purpose} for ${phone}: ${code}`); // TODO Sprint 11: SMS provider
    return otp.id;
  }

  private async consumeOtp(otpToken: string, code: string, purpose: string) {
    const otp = await this.prisma.otpCode.findUnique({ where: { id: otpToken } });
    if (!otp || otp.purpose !== purpose || otp.usedAt || otp.expiresAt < new Date() || otp.attempts >= 5) throw new UnauthorizedException('رمز التحقق غير صالح أو منتهي');
    if (otp.codeHash !== sha(code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('رمز التحقق غير صحيح');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    return otp.userId;
  }

  async verifyOtp(otpToken: string, code: string, ctx: Ctx) {
    const userId = await this.consumeOtp(otpToken, code, 'login');
    await this.audit.log('LOGIN_SUCCESS', userId, ctx);
    return this.issueTokens(userId);
  }

  private async issueTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    const roles = user.roles.map(r => r.role.code);
    const perms = [...new Set(user.roles.flatMap(r => r.role.permissions.map(p => p.permission.code)))];
    const accessToken = await this.jwt.signAsync({ sub: user.id, roles, perms }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL || '15m' });
    const raw = randomBytes(48).toString('hex');
    const rt = await this.prisma.refreshToken.create({ data: { userId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_DAYS || 30) * 864e5) } });
    return { accessToken, refreshToken: `${rt.id}.${raw}`, user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, roles } };
  }

  // Rotation: each refresh revokes the used token
  async refresh(token: string) {
    const [id, raw] = token.split('.');
    const rt = id && raw ? await this.prisma.refreshToken.findUnique({ where: { id } }) : null;
    if (!rt || rt.revokedAt || rt.expiresAt < new Date() || rt.tokenHash !== sha(raw)) throw new UnauthorizedException('انتهت الجلسة، سجّل الدخول مجدداً');
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.issueTokens(rt.userId);
  }

  async logout(userId: string, ctx: Ctx) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log('LOGOUT', userId, ctx);
    return { ok: true };
  }

  async forgot(identifier: string) {
    const user = await this.findByIdentifier(identifier);
    // Same response whether or not the user exists (no user enumeration)
    return { otpToken: user ? await this.issueOtp(user.id, 'reset', user.phone) : randomBytes(16).toString('hex') };
  }

  async reset(otpToken: string, code: string, newPassword: string, ctx: Ctx) {
    const userId = await this.consumeOtp(otpToken, code, 'reset');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), failedAttempts: 0, lockedUntil: null } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log('PASSWORD_RESET', userId, ctx);
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string, ctx: Ctx) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    await this.audit.log('PASSWORD_CHANGED', userId, ctx);
    return { ok: true };
  }
}
