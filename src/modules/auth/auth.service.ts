import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { AccountStatus } from '../../shared/enums/account-status.enum';
import { BusinessVerificationStatus } from '../../shared/enums/business-verification-status.enum';
import { Role } from '../../shared/enums/role.enum';
import { SubscriptionPlan } from '../../shared/enums/subscription-plan.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { User } from '../users/entities/user.entity';
import { CredentialLoginDto } from './dto/credential-login.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RegisterRequestOtpDto } from './dto/register-request-otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';
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

  async requestRegistrationOtp(payload: RegisterRequestOtpDto) {
    return this.requestRegistrationOtpByRoles(payload, [Role.CLIENT]);
  }

  async requestBusinessRegistrationOtp(payload: RegisterRequestOtpDto) {
    return this.requestRegistrationOtpByRoles(payload, [
      Role.BUSINESS,
      Role.CAPITAL_USER,
    ]);
  }

  async verifyBusinessRegistrationOtp(payload: VerifyRegistrationOtpDto) {
    return this.verifyRegistrationOtp(payload);
  }

  async registerAdmin(payload: RegisterAdminDto) {
    const configuredSecret = this.configService.adminRegistrationSecret;

    if (!configuredSecret) {
      throw new BadRequestException(
        'Admin registration is disabled. Configure ADMIN_REGISTRATION_SECRET.',
      );
    }

    if (payload.adminSecret !== configuredSecret) {
      throw new UnauthorizedException('Invalid admin registration secret.');
    }

    const normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    const normalizedUsername = payload.username.trim().toLowerCase();

    const existingByPhone = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (existingByPhone) {
      throw new ConflictException('Phone number is already registered.');
    }

    const existingByUsername = await this.usersRepository.findOne({
      where: { username: normalizedUsername },
    });

    if (existingByUsername) {
      throw new ConflictException('Username is already taken.');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = this.usersRepository.create({
      phoneNumber: normalizedPhoneNumber,
      displayName: payload.displayName.trim(),
      username: normalizedUsername,
      passwordHash,
      roles: [Role.ADMIN],
      isVerified: true,
      lastActiveAt: new Date(),
    });

    const savedUser = await this.usersRepository.save(user);

    return {
      message: 'Admin account created',
      user: {
        id: savedUser.id,
        phoneNumber: savedUser.phoneNumber,
        displayName: savedUser.displayName,
        username: savedUser.username,
        roles: savedUser.roles,
      },
    };
  }

  private async requestRegistrationOtpByRoles(
    payload: RegisterRequestOtpDto,
    roles: Role[],
  ) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    const normalizedUsername = payload.username?.trim().toLowerCase();
    const normalizedEmail = payload.email?.trim().toLowerCase();
    const isBusinessRegistration =
      roles.includes(Role.BUSINESS) || roles.includes(Role.CAPITAL_USER);
    const displayName = isBusinessRegistration
      ? (payload.businessName?.trim() || payload.displayName.trim())
      : payload.displayName.trim();

    const existingByPhone = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (existingByPhone?.isVerified) {
      throw new ConflictException('An account already exists for this phone number.');
    }

    if (normalizedUsername) {
      const existingByUsername = await this.usersRepository.findOne({
        where: { username: normalizedUsername },
      });

      if (
        existingByUsername &&
        existingByUsername.phoneNumber !== normalizedPhoneNumber
      ) {
        throw new ConflictException('Username is already taken.');
      }
    }

    if (normalizedEmail) {
      const existingByEmail = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });

      if (
        existingByEmail &&
        existingByEmail.phoneNumber !== normalizedPhoneNumber
      ) {
        throw new ConflictException('Email is already registered.');
      }
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = this.usersRepository.create({
      ...(existingByPhone ?? {}),
      phoneNumber: normalizedPhoneNumber,
      email: normalizedEmail ?? existingByPhone?.email,
      displayName: displayName,
      username: normalizedUsername,
      businessName: isBusinessRegistration
        ? displayName
        : existingByPhone?.businessName,
      passwordHash,
      roles,
      isVerified: false,
      businessVerificationStatus: isBusinessRegistration
        ? BusinessVerificationStatus.PENDING
        : existingByPhone?.businessVerificationStatus,
      subscriptionPlan: isBusinessRegistration
        ? SubscriptionPlan.LITE
        : existingByPhone?.subscriptionPlan,
      lastActiveAt: new Date(),
    });

    await this.usersRepository.save(user);

    const otpPayload = await this.issueOtp(normalizedPhoneNumber, 'REGISTER');

    return {
      message: 'Registration OTP created',
      phoneNumber: normalizedPhoneNumber,
      expiresAt: otpPayload.expiresAt,
      debugCode: otpPayload.debugCode,
    };
  }

  async verifyRegistrationOtp(payload: VerifyRegistrationOtpDto) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);

    await this.validateOtp({
      phoneNumber: normalizedPhoneNumber,
      code: payload.code,
      purpose: 'REGISTER',
    });

    const user = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (!user) {
      throw new BadRequestException('Registration details not found.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set for this account.');
    }

    user.isVerified = true;
    user.lastActiveAt = new Date();
    const savedUser = await this.usersRepository.save(user);

    return this.createSession(savedUser, payload.deviceId);
  }

  async loginWithCredentials(payload: CredentialLoginDto) {
    const identifier = payload.identifier.trim();

    const possiblePhone = this.normalizePhoneNumber(identifier);
    const phoneAliases = this.getPhoneAliases(possiblePhone);

    const user = await this.usersRepository.findOne({
      where: [
        { phoneNumber: In(phoneAliases) },
        { username: identifier.toLowerCase() },
      ],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const eligibleUser = await this.ensureAccountCanAuthenticate(user);

    if (!eligibleUser.isVerified) {
      throw new UnauthorizedException('Complete OTP verification first.');
    }

    if (!eligibleUser.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(
      payload.password,
      eligibleUser.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    eligibleUser.lastActiveAt = new Date();
    const savedUser = await this.usersRepository.save(eligibleUser);

    return this.createSession(savedUser, payload.deviceId);
  }

  async requestOtp(payload: RequestOtpDto) {
    const purpose = payload.purpose ?? 'LOGIN';
    const normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    const user = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (user) {
      await this.ensureAccountCanAuthenticate(user);
    }

    const otpPayload = await this.issueOtp(normalizedPhoneNumber, purpose);

    return {
      message: 'OTP created',
      phoneNumber: payload.phoneNumber,
      expiresAt: otpPayload.expiresAt,
      debugCode: otpPayload.debugCode,
    };
  }

  async verifyOtp(payload: VerifyOtpDto) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);

    await this.validateOtp({ ...payload, phoneNumber: normalizedPhoneNumber });

    let user = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (!user) {
      user = this.usersRepository.create({
        phoneNumber: normalizedPhoneNumber,
        roles: [Role.CLIENT],
        isVerified: true,
        lastActiveAt: new Date(),
      });
    } else {
      const eligibleUser = await this.ensureAccountCanAuthenticate(user);
      eligibleUser.isVerified = true;
      eligibleUser.lastActiveAt = new Date();
      user = eligibleUser;
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

    await this.ensureAccountCanAuthenticate(session.user);

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
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  private async issueOtp(phoneNumber: string, purpose: string) {
    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const normalized = this.normalizePhoneNumber(phoneNumber);

    const otp = this.otpCodesRepository.create({
      phoneNumber: normalized,
      code,
      purpose,
      expiresAt,
    });

    await this.otpCodesRepository.save(otp);

    return {
      expiresAt,
      debugCode: process.env.APP_ENV === 'production' ? undefined : code,
    };
  }

  private async validateOtp(payload: {
    phoneNumber: string;
    code: string;
    purpose?: string;
  }) {
    const normalized = this.normalizePhoneNumber(payload.phoneNumber);
    const phoneAliases = this.getPhoneAliases(normalized);

    const otp = await this.otpCodesRepository.findOne({
      where: {
        phoneNumber: In(phoneAliases),
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
  }

  private normalizePhoneNumber(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    const country = '265';

    if (digits.startsWith('0')) {
      const local = digits.replace(/^0+/, '');
      return country + local;
    }

    if (digits.startsWith(country)) return digits;

    if (digits.length === 9) return country + digits;

    return digits;
  }

  private getPhoneAliases(phone?: string): string[] {
    const normalized = this.normalizePhoneNumber(phone);
    if (!normalized) return [];

    const aliases = new Set<string>([normalized]);

    if (normalized.startsWith('265')) {
      aliases.add(`+${normalized}`);
      aliases.add(`0${normalized.slice(3)}`);
    }

    return Array.from(aliases);
  }

  private async findUserByPhoneNumber(phone?: string): Promise<User | null> {
    const aliases = this.getPhoneAliases(phone);
    if (aliases.length === 0) return null;

    return this.usersRepository.findOne({
      where: {
        phoneNumber: In(aliases),
      },
    });
  }

  private async ensureAccountCanAuthenticate(user: User): Promise<User> {
    if (user.accountStatus === AccountStatus.DELETED) {
      throw new UnauthorizedException('This account has been deleted permanently.');
    }

    if (user.accountStatus !== AccountStatus.DEACTIVATED) {
      return user;
    }

    const deactivatedUntil = user.deactivatedUntil;

    if (!deactivatedUntil || deactivatedUntil.getTime() > Date.now()) {
      const reactivateAt = deactivatedUntil?.toISOString() ?? 'a later time';
      throw new UnauthorizedException(
        `Account is deactivated. Try again after ${reactivateAt}.`,
      );
    }

    user.accountStatus = AccountStatus.ACTIVE;
    user.deactivatedUntil = null;
    return this.usersRepository.save(user);
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
