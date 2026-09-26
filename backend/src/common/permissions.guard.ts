import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMS } from './decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const need = this.reflector.getAllAndOverride<string[]>(PERMS, [ctx.getHandler(), ctx.getClass()]);
    if (!need?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (user?.roles?.includes('admin')) return true;
    if (need.every(p => user?.perms?.includes(p))) return true;
    throw new ForbiddenException('غير مصرح');  // TC-RBAC-004
  }
}
