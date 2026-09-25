import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization || '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Token مفقود');          // SEC-004
    try {
      req.user = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET }); // SEC-003 / SEC-005
    } catch { throw new UnauthorizedException('Token غير صالح أو منتهي'); }
    return true;
  }
}
