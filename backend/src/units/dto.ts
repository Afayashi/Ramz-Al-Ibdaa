import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsInt, Min, IsUUID, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, UnitStatus } from '@prisma/client';

export class CreateUnitDto {
  @IsUUID('4') propertyId: string;                     // TC-UNIT-001
  @IsString() @IsNotEmpty() number: string;
  @IsEnum(UnitType) type: UnitType;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @Type(() => Number) @IsPositive() area: number;
  @Type(() => Number) @IsInt() @Min(0) rooms: number;
  @Type(() => Number) @IsInt() @Min(0) bathrooms: number;
  @Type(() => Number) @IsPositive({ message: 'قيمة الإيجار يجب أن تكون أكبر من صفر' }) annualRent: number;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateUnitDto {
  @IsOptional() @IsString() @IsNotEmpty() number?: string;
  @IsOptional() @IsEnum(UnitType) type?: UnitType;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsPositive() area?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bathrooms?: number;
  @IsOptional() @Type(() => Number) @IsPositive() annualRent?: number;
  @IsOptional() @IsString() notes?: string;
}
export class ChangeStatusDto {
  @IsEnum(UnitStatus) status: UnitStatus;
  @IsOptional() @IsString() reason?: string;
}
export class UnitQuery {
  @IsOptional() @IsUUID('4') propertyId?: string;
  @IsOptional() @IsEnum(UnitStatus) status?: UnitStatus;
  @IsOptional() @IsEnum(UnitType) type?: UnitType;
}
