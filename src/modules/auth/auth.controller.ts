import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CredentialLoginDto } from './dto/credential-login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RegisterBusinessRequestOtpDto } from './dto/register-business-request-otp.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterRequestOtpDto } from './dto/register-request-otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/request-otp')
  requestRegistrationOtp(@Body() payload: RegisterRequestOtpDto) {
    return this.authService.requestRegistrationOtp(payload);
  }

  @Post('register/business/request-otp')
  requestBusinessRegistrationOtp(@Body() payload: RegisterBusinessRequestOtpDto) {
    return this.authService.requestBusinessRegistrationOtp(payload);
  }

  @Post('register/verify-otp')
  verifyRegistrationOtp(@Body() payload: VerifyRegistrationOtpDto) {
    return this.authService.verifyRegistrationOtp(payload);
  }

  @Post('register/business/verify-otp')
  verifyBusinessRegistrationOtp(@Body() payload: VerifyRegistrationOtpDto) {
    return this.authService.verifyBusinessRegistrationOtp(payload);
  }

  @Post('register/admin')
  registerAdmin(@Body() payload: RegisterAdminDto) {
    return this.authService.registerAdmin(payload);
  }

  @Post('login')
  login(@Body() payload: CredentialLoginDto) {
    return this.authService.loginWithCredentials(payload);
  }

  @Post('request-otp')
  requestOtp(@Body() payload: RequestOtpDto) {
    return this.authService.requestOtp(payload);
  }

  @Post('verify-otp')
  verifyOtp(@Body() payload: VerifyOtpDto) {
    return this.authService.verifyOtp(payload);
  }

  @Post('password-reset/request-otp')
  requestPasswordResetOtp(@Body() payload: RequestOtpDto) {
    return this.authService.requestPasswordResetOtp(payload);
  }

  @Post('password-reset/confirm')
  resetPasswordWithOtp(@Body() payload: ResetPasswordWithOtpDto) {
    return this.authService.resetPasswordWithOtp(payload);
  }

  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshAccessToken(payload.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: JwtUser, @Body() payload: LogoutDto) {
    return this.authService.logout(user.sub, payload.refreshToken);
  }
}

