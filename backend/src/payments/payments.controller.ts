import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto, VoidDto, PaymentQuery } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.svc.summary(u); }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PaymentQuery) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.get(u, id); }
  @Post() @RequirePermissions('payments.write') record(@CurrentUser() u: AuthUser, @Body() d: RecordPaymentDto) { return this.svc.record(u, d); }
  @Post(':id/void') @RequirePermissions('payments.void') void(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() d: VoidDto) { return this.svc.void(u, id, d.reason); }
}
