import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, AuthUser } from '../common/decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u.sub); }
  @Get('unread-count') unread(@CurrentUser() u: AuthUser) { return this.svc.unread(u.sub); }
  @Post('read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.readAll(u.sub); }
  @Post(':id/read') read(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.read(u.sub, id); }
}
