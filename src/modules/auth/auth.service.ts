import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { Role } from '../../shared/enums/role.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { User } from '../users/entities/user.entity';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpCode } from './entities/otp-code.entity';
import { Session } from './entities/session.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private readonly otpCodesRepository: Repository<OtpCode>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: AppConfigService,
  ) {}

  async requestOtp(payload: RequestOtpDto) {
    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = this.otpCodesRepository.create({
      phoneNumber: payload.phoneNumber,
      code,
      purpose: payload.purpose ?? 'LOGIN',
      expiresAt,
    });

    await this.otpCodesRepository.save(otp);

    return {
      message: 'OTP created',
      phoneNumber: payload.phoneNumber,
      expiresAt,
      debugCode:
        process.env.APP_ENV === 'production' ? undefined : code,
    };
  }

  async verifyOtp(payload: VerifyOtpDto) {
    const otp = await this.otpCodesRepository.findOne({
      where: {
        phoneNumber: payload.phoneNumber,
        purpose: payload.purpose ?? 'LOGIN',
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!otp || otp.consumedAt || otp.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP is invalid or expired');
    }

    if (otp.code !== payload.code) {
      throw new UnauthorizedException('OTP is invalid');
    }

    otp.consumedAt = new Date();
    await this.otpCodesRepository.save(otp);

    let user = await this.usersRepository.findOne({
      where: { phoneNumber: payload.phoneNumber },
    });

    if (!user) {
      user = this.usersRepository.create({
        phoneNumber: payload.phoneNumber,
        roles: [Role.CLIENT],
        isVerified: true,
        lastActiveAt: new Date(),
      });
    } else {
      user.isVerified = true;
      user.lastActiveAt = new Date();
    }

    user = await this.usersRepository.save(user);

    return this.createSession(user, payload.deviceId);
  }

  async refreshAccessToken(refreshToken: string) {
    const decoded = await this.jwtService.verifyAsync<JwtUser & { sid: string }>(
      refreshToken,
      {
        secret: this.configService.jwtRefreshSecret,
      },
    );

    const session = await this.sessionsRepository.findOne({
      where: { id: decoded.sid, userId: decoded.sub },
      relations: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    const isTokenValid = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!isTokenValid || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    session.lastUsedAt = new Date();
    await this.sessionsRepository.save(session);

    const accessToken = await this.jwtService.signAsync(
      {
        sub: session.user.id,
        phoneNumber: session.user.phoneNumber,
        roles: session.user.roles,
      },
      {
        secret: this.configService.jwtAccessSecret,
        expiresIn: this.configService.jwtAccessTtl,
      },
    );

    return { accessToken };
  }

  private async createSession(user: User, deviceId?: string) {
    const session = this.sessionsRepository.create({
      userId: user.id,
      deviceId,
      refreshTokenHash: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: new Date(),
    });

    const savedSession = await this.sessionsRepository.save(session);

    const jwtPayload: JwtUser = {
      sub: user.id,
      phoneNumber: user.phoneNumber,
      roles: user.roles,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.jwtAccessSecret,
        expiresIn: this.configService.jwtAccessTtl,
      }),
      this.jwtService.signAsync(
        {
          ...jwtPayload,
          sid: savedSession.id,
        },
        {
          secret: this.configService.jwtRefreshSecret,
          expiresIn: this.configService.jwtRefreshTtl,
        },
      ),
    ]);

    savedSession.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.sessionsRepository.save(savedSession);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }
}

