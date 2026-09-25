import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

const select = { id: true, fullName: true, email: true, phone: true, status: true, createdAt: true, roles: { select: { role: { select: { code: true, nameAr: true } } } } };

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.prisma.user.findUniqueOrThrow({ where: { id: u.sub }, select }); }

  @Get() @RequirePermissions('users.read')
  list() { return this.prisma.user.findMany({ select, orderBy: { createdAt: 'desc' } }); }
}
