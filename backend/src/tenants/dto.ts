import { IsString, IsNotEmpty, IsEnum, IsOptional, IsEmail, IsDateString } from 'class-validator';
import { PartyKind } from '@prisma/client';
import { IsPartyId, IsSaMobile } from '../common/validators';

export class CreateTenantDto {
  @IsOptional() @IsEnum(PartyKind) kind?: PartyKind;
  @IsString() @IsNotEmpty() fullName: string;
  @IsPartyId() nationalId: string;
  @IsOptional() @IsDateString() idExpiry?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsSaMobile() phone: string;
  @IsOptional() @IsEmail({}, { message: 'البريد غير صحيح' }) email?: string;
  @IsOptional() @IsString() employer?: string;
  @IsOptional() @IsString() emergencyName?: string;
  @IsOptional() @IsSaMobile() emergencyPhone?: string;
}
export class UpdateTenantDto {
  @IsOptional() @IsString() @IsNotEmpty() fullName?: string;
  @IsOptional() @IsDateString() idExpiry?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsSaMobile() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() employer?: string;
  @IsOptional() @IsString() emergencyName?: string;
  @IsOptional() @IsSaMobile() emergencyPhone?: string;
}
