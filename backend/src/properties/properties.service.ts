import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreatePropertyDto, UpdatePropertyDto, PropertyQuery } from './dto';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private audit: AuditService) {}

  private withStats(p: any) {
    const units = p.units || [];
    const total = units.length, rented = units.filter((u: any) => u.status === 'RENTED').length;
    const { units: _, ...rest } = p;
    return { ...rest, stats: { units: total, rented, available: units.filter((u: any) => u.status === 'AVAILABLE').length, occupancy: total ? Math.round((rented / total) * 100) : 0 } };
  }

  async list(u: AuthUser, q: PropertyQuery) {
    const where: Prisma.PropertyWhereInput = {
      archivedAt: null, ...(await this.scope.propertyWhere(u)),
      ...(q.type && { type: q.type }), ...(q.city && { city: q.city }),
      ...(q.q && { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { district: { contains: q.q, mode: 'insensitive' } }] }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (q.page! - 1) * q.pageSize!, take: q.pageSize,
        include: { owner: { select: { id: true, fullName: true } }, images: { take: 1, orderBy: { sortOrder: 'asc' } }, units: { where: { archivedAt: null }, select: { status: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map(r => this.withStats(r)) };
  }

  async get(u: AuthUser, id: string) {
    const p = await this.prisma.property.findFirst({
      where: { id, archivedAt: null, ...(await this.scope.propertyWhere(u)) },
      include: { owner: true, images: { orderBy: { sortOrder: 'asc' } }, units: { where: { archivedAt: null }, orderBy: { number: 'asc' } } },
    });
    if (!p) throw new NotFoundException('العقار غير موجود');
    return { ...this.withStats(p), units: p.units };
  }

  async create(u: AuthUser, d: CreatePropertyDto) {
    if (!(await this.prisma.owner.findUnique({ where: { id: d.ownerId } }))) throw new BadRequestException('المالك غير موجود'); // TC-PRO-002
    try {
      const p = await this.prisma.property.create({ data: d });
      await this.audit.log('PROPERTY_CREATED', u.sub, undefined, { id: p.id, code: p.code });
      return p;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('كود العقار مستخدم مسبقاً'); // TC-PRO-003
      throw e;
    }
  }

  async update(u: AuthUser, id: string, d: UpdatePropertyDto) {
    await this.get(u, id);
    if (d.ownerId && !(await this.prisma.owner.findUnique({ where: { id: d.ownerId } }))) throw new BadRequestException('المالك غير موجود');
    const p = await this.prisma.property.update({ where: { id }, data: d });
    await this.audit.log('PROPERTY_UPDATED', u.sub, undefined, { id, changes: Object.keys(d) });
    return p;
  }

  async archive(u: AuthUser, id: string) {
    await this.get(u, id);
    const rented = await this.prisma.unit.count({ where: { propertyId: id, status: 'RENTED', archivedAt: null } });
    if (rented) throw new BadRequestException(`لا يمكن حذف عقار به ${rented} وحدة مؤجرة`);
    await this.prisma.$transaction([
      this.prisma.unit.updateMany({ where: { propertyId: id }, data: { archivedAt: new Date() } }),
      this.prisma.property.update({ where: { id }, data: { archivedAt: new Date() } }),
    ]);
    await this.audit.log('PROPERTY_ARCHIVED', u.sub, undefined, { id });
    return { ok: true };
  }

  async addImages(u: AuthUser, id: string, files: Express.Multer.File[]) {
    await this.get(u, id);
    if (!files?.length) throw new BadRequestException('لم يتم إرفاق صور');
    const start = await this.prisma.propertyImage.count({ where: { propertyId: id } });
    await this.prisma.propertyImage.createMany({ data: files.map((f, i) => ({ propertyId: id, url: '/uploads/properties/' + f.filename, sortOrder: start + i })) });
    return this.prisma.propertyImage.findMany({ where: { propertyId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async removeImage(u: AuthUser, id: string, imageId: string) {
    await this.get(u, id);
    await this.prisma.propertyImage.deleteMany({ where: { id: imageId, propertyId: id } });
    return { ok: true };
  }
}
