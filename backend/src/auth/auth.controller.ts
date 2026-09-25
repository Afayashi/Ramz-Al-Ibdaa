import { Body, Controller, Post, Req, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, VerifyOtpDto, RefreshDto, ForgotDto, ResetDto, ChangePasswordDto } from './dto';
import { Public, CurrentUser, AuthUser } from '../common/decorators';

const ctx = (req: any) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('login') @HttpCode(200)
  login(@Body() d: LoginDto, @Req() r: any) { return this.auth.login(d.identifier, d.password, ctx(r)); }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('verify-otp') @HttpCode(200)
  verify(@Body() d: VerifyOtpDto, @Req() r: any) { return this.auth.verifyOtp(d.otpToken, d.code, ctx(r)); }

  @Public() @Post('refresh') @HttpCode(200)
  refresh(@Body() d: RefreshDto) { return this.auth.refresh(d.refreshToken); }

  @Post('logout') @HttpCode(200)
  logout(@CurrentUser() u: AuthUser, @Req() r: any) { return this.auth.logout(u.sub, ctx(r)); }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('forgot-password') @HttpCode(200)
  forgot(@Body() d: ForgotDto) { return this.auth.forgot(d.identifier); }

  @Public() @Post('reset-password') @HttpCode(200)
  reset(@Body() d: ResetDto, @Req() r: any) { return this.auth.reset(d.otpToken, d.code, d.newPassword, ctx(r)); }

  @Post('change-password') @HttpCode(200)
  change(@CurrentUser() u: AuthUser, @Body() d: ChangePasswordDto, @Req() r: any) { return this.auth.changePassword(u.sub, d.currentPassword, d.newPassword, ctx(r)); }
}
