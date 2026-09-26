import { IsString, IsNotEmpty, IsEnum, IsOptional, IsEmail, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PartyKind } from '@prisma/client';
import { IsPartyId, IsSaIban, IsSaMobile } from '../common/validators';

export class CreateOwnerDto {
  @IsOptional() @IsEnum(PartyKind) kind?: PartyKind;
  @IsString() @IsNotEmpty() fullName: string;
  @IsPartyId() nationalId: string;
  @IsSaMobile() phone: string;
  @IsOptional() @IsEmail({}, { message: 'البريد غير صحيح' }) email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
}
export class UpdateOwnerDto {
  @IsOptional() @IsString() @IsNotEmpty() fullName?: string;
  @IsOptional() @IsSaMobile() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
}
export class BankAccountDto {
  @IsString() @IsNotEmpty() bankName: string;
  @IsString() @IsNotEmpty() holderName: string;
  @Transform(({ value }) => String(value || '').replace(/\s+/g, '').toUpperCase()) @IsSaIban() iban: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
