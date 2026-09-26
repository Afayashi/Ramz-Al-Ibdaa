import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsArray, Min, Max, Matches, IsUUID, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType } from '@prisma/client';

export class CreatePropertyDto {
  @Matches(/^[A-Z]{2,5}-\d{3,6}$/, { message: 'صيغة الكود غير صحيحة (مثال RYD-001)' }) code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsEnum(PropertyType) type: PropertyType;
  @IsUUID('4', { message: 'يجب تحديد المالك' }) ownerId: string;   // TC-PRO-002
  @IsString() @IsNotEmpty() city: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() deedNumber?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() description?: string;
}
export class UpdatePropertyDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEnum(PropertyType) type?: PropertyType;
  @IsOptional() @IsUUID('4') ownerId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() deedNumber?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() description?: string;
}
export class PropertyQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(PropertyType) type?: PropertyType;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
