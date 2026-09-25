import { IsUUID, IsDateString, IsEnum, IsOptional, IsNumber, IsPositive, Min, Max, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentFrequency, ContractStatus } from '@prisma/client';

export class CreateContractDto {
  @IsUUID('4') unitId: string;
  @IsUUID('4') tenantId: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @Type(() => Number) @IsPositive({ message: 'قيمة الإيجار يجب أن تكون أكبر من صفر' }) annualRent?: number; // defaults to unit.annualRent
  @IsEnum(PaymentFrequency) frequency: PaymentFrequency;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsString() ejarNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateContractDto {
  @IsOptional() @IsUUID('4') tenantId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsPositive() annualRent?: number;
  @IsOptional() @IsEnum(PaymentFrequency) frequency?: PaymentFrequency;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsString() ejarNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
export class PreviewDto {
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @Type(() => Number) @IsPositive() annualRent: number;
  @IsEnum(PaymentFrequency) frequency: PaymentFrequency;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatPct?: number;
}
export class ReasonDto { @IsString() @IsNotEmpty({ message: 'السبب مطلوب' }) reason: string }
export class OptionalReasonDto { @IsOptional() @IsString() reason?: string }
export class RenewDto {
  @IsDateString() endDate: string;
  @IsOptional() @Type(() => Number) @IsPositive() annualRent?: number;
  @IsOptional() @IsEnum(PaymentFrequency) frequency?: PaymentFrequency;
}
export class ContractQuery {
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
  @IsOptional() @IsUUID('4') unitId?: string;
  @IsOptional() @IsUUID('4') tenantId?: string;
  @IsOptional() @IsUUID('4') propertyId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) expiringInDays?: number;
}
