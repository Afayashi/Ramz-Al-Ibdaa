import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { imageUpload } from '../common/upload';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto, AssignDto, PartsDto, CompleteDto, CloseDto, ReasonDto, MaintQuery } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';

const P = () => new ParseUUIDPipe();
@Controller('maintenance')
export class MaintenanceController {
  constructor(private svc: MaintenanceService) {}
  @Get('stats') stats(@CurrentUser() u: AuthUser) { return this.svc.stats(u); }
  @Get('technicians') @RequirePermissions('maintenance.write') technicians() { return this.svc.technicians(); }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: MaintQuery) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', P()) id: string) { return this.svc.get(u, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() d: CreateMaintenanceDto) { return this.svc.create(u, d); }
  @Post(':id/assign') @RequirePermissions('maintenance.write') assign(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: AssignDto) { return this.svc.assign(u, id, d); }
  @Post(':id/start') start(@CurrentUser() u: AuthUser, @Param('id', P()) id: string) { return this.svc.start(u, id); }
  @Post(':id/parts') parts(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: PartsDto) { return this.svc.waitParts(u, id, d.partsNote); }
  @Post(':id/complete') complete(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: CompleteDto) { return this.svc.complete(u, id, d); }
  @Post(':id/close') close(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: CloseDto) { return this.svc.close(u, id, d); }
  @Post(':id/reopen') reopen(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: ReasonDto) { return this.svc.reopen(u, id, d.reason); }
  @Post(':id/photos') @UseInterceptors(FilesInterceptor('files', 10, imageUpload('maintenance')))
  photos(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @UploadedFiles() files: Express.Multer.File[], @Query('stage') stage?: string) { return this.svc.addPhotos(u, id, files, stage === 'AFTER' ? 'AFTER' : 'BEFORE'); }
  @Delete(':id/photos/:photoId') removePhoto(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Param('photoId', P()) pid: string) { return this.svc.removePhoto(u, id, pid); }
  @Post(':id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', P()) id: string, @Body() d: ReasonDto) { return this.svc.cancel(u, id, d.reason); }
}
