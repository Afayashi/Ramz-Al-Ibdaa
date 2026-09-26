import { IsString, IsNotEmpty, MinLength, Matches, Length } from 'class-validator';
const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export class LoginDto { @IsString() @IsNotEmpty() identifier: string; @IsString() @IsNotEmpty() password: string; }
export class VerifyOtpDto { @IsString() otpToken: string; @Length(6, 6) code: string; }
export class RefreshDto { @IsString() refreshToken: string; }
export class ForgotDto { @IsString() @IsNotEmpty() identifier: string; }
export class ResetDto { @IsString() otpToken: string; @Length(6, 6) code: string; @Matches(STRONG, { message: 'كلمة المرور ضعيفة' }) newPassword: string; }
export class ChangePasswordDto { @IsString() currentPassword: string; @MinLength(8) @Matches(STRONG, { message: 'كلمة المرور ضعيفة' }) newPassword: string; }
