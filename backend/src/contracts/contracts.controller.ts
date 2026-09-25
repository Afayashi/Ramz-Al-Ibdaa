import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateContractDto, UpdateContractDto, PreviewDto, ReasonDto, OptionalReasonDto, RenewDto, ContractQuery } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

type Id = string;
const P = () => new ParseUUIDPipe();

@Controller('contracts')
export class ContractsController {
  constructor(private svc: ContractsService) {}
  @Post('preview') @RequirePermissions('contracts.write') preview(@Body() d: PreviewDto) { return this.svc.preview(d); }   // wizard step 3
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ContractQuery) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id) { return this.svc.get(u, id); }
  @Post() @RequirePermissions('contracts.write') create(@CurrentUser() u: AuthUser, @Body() d: CreateContractDto) { return this.svc.create(u, d); }
  @Patch(':id') @RequirePermissions('contracts.write') update(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id, @Body() d: UpdateContractDto) { return this.svc.update(u, id, d); }
  @Post(':id/submit') @RequirePermissions('contracts.write') submit(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id) { return this.svc.submit(u, id); }
  @Post(':id/approve') @RequirePermissions('contracts.approve') approve(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id) { return this.svc.approve(u, id); }
  @Post(':id/reject') @RequirePermissions('contracts.approve') reject(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id, @Body() d: ReasonDto) { return this.svc.reject(u, id, d.reason); }
  @Post(':id/cancel') @RequirePermissions('contracts.write') cancel(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id, @Body() d: OptionalReasonDto) { return this.svc.cancel(u, id, d.reason); }
  @Post(':id/terminate') @RequirePermissions('contracts.terminate') terminate(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id, @Body() d: ReasonDto) { return this.svc.terminate(u, id, d.reason); }
  @Post(':id/renew') @RequirePermissions('contracts.write') renew(@CurrentUser() u: AuthUser, @Param('id', P()) id: Id, @Body() d: RenewDto) { return this.svc.renew(u, id, d); }
  @Post('jobs/daily') @RequirePermissions('contracts.approve') daily() { return this.svc.runDaily(); }
}
