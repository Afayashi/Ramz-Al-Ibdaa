import { IsUUID, IsEnum, IsOptional, IsString, IsNumber, IsInt, Min, IsArray, ValidateNested, IsIn, IsNotEmpty, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { HandoverType } from '@prisma/client';

export class ItemDto {
  @IsString() @IsNotEmpty() area: string;
  @IsIn(['GOOD', 'FAIR', 'DAMAGED']) condition: 'GOOD' | 'FAIR' | 'DAMAGED';
  @IsOptional() @IsString() note?: string;
}
export class DeductionDto {
  @IsString() @IsNotEmpty() label: string;
  @Type(() => Number) @IsPositive() amount: number;
}
export class SaveHandoverDto {
  @IsUUID('4') contractId: string;
  @IsEnum(HandoverType) type: HandoverType;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) electricity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) water?: number;
  @Type(() => Number) @IsInt() @Min(0) keysCount: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DeductionDto) deductions?: DeductionDto[];
  @IsOptional() @IsString() notes?: string;
}
