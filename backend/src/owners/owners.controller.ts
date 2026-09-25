import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { CreateOwnerDto, UpdateOwnerDto, BankAccountDto } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

@Controller('owners')
export class OwnersController {
  constructor(private svc: OwnersService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.me(u); }  // owner portal
  @Get() @RequirePermissions('owners.read') list(@Query('q') q?: string) { return this.svc.list(q); }
  @Get(':id') @RequirePermissions('owners.read') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id, u); }
  @Post() @RequirePermissions('owners.write') create(@CurrentUser() u: AuthUser, @Body() d: CreateOwnerDto) { return this.svc.create(u, d); }
  @Patch(':id') @RequirePermissions('owners.write') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateOwnerDto) { return this.svc.update(u, id, d); }
  @Delete(':id') @RequirePermissions('owners.write') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(u, id); }
  @Post(':id/bank-accounts') @RequirePermissions('owners.write') addBank(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: BankAccountDto) { return this.svc.addBank(u, id, d); }
  @Patch(':id/bank-accounts/:accId/primary') @RequirePermissions('owners.write') primary(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('accId', ParseUUIDPipe) acc: string) { return this.svc.setPrimary(u, id, acc); }
  @Delete(':id/bank-accounts/:accId') @RequirePermissions('owners.write') removeBank(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('accId', ParseUUIDPipe) acc: string) { return this.svc.removeBank(u, id, acc); }
}
