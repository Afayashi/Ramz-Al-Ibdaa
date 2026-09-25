import { BadRequestException, Body, Controller, Delete, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { AttachmentEntity, AttachmentCategory } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser, RequirePermissions } from '../common/decorators';
import { docUpload } from '../common/upload';

class UploadDto {
  @IsEnum(AttachmentEntity) entityType: AttachmentEntity;
  @IsUUID('4') entityId: string;
  @IsOptional() @IsEnum(AttachmentCategory) category?: AttachmentCategory;
}

const MODEL: Record<string, string> = { OWNER: 'owner', TENANT: 'tenant', PROPERTY: 'property', UNIT: 'unit' };

@Controller('attachments')
export class AttachmentsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // TC-TEN-003 / TC-DOC-001
  @Post() @RequirePermissions('attachments.write') @UseInterceptors(FileInterceptor('file', docUpload('documents')))
  async upload(@CurrentUser() u: AuthUser, @Body() d: UploadDto, @UploadedFile() f: Express.Multer.File) {
    if (!f) throw new BadRequestException('لم يتم إرفاق ملف');
    const m = MODEL[d.entityType];
    if (m && !(await (this.prisma as any)[m].findFirst({ where: { id: d.entityId, archivedAt: null } }))) throw new NotFoundException('السجل غير موجود');
    const a = await this.prisma.attachment.create({ data: {
      entityType: d.entityType, entityId: d.entityId, category: d.category || 'OTHER',
      fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'), url: '/uploads/documents/' + f.filename, mimeType: f.mimetype, size: f.size, uploadedBy: u.sub,
    } });
    await this.audit.log('ATTACHMENT_UPLOADED', u.sub, undefined, { id: a.id, entity: d.entityType, entityId: d.entityId });
    return a;
  }

  // TC-DOC-002: archive, never hard delete
  @Delete(':id') @RequirePermissions('attachments.write')
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.attachment.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.log('ATTACHMENT_ARCHIVED', u.sub, undefined, { id });
    return { ok: true };
  }
}
