import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto, ChangeStatusDto, UnitQuery } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

@Controller('units')
export class UnitsController {
  constructor(private svc: UnitsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: UnitQuery) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post() @RequirePermissions('units.write') create(@CurrentUser() u: AuthUser, @Body() d: CreateUnitDto) { return this.svc.create(u, d); }
  @Patch(':id') @RequirePermissions('units.write') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateUnitDto) { return this.svc.update(u, id, d); }
  @Patch(':id/status') @RequirePermissions('units.write') status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ChangeStatusDto) { return this.svc.changeStatus(u, id, d); }
  @Delete(':id') @RequirePermissions('units.delete') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(u, id); }
}
