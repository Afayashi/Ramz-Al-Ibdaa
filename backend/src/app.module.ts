import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuditService } from './audit/audit.service';
import { UsersController } from './users/users.controller';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PropertiesController } from './properties/properties.controller';
import { PropertiesService } from './properties/properties.service';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { OwnersController } from './owners/owners.controller';
import { OwnersService } from './owners/owners.service';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { ScopeService } from './common/scope.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { HandoversController } from './handovers/handovers.controller';
import { HandoversService } from './handovers/handovers.service';
import { MaintenanceController } from './maintenance/maintenance.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { TasksController, TasksService } from './tasks/tasks';
import { ReportsController, ReportsService } from './reports/reports';
import { IntegrationsController, IntegrationsService } from './integrations/integrations';
import { SmsService } from './integrations/sms.service';
import { HealthController } from './health/health.controller';
import { DocumentsController, DocumentsService } from './documents/documents';
import { RequestContextMiddleware } from './common/request-context';

@Module({
  imports: [
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN || 120) }]),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'), serveRoot: '/uploads' }, { rootPath: join(process.cwd(), 'public', 'brand'), serveRoot: '/api/brand' }),
  ],
  controllers: [AuthController, UsersController, PropertiesController, UnitsController, OwnersController, TenantsController, AttachmentsController, ContractsController, PaymentsController, HandoversController, MaintenanceController, NotificationsController, TasksController, ReportsController, IntegrationsController, HealthController, DocumentsController],
  providers: [
    PrismaService, AuthService, AuditService, PropertiesService, UnitsService, ScopeService, OwnersService, TenantsService, ContractsService, PaymentsService, HandoversService, MaintenanceService, NotificationsService, TasksService, ReportsService, IntegrationsService, SmsService, DocumentsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(c: MiddlewareConsumer) { c.apply(RequestContextMiddleware).forRoutes('*'); }
}
