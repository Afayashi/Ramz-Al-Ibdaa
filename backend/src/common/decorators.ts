import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const PERMS = 'perms';
export const RequirePermissions = (...p: string[]) => SetMetadata(PERMS, p);
export interface AuthUser { sub: string; roles: string[]; perms: string[] }
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
