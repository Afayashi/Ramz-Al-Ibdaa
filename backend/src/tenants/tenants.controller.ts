import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

@Controller('tenants')
export class TenantsController {
  constructor(private svc: TenantsService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.me(u); }
  @Get() @RequirePermissions('tenants.read') list(@Query('q') q?: string) { return this.svc.list(q); }
  @Get(':id') @RequirePermissions('tenants.read') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post() @RequirePermissions('tenants.write') create(@CurrentUser() u: AuthUser, @Body() d: CreateTenantDto) { return this.svc.create(u, d); }
  @Patch(':id') @RequirePermissions('tenants.write') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateTenantDto) { return this.svc.update(u, id, d); }
  @Delete(':id') @RequirePermissions('tenants.write') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(u, id); }
}
