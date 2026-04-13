import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CredentialLoginDto } from './dto/credential-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterRequestOtpDto } from './dto/register-request-otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/request-otp')
  requestRegistrationOtp(@Body() payload: RegisterRequestOtpDto) {
    return this.authService.requestRegistrationOtp(payload);
  }

  @Post('register/verify-otp')
  verifyRegistrationOtp(@Body() payload: VerifyRegistrationOtpDto) {
    return this.authService.verifyRegistrationOtp(payload);
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

  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshAccessToken(payload.refreshToken);
  }
}

