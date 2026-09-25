import { IsUUID, IsEnum, IsOptional, IsString, IsDateString, IsNotEmpty, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @IsUUID('4') installmentId: string;
  @Type(() => Number) @IsPositive({ message: 'المبلغ يجب أن يكون أكبر من صفر' }) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() notes?: string;
}
export class VoidDto { @IsString() @IsNotEmpty({ message: 'سبب الإلغاء مطلوب' }) reason: string }
export class PaymentQuery {
  @IsOptional() @IsUUID('4') contractId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
}
