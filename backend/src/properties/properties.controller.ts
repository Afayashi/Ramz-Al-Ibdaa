import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto, PropertyQuery } from './dto';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';
import { imageUpload } from '../common/upload';

@Controller('properties')
export class PropertiesController {
  constructor(private svc: PropertiesService) {}

  // Owners pass via scope (own rows only); staff need properties.read
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PropertyQuery) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post() @RequirePermissions('properties.write')
  create(@CurrentUser() u: AuthUser, @Body() d: CreatePropertyDto) { return this.svc.create(u, d); }

  @Patch(':id') @RequirePermissions('properties.write')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdatePropertyDto) { return this.svc.update(u, id, d); }

  @Delete(':id') @RequirePermissions('properties.delete')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(u, id); }

  @Post(':id/images') @RequirePermissions('properties.write') @UseInterceptors(FilesInterceptor('images', 10, imageUpload('properties')))
  images(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: Express.Multer.File[]) { return this.svc.addImages(u, id, files); }

  @Delete(':id/images/:imageId') @RequirePermissions('properties.write')
  removeImage(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) { return this.svc.removeImage(u, id, imageId); }
}
