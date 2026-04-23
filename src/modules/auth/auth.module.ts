import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpCode } from './entities/otp-code.entity';
import { Session } from './entities/session.entity';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        secret: configService.jwtAccessSecret,
        signOptions: {
          expiresIn: configService.jwtAccessTtl,
        },
      }),
    }),
    TypeOrmModule.forFeature([User, OtpCode, Session]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

