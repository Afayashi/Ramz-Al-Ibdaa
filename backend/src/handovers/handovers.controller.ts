import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { HandoversService } from './handovers.service';
import { SaveHandoverDto } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

@Controller('handovers')
export class HandoversController {
  constructor(private svc: HandoversService) {}
  @Get('contract/:id') forContract(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.forContract(u, id); }
  @Post() @RequirePermissions('handovers.write') save(@CurrentUser() u: AuthUser, @Body() d: SaveHandoverDto) { return this.svc.save(u, d); }
  @Post(':id/sign') sign(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.sign(u, id); }
}
