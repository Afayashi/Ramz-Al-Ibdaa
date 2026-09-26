import { IsUUID, IsEnum, IsOptional, IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsInt, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MaintCategory, MaintPriority, MaintStatus, ChargeTo } from '@prisma/client';

export class CreateMaintenanceDto {
  @IsOptional() @IsUUID('4') unitId?: string;          // staff must send; tenant derived from active contract
  @IsEnum(MaintCategory) category: MaintCategory;
  @IsOptional() @IsEnum(MaintPriority) priority?: MaintPriority;
  @IsString() @IsNotEmpty({ message: 'العنوان مطلوب' }) @MaxLength(120) title: string;
  @IsString() @IsNotEmpty({ message: 'الوصف مطلوب' }) description: string;
}
export class AssignDto {
  @IsUUID('4') technicianId: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(MaintPriority) priority?: MaintPriority;
}
export class NoteDto { @IsOptional() @IsString() note?: string }
export class PartsDto { @IsString() @IsNotEmpty({ message: 'حدد القطع المطلوبة' }) partsNote: string }
export class CompleteDto {
  @IsString() @IsNotEmpty({ message: 'تقرير العمل مطلوب' }) workReport: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsEnum(ChargeTo) chargeTo?: ChargeTo;
}
export class CloseDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() ratingComment?: string;
}
export class ReasonDto { @IsString() @IsNotEmpty({ message: 'السبب مطلوب' }) reason: string }
export class MaintQuery {
  @IsOptional() @IsEnum(MaintStatus) status?: MaintStatus;
  @IsOptional() @IsUUID('4') unitId?: string;
  @IsOptional() @IsString() open?: string;   // 'true' → excludes CLOSED/CANCELLED
}
